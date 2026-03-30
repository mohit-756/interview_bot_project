"""LLM-first interview question generation with deterministic fallback helpers."""
from __future__ import annotations

from typing import Any

import json
import logging
import re
from collections import OrderedDict
from collections.abc import Mapping
from dataclasses import asdict, dataclass

from services.llm.client import _clean_json, _get_client, _llm_model, _llm_premium_model, _llm_provider
from services.question_plan import build_question_plan
from services.resume_parser import parse_resume_text

logger = logging.getLogger(__name__)

LLM_QUESTION_SYSTEM_PROMPT = """You are a highly experienced technical interviewer conducting a live panel interview.
Your ONLY source material is the candidate's resume and the job description provided in the user message.
You must generate questions that are IMPOSSIBLE to answer without knowing this specific candidate's resume.

ABSOLUTE RULES:
- Every question except the intro MUST reference a SPECIFIC project, technology, company, outcome, or achievement that appears in this candidate's resume.
- If a question could be asked of any random candidate, it is REJECTED. Rewrite it with a specific reference.
- Use the candidate's actual project names, platform names, and measurable results in the question text itself.
- Do NOT rephrase resume bullet points as questions. Instead, probe the implementation, trade-offs, failures, and decisions BEHIND those bullets.
- 80% of questions must be grounded in the candidate's specific experience. Only 20% can be intro/behavioral.

Flow to follow:
1. Intro: Let the candidate connect their background to this specific role.
2. Project Deep Dive: Pick the strongest/most recent project from the resume and probe execution details.
3. Implementation Trade-off: Ask about a key technical decision within one of their listed projects/roles.
4. Architecture/Design: Ask how one of their actual systems would need to evolve if requirements changed.
5. Debugging/Failure: Ask about a real failure, bug, or setback named in or implied by their resume.
6. Scaling/Performance: Ask about a scaling challenge tied to their actual project or platform.
7. Behavioral (only 1): Ask about leadership, conflict resolution, or stakeholder alignment.

Role-family routing rules:
- frontend -> components, state, UX, API integration, browser behavior; avoid data-platform questions
- backend -> APIs, services, data flow, reliability, integrations, scaling
- aiml -> models, evaluation, prompts, MLOps, drift, serving, trade-offs
- data/databricks -> platform, pipelines, lakehouse, governance, quality, scale, cost
- lead/manager -> ownership, stakeholder alignment, delivery, practice building

Hard rules:
- Return ONLY valid JSON with the exact shape below.
- project_name field MUST contain the actual project or platform name from the resume (not "your project").
- Never use vague phrases: "your most relevant project", "end to end", "what is your experience with", "explain what is", "tell me about yourself".
- Every question text should be specific enough that an interviewer could follow up based on the answer.
- At minimum: 1 architecture/design, 1 debugging/failure, 1 performance/scaling, 1 intro, 1 behavioral.

Return a JSON object with this exact shape:
{
  "questions": [
    {
      "text": "string — must contain a specific project/platform/achievement from the resume",
      "category": "intro|deep_dive|project|architecture|leadership|behavioral",
      "focus_skill": "string or null",
      "project_name": "string — the actual project or platform name, or null for intro/behavioral",
      "intent": "string — what specific competency this question reveals",
      "reference_answer": "string — what a strong answer would cover for this specific question",
      "difficulty": "easy|medium|hard",
      "priority_source": "resume_strength|jd_resume_overlap|jd_gap_probe|recent_project|architecture_signal|leadership_signal|baseline",
      "rationale": "one sentence explaining which resume fact makes this question relevant"
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
        if isinstance(limit, int):
            if len(seen) >= limit:
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
    if match:
        years = int(match.group(1))
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


def _augment_resume_skills(parsed_resume: dict[str, Any], resume_text: str, jd_skill_scores: Mapping[str, int] | None) -> list[str]:
    detected = [str(item) for item in (parsed_resume.get("skills") or [])]
    inline_skills = _extract_inline_section_values(resume_text, "skills")
    lowered_resume = _normalize_token(resume_text)
    jd_mentions = [str(skill) for skill in (jd_skill_scores or {}).keys() if _normalize_token(skill) and _normalize_token(skill) in lowered_resume]
    return _dedupe_strings(detected + inline_skills + jd_mentions, limit=24)


def _augment_resume_projects(parsed_resume: dict[str, Any], resume_text: str) -> list[str]:
    projects = [str(item) for item in (parsed_resume.get("projects") or [])]
    return _dedupe_strings(projects + _extract_inline_section_values(resume_text, "projects"), limit=10)


def _augment_resume_experiences(parsed_resume: dict[str, Any], resume_text: str) -> list[str]:
    experience = [str(item) for item in (parsed_resume.get("experience") or [])]
    return _dedupe_strings(experience + _extract_inline_section_values(resume_text, "experience"), limit=10)


def _augment_certifications(parsed_resume: dict[str, Any], resume_text: str) -> list[str]:
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
    core = [ordered[i][0] for i in range(min(6, len(ordered)))]
    secondary = [ordered[i][0] for i in range(min(6, len(ordered)), min(12, len(ordered)))]
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


def _structured_role_track(structured_input: StructuredQuestionInput) -> str:
    tokens = re.sub(
        r"[^a-z0-9+#./]+",
        " ",
        " ".join([
            structured_input.role_family,
            structured_input.role_title,
            structured_input.jd_title,
            " ".join(structured_input.jd_core_skills),
            " ".join(structured_input.resume_projects),
            " ".join(structured_input.resume_recent_roles),
        ]).lower(),
    )
    padded = f" {tokens} "

    def _has(*terms: str) -> bool:
        return any(f" {term} " in padded for term in terms)

    frontend = sum(1 for term in ("frontend", "react", "javascript", "typescript", "ui", "component", "responsive") if _has(term))
    data = sum(1 for term in ("databricks", "lakehouse", "spark", "pipeline", "warehouse", "governance", "unity catalog") if _has(term))
    aiml = sum(1 for term in ("aiml", "ml", "nlp", "llm", "model", "mlops", "rag", "screening", "scoring", "ranking", "proctoring") if _has(term))
    if _has("ai", "resume screening", "ai screening", "ai interview"):
        aiml += 2
    if data >= max(frontend, aiml) and data >= 2:
        return "data"
    if aiml >= max(frontend, data) and aiml >= 2:
        return "aiml"
    if frontend >= 2:
        return "frontend"
    return "backend"


def _planner_meta_for_structured_input(
    *,
    resume_text: str,
    jd_title: str | None,
    jd_skill_scores: Mapping[str, int] | None,
) -> dict[str, Any]:
    planner_bundle = build_question_plan(
        resume_text=resume_text,
        jd_title=jd_title,
        jd_skill_scores=jd_skill_scores or {},
        question_count=8,
    ) or {}
    planner_meta = planner_bundle.get("meta") if isinstance(planner_bundle, dict) else {}
    return planner_meta if isinstance(planner_meta, dict) else {}


# Structured input building -------------------------------------------------

def build_structured_question_input(
    *,
    resume_text: str,
    jd_title: str | None,
    jd_skill_scores: Mapping[str, int] | None,
    jd_text: str | None = None,
) -> StructuredQuestionInput:
    planner_meta = _planner_meta_for_structured_input(
        resume_text=resume_text,
        jd_title=jd_title,
        jd_skill_scores=jd_skill_scores,
    )
    parsed_resume = parse_resume_text(resume_text or "")
    structured_resume = planner_meta.get("structured_resume") if isinstance(planner_meta, dict) else {}
    structured_jd = planner_meta.get("structured_jd") if isinstance(planner_meta, dict) else {}

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


# Prompt construction -------------------------------------------------------

def _llm_user_prompt(structured_input: StructuredQuestionInput, question_count: int, retry_note: str | None = None) -> str:
    # ── Build a concrete evidence snapshot so the LLM has explicit names/facts ──
    evidence_lines: list[str] = []
    if structured_input.resume_projects:
        evidence_lines.append("CANDIDATE'S ACTUAL PROJECTS (use these names verbatim in questions):")
        for p in structured_input.resume_projects[:6]:
            evidence_lines.append(f"  - {p}")
    if structured_input.resume_measurable_impact:
        evidence_lines.append("MEASURABLE OUTCOMES (reference these numbers/results directly):")
        for m in structured_input.resume_measurable_impact[:5]:
            evidence_lines.append(f"  - {m}")
    if structured_input.resume_experiences:
        evidence_lines.append("RECENT ROLES/EXPERIENCE (ground questions in these):")
        for e in structured_input.resume_experiences[:4]:
            evidence_lines.append(f"  - {e}")
    if structured_input.overlap_skills:
        evidence_lines.append(f"SKILLS ON BOTH RESUME AND JD (highest priority for technical depth): {', '.join(structured_input.overlap_skills[:8])}")
    if structured_input.jd_only_skills:
        evidence_lines.append(f"SKILLS IN JD BUT NOT ON RESUME (use max 1 gap-probe question): {', '.join(structured_input.jd_only_skills[:3])}")
    if structured_input.resume_leadership_signals:
        evidence_lines.append("LEADERSHIP SIGNALS (use for leadership/stakeholder questions):")
        for l in structured_input.resume_leadership_signals[:3]:
            evidence_lines.append(f"  - {l}")
    evidence_snapshot = "\n".join(evidence_lines)

    instructions = [
        f"Generate exactly {question_count} interview questions for this specific candidate.",
        "CRITICAL: Your questions must be so specific to THIS resume that they could not be asked of any other candidate.",
        f"Use the EVIDENCE SNAPSHOT below — reference the actual project names, numbers, and role titles in your question text.",
        "80% of questions must directly reference a named project, platform, role, or measurable outcome from the resume.",
        "20% can be intro/behavioral — but even the intro should mention this role and what their resume shows.",
        "Do NOT produce generic questions. Every question must have a 'project_name' or a specific resume fact in its text.",
        "Mirror this flow: intro -> project execution deep dive -> implementation trade-off -> architecture/design -> debugging/failure -> scaling/performance -> (if senior) leadership/stakeholder -> (1 behavioral).",
        "If the same project appears in multiple questions, each must probe a completely different angle (e.g., one on execution, one on failure, one on scaling).",
        "Include at least one architecture/design question.",
        "Include at least one debugging/failure/root-cause question.",
        "Include at least one scaling/performance question.",
        "Do NOT mention the candidate's full name, email, phone, or location in any question.",
        "Vary the opening phrases — no more than 2 questions can start with the same words.",
        "Include at most 1 JD-gap question (skill in JD but missing from resume) — only if it's critical.",
        "Reference answers must specifically describe what a strong answer covers for THIS question, not a generic script.",
        "BANNED phrases: 'end to end', 'most relevant project', 'what is your experience with', 'explain what is', 'walk me through your resume', 'tell me about yourself'.",
    ]
    role_track = _structured_role_track(structured_input)
    if role_track == "frontend":
        instructions.append("Role track is FRONTEND: focus on UI architecture, component design, state management, API integration, and browser/responsiveness concerns tied to their specific projects.")
    elif role_track == "data":
        instructions.append("Role track is DATA/DATABRICKS: focus on platform design, governance, pipeline reliability, quality, cost, and scale tied to their specific data projects.")
    elif role_track == "aiml":
        instructions.append("Role track is AI/ML: focus on model choices, evaluation, prompt design, failure analysis, drift, and serving tied to their specific ML work.")
    else:
        instructions.append("Role track is BACKEND/GENERAL ENGINEERING: focus on API design, service reliability, data flow, integration, debugging, and scaling tied to their specific backend work.")
    if _is_senior_profile(structured_input):
        instructions.append("This is a SENIOR profile: include at least one question about leadership, stakeholder alignment, delivery decisions, or mentoring tied to their actual experience.")
    if _is_architect_profile(structured_input):
        instructions.append("This role has ARCHITECT signals: include at least one design/trade-off/system boundary question referencing their actual system or platform.")
    if retry_note:
        instructions.append(retry_note)

    return (
        "=== EVIDENCE SNAPSHOT (use these specific facts in your questions) ===\n"
        + evidence_snapshot
        + "\n\n=== INSTRUCTIONS ===\n"
        + "\n".join(instructions)
        + "\n\n=== CANDIDATE/JD FULL CONTEXT (JSON) ===\n"
        + json.dumps(asdict(structured_input), indent=2)
    )


# Response parsing + normalization -----------------------------------------

def _extract_json_object(raw: str) -> dict[str, Any]:
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


def _question_relevance_score(question: dict[str, Any], structured_input: StructuredQuestionInput) -> float:
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
    return round(float(score), 3)


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


def _is_project_grounded(question: dict[str, Any], structured_input: StructuredQuestionInput) -> bool:
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


def _is_project_question(question: dict[str, Any]) -> bool:
    category = str(question.get("category") or "")
    return category == "project"


def _has_project_anchor(question: dict[str, Any], structured_input: StructuredQuestionInput) -> bool:
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


def _opening_pattern_violations(questions: list[dict[str, Any]]) -> bool:
    patterns: dict[str, int] = {}
    for item in questions:
        pattern = _opening_pattern(str(item.get("text") or ""))
        if not pattern:
            continue
        patterns[pattern] = patterns.get(pattern, 0) + 1
        if patterns[pattern] > 2:
            return True
    return False


def _validate_question_set(questions: list[dict[str, Any]], structured_input: StructuredQuestionInput, question_count: int) -> list[str]:
    issues: list[str] = []
    requested_count = max(2, int(question_count))
    # Accept a small shortfall while keeping a practical floor for real interview sets.
    min_acceptable_count = max(6, requested_count - 2)
    if len(questions) < min_acceptable_count:
        issues.append(f"insufficient_questions:{len(questions)}")
        return issues

    similarity_seen: set[str] = set()
    behavioral_count: int = 0
    project_grounded_count: int = 0
    leadership_count: int = 0
    architecture_count: int = 0
    scaling_count: int = 0
    integration_count: int = 0
    skill_only_count: int = 0
    debugging_failure_count: int = 0
    design_count: int = 0
    project_execution_count: int = 0
    project_tradeoff_count: int = 0
    project_debugging_count: int = 0

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
            behavioral_count = behavioral_count + 1
        if question.get("category") == "leadership" or any(term in text_norm for term in ("stakeholder", "mentor", "lead", "team", "practice", "governance", "delivery leader")):
            leadership_count = leadership_count + 1
        if question.get("category") == "architecture" or any(term in text_norm for term in ("trade-off", "tradeoffs", "trade off", "scal", "governance", "design", "architecture")):
            architecture_count = architecture_count + 1
        if any(term in text_norm for term in ("design", "architecture", "interface", "boundary", "component", "pattern", "decision")):
            design_count = design_count + 1
        if any(term in text_norm for term in ("scale", "scaling", "grow", "10x", "5x", "twice", "double", "doubled", "across accounts", "adoption", "capacity", "governance", "performance", "latency", "throughput", "load")):
            scaling_count = scaling_count + 1
        if any(term in text_norm for term in ("api", "integration", "service", "services", "interface", "data flow", "contract", "pipeline", "webhook", "event")):
            integration_count = integration_count + 1
        grounded = _is_project_grounded(question, structured_input)
        if grounded:
            project_grounded_count = project_grounded_count + 1
        elif question.get("category") not in {"intro", "behavioral"} and str(question.get("priority_source") or "") != "jd_gap_probe":
            issues.append("question_not_grounded_in_resume_or_priority_jd")
        if question.get("category") == "deep_dive" and not grounded:
            skill_only_count = skill_only_count + 1
        if _is_project_question(question) and not _has_project_anchor(question, structured_input):
            issues.append("project_question_missing_name_or_metric_anchor")

        if grounded:
            if any(term in text_norm for term in ("what did you personally", "what exactly did you own", "what did you change", "did you personally drive", "how did you implement", "how did you build", "how did you deliver", "walk me through", "what problem were you solving")):
                project_execution_count = project_execution_count + 1
            if any(term in text_norm for term in ("trade-off", "tradeoffs", "trade off", "how did you decide", "why did you choose", "what decisions", "why was that design", "balance consistency", "what would you revisit")):
                project_tradeoff_count = project_tradeoff_count + 1
            if any(term in text_norm for term in ("debug", "failure", "didn't work", "did not work", "root cause", "bottleneck", "incident", "wrong", "remediation", "what signals", "fixes were working")):
                project_debugging_count = project_debugging_count + 1
        if any(term in text_norm for term in ("failure", "debug", "trade-off", "tradeoffs", "trade off", "didn't work", "did not work", "root cause", "bottleneck", "what went wrong", "incident")):
            debugging_failure_count = debugging_failure_count + 1

    if _opening_pattern_violations(questions):
        issues.append("opening_pattern_repetition")
    if project_grounded_count == 0:
        issues.append("no_project_grounded_question")
    if sum(1 for q in questions if q.get("category") == "intro") == 0:
        issues.append("missing_intro_question")
    if behavioral_count == 0:
        issues.append("missing_behavioral_question")
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
    role_track = _structured_role_track(structured_input)
    if _is_architect_profile(structured_input) and architecture_count == 0:
        issues.append("architect_role_missing_design_tradeoff_question")
    joined = " ".join(_normalize_token(q.get("text")) for q in questions)
    if role_track == "frontend":
        if not any(term in joined for term in ("component", "state", "responsive", "browser", "ux", "api integration", "ui")):
            issues.append("frontend_role_missing_ui_component_integration_coverage")
        if any(term in joined for term in ("databricks", "lakehouse", "unity catalog")):
            issues.append("frontend_role_contains_data_platform_content")
    if role_track == "data":
        if not any(term in joined for term in ("platform", "governance", "pipeline", "lakehouse", "scale", "cost", "quality")):
            issues.append("data_role_missing_platform_governance_scaling_coverage")
        if any(term in joined for term in ("component", "responsive", "browser", "ux", "ui")):
            issues.append("data_role_contains_frontend_content")
    return _dedupe_strings(issues)


def _normalize_llm_questions(
    *,
    raw_questions: list[Any],
    structured_input: StructuredQuestionInput,
    question_count: int,
) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
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
        role_alignment = 1.0 if category == "intro" else 0.8
        resume_alignment = 0.85 if category in {"intro", "project", "leadership"} else 0.75
        jd_alignment = 0.9 if category in {"deep_dive", "architecture"} else 0.75
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
            "role_alignment": role_alignment,
            "resume_alignment": resume_alignment,
            "jd_alignment": jd_alignment,
            "metadata": {
                "category": category,
                "priority_source": priority_source,
                "skill_or_topic": _clean(focus_skill or project_name or category),
                "role_alignment": role_alignment,
                "resume_alignment": resume_alignment,
                "jd_alignment": jd_alignment,
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

    final_questions: list[dict[str, Any]] = []
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


# LLM call + quality validation --------------------------------------------

def _call_llm(structured_input: StructuredQuestionInput, question_count: int, retry_note: str | None = None) -> dict[str, Any]:
    user_prompt = _llm_user_prompt(structured_input, question_count, retry_note=retry_note)
    provider = _llm_provider()
    model = _llm_premium_model()
    logger.info(
        "LLM_CALL_START provider=%s model=%s question_count_requested=%s question_count_returned=%s fallback_used=%s retry=%s",
        provider,
        model,
        question_count,
        0,
        False,
        bool(retry_note),
    )
    logger.info(
        "llm_question_request provider=%s model=%s question_count=%s retry=%s role_family=%s",
        provider,
        model,
        question_count,
        bool(retry_note),
        structured_input.role_family,
    )
    try:
        response = _get_client().chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": LLM_QUESTION_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.25 if retry_note else 0.35,
            max_tokens=8000,
        )
        logger.info("llm_question_request_success provider=%s model=%s retry=%s", provider, model, bool(retry_note))
    except Exception as exc:
        logger.warning("llm_question_request_failure provider=%s model=%s retry=%s error=%s", provider, model, bool(retry_note), exc)
        raise
    payload = _extract_json_object(response.choices[0].message.content or "")
    questions = _normalize_llm_questions(
        raw_questions=list(payload.get("questions") or []),
        structured_input=structured_input,
        question_count=max(2, int(question_count)),
    )
    logger.info(
        "LLM_CALL_RESPONSE provider=%s model=%s question_count_requested=%s question_count_returned=%s fallback_used=%s retry=%s",
        provider,
        model,
        question_count,
        len(questions),
        False,
        bool(retry_note),
    )
    return {
        "questions": questions,
        "user_prompt": user_prompt,
    }


def _retry_note_for_issues(issues: list[str]) -> str:
    return (
        "Your previous output lacked depth and grounding. Regenerate using project-specific details and measurable outcomes. "
        "Quality failures: "
        + ", ".join(issues)
        + ". Enforce: no duplicates, no weak phrases, every project-related question must include a project name or metric anchor, include project execution + trade-off + debugging/failure coverage, leadership and stakeholder plus scaling coverage for senior profiles, architecture/trade-off coverage for architect roles, and keep behavioral questions limited."
    )



def _generate_validated_llm_questions(
    structured_input: StructuredQuestionInput,
    question_count: int,
) -> tuple[list[dict[str, Any]], str, dict[str, Any]]:
    requested_count = max(2, int(question_count))
    first_attempt = _call_llm(structured_input, requested_count)
    all_issues = _validate_question_set(first_attempt["questions"], structured_input, requested_count)

    final_questions = first_attempt["questions"]
    final_user_prompt = first_attempt["user_prompt"]
    # Quota optimization: Disable automatic retries for Free Tier accounts (20 req/day)
    # This saves one LLM call per interview start.
    quality = {
        "first_attempt_issues": all_issues,
        "retry_used": False,
        "retry_issues": [],
        "final_issues": all_issues,
    }
    return final_questions, final_user_prompt, quality



def generate_llm_questions(
    *,
    jd_text: str,
    resume_text: str,
    question_count: int,
    jd_title: str | None = None,
    jd_skill_scores: Mapping[str, int] | None = None,
) -> dict[str, Any]:
    structured_input = build_structured_question_input(
        resume_text=resume_text,
        jd_title=jd_title,
        jd_skill_scores=jd_skill_scores,
        jd_text=jd_text,
    )
    final_questions, final_user_prompt, quality = _generate_validated_llm_questions(
        structured_input,
        max(2, int(question_count)),
    )

    return {
        "questions": final_questions[: max(2, int(question_count))],
        "structured_input": asdict(structured_input),
        "system_prompt": LLM_QUESTION_SYSTEM_PROMPT,
        "user_prompt": final_user_prompt,
        "llm_model": _llm_premium_model(),
        "quality": quality,
    }


# Deterministic fallback + runtime bundle assembly --------------------------

def _pick_fallback_top_up(
    *,
    llm_questions: list[dict[str, Any]],
    fallback_questions: list[dict[str, Any]],
    needed: int,
    distribution: dict[str, int] | None,
) -> list[dict[str, Any]]:
    if needed <= 0:
        return []

    seen = {_similarity_key(q.get("text")) for q in llm_questions}
    current_counts: dict[str, int] = {}
    for question in llm_questions:
        category = str(question.get("category") or "deep_dive")
        current_counts[category] = current_counts.get(category, 0) + 1

    target_distribution = distribution or {}
    candidates: list[tuple[int, float, dict[str, Any]]] = []
    for fallback_question in fallback_questions:
        text_key = _similarity_key(fallback_question.get("text"))
        if not text_key or text_key in seen:
            continue
        category = str(fallback_question.get("category") or "deep_dive")
        target = int(target_distribution.get(category, 0))
        deficit = max(0, target - current_counts.get(category, 0))
        relevance = float(((fallback_question.get("metadata") or {}).get("relevance_score") or 0.0))
        candidates.append((deficit, relevance, fallback_question))

    candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)

    picked: list[dict[str, Any]] = []
    for _, _, fallback_question in candidates:
        if len(picked) >= needed:
            break
        text_key = _similarity_key(fallback_question.get("text"))
        if text_key in seen:
            continue
        seen.add(text_key)
        picked.append(fallback_question)
    return picked


def _enforce_category_coverage(
    questions: list[dict[str, Any]],
    fallback_questions: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    if not fallback_questions:
        return questions
        
    categories_present = {str(q.get("category") or q.get("type") or "project") for q in questions}
    has_intro = "intro" in categories_present
    has_behavioral = "behavioral" in categories_present
    
    if has_intro and has_behavioral:
        return questions
        
    result = list(questions)
    seen_texts = {_similarity_key(q.get("text")) for q in result}
    
    def _swap_question(target_category: str | tuple[str, ...], replace_from_end: bool = True) -> bool:
        candidate = None
        for fq in fallback_questions:
            cat = str(fq.get("category") or fq.get("type") or "project")
            is_match = cat in target_category if isinstance(target_category, tuple) else cat == target_category
            if is_match and _similarity_key(fq.get("text")) not in seen_texts:
                candidate = fq
                break
                
        if not candidate:
            return False
        assert candidate is not None
            
        # Find a victim to replace (usually another deep_dive or project that isn't the only one)
        victim_idx = -1
        if replace_from_end:
            for i in range(len(result) - 1, -1, -1):
                if str(result[i].get("category")) in {"deep_dive", "project"}:
                    victim_idx = i
                    break
        else:
            for i in range(len(result)):
                if str(result[i].get("category")) in {"deep_dive", "project"}:
                    victim_idx = i
                    break
                    
        if victim_idx >= 0:
            result[victim_idx] = candidate
            seen_texts.add(_similarity_key(candidate.get("text")))
            return True
            
        return False

    if not has_intro:
        # Swap the first deep dive or project question with the intro
        success = _swap_question("intro", replace_from_end=False)
        if not success and result:
            idx = 0
            for i in range(len(result)):
                if str(result[i].get("category")) in {"deep_dive", "project"}:
                    idx = i
                    break
            result[idx] = {
                "text": "Could you briefly walk me through your background and the most recent role on your resume?",
                "category": "intro",
                "type": "intro",
                "difficulty": "easy",
                "topic": "background",
                "intent": "Assess candidate background and communication.",
                "priority_source": "baseline",
            }
        
    if not has_behavioral:
        # Swap the last deep dive or project question with behavioral
        success = _swap_question("behavioral", replace_from_end=True)
        if not success and result:
            idx = -1
            for i in range(len(result)-1, -1, -1):
                if str(result[i].get("category")) in {"deep_dive", "project"}:
                    idx = i
                    break
            result[idx] = {
                "text": "Tell me about a time when you had to manage conflicting priorities or navigate a difficult stakeholder conversation to deliver a project on time.",
                "category": "behavioral",
                "type": "hr",
                "difficulty": "medium",
                "topic": "stakeholder management",
                "intent": "Assess behavioral depth, conflict resolution, and communication.",
                "priority_source": "derived",
            }
        
    return result


def _build_fallback_bundle(
    *,
    resume_text: str,
    jd_title: str | None,
    jd_skill_scores: Mapping[str, int] | None,
    question_count: int,
) -> dict[str, Any]:
    fallback_bundle = build_question_plan(
        resume_text=resume_text,
        jd_title=jd_title,
        jd_skill_scores=jd_skill_scores or {},
        question_count=question_count,
    ) or {}
    return fallback_bundle if isinstance(fallback_bundle, dict) else {}


def _bundle_counts(questions: list[dict[str, Any]]) -> dict[str, Any]:
    project_like_count = sum(
        1
        for item in questions
        if item.get("category") in {"deep_dive", "project", "architecture", "leadership"}
    )
    hr_count = sum(1 for item in questions if item.get("category") == "behavioral")
    return {
        "total_questions": len(questions),
        "project_count": project_like_count,
        "hr_count": hr_count,
        "project_questions_count": project_like_count,
        "theory_questions_count": hr_count,
        "intro_count": sum(1 for item in questions if item.get("category") == "intro"),
    }


def _runtime_bundle_from_llm(
    *,
    llm_bundle: dict[str, Any],
    fallback_bundle: dict[str, Any],
    questions: list[dict[str, Any]],
    project_ratio: float | None,
    llm_topped_up_with_fallback: bool,
) -> dict[str, Any]:
    logger.info(
        "llm_question_bundle_ready provider=%s model=%s generation_mode=%s fallback_used=%s questions=%s",
        _llm_provider(),
        llm_bundle.get("llm_model"),
        "llm_primary",
        False,
        len(questions),
    )
    return {
        "questions": questions,
        **_bundle_counts(questions),
        "projects": list((llm_bundle.get("structured_input") or {}).get("resume_projects") or [])[:6],
        "meta": {
            **(fallback_bundle.get("meta") or {}),
            "generation_mode": "llm_primary",
            "fallback_used": False,
            "llm_topped_up_with_fallback": llm_topped_up_with_fallback,
            "llm_model": llm_bundle.get("llm_model"),
            "llm_system_prompt": llm_bundle.get("system_prompt"),
            "llm_user_prompt": llm_bundle.get("user_prompt"),
            "structured_input": llm_bundle.get("structured_input"),
            "llm_quality": llm_bundle.get("quality"),
            "project_ratio_requested": project_ratio,
        },
    }


def _runtime_bundle_from_fallback(
    *,
    fallback_bundle: dict[str, Any],
    fallback_reason: str,
    project_ratio: float | None,
    structured_input: StructuredQuestionInput,
) -> dict[str, Any]:
    questions = list(fallback_bundle.get("questions") or [])
    meta = dict(fallback_bundle.get("meta") or {})
    meta.update(
        {
            "generation_mode": "fallback_dynamic_plan",
            "fallback_used": True,
            "fallback_reason": fallback_reason,
            "project_ratio_requested": project_ratio,
            "structured_input": asdict(structured_input),
        }
    )
    logger.info(
        "llm_question_bundle_ready provider=%s model=%s generation_mode=%s fallback_used=%s questions=%s",
        _llm_provider(),
        _llm_model(),
        "fallback_dynamic_plan",
        True,
        len(questions),
    )
    return {
        "questions": questions,
        "total_questions": int(fallback_bundle.get("total_questions", len(questions)) or len(questions)),
        "project_count": int(fallback_bundle.get("project_count", 0) or 0),
        "hr_count": int(fallback_bundle.get("hr_count", 0) or 0),
        "project_questions_count": int(fallback_bundle.get("project_questions_count", 0) or 0),
        "theory_questions_count": int(fallback_bundle.get("theory_questions_count", 0) or 0),
        "intro_count": int(fallback_bundle.get("intro_count", 0) or 0),
        "projects": list(fallback_bundle.get("projects") or []),
        "meta": meta,
    }


EMERGENCY_FALLBACK_QUESTIONS = [
    {
        "text": "Could you briefly walk me through your background and the most recent role on your resume?",
        "category": "intro",
        "type": "intro",
        "difficulty": "easy",
        "topic": "background",
        "intent": "Assess candidate background and communication.",
        "priority_source": "baseline",
    },
    {
        "text": "Tell me about a time when you had to manage conflicting priorities or navigate a difficult stakeholder conversation to deliver a project on time.",
        "category": "behavioral",
        "type": "hr",
        "difficulty": "medium",
        "topic": "stakeholder management",
        "intent": "Assess behavioral depth, conflict resolution, and communication.",
        "priority_source": "derived",
    },
    {
        "text": "Describe a recent technical challenge you faced. What was the root cause, and how did you resolve it?",
        "category": "deep_dive",
        "type": "project",
        "difficulty": "medium",
        "topic": "problem solving",
        "intent": "Assess analytical and debugging skills.",
        "priority_source": "derived",
    },
    {
        "text": "Walk me through how you would design a system to scale 10x from its current load. What are the key bottlenecks you would anticipate?",
        "category": "architecture",
        "type": "project",
        "difficulty": "hard",
        "topic": "system design",
        "intent": "Assess architectural thinking and scalability considerations.",
        "priority_source": "derived",
    },
    {
        "text": "How do you ensure the code you deliver is maintainable and reliable over time?",
        "category": "deep_dive",
        "type": "project",
        "difficulty": "medium",
        "topic": "software engineering practices",
        "intent": "Assess understanding of testing, review, and quality standards.",
        "priority_source": "derived",
    },
    {
        "text": "Tell me about a time you had to learn a new technology quickly to deliver a critical feature.",
        "category": "behavioral",
        "type": "hr",
        "difficulty": "medium",
        "topic": "adaptability",
        "intent": "Assess learning agility and execution under pressure.",
        "priority_source": "derived",
    },
    {
        "text": "What is the most complex bug you've had to debug in production, and what tools did you use?",
        "category": "deep_dive",
        "type": "project",
        "difficulty": "hard",
        "topic": "debugging",
        "intent": "Assess deep technical troubleshooting.",
        "priority_source": "derived",
    },
    {
        "text": "How do you approach trading off between building the perfect technical solution versus delivering quickly to meet business needs?",
        "category": "leadership",
        "type": "hr",
        "difficulty": "medium",
        "topic": "trade-offs",
        "intent": "Assess business acumen and pragmatic engineering.",
        "priority_source": "derived",
    }
]


def generate_question_bundle_with_fallback(
    *,
    resume_text: str,
    jd_title: str | None,
    jd_skill_scores: Mapping[str, int] | None,
    question_count: int | None = None,
    project_ratio: float | None = None,
    jd_text: str | None = None,
) -> dict[str, Any]:
    desired_count = max(2, min(20, int(question_count or 8)))
    provider = _llm_provider()
    model = _llm_premium_model()
    
    try:
        fallback_bundle = _build_fallback_bundle(
            resume_text=resume_text,
            jd_title=jd_title,
            jd_skill_scores=jd_skill_scores,
            question_count=desired_count,
        )
    except Exception as exc:
        logger.error("Fallback bundle generation failed completely: %s", exc)
        fallback_bundle = {"questions": EMERGENCY_FALLBACK_QUESTIONS[:desired_count]}

    try:
        llm_bundle = generate_llm_questions(
            jd_text=_build_jd_text(jd_title, jd_skill_scores, jd_text=jd_text),
            resume_text=resume_text,
            question_count=desired_count,
            jd_title=jd_title,
            jd_skill_scores=jd_skill_scores or {},
        )
        questions = list(llm_bundle["questions"])
        llm_topped_up_with_fallback = False

        missing = desired_count - len(questions)
        if missing > 0:
            distribution = (fallback_bundle.get("meta") or {}).get("distribution")
            top_up_questions = _pick_fallback_top_up(
                llm_questions=questions,
                fallback_questions=list(fallback_bundle.get("questions") or []),
                needed=missing,
                distribution=distribution if isinstance(distribution, dict) else None,
            )
            if top_up_questions:
                questions.extend(top_up_questions)
                llm_topped_up_with_fallback = True

        # Enforce explicitly required categories
        original_len = len(questions)
        questions = _enforce_category_coverage(questions, list(fallback_bundle.get("questions") or []))
        if len(questions) != original_len or any(q.get("category") in {"intro", "behavioral"} for q in questions) and not llm_topped_up_with_fallback:
            llm_topped_up_with_fallback = True
            
        logger.info(
            "LLM_SUCCESS provider=%s model=%s question_count_requested=%s question_count_returned=%s fallback_used=%s",
            provider,
            model,
            desired_count,
            len(questions),
            False,
        )

        return _runtime_bundle_from_llm(
            llm_bundle=llm_bundle,
            fallback_bundle=fallback_bundle,
            questions=questions,
            project_ratio=project_ratio,
            llm_topped_up_with_fallback=llm_topped_up_with_fallback,
        )
    except Exception as exc:
        logger.warning("LLM question generation failed, using deterministic fallback: %s", exc)
        fallback_questions = list(fallback_bundle.get("questions") or [])
        
        if not fallback_questions or len(fallback_questions) < desired_count:
            # Complete failure, use emergency questions
            fallback_questions = EMERGENCY_FALLBACK_QUESTIONS[:desired_count]
        else:
            # Enforce explicitly required categories for the fallback plan as well
            fallback_questions = _enforce_category_coverage(fallback_questions, fallback_questions)
            
        fallback_bundle["questions"] = fallback_questions
        
        logger.warning(
            "LLM_FAILED provider=%s model=%s question_count_requested=%s question_count_returned=%s fallback_used=%s error=%s",
            provider,
            model,
            desired_count,
            len(fallback_questions),
            True,
            exc,
        )
        try:
            structured_input = build_structured_question_input(
                resume_text=resume_text,
                jd_title=jd_title,
                jd_skill_scores=jd_skill_scores or {},
                jd_text=jd_text,
            )
        except Exception:
            structured_input = StructuredQuestionInput(
                role=jd_title or "Interview Role",
                role_title=jd_title or "Interview Role",
                role_family="engineer",
                seniority="mid",
                experience_level="mid",
                jd_title=jd_title or "Interview Role",
                jd_summary="",
                jd_core_skills=[],
                jd_secondary_skills=[],
                jd_responsibilities=[],
                jd_skills=[],
                jd_skill_weights={},
                resume_summary="",
                resume_recent_roles=[],
                resume_skills=[],
                resume_projects=[],
                resume_project_technologies=[],
                resume_experiences=[],
                resume_leadership_signals=[],
                resume_measurable_impact=[],
                certifications=[],
                overlap_skills=[],
                resume_only_skills=[],
                jd_only_skills=[],
            )

        return _runtime_bundle_from_fallback(
            fallback_bundle=fallback_bundle,
            fallback_reason=str(exc),
            project_ratio=project_ratio,
            structured_input=structured_input,
        )
