"""LLM-first interview question generation with deterministic fallback helpers."""
from __future__ import annotations

import json
import logging
import re
from collections import OrderedDict
from collections.abc import Mapping
from dataclasses import asdict, dataclass

from services.llm.client import _clean_json, _get_client, _llm_model
from services.question_plan import build_question_plan
from services.resume_parser import parse_resume_text

logger = logging.getLogger(__name__)

LLM_QUESTION_SYSTEM_PROMPT = """You are a senior technical interviewer and hiring panelist.
Your task is to generate high-quality interview questions using a job description and a candidate resume.

Use this intent exactly while preserving the runtime JSON schema:
- Questions must be grounded in resume projects, experience, and skills plus the JD role.
- No generic skill questions.
- No repeated structure.
- No skill-clone patterns.
- Required coverage/distribution should include: intro, project deep dive, implementation trade-offs, architecture/design, debugging/failure (mandatory), performance/scaling (mandatory), role-specific, API/system integration, behavioral/leadership.

Priority order for question selection:
1. Recent role achievements and concrete ownership from the resume
2. Named resume projects and implementations
3. Measurable impact from the resume
4. High-priority JD core skills and responsibilities
5. Behavioral coverage only when needed for the role

Hard rules:
- Return ONLY valid JSON.
- Preserve the exact response shape requested below.
- Questions must be grounded in the candidate's actual resume projects, recent work, leadership experience, or measurable impact.
- Prioritize JD core skills only when they are supported by the resume OR central to the role.
- At least 50% of the questions should be grounded in named resume projects, recent role achievements, or measurable outcomes when that evidence is available.
- Ask about actual resume projects before asking generic skill questions.
- Prefer referencing measurable outcomes when available, such as performance improvement, scale, latency, throughput, cost reduction, adoption, or accuracy/recall/precision impact.
- If a question is project-related, it must include either a project name or a concrete metric, scale, latency, users, throughput, percentage, cost, or impact signal.
- Across the set, include: one intro/background opener, project deep dive coverage, implementation trade-off coverage, architecture/design coverage, debugging/failure coverage, performance/scaling coverage, role-specific coverage, API/system integration coverage, and behavioral/leadership coverage when supported.
- Debugging/failure coverage is mandatory.
- Performance/scaling coverage is mandatory.
- Design/architecture coverage is mandatory.
- For each strong project or major role achievement, aim to cover execution, decision/trade-off, and debugging/failure angles across the set.
- At least one question must explore failure, debugging, trade-offs, or something that did not work.
- Match role family and seniority:
  - Engineer -> implementation, debugging, APIs, project execution
  - Architect -> system design, trade-offs, scalability, governance
  - Lead/Head/Manager -> strategy, stakeholder alignment, delivery quality, practice/team building
- For architect, lead, head, manager, or practice profiles, include architecture trade-offs, governance/scalability, stakeholder alignment, and delivery/practice-building depth. Avoid junior-level phrasing.
- For senior roles, include leadership, stakeholder, and scaling questions.
- Use natural, human interviewer phrasing.
- Questions should feel analytical, reflective, scenario-based, and role-appropriate.
- Prefer specific prompts like 'Walk me through...', 'How did you decide...', 'What trade-offs did you consider...', 'Tell me about a time...', but do not repeat one opening style too often.
- Avoid generic phrasing like 'used X end to end' or 'most relevant project'.
- Reject weak language such as 'what is your experience with' or 'explain what is'.
- Avoid duplicate question patterns, and do not start more than two questions with the same opening pattern.
- Use only 1-2 behavioral questions maximum.
- Never ask about a minor skill unless it is clearly important for the role.
- Reject questions that could apply unchanged to almost any candidate.

Return a JSON object with this exact shape:
{
  "questions": [
    {
      "text": "string",
      "category": "intro|deep_dive|project|architecture|leadership|behavioral",
      "focus_skill": "string or null",
      "project_name": "string or null",
      "intent": "string",
      "reference_answer": "string",
      "difficulty": "easy|medium|hard",
      "priority_source": "resume_strength|jd_resume_overlap|jd_gap_probe|recent_project|architecture_signal|leadership_signal|baseline",
      "rationale": "short explanation grounded in the provided context"
    }
  ]
}
"""


@dataclass
class StructuredQuestionInput:
    role: str
    role_title: str
    role_family: str
    seniority: str
    experience_level: str
    jd_title: str
    jd_summary: str
    jd_core_skills: list[str]
    jd_secondary_skills: list[str]
    jd_responsibilities: list[str]
    jd_skills: list[str]
    jd_skill_weights: dict[str, int]
    resume_summary: str
    resume_recent_roles: list[str]
    resume_skills: list[str]
    resume_projects: list[str]
    resume_project_technologies: list[str]
    resume_experiences: list[str]
    resume_leadership_signals: list[str]
    resume_measurable_impact: list[str]
    certifications: list[str]
    overlap_skills: list[str]
    resume_only_skills: list[str]
    jd_only_skills: list[str]


