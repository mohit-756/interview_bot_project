"""Single source of truth for interview question planning.

Dynamic planner goals:
- Build structured intermediate extraction for resume + JD context
- Infer role family and seniority from title and resume signals
- Prioritize topics from overlap, recency, and strength signals
- Generate question distributions that adapt to role family
- Persist machine-readable metadata per question for runtime/HR review

The public entry point remains `build_question_plan(...)` so existing callers keep
working without changes.
"""

from __future__ import annotations

import math
import re
from collections import OrderedDict
from collections.abc import Mapping
from dataclasses import asdict, dataclass, field

from services.resume_parser import parse_resume_text

INTRO_QUESTION = {
    "text": "Please introduce yourself briefly, including your background and the project, system, or leadership work that best represents your strengths.",
    "type": "intro",
    "category": "intro",
    "topic": "self_intro",
    "intent": "Understand the candidate's background, strongest evidence, and communication style.",
    "focus_skill": None,
    "project_name": None,
    "reference_answer": "A strong answer briefly covers background, the most relevant experience, direct contribution, impact, and what the candidate learned.",
    "difficulty": "easy",
    "priority_source": "baseline",
    "role_alignment": 1.0,
    "resume_alignment": 1.0,
    "jd_alignment": 1.0,
    "metadata": {
        "category": "intro",
        "priority_source": "baseline",
        "skill_or_topic": "self_intro",
        "role_alignment": 1.0,
        "resume_alignment": 1.0,
        "jd_alignment": 1.0,
        "relevance_score": 1.0,
    },
}

HR_QUESTIONS = [
    "Tell me about a time you had to adapt when requirements or priorities changed midway.",
    "Describe a situation where you had to align with teammates or stakeholders with different views.",
    "Tell me about a time you had to learn something quickly to deliver an outcome.",
    "Describe a difficult trade-off you made under time pressure. What did you optimize for?",
    "How do you handle ownership when a project or deliverable is not going as planned?",
]

ROLE_FAMILY_KEYWORDS = {
    "practice_head": ("practice head", "head of", "delivery head", "practice lead", "vertical head"),
    "manager": ("engineering manager", "manager", "director", "vp", "vice president"),
    "architect": ("architect", "solution architect", "enterprise architect", "principal architect"),
    "lead": ("tech lead", "lead", "team lead", "staff", "principal"),
    "senior_engineer": ("senior", "sr.", "sr ", "sde 2", "sde2", "iii", "level 3"),
    "engineer": ("engineer", "developer", "programmer", "sde", "software", "backend", "frontend", "full stack", "qa", "data engineer"),
}

LEADERSHIP_TERMS = {
    "led", "owned", "mentored", "hired", "roadmap", "stakeholder", "strategy", "delivery", "managed", "budget", "cross-functional",
}
ARCHITECTURE_TERMS = {
    "architecture", "scalable", "distributed", "microservices", "event-driven", "system design", "availability", "latency", "kafka", "cloud", "aws", "azure", "gcp",
}
RECENCY_TERMS = {"current", "present", "recent", "latest", "ongoing", "now"}


@dataclass
class EvidenceItem:
    text: str
    source: str
    recency: float = 0.4
    strength: float = 0.4
    leadership: float = 0.0
    architecture: float = 0.0
    skills: list[str] = field(default_factory=list)


@dataclass
class StructuredResume:
    summary: str
    skills: list[str]
    experiences: list[EvidenceItem]
    projects: list[EvidenceItem]
    certifications: list[str]
    leadership_signal: float
    architecture_signal: float
    inferred_years_band: str


@dataclass
class StructuredJD:
    title: str
    required_skills: list[str]
    keywords: list[str]
    leadership_signal: float
    architecture_signal: float


@dataclass
class PlannerContext:
    role_family: str
    seniority: str
    title: str
    resume: StructuredResume
    jd: StructuredJD
    topic_priorities: list[dict[str, object]]
    distribution: dict[str, int]



