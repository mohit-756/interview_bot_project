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
    "Tell me about a time requirements changed mid-delivery and you had to reset scope, communication, or execution without losing momentum.",
    "Describe a situation where you had to align teammates, product partners, or stakeholders around competing priorities or technical concerns.",
    "Tell me about a time you had to learn a domain, tool, or system constraint quickly so you could unblock delivery.",
    "Describe a difficult delivery or design trade-off you made under pressure. What did you optimize for and what did you deliberately defer?",
    "Tell me about a time a project was at risk and you took ownership to stabilize delivery, quality, or stakeholder confidence.",
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
EMAIL_PATTERN = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
NAMEY_HEADER_PATTERN = re.compile(r"^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$")


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



def get_resume_module(resume: StructuredResume) -> str:
    text_pool = " ".join(
        [resume.summary]
        + [item.text for item in resume.projects[:6]]
        + [item.text for item in resume.experiences[:6]]
    ).lower()
    mapping = [
        (("resume", "screen"), "resume screening system"),
        (("backend", "api"), "backend API system"),
        (("nlp", "scoring"), "NLP scoring system"),
        (("ai", "proctor"), "AI proctoring system"),
        (("candidate", "tracking"), "candidate tracking database"),
        (("database", "sql"), "candidate tracking database"),
        (("scoring",), "scoring system"),
        (("api",), "backend API system"),
        (("workflow",), "workflow system"),
        (("screening",), "screening system"),
    ]
    for keywords, label in mapping:
        if all(keyword in text_pool for keyword in keywords):
            return label
    return "system"



