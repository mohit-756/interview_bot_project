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

import re
from collections import OrderedDict
from collections.abc import Mapping
from dataclasses import asdict, dataclass, field

from services.resume_parser import parse_resume_text

EMAIL_PATTERN = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
PHONE_PATTERN = re.compile(r"\b\+?\d[\d\s().-]{7,}\b")
NAMEY_HEADER_PATTERN = re.compile(r"^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$")
METRIC_PATTERN = re.compile(
    r"(\b\d+[\d,.]*\+?%\b|\b\d+x\b|\b\d+[\d,.]*\s*(?:ms|s|sec|seconds|minutes|hrs|hours|days|weeks|months|users|clients|customers|services|teams|engineers|apps|pipelines|projects|accounts|stores|records|events)\b)",
    re.IGNORECASE,
)

ROLE_FAMILY_KEYWORDS = {
    "practice_head": (
        "practice head", "head of", "delivery head", "practice lead", "practice manager", "capability head",
        "center of excellence", "coe lead", "practice director",
    ),
    "manager": (
        "engineering manager", "manager", "director", "vp", "vice president", "delivery manager", "program manager",
    ),
    "architect": (
        "architect", "solution architect", "enterprise architect", "principal architect", "platform architect",
    ),
    "lead": (
        "tech lead", "lead engineer", "technical lead", "team lead", "staff engineer", "principal engineer", "lead",
    ),
    "senior_engineer": (
        "senior", "sr.", "sr ", "sde 2", "sde2", "iii", "level 3", "software engineer ii",
    ),
    "engineer": (
        "engineer", "developer", "programmer", "sde", "software", "backend", "frontend", "full stack", "qa", "data engineer", "aiml engineer",
    ),
}

LEADERSHIP_TERMS = {
    "led", "owned", "mentored", "hired", "roadmap", "stakeholder", "strategy", "delivery", "managed", "budget",
    "cross-functional", "practice", "governance", "director", "head", "alignment", "capability",
}
ARCHITECTURE_TERMS = {
    "architecture", "scalable", "distributed", "microservices", "event-driven", "system design", "availability", "latency",
    "kafka", "cloud", "aws", "azure", "gcp", "platform", "governance", "lakehouse", "databricks",
}
FRONTEND_TERMS = {
    "frontend", "ui", "ux", "react", "javascript", "typescript", "next.js", "nextjs", "angular", "vue", "css",
    "component", "responsive", "browser", "accessibility", "figma",
}
BACKEND_TERMS = {
    "backend", "api", "service", "microservice", "fastapi", "django", "flask", "spring", "node", "java", "python",
    "postgres", "sql", "database", "integration", "webhook", "redis", "queue",
}
AIML_TERMS = {
    "aiml", "ai", "ml", "machine learning", "deep learning", "nlp", "llm", "rag", "prompt", "embedding", "inference",
    "model", "feature engineering", "evaluation", "mlops", "recall", "precision", "screening", "scoring", "ranking",
    "retrieval", "proctoring", "recommendation",
}
DATA_TERMS = {
    "data", "databricks", "lakehouse", "delta", "spark", "warehouse", "etl", "elt", "pipeline", "governance", "unity catalog",
    "airflow", "dbt", "analytics", "streaming", "medallion", "fabric",
}
RECENCY_TERMS = {"current", "present", "recent", "latest", "ongoing", "now"}