def _clean(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()



def _dedupe(values: list[str], limit: int | None = None) -> list[str]:
    seen = OrderedDict()
    for value in values:
        cleaned = _clean(value)
        key = cleaned.lower()
        if cleaned and key not in seen:
            seen[key] = cleaned
        if limit and len(seen) >= limit:
            break
    return list(seen.values())



def _normalize_skill_token(value: str) -> str:
    token = _clean(value).lower()
    token = re.sub(r"[^a-z0-9+#./ ]+", "", token)
    return token.strip()



def _skill_aliases(skill: str) -> set[str]:
    base = _normalize_skill_token(skill)
    aliases = {base}
    compact = base.replace(" ", "")
    if compact:
        aliases.add(compact)
    if base in {"nodejs", "node.js"}:
        aliases.update({"nodejs", "node.js", "node"})
    if base in {"javascript", "js"}:
        aliases.update({"javascript", "js"})
    if base in {"typescript", "ts"}:
        aliases.update({"typescript", "ts"})
    if base == "react":
        aliases.update({"react", "reactjs", "react.js"})
    return {alias for alias in aliases if alias}



def _line_skill_matches(text: str, skills: list[str]) -> list[str]:
    lowered = _normalize_skill_token(text)
    matches: list[str] = []
    for skill in skills:
        aliases = _skill_aliases(skill)
        if any(alias and alias in lowered for alias in aliases):
            matches.append(skill)
    return _dedupe(matches)



def _score_text_signal(text: str, keywords: set[str]) -> float:
    lowered = text.lower()
    hits = sum(1 for term in keywords if term in lowered)
    return min(1.0, hits / 3.0)



def _infer_years_band(text: str) -> str:
    match = re.search(r"(\d+)\+?\s*(?:years|yrs)", text.lower())
    if match:
        years = int(match.group(1))
        if years >= 12:
            return "12+"
        if years >= 8:
            return "8-11"
        if years >= 5:
            return "5-7"
        if years >= 2:
            return "2-4"
    return "0-2"



def _build_evidence_items(lines: list[str], source: str, known_skills: list[str]) -> list[EvidenceItem]:
    items: list[EvidenceItem] = []
    total = max(1, len(lines))
    for index, line in enumerate(lines[:10]):
        recency_rank = 1.0 - (index / total) * 0.55
        lowered = line.lower()
        skill_hits = _line_skill_matches(line, known_skills)
        strength = min(1.0, 0.35 + (0.12 * len(skill_hits)))
        if any(term in lowered for term in RECENCY_TERMS):
            recency_rank = max(recency_rank, 0.95)
        items.append(
            EvidenceItem(
                text=line,
                source=source,
                recency=round(max(0.2, recency_rank), 3),
                strength=round(strength, 3),
                leadership=round(_score_text_signal(line, LEADERSHIP_TERMS), 3),
                architecture=round(_score_text_signal(line, ARCHITECTURE_TERMS), 3),
                skills=skill_hits,
            )
        )
    return items



def _extract_structured_resume(resume_text: str) -> StructuredResume:
    parsed = parse_resume_text(resume_text or "")
    skills = _dedupe([str(item) for item in (parsed.get("skills") or [])], limit=18)
    experience_lines = [str(item) for item in (parsed.get("experience") or [])]
    project_lines = [str(item) for item in (parsed.get("projects") or [])]

    experiences = _build_evidence_items(experience_lines, "experience", skills)
    projects = _build_evidence_items(project_lines, "project", skills)

    leadership_signal = 0.0
    architecture_signal = 0.0
    all_items = experiences + projects
    if all_items:
        leadership_signal = round(sum(item.leadership for item in all_items) / len(all_items), 3)
        architecture_signal = round(sum(item.architecture for item in all_items) / len(all_items), 3)

    summary = _clean(parsed.get("summary") or "")
    years_band = _infer_years_band((summary or "") + "\n" + (resume_text or ""))

    return StructuredResume(
        summary=summary,
        skills=skills,
        experiences=experiences,
        projects=projects,
        certifications=[str(item) for item in (parsed.get("certifications") or [])][:5],
        leadership_signal=leadership_signal,
        architecture_signal=architecture_signal,
        inferred_years_band=years_band,
    )



def _extract_structured_jd(jd_title: str | None, jd_skill_scores: Mapping[str, int] | None) -> StructuredJD:
    required_skills = _dedupe([str(skill) for skill in (jd_skill_scores or {}).keys()], limit=18)
    title = _clean(jd_title or "Interview")
    all_keywords = _dedupe([title] + required_skills)
    joined = " ".join(all_keywords).lower()
    return StructuredJD(
        title=title,
        required_skills=required_skills,
        keywords=all_keywords,
        leadership_signal=round(_score_text_signal(joined, LEADERSHIP_TERMS), 3),
        architecture_signal=round(_score_text_signal(joined, ARCHITECTURE_TERMS), 3),
    )



def _infer_role_family(title: str, resume: StructuredResume, jd: StructuredJD) -> tuple[str, str]:
    combined = f"{title} {jd.title} {resume.summary}".lower()
    for family, keywords in ROLE_FAMILY_KEYWORDS.items():
        if any(keyword in combined for keyword in keywords):
            seniority = family
            if family in {"engineer", "senior_engineer"}:
                seniority = "senior_engineer" if family == "senior_engineer" else "engineer"
            return family, seniority

    if resume.leadership_signal >= 0.55:
        return "manager", "manager"
    if resume.architecture_signal >= 0.5:
        return "architect", "architect"
    if resume.inferred_years_band in {"8-11", "12+"}:
        return "lead", "lead"
    if resume.inferred_years_band in {"5-7"}:
        return "senior_engineer", "senior_engineer"
    return "engineer", "engineer"



def _distribution_for_role(role_family: str, total_questions: int) -> dict[str, int]:
    remaining = max(0, total_questions - 1)
    presets = {
        "engineer": {"deep_dive": 3, "project": 2, "behavioral": 1},
        "senior_engineer": {"deep_dive": 2, "project": 2, "architecture": 1, "behavioral": 1},
        "lead": {"deep_dive": 1, "project": 2, "architecture": 1, "leadership": 1, "behavioral": 1},
        "architect": {"deep_dive": 1, "project": 1, "architecture": 3, "behavioral": 1},
        "manager": {"project": 1, "architecture": 1, "leadership": 2, "behavioral": 2},
        "practice_head": {"architecture": 1, "leadership": 3, "behavioral": 2},
    }
    base = dict(presets.get(role_family, presets["engineer"]))
    current = sum(base.values())
    if current < remaining:
        expansion_order = {
            "engineer": ["deep_dive", "project", "behavioral"],
            "senior_engineer": ["deep_dive", "project", "architecture", "behavioral"],
            "lead": ["leadership", "architecture", "project", "behavioral", "deep_dive"],
            "architect": ["architecture", "deep_dive", "project", "behavioral"],
            "manager": ["leadership", "behavioral", "architecture", "project"],
            "practice_head": ["leadership", "behavioral", "architecture", "project"],
        }
        order = expansion_order.get(role_family, ["deep_dive", "project", "architecture", "leadership", "behavioral"])
        idx = 0
        while current < remaining:
            key = order[idx % len(order)]
            base[key] = base.get(key, 0) + 1
            current += 1
            idx += 1
    elif current > remaining:
        order = ["behavioral", "leadership", "architecture", "project", "deep_dive"]
        idx = 0
        while current > remaining and idx < 50:
            key = order[idx % len(order)]
            if base.get(key, 0) > 0:
                base[key] -= 1
                current -= 1
            idx += 1
    return {key: value for key, value in base.items() if value > 0}



def _make_topic_candidates(resume: StructuredResume, jd: StructuredJD, role_family: str) -> list[dict[str, object]]:
    candidates: list[dict[str, object]] = []
    resume_skill_set = {_normalize_skill_token(item): item for item in resume.skills}
    jd_skill_set = {_normalize_skill_token(item): item for item in jd.required_skills}
    overlap_keys = [key for key in resume_skill_set if key in jd_skill_set]
    resume_only_keys = [key for key in resume_skill_set if key not in jd_skill_set]
    jd_only_keys = [key for key in jd_skill_set if key not in resume_skill_set]

    for key in overlap_keys:
        canonical = resume_skill_set[key]
        evidence = [item for item in (resume.experiences + resume.projects) if canonical in item.skills]
        recency = max([item.recency for item in evidence], default=0.55)
        strength = max([item.strength for item in evidence], default=0.55)
        role_alignment = 0.85 if role_family in {"engineer", "senior_engineer", "lead"} else 0.6
        candidates.append({
            "kind": "skill",
            "label": canonical,
            "priority_source": "jd_resume_overlap",
            "score": round(1.1 + recency + strength + role_alignment, 3),
            "resume_alignment": round(min(1.0, 0.55 + strength), 3),
            "jd_alignment": 1.0,
            "role_alignment": round(role_alignment, 3),
            "evidence": evidence,
        })

    for key in resume_only_keys:
        canonical = resume_skill_set[key]
        evidence = [item for item in (resume.experiences + resume.projects) if canonical in item.skills]
        recency = max([item.recency for item in evidence], default=0.45)
        strength = max([item.strength for item in evidence], default=0.45)
        role_alignment = 0.75 if role_family in {"engineer", "senior_engineer"} else 0.55
        candidates.append({
            "kind": "skill",
            "label": canonical,
            "priority_source": "resume_strength",
            "score": round(0.65 + recency + strength + role_alignment, 3),
            "resume_alignment": round(min(1.0, 0.55 + strength), 3),
            "jd_alignment": 0.35,
            "role_alignment": round(role_alignment, 3),
            "evidence": evidence,
        })

    for key in jd_only_keys:
        canonical = jd_skill_set[key]
        candidates.append({
            "kind": "skill",
            "label": canonical,
            "priority_source": "jd_gap_probe",
            "score": round(0.55 + (0.7 if role_family in {"engineer", "senior_engineer", "architect"} else 0.45), 3),
            "resume_alignment": 0.15,
            "jd_alignment": 0.95,
            "role_alignment": 0.65,
            "evidence": [],
        })

    for item in resume.projects:
        project_boost = 0.3 if item.architecture > 0.35 else 0.0
        candidates.append({
            "kind": "project",
            "label": item.text,
            "priority_source": "recent_project" if item.recency >= 0.75 else "project_depth",
            "score": round(0.75 + item.recency + item.strength + project_boost, 3),
            "resume_alignment": round(min(1.0, 0.6 + item.strength), 3),
            "jd_alignment": round(0.45 + (0.15 * len(item.skills)), 3),
            "role_alignment": round(0.7 + item.architecture * 0.2, 3),
            "evidence": [item],
        })

    if role_family in {"architect", "lead", "manager", "practice_head"}:
        for item in resume.experiences + resume.projects:
            if item.architecture >= 0.3:
                candidates.append({
                    "kind": "architecture",
                    "label": item.text,
                    "priority_source": "architecture_signal",
                    "score": round(0.9 + item.architecture + item.recency, 3),
                    "resume_alignment": round(0.6 + item.architecture * 0.35, 3),
                    "jd_alignment": round(0.5 + jd.architecture_signal * 0.4, 3),
                    "role_alignment": 1.0 if role_family == "architect" else 0.8,
                    "evidence": [item],
                })
            if item.leadership >= 0.3:
                candidates.append({
                    "kind": "leadership",
                    "label": item.text,
                    "priority_source": "leadership_signal",
                    "score": round(0.85 + item.leadership + item.recency, 3),
                    "resume_alignment": round(0.6 + item.leadership * 0.35, 3),
                    "jd_alignment": round(0.45 + jd.leadership_signal * 0.45, 3),
                    "role_alignment": 1.0 if role_family in {"manager", "practice_head"} else 0.8,
                    "evidence": [item],
                })

    candidates.sort(key=lambda item: (float(item["score"]), float(item["resume_alignment"])), reverse=True)

    filtered: list[dict[str, object]] = []
    seen: set[tuple[str, str]] = set()
    for item in candidates:
        key = (str(item["kind"]), _normalize_skill_token(str(item["label"])))
        if key in seen:
            continue
        seen.add(key)
        relevance = max(float(item["resume_alignment"]), float(item["jd_alignment"]), float(item["role_alignment"]))
        if relevance < 0.5 and str(item["priority_source"]) != "jd_gap_probe":
            continue
        filtered.append(item)
        if len(filtered) >= 20:
            break
    return filtered



def _pick_evidence(candidate: dict[str, object], category: str, role_family: str) -> EvidenceItem | None:
    evidence = list(candidate.get("evidence") or [])
    if not evidence:
        return None
    if category == "leadership":
        evidence.sort(key=lambda item: (item.leadership, item.recency, item.strength), reverse=True)
    elif category == "architecture":
        evidence.sort(key=lambda item: (item.architecture, item.recency, item.strength), reverse=True)
    elif role_family in {"engineer", "senior_engineer"}:
        evidence.sort(key=lambda item: (item.recency, item.strength), reverse=True)
    else:
        evidence.sort(key=lambda item: (item.strength, item.recency), reverse=True)
    return evidence[0]



def _question_text(category: str, candidate: dict[str, object], context: PlannerContext, index: int) -> tuple[str, str | None]:
    label = str(candidate["label"])
    evidence = _pick_evidence(candidate, category, context.role_family)
    evidence_text = evidence.text if evidence else None
    skill = label if candidate.get("kind") == "skill" else None
    title = context.jd.title or context.title or "the role"

    if category == "deep_dive":
        if skill and evidence_text:
            return (
                f"You’ve worked with {skill}. Tell me about the most relevant recent example where you used it, what problem you were solving, and the trade-offs you handled.",
                evidence_text,
            )
        if skill:
            return (
                f"For this {title} role, walk me through a real task or feature where you used {skill} end to end. What decisions did you make and why?",
                None,
            )
        return (
            f"Walk me through the most technically demanding implementation you have handled recently. What made it difficult, and how did you resolve it?",
            evidence_text,
        )

    if category == "project":
        if evidence_text:
            return (
                f"In '{label}', what was the core objective, what exactly did you own, and how did you validate that your solution worked in practice?",
                evidence_text,
            )
        return (
            f"Tell me about the project or feature most relevant to this {title} role. What was your contribution and measurable impact?",
            None,
        )

    if category == "architecture":
        if evidence_text:
            return (
                f"Using '{label}' as context, explain the architecture or system-design choices involved. Why was that design appropriate, and what would you change at larger scale?",
                evidence_text,
            )
        return (
            f"For a {title} role, describe how you would design a scalable, observable, and maintainable solution for a core business workflow.",
            None,
        )

    if category == "leadership":
        if evidence_text:
            return (
                f"Tell me about a situation from '{label}' where you influenced direction, ownership, delivery, or stakeholders. What actions did you take and what changed because of you?",
                evidence_text,
            )
        return (
            f"Describe a time you led execution, mentored others, or aligned stakeholders to deliver an important outcome.",
            None,
        )

    hr_prompt = HR_QUESTIONS[index % len(HR_QUESTIONS)]
    return hr_prompt, evidence_text



def _difficulty_for(role_family: str, category: str) -> str:
    if category in {"architecture", "leadership"}:
        return "hard" if role_family in {"architect", "manager", "practice_head", "lead"} else "medium"
    if role_family in {"senior_engineer", "architect", "lead"}:
        return "medium"
    return "easy" if category == "behavioral" else "medium"



def _build_question(category: str, candidate: dict[str, object], context: PlannerContext, index: int) -> dict[str, object]:
    text, evidence_text = _question_text(category, candidate, context, index)
    skill_or_topic = str(candidate.get("label") or category)
    metadata = {
        "category": category,
        "priority_source": str(candidate.get("priority_source") or "derived"),
        "skill_or_topic": skill_or_topic,
        "role_alignment": round(float(candidate.get("role_alignment") or 0.0), 3),
        "resume_alignment": round(float(candidate.get("resume_alignment") or 0.0), 3),
        "jd_alignment": round(float(candidate.get("jd_alignment") or 0.0), 3),
        "relevance_score": round(max(
            float(candidate.get("role_alignment") or 0.0),
            float(candidate.get("resume_alignment") or 0.0),
            float(candidate.get("jd_alignment") or 0.0),
        ), 3),
        "role_family": context.role_family,
        "seniority": context.seniority,
        "evidence_excerpt": evidence_text,
    }
    return {
        "text": text,
        "type": category if category != "behavioral" else "hr",
        "category": category,
        "topic": skill_or_topic[:80],
        "intent": f"Assess {category.replace('_', ' ')} depth aligned to the {context.role_family} profile.",
        "focus_skill": skill_or_topic if candidate.get("kind") == "skill" else None,
        "project_name": skill_or_topic[:160] if candidate.get("kind") in {"project", "architecture", "leadership"} else None,
        "reference_answer": "A strong answer should be evidence-backed, explain decisions and trade-offs, and clearly describe the candidate's personal contribution and outcomes.",
        "difficulty": _difficulty_for(context.role_family, category),
        "priority_source": metadata["priority_source"],
        "role_alignment": metadata["role_alignment"],
        "resume_alignment": metadata["resume_alignment"],
        "jd_alignment": metadata["jd_alignment"],
        "metadata": metadata,
    }



def _fallback_candidate(category: str, context: PlannerContext) -> dict[str, object]:
    topic = {
        "deep_dive": context.jd.required_skills[0] if context.jd.required_skills else "technical depth",
        "project": context.resume.projects[0].text if context.resume.projects else "recent project",
        "architecture": context.jd.title or "system design",
        "leadership": context.resume.experiences[0].text if context.resume.experiences else "team ownership",
        "behavioral": "behavioral",
    }.get(category, "general")
    return {
        "kind": "skill" if category == "deep_dive" else "project",
        "label": topic,
        "priority_source": "fallback",
        "score": 0.6,
        "resume_alignment": 0.5,
        "jd_alignment": 0.5,
        "role_alignment": 0.6,
        "evidence": [],
    }



def build_question_plan(
    *,
    resume_text: str,
    jd_title: str | None,
    jd_skill_scores: Mapping[str, int] | None,
    question_count: int | None = None,
) -> dict[str, object]:
    total_questions = max(2, min(20, int(question_count or 8)))
    resume = _extract_structured_resume(resume_text or "")
    jd = _extract_structured_jd(jd_title, jd_skill_scores)
    role_family, seniority = _infer_role_family(jd_title or jd.title, resume, jd)
    distribution = _distribution_for_role(role_family, total_questions)
    topic_priorities = _make_topic_candidates(resume, jd, role_family)
    context = PlannerContext(
        role_family=role_family,
        seniority=seniority,
        title=_clean(jd_title or jd.title),
        resume=resume,
        jd=jd,
        topic_priorities=topic_priorities,
        distribution=distribution,
    )

    questions: list[dict[str, object]] = [dict(INTRO_QUESTION)]
    used_labels: set[str] = set()
    pool = list(topic_priorities)

    for category, count in distribution.items():
        created = 0
        for candidate in pool:
            label_key = f"{category}:{_normalize_skill_token(str(candidate.get('label') or ''))}"
            if label_key in used_labels:
                continue
            if category == "architecture" and candidate.get("kind") not in {"architecture", "project", "skill"}:
                continue
            if category == "leadership" and candidate.get("kind") not in {"leadership", "project"}:
                continue
            if category == "project" and candidate.get("kind") not in {"project", "skill"}:
                continue
            if category == "deep_dive" and candidate.get("kind") not in {"skill", "project"}:
                continue
            if category == "behavioral" and candidate.get("kind") not in {"project", "leadership", "skill", "architecture"}:
                continue

            questions.append(_build_question(category, candidate, context, created))
            used_labels.add(label_key)
            created += 1
            if created >= count:
                break
        while created < count:
            fallback = _fallback_candidate(category, context)
            questions.append(_build_question(category, fallback, context, created))
            created += 1

    questions = questions[:total_questions]
    project_like_count = sum(1 for item in questions if item.get("category") in {"deep_dive", "project", "architecture", "leadership"})
    hr_count = sum(1 for item in questions if item.get("category") == "behavioral")

    return {
        "questions": questions,
        "total_questions": len(questions),
        "project_count": project_like_count,
        "hr_count": hr_count,
        "project_questions_count": project_like_count,
        "theory_questions_count": hr_count,
        "intro_count": 1,
        "projects": [item.text for item in resume.projects[:6]],
        "meta": {
            "total_questions": len(questions),
            "project_count": project_like_count,
            "hr_count": hr_count,
            "project_questions_count": project_like_count,
            "theory_questions_count": hr_count,
            "intro_count": 1,
            "projects": [item.text for item in resume.projects[:6]],
            "role_family": role_family,
            "seniority": seniority,
            "distribution": distribution,
            "structured_resume": asdict(resume),
            "structured_jd": asdict(jd),
            "topic_priorities": topic_priorities,
        },
    }