def _sanitize_evidence_text(value: str | None) -> str:
    cleaned = _clean(value)
    if not cleaned:
        return ""
    cleaned = EMAIL_PATTERN.sub("", cleaned)
    cleaned = re.sub(r"\b(?:phone|mobile|email|gmail|contact|linkedin)\b.*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\b\+?\d[\d\s().-]{7,}\b", "", cleaned)
    cleaned = re.sub(r"\b[A-Z]{2,}(?:\s+[A-Z]{2,})+\b", "", cleaned)
    cleaned = re.sub(r"[^A-Za-z0-9+#./,%()\-\s]", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -|,")
    if NAMEY_HEADER_PATTERN.match(cleaned) and len(cleaned.split()) <= 3:
        return ""
    return cleaned


def _evidence_label(value: str | None, fallback: str) -> str:
    cleaned = _sanitize_evidence_text(value)
    if not cleaned:
        return fallback
    lowered = cleaned.lower()
    mapping = [
        (("veriton",), "Veriton data platform"),
        (("frontend", "ui"), "frontend UI system"),
        (("design", "system"), "frontend UI system"),
        (("dashboard",), "frontend UI system"),
        (("backend", "api"), "backend API system"),
        (("api",), "backend API system"),
        (("lakehouse",), "data platform"),
        (("databricks",), "data platform"),
        (("pipeline",), "data pipeline"),
        (("resume", "screen"), "resume screening system"),
    ]
    for keywords, label in mapping:
        if all(keyword in lowered for keyword in keywords):
            return label
    return cleaned


def _clean_label(value: str | None, fallback: str) -> str:
    cleaned = _evidence_label(value, fallback)
    if not cleaned:
        return fallback
    cleaned = re.sub(r"^[\-•*\d.\)\(\s]+", "", cleaned)
    cleaned = re.split(r"[;:,.!?]|\b(using|built|developed|implemented|designed|worked on|responsible for|with)\b", cleaned, maxsplit=1, flags=re.IGNORECASE)[0]
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -")
    words = cleaned.split()
    if not words:
        return fallback
    return " ".join(words[:6])



def _role_track(context: PlannerContext) -> str:
    blob = " ".join([
        context.role_family,
        context.seniority,
        context.title,
        context.jd.title,
        " ".join(context.jd.required_skills),
        context.resume.summary,
        " ".join(item.text for item in (context.resume.projects[:4] + context.resume.experiences[:4])),
    ]).lower()
    normalized = f" {re.sub(r'[^a-z0-9+#./]+', ' ', blob)} "

    def _has(term: str) -> bool:
        return f" {term} " in normalized

    if any(_has(term) for term in ("frontend", "react", "javascript", "typescript", "ui", "ux", "css", "angular", "vue")) or " design system " in normalized:
        return "frontend"
    if any(_has(term) for term in ("aiml", "ml", "nlp", "llm", "databricks", "lakehouse", "spark", "pipeline", "warehouse")) or " machine learning " in normalized or " data engineer " in normalized:
        return "data"
    return "backend"


def _slot_candidate(category: str, context: PlannerContext) -> dict[str, object]:
    module_label = get_resume_module(context.resume)
    prioritized = list(context.topic_priorities or [])
    evidence_pool = context.resume.projects + context.resume.experiences
    role_track = _role_track(context)

    def _fallback(label: str, evidence: list[EvidenceItem] | None = None, *, kind: str = "project") -> dict[str, object]:
        return {
            "kind": kind,
            "label": label or module_label,
            "priority_source": "structured_slot",
            "score": 0.9,
            "resume_alignment": 0.8,
            "jd_alignment": 0.7,
            "role_alignment": 0.8,
            "evidence": evidence or [],
        }

    def _pick(kind: str | None = None, predicate=None) -> dict[str, object] | None:
        for item in prioritized:
            if kind and str(item.get("kind")) != kind:
                continue
            if predicate and not predicate(item):
                continue
            return dict(item)
        return None

    intro = _fallback(_clean_label(context.jd.title or context.title, "your background"), kind="intro")
    if category == "intro":
        return intro

    project_item = context.resume.projects[0] if context.resume.projects else (evidence_pool[0] if evidence_pool else None)
    experience_item = context.resume.experiences[0] if context.resume.experiences else project_item
    backend_item = next(
        (
            item for item in evidence_pool
            if any(term in item.text.lower() for term in ("backend", "api", "service", "pipeline", "workflow", "database", "fastapi", "sql", "integration"))
        ),
        None,
    )
    frontend_item = next(
        (
            item for item in evidence_pool
            if any(term in item.text.lower() for term in ("frontend", "ui", "react", "component", "design system", "state", "responsive", "browser", "dashboard"))
        ),
        None,
    )
    debug_item = next(
        (
            item for item in evidence_pool
            if any(term in item.text.lower() for term in ("debug", "bug", "failure", "incident", "issue", "root cause", "fix", "latency", "outage"))
        ),
        None,
    )
    architecture_item = next(
        (
            item for item in evidence_pool
            if any(term in item.text.lower() for term in ("architecture", "design", "scalable", "distributed", "microservices", "integration", "platform", "cloud"))
        ),
        None,
    )
    leadership_item = next(
        (
            item for item in evidence_pool
            if any(term in item.text.lower() for term in ("led", "lead", "stakeholder", "mentor", "managed", "ownership", "roadmap", "delivery"))
        ),
        None,
    )

    if category == "project":
        return _pick("project") or _fallback(_clean_label(project_item.text if project_item else module_label, module_label), [project_item] if project_item else [])
    if category == "deep_dive":
        preferred_item = frontend_item if role_track == "frontend" and frontend_item else project_item
        return (
            _pick(predicate=lambda item: str(item.get("kind")) in {"project", "skill"} and item.get("evidence"))
            or _fallback(_clean_label(preferred_item.text if preferred_item else module_label, module_label), [preferred_item] if preferred_item else [])
        )
    if category == "backend":
        chosen = frontend_item if role_track == "frontend" and frontend_item else backend_item
        return (
            _pick(predicate=lambda item: any(ev for ev in (item.get("evidence") or []) if any(term in ev.text.lower() for term in ("api", "service", "backend", "pipeline", "database", "integration", "ui", "component", "state", "browser", "responsive"))))
            or _fallback(_clean_label(chosen.text if chosen else project_item.text if project_item else module_label, module_label), [chosen] if chosen else ([project_item] if project_item else []))
        )
    if category == "debugging":
        return (
            _pick(predicate=lambda item: any(ev for ev in (item.get("evidence") or []) if any(term in ev.text.lower() for term in ("debug", "bug", "failure", "incident", "issue", "fix", "root cause"))))
            or _fallback(_clean_label(debug_item.text if debug_item else project_item.text if project_item else module_label, module_label), [debug_item] if debug_item else ([project_item] if project_item else []))
        )
    if category == "architecture":
        return (
            _pick("architecture")
            or _pick(predicate=lambda item: any(ev for ev in (item.get("evidence") or []) if any(term in ev.text.lower() for term in ("design", "architecture", "scalable", "distributed", "platform", "integration", "cloud"))))
            or _fallback(_clean_label(architecture_item.text if architecture_item else project_item.text if project_item else module_label, module_label), [architecture_item] if architecture_item else ([project_item] if project_item else []))
        )
    if category == "leadership":
        return (
            _pick("leadership")
            or _fallback(_clean_label(leadership_item.text if leadership_item else experience_item.text if experience_item else "your recent work", "your recent work"), [leadership_item] if leadership_item else ([experience_item] if experience_item else []))
        )
    return _fallback(module_label, [project_item] if project_item else [])



def _question_text(category: str, candidate: dict[str, object], context: PlannerContext, index: int) -> tuple[str, str | None]:
    label = _clean_label(str(candidate.get("label") or ""), get_resume_module(context.resume))
    evidence = _pick_evidence(candidate, category, context.role_family)
    evidence_text = _sanitize_evidence_text(evidence.text if evidence else None) or None
    role_label = _clean(context.jd.title or context.title or "this role")
    module_label = get_resume_module(context.resume)
    role_track = _role_track(context)
    target = label or module_label or "system"

    if category == "intro":
        return (
            f"Please introduce yourself briefly and connect your background to {role_label}, highlighting the project or system that best represents your work.",
            evidence_text,
        )
    if category == "project":
        return (
            f"Walk me through {target}: what problem was it solving, what did you personally own, and what concrete outcome, metric, or user impact told you it was working?",
            evidence_text,
        )
    if category == "deep_dive":
        if role_track == "frontend":
            return (
                f"In {target}, how did you break down the UI into components, state boundaries, or reusable patterns, and what trade-offs shaped that structure?",
                evidence_text,
            )
        return (
            f"Thinking about {target}, which implementation choice or trade-off best shows how you make technical decisions under real constraints, and why did you choose that path?",
            evidence_text,
        )
    if category == "backend":
        if role_track == "frontend":
            return (
                f"For {target}, how did you handle responsiveness, cross-browser behavior, and API or state integration so the user experience stayed stable as the UI grew?",
                evidence_text,
            )
        return (
            f"In {target}, how did you structure the APIs, services, integrations, or data flow so the system stayed maintainable and reliable as real usage increased?",
            evidence_text,
        )
    if category == "debugging":
        if role_track == "frontend":
            return (
                f"Describe a tricky UI, API-integration, or state bug from {target}: what symptoms showed up first, how did you narrow the issue, and what change made the experience stable again?",
                evidence_text,
            )
        return (
            f"Describe a failure, debugging issue, or production problem from {target}: what signals told you something was wrong, how did you isolate the root cause, and what changed afterward?",
            evidence_text,
        )
    if category == "architecture":
        if role_track == "frontend":
            return (
                f"If {target} had to support more features, heavier usage, or faster releases, how would you evolve the frontend architecture, performance strategy, and collaboration model without hurting UX?",
                evidence_text,
            )
        return (
            f"If {target} had to handle more scale, tighter reliability targets, or broader integration requirements, what design or architecture changes would you make first and what trade-offs would you watch?",
            evidence_text,
        )
    if category == "leadership":
        return (
            f"Tell me about a situation in your recent work where you had to align people, make a delivery decision, or take ownership beyond implementation. How did you handle it and what was the outcome?",
            evidence_text,
        )
    hr_prompt = HR_QUESTIONS[index % len(HR_QUESTIONS)]
    return hr_prompt, evidence_text



def _difficulty_for(role_family: str, category: str) -> str:
    if category in {"architecture", "leadership"}:
        return "hard" if role_family in {"architect", "manager", "practice_head", "lead"} else "medium"
    if category in {"debugging", "backend", "deep_dive", "project"}:
        return "medium"
    return "easy"



def _reference_answer_for(category: str) -> str:
    if category == "architecture":
        return "A strong answer should explain the design changes, trade-offs, scaling plan, and how reliability or observability would be validated."
    if category == "debugging":
        return "A strong answer should explain the failure signal, debugging steps, root cause, the fix, and how recurrence was prevented."
    if category == "backend":
        return "A strong answer should explain implementation structure, interfaces, data flow, operational concerns, and why that approach held up in practice."
    if category == "leadership":
        return "A strong answer should describe the situation, ownership taken, how alignment or delivery was handled, and the concrete result."
    if category == "project":
        return "A strong answer should clearly state the problem, the candidate's ownership, key decisions, execution details, and measurable impact."
    if category == "deep_dive":
        return "A strong answer should focus on a concrete implementation choice, trade-offs, reasoning, and lessons learned."
    return "A strong answer should explain the candidate's real contribution, decisions, execution details, validation approach, and outcomes."



def _build_question(category: str, candidate: dict[str, object], context: PlannerContext, index: int) -> dict[str, object]:
    text, evidence_text = _question_text(category, candidate, context, index)
    skill_or_topic = str(candidate.get("label") or category)
    normalized_category = "behavioral" if category == "behavioral" else category
    public_category = "project" if category == "backend" else normalized_category
    metadata = {
        "category": public_category,
        "slot": category,
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
        "type": "hr" if public_category == "behavioral" else public_category,
        "category": public_category,
        "topic": skill_or_topic[:80],
        "intent": f"Assess {category.replace('_', ' ')} depth aligned to the {context.role_family} profile.",
        "focus_skill": None,
        "project_name": skill_or_topic[:160] if public_category in {"project", "architecture", "leadership"} else None,
        "reference_answer": _reference_answer_for(category),
        "difficulty": _difficulty_for(context.role_family, category),
        "priority_source": metadata["priority_source"],
        "role_alignment": metadata["role_alignment"],
        "resume_alignment": metadata["resume_alignment"],
        "jd_alignment": metadata["jd_alignment"],
        "metadata": metadata,
    }



def _first_six_words(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9']+", text.lower())[:6])



def _has_duplicate_structure(questions: list[dict[str, object]]) -> bool:
    similarity_seen: set[str] = set()
    first_six_seen: set[str] = set()
    opening_limits = {
        "think back": 0,
        "describe a situation": 0,
        "choose a project": 0,
    }
    for question in questions:
        text = _clean(question.get("text"))
        similarity = re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", "", text.lower())).strip()
        first_six = _first_six_words(text)
        if similarity in similarity_seen or (first_six and first_six in first_six_seen):
            return True
        similarity_seen.add(similarity)
        first_six_seen.add(first_six)
        lowered = text.lower()
        for prefix in opening_limits:
            if lowered.startswith(prefix):
                opening_limits[prefix] += 1
                if opening_limits[prefix] > 1:
                    return True
    return False


def build_question_context(
    *,
    resume_text: str,
    jd_title: str | None,
    jd_skill_scores: Mapping[str, int] | None,
    question_count: int | None = None,
) -> dict[str, object]:
    resume = _extract_structured_resume(resume_text or "")
    jd = _extract_structured_jd(jd_title, jd_skill_scores)
    role_family, seniority = _infer_role_family(jd_title or jd.title, resume, jd)
    distribution = _distribution_for_role(role_family, max(2, min(20, int(question_count or 8))))
    topic_priorities = _make_topic_candidates(resume, jd, role_family)

    return {
        "role_title": _clean(jd_title or jd.title),
        "role_family": role_family,
        "seniority": seniority,
        "distribution": distribution,
        "jd_core_skills": jd.required_skills[:8],
        "jd_keywords": jd.keywords[:12],
        "resume_summary": resume.summary,
        "resume_projects": [item.text for item in resume.projects[:6]],
        "resume_recent_experience": [item.text for item in resume.experiences[:6]],
        "resume_skills": resume.skills[:12],
        "resume_certifications": resume.certifications[:5],
        "resume_leadership_signal": resume.leadership_signal,
        "resume_architecture_signal": resume.architecture_signal,
        "topic_priorities": topic_priorities[:10],
    }


def build_question_plan(
    *,
    resume_text: str,
    jd_title: str | None,
    jd_skill_scores: Mapping[str, int] | None,
    question_count: int | None = None,
) -> dict[str, object]:
    total_questions = max(6, min(9, int(question_count or 8)))
    resume = _extract_structured_resume(resume_text or "")
    jd = _extract_structured_jd(jd_title, jd_skill_scores)
    role_family, seniority = _infer_role_family(jd_title or jd.title, resume, jd)
    topic_priorities = _make_topic_candidates(resume, jd, role_family)
    distribution = {
        "intro": 1,
        "project": 1,
        "deep_dive": 1,
        "backend": 1,
        "debugging": 1,
        "architecture": 1,
        "leadership": 1,
    }
    context = PlannerContext(
        role_family=role_family,
        seniority=seniority,
        title=_clean(jd_title or jd.title),
        resume=resume,
        jd=jd,
        topic_priorities=topic_priorities,
        distribution=distribution,
    )

    slot_order = ["intro", "project", "deep_dive", "backend", "debugging", "architecture", "leadership"]
    role_slot_presets = {
        "engineer": ["intro", "project", "deep_dive", "backend", "debugging", "architecture", "leadership"],
        "senior_engineer": ["intro", "project", "deep_dive", "backend", "debugging", "architecture", "leadership"],
        "lead": ["intro", "project", "deep_dive", "debugging", "architecture", "leadership", "leadership"],
        "architect": ["intro", "project", "architecture", "deep_dive", "debugging", "architecture", "leadership"],
        "manager": ["intro", "project", "debugging", "architecture", "leadership", "leadership", "architecture"],
        "practice_head": ["intro", "project", "architecture", "debugging", "leadership", "leadership", "architecture"],
    }
    slot_order = list(role_slot_presets.get(role_family, slot_order))
    if total_questions == 6:
        slot_order = slot_order[:6]
    elif total_questions == 8:
        if role_family in {"architect", "manager", "practice_head", "lead"}:
            slot_order.append("leadership" if role_family in {"manager", "practice_head", "lead"} else "architecture")
        else:
            slot_order.append("project")
    elif total_questions >= 9:
        extra_slots = ["project", "deep_dive"]
        if role_family == "architect":
            extra_slots = ["architecture", "project"]
        elif role_family in {"manager", "practice_head"}:
            extra_slots = ["leadership", "architecture"]
        elif role_family == "lead":
            extra_slots = ["leadership", "project"]
        slot_order.extend(extra_slots)

    def _build_slot_set(active_slots: list[str], variant: int = 0) -> list[dict[str, object]]:
        questions: list[dict[str, object]] = []
        for index, slot in enumerate(active_slots, start=1):
            candidate = _slot_candidate(slot, context)
            if variant:
                candidate = dict(candidate)
                if slot in {"project", "deep_dive", "backend", "debugging", "architecture"}:
                    candidate["label"] = get_resume_module(resume) if index % 2 == 0 else candidate.get("label")
                if slot == "leadership" and variant > 1:
                    candidate["label"] = "your recent work"
            questions.append(_build_question(slot, candidate, context, index))
        return questions

    final_questions = _build_slot_set(slot_order)
    if _has_duplicate_structure(final_questions):
        final_questions = _build_slot_set(slot_order, variant=1)
    if _has_duplicate_structure(final_questions):
        final_questions = _build_slot_set(slot_order, variant=2)

    if _has_duplicate_structure(final_questions):
        role_track = _role_track(context)
        if role_family in {"manager", "practice_head", "lead"}:
            rewrites = {
                1: "Walk me through the platform or transformation program where your ownership had the clearest delivery or business impact.",
                2: "Which operating-model, architecture, or delivery trade-off from that work best shows how you make leadership decisions under constraints?",
                3: "How did you structure delivery, governance, or cross-team execution so the platform stayed scalable and maintainable across stakeholders?",
                4: "Describe a platform, delivery, or stakeholder issue you had to debug: what signals surfaced first, how did you isolate the real cause, and what changed afterward?",
                5: "If that program had to scale across more teams, accounts, or workloads, what architecture, governance, or capability changes would you make first?",
                6: "Tell me about a time you had to align senior stakeholders, delivery leaders, or partner teams around a difficult decision and what outcome you drove.",
            }
        elif role_track == "frontend":
            rewrites = {
                1: "Walk me through the frontend product area or UI system where your ownership and user impact were clearest.",
                2: "Which component, state-management, or implementation trade-off from that work best shows how you make frontend decisions under constraints?",
                3: "How did you organize components, API integration, and state flow so the UI stayed maintainable as the product evolved?",
                4: "Describe a tricky UI, browser, or API-state issue you debugged: what symptoms showed up first, how did you narrow the cause, and what stabilized the experience?",
                5: "If that frontend had to support more features or heavier usage, what architecture or performance changes would you make first?",
                6: "Tell me about a release where you had to align design, product, and engineering trade-offs while keeping the user experience stable.",
            }
        else:
            rewrites = {
                1: "Walk me through the most concrete project or system you worked on recently: what problem did it solve and what did you own?",
                2: "What implementation trade-off from your recent work best shows how you make engineering decisions under constraints?",
                3: "How did you organize the backend, services, or data flow in your recent work so the system remained maintainable?",
                4: "Describe a debugging issue you investigated recently: what symptoms appeared first, how did you narrow the cause, and what fixed it?",
                5: "How would you redesign the system you know best to improve scale, reliability, or observability without overcomplicating it?",
                6: "Tell me about a time you had to take ownership, align people, or push a delivery decision forward when things were unclear.",
            }
        for idx, text in rewrites.items():
            if idx < len(final_questions):
                final_questions[idx]["text"] = text

    project_like_count = sum(1 for item in final_questions if item.get("category") in {"deep_dive", "project", "architecture", "leadership"})
    hr_count = sum(1 for item in final_questions if item.get("category") == "behavioral")
    intro_count = sum(1 for item in final_questions if item.get("category") == "intro")
    projects = [item.text for item in resume.projects[:6]]
    structured_resume_meta = {
        "projects": [item.text for item in resume.projects[:6]],
        "experience": [item.text for item in resume.experiences[:6]],
        "skills": list(resume.skills[:18]),
    }

    return {
        "questions": final_questions,
        "total_questions": len(final_questions),
        "project_count": project_like_count,
        "hr_count": hr_count,
        "project_questions_count": project_like_count,
        "theory_questions_count": hr_count,
        "intro_count": intro_count,
        "projects": projects,
        "meta": {
            "total_questions": len(final_questions),
            "project_count": project_like_count,
            "hr_count": hr_count,
            "project_questions_count": project_like_count,
            "theory_questions_count": hr_count,
            "intro_count": intro_count,
            "projects": projects,
            "role_family": role_family,
            "seniority": seniority,
            "distribution": distribution,
            "structured_resume": structured_resume_meta,
            "structured_jd": asdict(jd),
            "topic_priorities": topic_priorities,
            "resume_module": get_resume_module(resume),
        },
    }