INTRO_QUESTION = {
    "text": "Please introduce yourself briefly and connect your background to this role, highlighting the project, platform, or business outcome that best represents your work.",
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


@dataclass
class EvidenceItem:
    text: str
    source: str
    recency: float = 0.4
    strength: float = 0.4
    leadership: float = 0.0
    architecture: float = 0.0
    measurable: float = 0.0
    kind_weight: float = 0.0
    label: str = ""
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


def _contains_metric(text: str | None) -> bool:
    return bool(METRIC_PATTERN.search(_clean(text)))


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


def _sanitize_evidence_text(value: str | None) -> str:
    cleaned = _clean(value)
    if not cleaned:
        return ""
    cleaned = EMAIL_PATTERN.sub("", cleaned)
    cleaned = PHONE_PATTERN.sub("", cleaned)
    cleaned = re.sub(r"https?://\S+", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\b(?:phone|mobile|email|gmail|contact|linkedin|address|location)\b.*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^[\-•*\d.)\s]+", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -|,")
    if NAMEY_HEADER_PATTERN.match(cleaned) and len(cleaned.split()) <= 3:
        return ""
    if len(cleaned) < 12:
        return ""
    lowered = cleaned.lower()
    if any(token in lowered for token in ("curriculum vitae", "resume", "professional summary", "career objective")):
        return ""
    if sum(ch.isdigit() for ch in cleaned) >= max(6, len(cleaned) // 4):
        return ""
    if "|" in cleaned and len(cleaned.split("|")) >= 3 and not any(term in lowered for term in ("platform", "system", "pipeline", "service", "project", "engineer", "architect", "developer")):
        return ""
    return cleaned


def _split_evidence_fragments(lines: list[str]) -> list[str]:
    fragments: list[str] = []
    for raw in lines:
        text = str(raw or "")
        if not _clean(text):
            continue
        parts = re.split(r"[\u2022•]|(?<!\b[A-Z])[;]+|(?<=[.!?])\s+|\s{2,}", text)
        for part in parts:
            cleaned = _sanitize_evidence_text(part)
            if not cleaned:
                continue
            if len(cleaned) > 260 and ":" in cleaned:
                subparts = [seg for seg in re.split(r":\s+", cleaned) if _clean(seg)]
                for seg in subparts:
                    seg_clean = _sanitize_evidence_text(seg)
                    if seg_clean:
                        fragments.append(seg_clean)
                continue
            fragments.append(cleaned)
    return _dedupe(fragments, limit=36)


def _projectish_phrase(text: str) -> str:
    cleaned = _sanitize_evidence_text(text)
    if not cleaned:
        return ""
    lowered = cleaned.lower()
    if any(token in lowered for token in ("professional summary", "career objective", "hyderabad", "india")):
        return ""
    if NAMEY_HEADER_PATTERN.match(cleaned) or re.match(r"^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4}\s+(?:architect|engineer|developer|manager|head)$", cleaned):
        return ""
    patterns = [
        (("veriton",), "Veriton data platform"),
        (("ai", "interview"), "AI interview system"),
        (("resume", "screen"), "resume screening system"),
        (("databricks", "lakehouse"), "Databricks Lakehouse platform"),
        (("lakehouse",), "Databricks Lakehouse platform"),
        (("databricks",), "Databricks data platform"),
        (("design system",), "design system"),
        (("analytics", "dashboard"), "analytics dashboard"),
        (("dashboard",), "analytics dashboard"),
        (("frontend", "ui"), "frontend UI system"),
        (("backend", "api"), "backend API system"),
        (("api", "platform"), "API platform"),
        (("data", "platform"), "data platform"),
        (("pipeline",), "data pipeline"),
        (("screening", "system"), "resume screening system"),
    ]
    lowered = cleaned.lower()
    for keywords, label in patterns:
        if all(keyword in lowered for keyword in keywords):
            return label

    head = re.split(r"[;:!?]", cleaned, maxsplit=1)[0]
    head = re.sub(r"\b(?:using|with|built|developed|implemented|designed|delivered|responsible for|worked on|at|for)\b.*", "", head, flags=re.IGNORECASE)
    head = re.sub(r"\s+", " ", head).strip(" -")
    words = head.split()
    if len(words) >= 2:
        phrase = " ".join(words[:6])
        if not NAMEY_HEADER_PATTERN.match(phrase):
            return phrase

    noun_chunks = re.findall(r"([A-Za-z][A-Za-z0-9+#./-]*(?:\s+[A-Za-z0-9+#./-]+){1,4}\s+(?:platform|system|pipeline|dashboard|service|application|portal|engine|workspace|lakehouse))", cleaned)
    if noun_chunks:
        return _clean(noun_chunks[0])
    return ""


def _evidence_priority(item: EvidenceItem) -> float:
    return round(item.kind_weight + item.recency + item.strength + item.measurable + (0.35 if item.label else 0.0), 3)


def _build_evidence_items(lines: list[str], source: str, known_skills: list[str]) -> list[EvidenceItem]:
    items: list[EvidenceItem] = []
    raw_fragments = _split_evidence_fragments(lines)
    ranked_fragments = sorted(
        enumerate(raw_fragments),
        key=lambda pair: (
            (1.0 if any(term in pair[1].lower() for term in RECENCY_TERMS | {"present", "current", "ongoing"}) else 0.0)
            + (0.9 if _projectish_phrase(pair[1]) else 0.0)
            + (0.45 if _contains_metric(pair[1]) else 0.0)
            + (0.35 if any(term in pair[1].lower() for term in ("ai", "ml", "nlp", "react", "frontend", "backend", "databricks", "lakehouse", "pipeline")) else 0.0),
            -pair[0],
        ),
        reverse=True,
    )
    fragments = [text for _, text in ranked_fragments]
    total = max(1, len(fragments))
    for index, line in enumerate(fragments[:14]):
        recency_rank = 1.0 - (index / total) * 0.55
        if any(term in line.lower() for term in RECENCY_TERMS):
            recency_rank = max(recency_rank, 0.95)
        skill_hits = [skill for skill in known_skills if _normalize_skill_token(skill) and _normalize_skill_token(skill) in _normalize_skill_token(line)]
        strength = min(1.0, 0.38 + (0.1 * len(skill_hits)) + (0.12 if _contains_metric(line) else 0.0))
        measurable = 0.8 if _contains_metric(line) else 0.0
        kind_weight = 1.2 if _projectish_phrase(line) else (0.95 if measurable else 0.55)
        items.append(
            EvidenceItem(
                text=line,
                source=source,
                recency=round(max(0.2, recency_rank), 3),
                strength=round(strength, 3),
                leadership=round(_score_text_signal(line, LEADERSHIP_TERMS), 3),
                architecture=round(_score_text_signal(line, ARCHITECTURE_TERMS), 3),
                measurable=measurable,
                kind_weight=kind_weight,
                label=_projectish_phrase(line),
                skills=_dedupe(skill_hits),
            )
        )
    items.sort(key=_evidence_priority, reverse=True)
    return items


def _extract_structured_resume(resume_text: str) -> StructuredResume:
    parsed = parse_resume_text(resume_text or "")
    skills = _dedupe([str(item) for item in (parsed.get("skills") or [])], limit=18)
    raw_lines = [_clean(line) for line in (resume_text or "").splitlines() if _clean(line)]
    experience_lines = [str(item) for item in (parsed.get("experience") or [])]
    project_lines = [str(item) for item in (parsed.get("projects") or [])]
    project_lines += [
        line for line in raw_lines
        if any(token in line.lower() for token in ("project", "system", "platform", "dashboard", "analysis", "pipeline", "lakehouse"))
        and (":" in line or len(line.split()) <= 18)
    ][:12]
    experience_lines += [
        line for line in raw_lines
        if any(token in line.lower() for token in ("developed", "built", "implemented", "designed", "led", "managed", "integrated", "optimized", "collaborated"))
    ][:16]
    measurable_lines = [str(item) for item in (parsed.get("measurable_impacts") or [])]

    experiences = _build_evidence_items(experience_lines + measurable_lines[:4], "experience", skills)
    projects = _build_evidence_items(project_lines + measurable_lines[:4], "project", skills)

    all_items = experiences + projects
    leadership_signal = round(sum(item.leadership for item in all_items) / len(all_items), 3) if all_items else 0.0
    architecture_signal = round(sum(item.architecture for item in all_items) / len(all_items), 3) if all_items else 0.0
    summary = _sanitize_evidence_text(parsed.get("summary") or "")
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
    combined = " ".join([
        title or "",
        jd.title,
        " ".join(jd.required_skills),
        resume.summary,
        " ".join(item.text for item in resume.projects[:4]),
        " ".join(item.text for item in resume.experiences[:4]),
    ]).lower()

    for family in ("practice_head", "manager", "architect", "lead", "senior_engineer", "engineer"):
        if any(keyword in combined for keyword in ROLE_FAMILY_KEYWORDS[family]):
            seniority = family if family not in {"engineer", "senior_engineer"} else family
            return family, seniority

    if resume.leadership_signal >= 0.58 and resume.inferred_years_band in {"8-11", "12+"}:
        return "manager", "manager"
    if resume.architecture_signal >= 0.52 and resume.inferred_years_band in {"5-7", "8-11", "12+"}:
        return "architect", "architect"
    if resume.inferred_years_band in {"8-11", "12+"}:
        return "lead", "lead"
    if resume.inferred_years_band in {"5-7"}:
        return "senior_engineer", "senior_engineer"
    return "engineer", "engineer"


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

    def _score(terms: set[str]) -> int:
        return sum(2 if f" {term} " in normalized else 0 for term in terms if " " in term) + sum(1 for term in terms if " " not in term and f" {term} " in normalized)

    frontend_score = _score(FRONTEND_TERMS)
    aiml_score = _score(AIML_TERMS)
    data_score = _score(DATA_TERMS)
    backend_score = _score(BACKEND_TERMS)

    if "ai interview system" in normalized or "resume screening system" in normalized or "screening" in normalized and "model" in normalized:
        aiml_score += 2
    if "databricks" in normalized or "lakehouse" in normalized or "unity catalog" in normalized:
        data_score += 2

    if data_score >= max(frontend_score, backend_score, aiml_score) and data_score >= 2:
        return "data"
    if aiml_score >= max(frontend_score, backend_score) and aiml_score >= 2:
        return "aiml"
    if frontend_score >= max(backend_score, data_score, aiml_score) and frontend_score >= 2:
        return "frontend"
    return "backend"


def get_resume_module(resume: StructuredResume) -> str:
    ordered = sorted(resume.projects + resume.experiences, key=_evidence_priority, reverse=True)
    for item in ordered:
        if item.label:
            return item.label
    return "your recent work"


def _distribution_for_role(role_family: str, total_questions: int) -> dict[str, int]:
    _ = role_family
    remaining = max(0, total_questions - 1)
    base = {"project": 1, "deep_dive": 1, "backend": 1, "debugging": 1, "architecture": 1, "leadership": 1}
    while sum(base.values()) < remaining:
        for key in ("project", "deep_dive", "architecture", "leadership", "backend", "debugging"):
            if sum(base.values()) >= remaining:
                break
            base[key] = base.get(key, 0) + 1
    while sum(base.values()) > remaining:
        for key in ("leadership", "backend", "deep_dive", "project"):
            if sum(base.values()) <= remaining:
                break
            if base.get(key, 0) > 0:
                base[key] -= 1
    return {k: v for k, v in base.items() if v > 0}


def _make_topic_candidates(resume: StructuredResume, jd: StructuredJD, role_family: str) -> list[dict[str, object]]:
    candidates: list[dict[str, object]] = []
    resume_skill_set = {_normalize_skill_token(item): item for item in resume.skills}
    jd_skill_set = {_normalize_skill_token(item): item for item in jd.required_skills}

    def _candidate_from_item(item: EvidenceItem, kind: str, priority_source: str, extra: float = 0.0) -> dict[str, object]:
        label = item.label or item.text
        role_alignment = 0.72 + (0.15 if kind in {"architecture", "leadership"} else 0.0)
        if kind == "architecture" and role_family == "architect":
            role_alignment = max(role_alignment, 0.92)
        if kind == "leadership" and role_family in {"lead", "manager", "practice_head"}:
            role_alignment = max(role_alignment, 0.9)
        return {
            "kind": kind,
            "label": label,
            "priority_source": priority_source,
            "score": round(_evidence_priority(item) + extra, 3),
            "resume_alignment": round(min(1.0, 0.58 + item.strength * 0.35), 3),
            "jd_alignment": round(0.45 + (0.12 * len(item.skills)), 3),
            "role_alignment": round(role_alignment, 3),
            "evidence": [item],
        }

    for item in resume.projects:
        candidates.append(_candidate_from_item(item, "project", "recent_project" if item.recency >= 0.75 else "resume_strength", 0.45))
    for item in resume.experiences[:8]:
        if item.label or item.measurable:
            candidates.append(_candidate_from_item(item, "project", "resume_strength", 0.25))
        if item.architecture >= 0.25:
            candidates.append(_candidate_from_item(item, "architecture", "architecture_signal", 0.35))
        if item.leadership >= 0.25:
            candidates.append(_candidate_from_item(item, "leadership", "leadership_signal", 0.35))

    overlap_keys = [key for key in resume_skill_set if key in jd_skill_set]
    jd_only_keys = [key for key in jd_skill_set if key not in resume_skill_set]
    for key in overlap_keys:
        canonical = resume_skill_set[key]
        evidence = [item for item in (resume.experiences + resume.projects) if canonical in item.skills]
        if evidence:
            best = sorted(evidence, key=_evidence_priority, reverse=True)[0]
            candidates.append({
                "kind": "skill_anchor",
                "label": best.label or canonical,
                "priority_source": "jd_resume_overlap",
                "score": round(_evidence_priority(best) + 0.25, 3),
                "resume_alignment": 0.92,
                "jd_alignment": 1.0,
                "role_alignment": 0.78,
                "evidence": [best],
                "focus_skill": canonical,
            })
    for key in jd_only_keys[:2]:
        canonical = jd_skill_set[key]
        candidates.append({
            "kind": "skill_gap",
            "label": canonical,
            "priority_source": "jd_gap_probe",
            "score": 0.95,
            "resume_alignment": 0.1,
            "jd_alignment": 0.95,
            "role_alignment": 0.7,
            "evidence": [],
            "focus_skill": canonical,
        })

    if role_family in {"architect", "lead", "manager", "practice_head"}:
        for item in resume.projects + resume.experiences:
            if item.architecture >= 0.3:
                candidates.append(_candidate_from_item(item, "architecture", "architecture_signal", 0.4))
            if item.leadership >= 0.3:
                candidates.append(_candidate_from_item(item, "leadership", "leadership_signal", 0.4))

    deduped: list[dict[str, object]] = []
    seen: set[tuple[str, str]] = set()
    for item in sorted(candidates, key=lambda x: (float(x["score"]), float(x["resume_alignment"])), reverse=True):
        key = (str(item["kind"]), _normalize_skill_token(str(item["label"])))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
        if len(deduped) >= 24:
            break
    return deduped


def _pick_evidence(candidate: dict[str, object], category: str, role_family: str) -> EvidenceItem | None:
    evidence = list(candidate.get("evidence") or [])
    if not evidence:
        return None
    if category == "leadership":
        evidence.sort(key=lambda item: (item.leadership, _evidence_priority(item)), reverse=True)
    elif category == "architecture":
        evidence.sort(key=lambda item: (item.architecture, _evidence_priority(item)), reverse=True)
    elif role_family in {"engineer", "senior_engineer"}:
        evidence.sort(key=_evidence_priority, reverse=True)
    else:
        evidence.sort(key=lambda item: (_evidence_priority(item), item.strength), reverse=True)
    return evidence[0]


def _slot_candidate(category: str, context: PlannerContext, occurrence: int = 1) -> dict[str, object]:
    role_track = _role_track(context)
    prioritized = list(context.topic_priorities or [])
    module_label = get_resume_module(context.resume)
    evidence_pool = sorted(context.resume.projects + context.resume.experiences, key=_evidence_priority, reverse=True)

    def _fallback(label: str, evidence: list[EvidenceItem] | None = None, *, kind: str = "project") -> dict[str, object]:
        return {
            "kind": kind,
            "label": label or module_label,
            "priority_source": "structured_slot",
            "score": 0.9,
            "resume_alignment": 0.85,
            "jd_alignment": 0.72,
            "role_alignment": 0.82,
            "evidence": evidence or [],
        }

    def _pick(*kinds: str, predicate=None) -> dict[str, object] | None:
        matches: list[dict[str, object]] = []
        for item in prioritized:
            if kinds and str(item.get("kind")) not in set(kinds):
                continue
            if predicate and not predicate(item):
                continue
            matches.append(dict(item))
        if not matches:
            return None
        return matches[min(len(matches) - 1, max(0, occurrence - 1))]

    if category == "intro":
        return _fallback(context.jd.title or context.title or "your background", kind="intro")

    best_project = next((item for item in context.resume.projects if item.label), None) or (context.resume.projects[0] if context.resume.projects else None)
    best_experience = next((item for item in context.resume.experiences if item.label), None) or (context.resume.experiences[0] if context.resume.experiences else best_project)
    debug_item = next((item for item in evidence_pool if any(term in item.text.lower() for term in ("debug", "bug", "failure", "incident", "issue", "root cause", "fix", "latency", "outage", "drift"))), None) or best_project
    architecture_item = next((item for item in evidence_pool if item.architecture >= 0.25 or any(term in item.text.lower() for term in ("design", "architecture", "platform", "scalable", "integration", "governance", "lakehouse"))), None) or best_project
    leadership_item = next((item for item in evidence_pool if item.leadership >= 0.25 or any(term in item.text.lower() for term in ("led", "stakeholder", "mentor", "managed", "delivery", "roadmap", "ownership", "hiring", "practice"))), None) or best_experience
    frontend_item = next((item for item in evidence_pool if any(term in item.text.lower() for term in ("frontend", "ui", "react", "component", "dashboard", "responsive", "browser", "design system"))), None)
    data_item = next((item for item in evidence_pool if any(term in item.text.lower() for term in ("databricks", "lakehouse", "pipeline", "governance", "spark", "warehouse", "platform"))), None)
    aiml_item = next((item for item in evidence_pool if any(term in item.text.lower() for term in ("ml", "ai", "nlp", "llm", "model", "recall", "precision", "rag", "inference"))), None)
    backend_item = next((item for item in evidence_pool if any(term in item.text.lower() for term in ("backend", "api", "service", "database", "integration", "workflow", "fastapi", "sql"))), None)

    if category == "project":
        chosen = frontend_item if role_track == "frontend" and frontend_item else data_item if role_track == "data" and data_item else aiml_item if role_track == "aiml" and aiml_item else best_project
        return _pick("project", "skill_anchor") or _fallback((chosen.label if chosen else module_label), [chosen] if chosen else [])
    if category == "deep_dive":
        chosen = frontend_item if role_track == "frontend" and frontend_item else data_item if role_track == "data" and data_item else aiml_item if role_track == "aiml" and aiml_item else backend_item or best_project
        return _pick("skill_anchor", predicate=lambda item: bool(item.get("evidence"))) or _pick("project", predicate=lambda item: bool(item.get("evidence"))) or _fallback((chosen.label if chosen else module_label), [chosen] if chosen else [])
    if category == "backend":
        chosen = frontend_item if role_track == "frontend" and frontend_item else data_item if role_track == "data" and data_item else aiml_item if role_track == "aiml" and aiml_item else backend_item or best_project
        return _pick("project", "architecture", predicate=lambda item: bool(item.get("evidence"))) or _fallback((chosen.label if chosen else module_label), [chosen] if chosen else [])
    if category == "debugging":
        return _pick("project", "skill_anchor", predicate=lambda item: bool(item.get("evidence"))) or _fallback((debug_item.label if debug_item else module_label), [debug_item] if debug_item else [])
    if category == "architecture":
        chosen = frontend_item if role_track == "frontend" and frontend_item else data_item if role_track == "data" and data_item else aiml_item if role_track == "aiml" and aiml_item else architecture_item
        return _pick("architecture") or _pick("project") or _fallback((chosen.label if chosen else module_label), [chosen] if chosen else [], kind="architecture")
    if category == "leadership":
        chosen = data_item if role_track == "data" and data_item and context.role_family in {"lead", "manager", "practice_head", "architect"} else leadership_item
        return _pick("leadership") or _pick("project") or _fallback((chosen.label if chosen else module_label), [chosen] if chosen else [], kind="leadership")
    return _fallback(module_label, [best_project] if best_project else [])


def _question_text(category: str, candidate: dict[str, object], context: PlannerContext, index: int, occurrence: int = 1) -> tuple[str, str | None]:
    evidence = _pick_evidence(candidate, category, context.role_family)
    evidence_text = _sanitize_evidence_text(evidence.text if evidence else None) or None
    role_label = _clean(context.jd.title or context.title or "this role")
    role_track = _role_track(context)
    strongest_project = get_resume_module(context.resume)
    target = _clean(str(candidate.get("label") or "")) or (evidence.label if evidence else strongest_project) or strongest_project
    target = _projectish_phrase(target) or strongest_project
    metric_hint = evidence_text if _contains_metric(evidence_text) else None
    impact_hint = metric_hint or "the outcome"

    if category == "intro":
        return (
            f"Please introduce yourself briefly and connect your background to {role_label}, highlighting the project, platform, or outcome that best represents your work.",
            evidence_text,
        )
    if category == "project":
        variants = [
            f"Walk me through {target}: what problem was it solving, what did you personally own, and what measurable result, adoption signal, or business outcome told you it was working?",
            f"Looking at {target}, what was the hardest part you owned directly, and how did you know your changes moved the product, platform, or business in the right direction?",
            f"When you worked on {target}, what was the concrete objective, where did your ownership begin and end, and what outcome made that work meaningful?",
            f"For {target}, what did you change in the code, workflow, or product itself that moved the needle, and how did you validate that impact in practice?",
            f"Take {target} as an example: where was the engineering risk, what part did you drive yourself, and what evidence convinced you the solution was working well enough to keep?",
        ]
        return (variants[(occurrence - 1) % len(variants)], evidence_text)
    if category == "deep_dive":
        if role_track == "frontend":
            return (
                f"In {target}, how did you break the UI into components, state boundaries, or reusable patterns, and what trade-offs shaped that structure?",
                evidence_text,
            )
        if role_track == "aiml":
            return (
                f"In {target}, how did you choose the model, feature, prompt, or evaluation approach you used, and what trade-offs mattered most for the real product constraint?",
                evidence_text,
            )
        if role_track == "data":
            return (
                f"In {target}, how did you decide the data model, orchestration approach, or platform pattern, and what trade-offs did you make around reliability, cost, and maintainability?",
                evidence_text,
            )
        return (
            f"In {target}, which implementation choice best shows how you make engineering decisions under real constraints, and why was that the right trade-off at the time?",
            evidence_text,
        )
    if category == "backend":
        if role_track == "frontend":
            return (
                f"In {target}, how did you handle API integration, responsiveness, and browser or state-management concerns so the user experience stayed stable as the UI grew?",
                evidence_text,
            )
        if role_track == "data":
            return (
                f"How was {target} structured so the platform could support more domains, stricter governance, or higher data volume without turning into a brittle pipeline chain?",
                evidence_text,
            )
        if role_track == "aiml":
            return (
                f"How did you structure the serving path, feature flow, or system integration around {target} so model behavior stayed reliable in production rather than only in offline evaluation?",
                evidence_text,
            )
        return (
            f"How did you structure the APIs, services, and data flow around {target} so the system stayed maintainable and reliable as usage grew?",
            evidence_text,
        )
    if category == "debugging":
        if role_track == "frontend":
            return (
                f"Tell me about a tricky bug or failure in {target}: what symptoms showed up first, how did you narrow the issue across UI, API, or state boundaries, and what change made the experience stable again?",
                evidence_text,
            )
        if role_track == "aiml":
            return (
                f"Tell me about a failure or quality issue in {target}: what signal told you the model or pipeline was off, how did you isolate the root cause, and what changed after the fix?",
                evidence_text,
            )
        if role_track == "data":
            return (
                f"Describe a production issue in {target}: what monitoring signal, data-quality break, or platform bottleneck surfaced first, how did you isolate the cause, and what prevented recurrence?",
                evidence_text,
            )
        return (
            f"Tell me about a failure or debugging issue in {target}: what signal told you something was wrong, how did you isolate the root cause, and what changed afterward?",
            evidence_text,
        )
    if category == "architecture":
        if role_track == "frontend":
            variants = [
                f"If {target} had to support more features, heavier usage, or faster release velocity, how would you evolve the frontend architecture, performance strategy, and collaboration model without hurting UX?",
                f"Suppose {target} had to handle a much broader product surface: how would you reshape the component architecture, state model, and performance guardrails before the UI became fragile?",
            ]
            return (variants[(occurrence - 1) % len(variants)], evidence_text)
        if role_track == "aiml":
            variants = [
                f"If {target} had to run at higher scale or tighter latency targets, how would you redesign the pipeline, serving path, or rollback strategy, and what trade-offs would you watch first?",
                f"If usage on {target} grew sharply, what would you change first in the model-serving path, evaluation loop, or fallback design so quality stayed stable under production pressure?",
            ]
            return (variants[(occurrence - 1) % len(variants)], evidence_text)
        if role_track == "data":
            variants = [
                f"If {target} had to scale across more domains, workloads, or enterprise controls, what architecture, governance, or cost-management changes would you make first, and why?",
                f"Imagine {target} becoming the shared platform for more business units: how would you evolve the lakehouse architecture, governance model, and operating boundaries before scale created delivery drag?",
            ]
            return (variants[(occurrence - 1) % len(variants)], evidence_text)
        variants = [
            f"If {target} had to handle more scale, tighter reliability targets, or broader integration requirements, what design or architecture changes would you make first and what trade-offs would you watch?",
            f"As {target} grows, where would you redraw service boundaries, contracts, or operational guardrails first, and what trade-offs would drive that decision?",
        ]
        return (variants[(occurrence - 1) % len(variants)], evidence_text)
    if category == "leadership":
        if context.role_family in {"lead", "manager", "practice_head"} or role_track == "data":
            variants = [
                f"Tell me about a situation around {target if role_track == 'data' else 'your recent work'} where you had to align stakeholders, make a delivery or platform decision, or scale ownership beyond implementation. What did you do and what was the outcome?",
                f"In work related to {target}, when did you have to push alignment across business, engineering, or delivery teams rather than just solve the technical problem yourself, and how did that change the outcome?",
                f"Give me an example from {target if role_track == 'data' else 'your recent work'} where ownership expanded beyond coding into planning, delegation, governance, or stakeholder management. How did you handle it?",
            ]
            return (variants[(occurrence - 1) % len(variants)], evidence_text)
        variants = [
            "Tell me about a situation in your recent work where you had to align people, make a delivery decision, or take ownership beyond implementation. How did you handle it and what was the outcome?",
            "When did your role expand beyond writing code into unblocking others, shaping scope, or driving a delivery decision, and what happened because of that?",
        ]
        return (variants[(occurrence - 1) % len(variants)], evidence_text)
    return (
        f"What from {target} best represents how you work in practice?",
        evidence_text,
    )


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


def _build_question(category: str, candidate: dict[str, object], context: PlannerContext, index: int, occurrence: int = 1) -> dict[str, object]:
    text, evidence_text = _question_text(category, candidate, context, index, occurrence)
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
        "relevance_score": round(max(float(candidate.get("role_alignment") or 0.0), float(candidate.get("resume_alignment") or 0.0), float(candidate.get("jd_alignment") or 0.0)), 3),
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
        "project_name": (skill_or_topic[:160] if public_category in {"project", "architecture", "leadership"} else None),
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
    openings: dict[str, int] = {}
    for question in questions:
        text = _clean(question.get("text"))
        similarity = re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", "", text.lower())).strip()
        first_six = _first_six_words(text)
        if similarity in similarity_seen or (first_six and first_six in first_six_seen):
            return True
        similarity_seen.add(similarity)
        first_six_seen.add(first_six)
        opening = " ".join(re.findall(r"[a-z0-9']+", text.lower())[:2])
        openings[opening] = openings.get(opening, 0) + 1
        if openings[opening] > 2:
            return True
    return False


def build_question_context(*, resume_text: str, jd_title: str | None, jd_skill_scores: Mapping[str, int] | None, question_count: int | None = None) -> dict[str, object]:
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


def build_question_plan(*, resume_text: str, jd_title: str | None, jd_skill_scores: Mapping[str, int] | None, question_count: int | None = None) -> dict[str, object]:
    total_questions = max(6, min(9, int(question_count or 8)))
    resume = _extract_structured_resume(resume_text or "")
    jd = _extract_structured_jd(jd_title, jd_skill_scores)
    role_family, seniority = _infer_role_family(jd_title or jd.title, resume, jd)
    topic_priorities = _make_topic_candidates(resume, jd, role_family)
    context = PlannerContext(
        role_family=role_family,
        seniority=seniority,
        title=_clean(jd_title or jd.title),
        resume=resume,
        jd=jd,
        topic_priorities=topic_priorities,
        distribution=_distribution_for_role(role_family, total_questions),
    )

    role_track = _role_track(context)
    if role_family == "architect":
        slot_order = ["intro", "project", "architecture", "deep_dive", "debugging", "architecture", "leadership"]
    elif role_family in {"manager", "practice_head"}:
        slot_order = ["intro", "project", "deep_dive", "debugging", "architecture", "leadership", "leadership"]
    elif role_family == "lead":
        slot_order = ["intro", "project", "deep_dive", "debugging", "architecture", "leadership", "project"]
    else:
        slot_order = ["intro", "project", "deep_dive", "backend", "debugging", "architecture", "project"]

    if total_questions >= 8:
        if role_family == "architect":
            slot_order.append("architecture")
        elif role_family in {"manager", "practice_head", "lead"}:
            slot_order.append("leadership")
        elif role_track == "data":
            slot_order.append("architecture")
        else:
            slot_order.append("project")
    if total_questions >= 9:
        if role_family in {"manager", "practice_head"}:
            slot_order.append("architecture")
        elif role_family == "architect":
            slot_order.append("project")
        elif role_track == "data":
            slot_order.append("project")
        else:
            slot_order.append("deep_dive")

    category_counts: dict[str, int] = {}
    questions: list[dict[str, object]] = []
    for i, slot in enumerate(slot_order[:total_questions], start=1):
        category_counts[slot] = category_counts.get(slot, 0) + 1
        occurrence = category_counts[slot]
        questions.append(_build_question(slot, _slot_candidate(slot, context, occurrence), context, i, occurrence))

    if _has_duplicate_structure(questions):
        category_counts = {}
        questions = []
        for i, slot in enumerate(slot_order[:total_questions], start=1):
            category_counts[slot] = category_counts.get(slot, 0) + 1
            occurrence = category_counts[slot] + 1
            questions.append(_build_question(slot, _slot_candidate(slot, context, occurrence), context, i + 10, occurrence))

    project_like_count = sum(1 for item in questions if item.get("category") in {"deep_dive", "project", "architecture", "leadership"})
    hr_count = sum(1 for item in questions if item.get("category") == "behavioral")
    intro_count = sum(1 for item in questions if item.get("category") == "intro")
    projects = [item.label or item.text for item in resume.projects[:6]]
    structured_resume_meta = {
        "projects": [item.text for item in resume.projects[:6]],
        "experience": [item.text for item in resume.experiences[:6]],
        "skills": list(resume.skills[:18]),
    }

    return {
        "questions": questions,
        "total_questions": len(questions),
        "project_count": project_like_count,
        "hr_count": hr_count,
        "project_questions_count": project_like_count,
        "theory_questions_count": hr_count,
        "intro_count": intro_count,
        "projects": projects,
        "meta": {
            "total_questions": len(questions),
            "project_count": project_like_count,
            "hr_count": hr_count,
            "project_questions_count": project_like_count,
            "theory_questions_count": hr_count,
            "intro_count": intro_count,
            "projects": projects,
            "role_family": role_family,
            "seniority": seniority,
            "distribution": context.distribution,
            "structured_resume": structured_resume_meta,
            "structured_jd": asdict(jd),
            "topic_priorities": topic_priorities,
            "resume_module": get_resume_module(resume),
            "role_track": role_track,
        },
    }