def _clean(value: str | None) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _dedupe_strings(values: list[str], *, limit: int | None = None) -> list[str]:
    seen: OrderedDict[str, str] = OrderedDict()
    for value in values:
        cleaned = _clean(value)
        if not cleaned:
            continue
        key = cleaned.lower()
        if key not in seen:
            seen[key] = cleaned
        if limit and len(seen) >= limit:
            break
    return list(seen.values())


def _normalize_token(value: str | None) -> str:
    return re.sub(r"[^a-z0-9+#./ %:-]+", "", _clean(value).lower()).strip()


def _similarity_key(value: str | None) -> str:
    lowered = _normalize_token(value)
    lowered = re.sub(r"\b(tell me about|walk me through|describe|explain|how would you|how do you|in your|for your|can you)\b", "", lowered)
    return re.sub(r"\s+", " ", lowered).strip()


def _opening_pattern(text: str | None) -> str:
    words = re.findall(r"[a-z0-9']+", _normalize_token(text))
    return " ".join(words[:2])


def _build_jd_text(jd_title: str | None, jd_skill_scores: Mapping[str, int] | None, jd_text: str | None = None) -> str:
    if _clean(jd_text):
        return _clean(jd_text)
    skills = [f"{skill} ({int(weight)})" for skill, weight in (jd_skill_scores or {}).items() if _clean(skill)]
    sections = [f"Role: {_clean(jd_title or 'Interview Role')}"]
    if skills:
        sections.append("Required skills: " + ", ".join(skills))
    return "\n".join(sections)


def _infer_experience_level(summary: str, resume_text: str) -> str:
    combined = f"{summary}\n{resume_text}".lower()
    match = re.search(r"(\d+)\+?\s*(?:years|yrs)", combined)
    years = int(match.group(1)) if match else None
    if years is not None:
        if years >= 12:
            return "executive"
        if years >= 8:
            return "staff_plus"
        if years >= 5:
            return "senior"
        if years >= 2:
            return "mid"
        return "junior"
    if any(term in combined for term in ("practice head", "director", "vp", "vice president")):
        return "executive"
    if any(term in combined for term in ("architect", "principal", "staff", "lead")):
        return "staff_plus"
    if "senior" in combined:
        return "senior"
    return "junior"


def _extract_inline_section_values(text: str, label: str) -> list[str]:
    pattern = re.compile(rf"{label}\s*:\s*(.+?)(?=(?:\n\s*[A-Za-z][A-Za-z ]*\s*:)|$)", re.IGNORECASE | re.DOTALL)
    matches = pattern.findall(text or "")
    values: list[str] = []
    for match in matches:
        for part in re.split(r"[,;\n]\s*", match):
            cleaned = _clean(part)
            if cleaned:
                values.append(cleaned)
    return _dedupe_strings(values)


def _augment_resume_skills(parsed_resume: dict[str, object], resume_text: str, jd_skill_scores: Mapping[str, int] | None) -> list[str]:
    detected = [str(item) for item in (parsed_resume.get("skills") or [])]
    inline_skills = _extract_inline_section_values(resume_text, "skills")
    lowered_resume = _normalize_token(resume_text)
    jd_mentions = [str(skill) for skill in (jd_skill_scores or {}).keys() if _normalize_token(skill) and _normalize_token(skill) in lowered_resume]
    return _dedupe_strings(detected + inline_skills + jd_mentions, limit=24)


def _augment_resume_projects(parsed_resume: dict[str, object], resume_text: str) -> list[str]:
    projects = [str(item) for item in (parsed_resume.get("projects") or [])]
    return _dedupe_strings(projects + _extract_inline_section_values(resume_text, "projects"), limit=10)


def _augment_resume_experiences(parsed_resume: dict[str, object], resume_text: str) -> list[str]:
    experience = [str(item) for item in (parsed_resume.get("experience") or [])]
    return _dedupe_strings(experience + _extract_inline_section_values(resume_text, "experience"), limit=10)


def _augment_certifications(parsed_resume: dict[str, object], resume_text: str) -> list[str]:
    certs = [str(item) for item in (parsed_resume.get("certifications") or [])]
    return _dedupe_strings(certs + _extract_inline_section_values(resume_text, "certifications"), limit=6)


def _extract_jd_responsibilities(jd_text: str, jd_title: str | None) -> list[str]:
    lines = [line.strip(" -*\t") for line in re.split(r"[\n\r]+", jd_text or "") if _clean(line)]
    keep: list[str] = []
    for line in lines:
        lowered = line.lower()
        if jd_title and _clean(jd_title).lower() == lowered:
            continue
        if any(token in lowered for token in ("responsib", "own", "design", "build", "lead", "manage", "deliver", "stakeholder", "architect", "optimi", "mentor", "develop", "implement")):
            keep.append(_clean(line))
    if not keep:
        sentences = re.split(r"(?<=[.!?])\s+", jd_text or "")
        keep = [_clean(sentence) for sentence in sentences if any(token in sentence.lower() for token in ("design", "build", "lead", "manage", "deliver", "own", "mentor", "stakeholder", "architect"))]
    return _dedupe_strings(keep, limit=8)


def _split_core_secondary_skills(jd_skill_scores: Mapping[str, int] | None) -> tuple[list[str], list[str]]:
    ordered = [(str(skill), int(weight)) for skill, weight in (jd_skill_scores or {}).items() if _clean(skill)]
    ordered.sort(key=lambda item: item[1], reverse=True)
    core = [skill for skill, _ in ordered[: min(6, len(ordered))]]
    secondary = [skill for skill, _ in ordered[min(6, len(ordered)): min(12, len(ordered))]]
    return _dedupe_strings(core, limit=6), _dedupe_strings(secondary, limit=6)


def _extract_project_technologies(projects: list[str], resume_skills: list[str]) -> list[str]:
    techs: list[str] = []
    normalized_skills = [skill for skill in resume_skills if _normalize_token(skill)]
    for project in projects:
        lowered = _normalize_token(project)
        for skill in normalized_skills:
            token = _normalize_token(skill)
            if token and token in lowered:
                techs.append(skill)
    return _dedupe_strings(techs, limit=12)


def _extract_leadership_signals(resume_text: str, resume_experiences: list[str], resume_projects: list[str]) -> list[str]:
    pool = resume_experiences + resume_projects + [line.strip() for line in (resume_text or "").splitlines() if _clean(line)]
    signals = [item for item in pool if any(term in item.lower() for term in ("led", "lead", "mentored", "stakeholder", "roadmap", "hiring", "managed", "governance", "delivery", "strategy", "practice", "director", "head"))]
    return _dedupe_strings(signals, limit=8)


def _extract_measurable_impact(resume_text: str, resume_experiences: list[str], resume_projects: list[str]) -> list[str]:
    pool = resume_experiences + resume_projects + [line.strip() for line in (resume_text or "").splitlines() if _clean(line)]
    pattern = re.compile(r"(\b\d+[\d,.]*\+?%?\b|\b\d+x\b|\b\d+[\d,.]*\s*(?:users|clients|services|teams|engineers|apps|pipelines|projects|days|months|weeks|hours)\b)", re.IGNORECASE)
    impacts = [item for item in pool if pattern.search(item)]
    return _dedupe_strings(impacts, limit=8)


def _is_senior_profile(structured_input: StructuredQuestionInput) -> bool:
    seniority_blob = " ".join([
        structured_input.role_family,
        structured_input.seniority,
        structured_input.experience_level,
        structured_input.role_title,
    ]).lower()
    return any(term in seniority_blob for term in ("senior", "lead", "manager", "head", "director", "vp", "practice", "staff", "principal", "executive")) or structured_input.role_family in {"lead", "manager", "practice_head"}


def _is_architect_profile(structured_input: StructuredQuestionInput) -> bool:
    blob = " ".join([
        structured_input.role_family,
        structured_input.role_title,
        structured_input.jd_title,
        " ".join(structured_input.jd_core_skills),
        " ".join(structured_input.jd_responsibilities),
    ]).lower()
    return any(term in blob for term in ("architect", "architecture", "system design", "distributed", "trade-off", "scalab", "databricks"))


def build_structured_question_input(
    *,
    resume_text: str,
    jd_title: str | None,
    jd_skill_scores: Mapping[str, int] | None,
    jd_text: str | None = None,
) -> StructuredQuestionInput:
    planner_bundle = build_question_plan(
        resume_text=resume_text,
        jd_title=jd_title,
        jd_skill_scores=jd_skill_scores or {},
        question_count=8,
    ) or {}
    planner_meta = planner_bundle.get("meta") if isinstance(planner_bundle, dict) else {}
    if planner_meta is None:
        planner_meta = {}
    parsed_resume = parse_resume_text(resume_text or "")
    structured_resume = planner_meta["structured_resume"] if isinstance(planner_meta, dict) and "structured_resume" in planner_meta else {}
    structured_jd = planner_meta["structured_jd"] if isinstance(planner_meta, dict) and "structured_jd" in planner_meta else {}

    resume_skills = _augment_resume_skills(parsed_resume, resume_text or "", jd_skill_scores)
    if not resume_skills:
        resume_skills = _dedupe_strings([str(item) for item in (structured_resume.get("skills") or [])], limit=24)
    jd_skills = _dedupe_strings([str(item) for item in ((jd_skill_scores or {}).keys() or structured_jd.get("required_skills") or [])], limit=20)

    resume_skill_keys = {_normalize_token(item): item for item in resume_skills}
    jd_skill_keys = {_normalize_token(item): item for item in jd_skills}
    overlap = [resume_skill_keys[key] for key in resume_skill_keys if key in jd_skill_keys]
    resume_only = [resume_skill_keys[key] for key in resume_skill_keys if key not in jd_skill_keys]
    jd_only = [jd_skill_keys[key] for key in jd_skill_keys if key not in resume_skill_keys]

    role_family = str(planner_meta.get("role_family") or "engineer")
    seniority = str(planner_meta.get("seniority") or role_family)
    jd_summary = _build_jd_text(jd_title=jd_title, jd_skill_scores=jd_skill_scores, jd_text=jd_text)
    resume_summary = _clean(parsed_resume.get("summary") or structured_resume.get("summary") or "")
    resume_projects = _augment_resume_projects(parsed_resume, resume_text or "")
    resume_experiences = _augment_resume_experiences(parsed_resume, resume_text or "")
    jd_core_skills, jd_secondary_skills = _split_core_secondary_skills(jd_skill_scores)

    return StructuredQuestionInput(
        role=_clean(jd_title or structured_jd.get("title") or "Interview Role"),
        role_title=_clean(jd_title or structured_jd.get("title") or "Interview Role"),
        role_family=role_family,
        seniority=seniority,
        experience_level=_infer_experience_level(resume_summary, resume_text or ""),
        jd_title=_clean(jd_title or structured_jd.get("title") or "Interview Role"),
        jd_summary=jd_summary,
        jd_core_skills=jd_core_skills,
        jd_secondary_skills=jd_secondary_skills,
        jd_responsibilities=_extract_jd_responsibilities(jd_summary, jd_title),
        jd_skills=jd_skills,
        jd_skill_weights={_clean(k): int(v) for k, v in (jd_skill_scores or {}).items() if _clean(k)},
        resume_summary=resume_summary,
        resume_recent_roles=resume_experiences[:5],
        resume_skills=resume_skills,
        resume_projects=resume_projects,
        resume_project_technologies=_extract_project_technologies(resume_projects, resume_skills),
        resume_experiences=resume_experiences,
        resume_leadership_signals=_extract_leadership_signals(resume_text or "", resume_experiences, resume_projects),
        resume_measurable_impact=_extract_measurable_impact(resume_text or "", resume_experiences, resume_projects),
        certifications=_augment_certifications(parsed_resume, resume_text or ""),
        overlap_skills=_dedupe_strings(overlap, limit=12),
        resume_only_skills=_dedupe_strings(resume_only, limit=12),
        jd_only_skills=_dedupe_strings(jd_only, limit=12),
    )


def _llm_user_prompt(structured_input: StructuredQuestionInput, question_count: int, retry_note: str | None = None) -> str:
    instructions = [
        f"Generate {question_count} interview questions for this candidate.",
        "Use the JSON context exactly as provided.",
        "Treat resume_recent_roles, resume_projects, resume_project_technologies, and resume_measurable_impact as the strongest evidence.",
        "Use this exact prompt intent: grounded in resume projects/experience/skills and the JD role; no generic skill questions; no repeated structure; no skill-clone patterns.",
        "Required coverage/distribution across the set: intro, project deep dive, implementation trade-offs, architecture/design, debugging/failure, performance/scaling, role-specific, API/system integration, behavioral/leadership.",
        "The first question should be a concise intro/background opener.",
        "The remaining questions must mostly be project, implementation, architecture, leadership, or high-signal JD-depth questions.",
        "At least 50% of the questions should be grounded in named projects, recent achievements, or measurable outcomes when available.",
        "At least one question must be explicitly grounded in a named project or recent role achievement.",
        "Every project-related question must include a project name or a measurable metric/scale detail.",
        "Across the set, strong projects should be explored from execution, decision/trade-off, debugging/failure, and system integration angles.",
        "Include at least one architecture/design question.",
        "Include at least one debugging/failure question.",
        "Include at least one performance/scaling question.",
        "Include at least one role-specific or API/system integration question when the resume or JD supports it.",
        "Prefer concrete resume evidence and measurable outcomes over generic skills.",
        "Prefer analytical, reflective, and scenario-based phrasing with natural variety.",
        "Use no more than two questions with the same opening pattern.",
        "Include at most one JD gap-probe question, only for a critical missing skill.",
        "Reference answers should describe what a strong answer should cover, not a memorized script.",
        "Do not use weak phrasing such as 'end to end', 'most relevant project', 'what is your experience with', or 'explain what is'.",
        "Do not produce questions that can apply unchanged to almost any candidate.",
    ]
    if _is_senior_profile(structured_input):
        instructions.append("Because this is a senior profile, include leadership, stakeholder, ownership, scaling, mentoring, delivery, or practice-building coverage where supported.")
    if _is_architect_profile(structured_input):
        instructions.append("Because this role has architect/design signals, include design, architecture, trade-off, scale, reliability, or platform-decision coverage.")
    if retry_note:
        instructions.append(retry_note)
    return (
        "\n".join(instructions)
        + "\n\nCandidate/JD context (JSON):\n"
        + json.dumps(asdict(structured_input), indent=2)
    )


def _extract_json_object(raw: str) -> dict[str, object]:
    cleaned = _clean_json(raw or "")
    match = re.search(r"\{.*\}", cleaned, re.DOTALL) 
    if match:
        cleaned = match.group(0)
    data = json.loads(cleaned)
    if not isinstance(data, dict):
        raise ValueError("LLM response must be a JSON object")
    return data


def _normalize_category(value: str | None, text: str) -> str:
    category = _normalize_token(value)
    if category in {"architecture_or_design", "architectureordesign", "system_design", "systemdesign", "design"}:
        return "architecture"
    if category in {"leadership_or_behavioral", "leadershipbehavioral"}:
        lowered = _normalize_token(text)
        return "leadership" if any(term in lowered for term in ("stakeholder", "mentor", "led", "ownership", "team", "conflict", "practice")) else "behavioral"
    if category in {"intro", "deep_dive", "deepdive", "project", "architecture", "leadership", "behavioral"}:
        return "deep_dive" if category == "deepdive" else category
    return "deep_dive"


def _normalize_difficulty(value: str | None) -> str:
    difficulty = _normalize_token(value)
    if difficulty in {"easy", "medium", "hard"}:
        return difficulty
    return "medium"


def _choose_priority_source(category: str, focus_skill: str | None, structured_input: StructuredQuestionInput) -> str:
    skill_key = _normalize_token(focus_skill)
    overlap = {_normalize_token(item) for item in structured_input.overlap_skills}
    jd_only = {_normalize_token(item) for item in structured_input.jd_only_skills}
    if category == "intro":
        return "baseline"
    if skill_key and skill_key in overlap:
        return "jd_resume_overlap"
    if skill_key and skill_key in jd_only:
        return "jd_gap_probe"
    if category == "project":
        return "recent_project"
    if category == "architecture":
        return "architecture_signal"
    if category == "leadership":
        return "leadership_signal"
    return "resume_strength"


def _question_relevance_score(question: dict[str, object], structured_input: StructuredQuestionInput) -> float:
    haystacks = [
        _normalize_token(question.get("text")),
        _normalize_token(question.get("focus_skill")),
        _normalize_token(question.get("project_name")),
        _normalize_token(question.get("intent")),
        _normalize_token((question.get("metadata") or {}).get("evidence_excerpt")),
    ]
    overlap_keys = {_normalize_token(item) for item in structured_input.overlap_skills}
    resume_keys = {_normalize_token(item) for item in structured_input.resume_skills}
    jd_keys = {_normalize_token(item) for item in structured_input.jd_skills}
    project_keys = {_normalize_token(item) for item in structured_input.resume_projects}
    recent_role_keys = {_normalize_token(item) for item in structured_input.resume_recent_roles}

    score = 0.0
    joined = " ".join(item for item in haystacks if item)
    if question.get("category") == "intro":
        score += 0.8
    if any(key and key in joined for key in overlap_keys):
        score += 1.2
    if any(key and key in joined for key in resume_keys):
        score += 0.8
    if any(key and key in joined for key in jd_keys):
        score += 0.8
    if any(key and key in joined for key in project_keys):
        score += 1.0
    if any(key and key in joined for key in recent_role_keys):
        score += 1.0
    if _clean(question.get("project_name")):
        score += 0.6
    if question.get("category") in {"project", "architecture", "leadership"}:
        score += 0.3
    if len(_clean(question.get("text"))) >= 30:
        score += 0.2
    return round(score, 3)


def _contains_weak_phrase(text: str) -> bool:
    lowered = _normalize_token(text)
    weak_phrases = [
        "end to end",
        "most relevant project",
        "tell me about yourself",
        "what is your experience with",
        "explain what is",
    ]
    return any(phrase in lowered for phrase in weak_phrases)


def _is_project_grounded(question: dict[str, object], structured_input: StructuredQuestionInput) -> bool:
    joined = " ".join([
        _clean(question.get("text")),
        _clean(question.get("project_name")),
        _clean(question.get("intent")),
        _clean((question.get("metadata") or {}).get("evidence_excerpt")),
    ])
    joined_norm = _normalize_token(joined)
    for item in structured_input.resume_projects + structured_input.resume_recent_roles + structured_input.resume_measurable_impact:
        token = _normalize_token(item)
        if token and token in joined_norm:
            return True
    return bool(_clean(question.get("project_name"))) or question.get("category") in {"project", "architecture", "leadership"} and bool(_clean((question.get("metadata") or {}).get("evidence_excerpt")))


def _contains_metric_or_scale(text: str | None) -> bool:
    raw = _clean(text)
    if not raw:
        return False
    metric_patterns = [
        r"\b\d+[\d,.]*%\b",
        r"\b\d+x\b",
        r"\b\d+[\d,.]*\s*(ms|s|sec|seconds|minutes|hrs|hours|days|weeks|months)\b",
        r"\b\d+[\d,.]*\s*(users|clients|customers|requests|rps|qps|pipelines|services|teams|engineers|accounts|stores|records|rows|events)\b",
        r"\b(latency|throughput|scale|uptime|downtime|cost|savings|adoption|performance|accuracy|precision|recall)\b",
    ]
    return any(re.search(pattern, raw, re.IGNORECASE) for pattern in metric_patterns)


def _is_project_question(question: dict[str, object]) -> bool:
    category = str(question.get("category") or "")
    return category == "project"


def _has_project_anchor(question: dict[str, object], structured_input: StructuredQuestionInput) -> bool:
    if not _is_project_question(question):
        return True
    if _clean(question.get("project_name")):
        return True
    text = " ".join([
        _clean(question.get("text")),
        _clean((question.get("metadata") or {}).get("evidence_excerpt")),
    ])
    if _contains_metric_or_scale(text):
        return True
    text_norm = _normalize_token(text)
    for item in structured_input.resume_projects + structured_input.resume_recent_roles + structured_input.resume_measurable_impact:
        token = _normalize_token(item)
        if token and token in text_norm:
            return True
    return False


def _opening_pattern_violations(questions: list[dict[str, object]]) -> bool:
    patterns: dict[str, int] = {}
    for item in questions:
        pattern = _opening_pattern(str(item.get("text") or ""))
        if not pattern:
            continue
        patterns[pattern] = patterns.get(pattern, 0) + 1
        if patterns[pattern] > 2:
            return True
    return False


def _validate_question_set(questions: list[dict[str, object]], structured_input: StructuredQuestionInput, question_count: int) -> list[str]:
    issues: list[str] = []
    if len(questions) < max(2, int(question_count)):
        issues.append(f"insufficient_questions:{len(questions)}")
        return issues

    similarity_seen: set[str] = set()
    behavioral_count = 0
    project_grounded_count = 0
    leadership_count = 0
    architecture_count = 0
    scaling_count = 0
    integration_count = 0
    skill_only_count = 0
    debugging_failure_count = 0
    design_count = 0
    project_execution_count = 0
    project_tradeoff_count = 0
    project_debugging_count = 0

    for question in questions:
        text = _clean(question.get("text"))
        text_norm = _normalize_token(text)
        similarity = _similarity_key(text)
        if similarity in similarity_seen:
            issues.append("duplicate_or_near_duplicate")
            break
        similarity_seen.add(similarity)
        if _contains_weak_phrase(text):
            issues.append("weak_phrase_present")
        if question.get("category") == "behavioral":
            behavioral_count += 1
        if question.get("category") == "leadership" or any(term in text_norm for term in ("stakeholder", "mentor", "lead", "team", "practice", "governance", "delivery leader")):
            leadership_count += 1
        if question.get("category") == "architecture" or any(term in text_norm for term in ("trade-off", "tradeoffs", "trade off", "scal", "governance", "design", "architecture")):
            architecture_count += 1
        if any(term in text_norm for term in ("design", "architecture", "interface", "boundary", "component", "pattern", "decision")):
            design_count += 1
        if any(term in text_norm for term in ("scale", "scaling", "grow", "10x", "5x", "twice", "double", "doubled", "across accounts", "adoption", "capacity", "governance", "performance", "latency", "throughput", "load")):
            scaling_count += 1
        if any(term in text_norm for term in ("api", "integration", "service", "services", "interface", "data flow", "contract", "pipeline", "webhook", "event")):
            integration_count += 1
        grounded = _is_project_grounded(question, structured_input)
        if grounded:
            project_grounded_count += 1
        elif question.get("category") not in {"intro", "behavioral"} and str(question.get("priority_source") or "") != "jd_gap_probe":
            issues.append("question_not_grounded_in_resume_or_priority_jd")
        if question.get("category") == "deep_dive" and not grounded:
            skill_only_count += 1
        if _is_project_question(question) and not _has_project_anchor(question, structured_input):
            issues.append("project_question_missing_name_or_metric_anchor")

        if grounded:
            if any(term in text_norm for term in ("what did you personally", "what exactly did you own", "what did you change", "did you personally drive", "how did you implement", "how did you build", "how did you deliver", "walk me through", "what problem were you solving")):
                project_execution_count += 1
            if any(term in text_norm for term in ("trade-off", "tradeoffs", "trade off", "how did you decide", "why did you choose", "what decisions", "why was that design", "balance consistency", "what would you revisit")):
                project_tradeoff_count += 1
            if any(term in text_norm for term in ("debug", "failure", "didn't work", "did not work", "root cause", "bottleneck", "incident", "wrong", "remediation", "what signals", "fixes were working")):
                project_debugging_count += 1
        if any(term in text_norm for term in ("failure", "debug", "trade-off", "tradeoffs", "trade off", "didn't work", "did not work", "root cause", "bottleneck", "what went wrong", "incident")):
            debugging_failure_count += 1

    if _opening_pattern_violations(questions):
        issues.append("opening_pattern_repetition")
    if project_grounded_count == 0:
        issues.append("no_project_grounded_question")
    if behavioral_count > max(2, question_count // 3):
        issues.append("too_many_generic_behavioral")
    if skill_only_count >= max(3, question_count - 2):
        issues.append("too_many_skill_only_questions")
    if debugging_failure_count == 0:
        issues.append("missing_failure_debugging_tradeoff_question")
    if design_count == 0:
        issues.append("missing_design_question")
    if scaling_count == 0:
        issues.append("missing_performance_or_scaling_question")
    if project_grounded_count > 0 and project_execution_count == 0:
        issues.append("missing_project_execution_question")
    if project_grounded_count > 0 and project_tradeoff_count == 0:
        issues.append("missing_project_tradeoff_question")
    if structured_input.role_family in {"engineer", "senior_engineer", "architect"} and project_grounded_count > 0 and project_debugging_count == 0:
        issues.append("missing_project_debugging_question")
    if _is_senior_profile(structured_input) and leadership_count == 0:
        issues.append("senior_role_missing_leadership_or_stakeholder_question")
    if structured_input.role_family in {"lead", "manager", "practice_head"} and scaling_count == 0:
        issues.append("senior_role_missing_scaling_question")
    if _is_architect_profile(structured_input) and architecture_count == 0:
        issues.append("architect_role_missing_design_tradeoff_question")
    return _dedupe_strings(issues)


def _normalize_llm_questions(
    *,
    raw_questions: list[object],
    structured_input: StructuredQuestionInput,
    question_count: int,
) -> list[dict[str, object]]:
    normalized: list[dict[str, object]] = []
    seen_text: set[str] = set()

    for item in raw_questions:
        if not isinstance(item, dict):
            continue
        text = _clean(item.get("text"))
        category_hint = _normalize_category(item.get("category"), text)
        if not text or len(text) < 18 or ("?" not in text and category_hint not in {"behavioral", "leadership"}) or _contains_weak_phrase(text):
            continue

        category = category_hint
        similarity = _similarity_key(text)
        if not similarity or similarity in seen_text:
            continue

        focus_skill = _clean(item.get("focus_skill")) or None
        project_name = _clean(item.get("project_name")) or None
        reference_answer = _clean(item.get("reference_answer"))
        if len(reference_answer) < 24:
            reference_answer = "A strong answer should explain the candidate's real contribution, decisions, trade-offs, execution details, validation approach, and outcomes."
        priority_source = _clean(item.get("priority_source")) or _choose_priority_source(category, focus_skill, structured_input)
        question = {
            "text": text,
            "type": "hr" if category == "behavioral" else category,
            "category": category,
            "topic": _clean(focus_skill or project_name or category)[:80],
            "intent": _clean(item.get("intent")) or f"Assess {category.replace('_', ' ')} depth for the role.",
            "focus_skill": focus_skill,
            "project_name": project_name,
            "reference_answer": reference_answer,
            "difficulty": _normalize_difficulty(item.get("difficulty")),
            "priority_source": priority_source,
            "role_alignment": 1.0 if category == "intro" else 0.8,
            "resume_alignment": 0.85 if category in {"intro", "project", "leadership"} else 0.75,
            "jd_alignment": 0.9 if category in {"deep_dive", "architecture"} else 0.75,
            "metadata": {
                "category": category,
                "priority_source": priority_source,
                "skill_or_topic": _clean(focus_skill or project_name or category),
                "role_alignment": 1.0 if category == "intro" else 0.8,
                "resume_alignment": 0.85 if category in {"intro", "project", "leadership"} else 0.75,
                "jd_alignment": 0.9 if category in {"deep_dive", "architecture"} else 0.75,
                "relevance_score": 0.0,
                "role_family": structured_input.role_family,
                "seniority": structured_input.experience_level,
                "evidence_excerpt": _clean(item.get("rationale")) or None,
            },
        }
        relevance = _question_relevance_score(question, structured_input)
        if relevance < 0.6 and category not in {"intro", "behavioral", "leadership"} and priority_source != "jd_gap_probe":
            continue
        question["metadata"]["relevance_score"] = relevance
        normalized.append(question)
        seen_text.add(similarity)
        if len(normalized) >= max(question_count * 2, question_count + 4):
            break

    normalized.sort(
        key=lambda item: (
            0 if item.get("category") == "intro" else 1,
            -(float((item.get("metadata") or {}).get("relevance_score") or 0.0)),
            len(str(item.get("text") or "")),
        )
    )

    final_questions: list[dict[str, object]] = []
    category_caps = {"behavioral": 2, "leadership": 3, "architecture": 3, "deep_dive": 4, "project": 3, "intro": 1}
    category_counts: dict[str, int] = {}

    for question in normalized:
        category = str(question.get("category") or "deep_dive")
        if category_counts.get(category, 0) >= category_caps.get(category, question_count):
            continue
        final_questions.append(question)
        category_counts[category] = category_counts.get(category, 0) + 1
        if len(final_questions) >= question_count:
            break

    return final_questions


def _call_llm(structured_input: StructuredQuestionInput, question_count: int, retry_note: str | None = None) -> dict[str, object]:
    user_prompt = _llm_user_prompt(structured_input, question_count, retry_note=retry_note)
    response = _get_client().chat.completions.create(
        model=_llm_model(),
        messages=[
            {"role": "system", "content": LLM_QUESTION_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.25 if retry_note else 0.35,
        max_tokens=2400,
    )
    payload = _extract_json_object(response.choices[0].message.content or "")
    questions = _normalize_llm_questions(
        raw_questions=list(payload.get("questions") or []),
        structured_input=structured_input,
        question_count=max(2, int(question_count)),
    )
    return {
        "questions": questions,
        "user_prompt": user_prompt,
    }


def generate_llm_questions(
    *,
    jd_text: str,
    resume_text: str,
    question_count: int,
    jd_title: str | None = None,
    jd_skill_scores: Mapping[str, int] | None = None,
) -> dict[str, object]:
    structured_input = build_structured_question_input(
        resume_text=resume_text,
        jd_title=jd_title,
        jd_skill_scores=jd_skill_scores,
        jd_text=jd_text,
    )
    first_attempt = _call_llm(structured_input, max(2, int(question_count)))
    first_issues = _validate_question_set(first_attempt["questions"], structured_input, max(2, int(question_count)))

    all_issues = list(first_issues)

    final_questions = first_attempt["questions"]
    final_user_prompt = first_attempt["user_prompt"]
    retry_used = False
    retry_issues: list[str] = []

    if all_issues:
        retry_used = True
        stricter_note = (
            "Your previous output lacked depth and grounding. Regenerate using project-specific details and measurable outcomes. "
            "Quality failures: "
            + ", ".join(all_issues)
            + ". Enforce: no duplicates, no weak phrases, every project-related question must include a project name or metric anchor, include project execution + trade-off + debugging/failure coverage, leadership and stakeholder plus scaling coverage for senior profiles, architecture/trade-off coverage for architect roles, and keep behavioral questions limited."
        )
        retry_attempt = _call_llm(structured_input, max(2, int(question_count)), retry_note=stricter_note)
        retry_issues = _validate_question_set(retry_attempt["questions"], structured_input, max(2, int(question_count)))
        if not retry_issues:
            final_questions = retry_attempt["questions"]
            final_user_prompt = retry_attempt["user_prompt"]
        else:
            raise ValueError(
                "LLM question quality failed after retry: first="
                + ",".join(all_issues)
                + " retry="
                + ",".join(retry_issues)
            )

    return {
        "questions": final_questions[: max(2, int(question_count))],
        "structured_input": asdict(structured_input),
        "system_prompt": LLM_QUESTION_SYSTEM_PROMPT,
        "user_prompt": final_user_prompt,
        "llm_model": _llm_model(),
        "quality": {
            "first_attempt_issues": all_issues,
            "retry_used": retry_used,
            "retry_issues": retry_issues,
        },
    }


def generate_question_bundle_with_fallback(
    *,
    resume_text: str,
    jd_title: str | None,
    jd_skill_scores: Mapping[str, int] | None,
    question_count: int | None = None,
    project_ratio: float | None = None,
    jd_text: str | None = None,
) -> dict[str, object]:
    desired_count = max(2, min(20, int(question_count or 8)))
    fallback_bundle = build_question_plan(
        resume_text=resume_text,
        jd_title=jd_title,
        jd_skill_scores=jd_skill_scores or {},
        question_count=desired_count,
    ) or {}
    try:
        llm_bundle = generate_llm_questions(
            jd_text=_build_jd_text(jd_title, jd_skill_scores, jd_text=jd_text),
            resume_text=resume_text,
            question_count=desired_count,
            jd_title=jd_title,
            jd_skill_scores=jd_skill_scores or {},
        )
        questions = llm_bundle["questions"]
        project_like_count = sum(
            1
            for item in questions
            if item.get("category") in {"deep_dive", "project", "architecture", "leadership"}
        )
        hr_count = sum(1 for item in questions if item.get("category") == "behavioral")
        return {
            "questions": questions,
            "total_questions": len(questions),
            "project_count": project_like_count,
            "hr_count": hr_count,
            "project_questions_count": project_like_count,
            "theory_questions_count": hr_count,
            "intro_count": sum(1 for item in questions if item.get("category") == "intro"),
            "projects": list(llm_bundle["structured_input"].get("resume_projects") or [])[:6],
            "meta": {
                **(fallback_bundle.get("meta") or {}),
                "generation_mode": "llm_primary",
                "fallback_used": False,
                "llm_model": llm_bundle.get("llm_model"),
                "llm_system_prompt": llm_bundle.get("system_prompt"),
                "llm_user_prompt": llm_bundle.get("user_prompt"),
                "structured_input": llm_bundle.get("structured_input"),
                "llm_quality": llm_bundle.get("quality"),
                "project_ratio_requested": project_ratio,
            },
        }
    except Exception as exc:
        logger.warning("LLM question generation failed, using deterministic fallback: %s", exc)
        fallback_bundle = fallback_bundle or {}
        questions = []
        if isinstance(fallback_bundle, dict):
            questions = fallback_bundle.get("questions")
            if questions is None:
                questions = []
        meta = dict((fallback_bundle.get("meta") or {}) if isinstance(fallback_bundle, dict) else {})
        meta.update(
            {
                "generation_mode": "fallback_dynamic_plan",
                "fallback_used": True,
                "fallback_reason": str(exc),
                "project_ratio_requested": project_ratio,
                "structured_input": asdict(
                    build_structured_question_input(
                        resume_text=resume_text,
                        jd_title=jd_title,
                        jd_skill_scores=jd_skill_scores or {},
                        jd_text=jd_text,
                    )
                ),
            }
        )
        return {
            "questions": questions,
            "total_questions": len(questions),
            "project_count": fallback_bundle.get("project_count", 0) if isinstance(fallback_bundle, dict) else 0,
            "hr_count": fallback_bundle.get("hr_count", 0) if isinstance(fallback_bundle, dict) else 0,
            "project_questions_count": fallback_bundle.get("project_questions_count", 0) if isinstance(fallback_bundle, dict) else 0,
            "theory_questions_count": fallback_bundle.get("theory_questions_count", 0) if isinstance(fallback_bundle, dict) else 0,
            "intro_count": fallback_bundle.get("intro_count", 0) if isinstance(fallback_bundle, dict) else 0,
            "projects": fallback_bundle.get("projects", []) if isinstance(fallback_bundle, dict) else [],
            "meta": meta,
        }
