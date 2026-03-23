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

LLM_QUESTION_SYSTEM_PROMPT = """You are a senior technical interviewer creating a high-quality interview question bank.
Your job is to generate sharp, resume-aware, JD-aware interview questions for ANY role, ANY tech stack, ANY seniority.

Rules:
- Return ONLY valid JSON.
- Produce interviewer-style questions, not generic study prompts.
- Use the candidate's resume evidence and the JD needs together.
- Stay dynamic: never assume a fixed stack, fixed skills, or fresher-only profile.
- Avoid hardcoded templates that ignore the supplied context.
- Questions must be specific, realistic, and answerable from real work.
- Prefer questions that probe ownership, decisions, trade-offs, debugging, architecture, delivery impact, collaboration, and prioritization.
- Ensure variety across categories: intro, deep_dive, project, architecture_or_design, leadership_or_behavioral, jd_gap_probe when relevant.
- Do not ask duplicate or near-duplicate questions.
- Do not ask trivia-only or textbook-definition questions unless strongly justified by the JD.
- If resume evidence is weak for a JD skill, you may ask a transfer/approach question, but state it practically.

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
    seniority: str
    experience_level: str
    jd_title: str
    jd_summary: str
    jd_skills: list[str]
    jd_skill_weights: dict[str, int]
    resume_summary: str
    resume_skills: list[str]
    resume_projects: list[str]
    resume_experiences: list[str]
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
    return re.sub(r"[^a-z0-9+#./ ]+", "", _clean(value).lower()).strip()


def _similarity_key(value: str | None) -> str:
    lowered = _normalize_token(value)
    lowered = re.sub(r"\b(tell me about|walk me through|describe|explain|how would you|how do you)\b", "", lowered)
    return re.sub(r"\s+", " ", lowered).strip()


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
    return _dedupe_strings(detected + inline_skills + jd_mentions, limit=20)


def _augment_resume_projects(parsed_resume: dict[str, object], resume_text: str) -> list[str]:
    projects = [str(item) for item in (parsed_resume.get("projects") or [])]
    return _dedupe_strings(projects + _extract_inline_section_values(resume_text, "projects"), limit=8)


def _augment_resume_experiences(parsed_resume: dict[str, object], resume_text: str) -> list[str]:
    experience = [str(item) for item in (parsed_resume.get("experience") or [])]
    return _dedupe_strings(experience + _extract_inline_section_values(resume_text, "experience"), limit=8)


def _augment_certifications(parsed_resume: dict[str, object], resume_text: str) -> list[str]:
    certs = [str(item) for item in (parsed_resume.get("certifications") or [])]
    return _dedupe_strings(certs + _extract_inline_section_values(resume_text, "certifications"), limit=6)


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
    )
    planner_meta = planner_bundle.get("meta") or {}
    parsed_resume = parse_resume_text(resume_text or "")
    structured_resume = planner_meta.get("structured_resume") or {}
    structured_jd = planner_meta.get("structured_jd") or {}

    resume_skills = _augment_resume_skills(parsed_resume, resume_text or "", jd_skill_scores)
    if not resume_skills:
        resume_skills = _dedupe_strings([str(item) for item in (structured_resume.get("skills") or [])], limit=20)
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

    return StructuredQuestionInput(
        role=_clean(jd_title or structured_jd.get("title") or "Interview Role"),
        seniority=seniority,
        experience_level=_infer_experience_level(resume_summary, resume_text or ""),
        jd_title=_clean(jd_title or structured_jd.get("title") or "Interview Role"),
        jd_summary=jd_summary,
        jd_skills=jd_skills,
        jd_skill_weights={_clean(k): int(v) for k, v in (jd_skill_scores or {}).items() if _clean(k)},
        resume_summary=resume_summary,
        resume_skills=resume_skills,
        resume_projects=_augment_resume_projects(parsed_resume, resume_text or ""),
        resume_experiences=_augment_resume_experiences(parsed_resume, resume_text or ""),
        certifications=_augment_certifications(parsed_resume, resume_text or ""),
        overlap_skills=_dedupe_strings(overlap, limit=12),
        resume_only_skills=_dedupe_strings(resume_only, limit=12),
        jd_only_skills=_dedupe_strings(jd_only, limit=12),
    )


def _llm_user_prompt(structured_input: StructuredQuestionInput, question_count: int) -> str:
    return (
        f"Generate {question_count} interview questions for this candidate.\n\n"
        "Candidate/JD context (JSON):\n"
        f"{json.dumps(asdict(structured_input), indent=2)}\n\n"
        "Additional instructions:\n"
        "- The first question should be a concise intro/background opener.\n"
        "- Remaining questions should balance resume-backed depth with JD coverage.\n"
        "- Use resume_projects and resume_experiences as evidence anchors where possible.\n"
        "- If jd_only_skills exists, include at most one practical gap-probe question unless the JD strongly requires more.\n"
        "- Avoid repeating the same skill/topic from multiple angles unless the role is highly specialized.\n"
        "- Reference answers should describe what a strong answer should cover, not a memorized script.\n"
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
        return "leadership" if any(term in lowered for term in ("stakeholder", "mentor", "led", "ownership", "team", "conflict")) else "behavioral"
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
    ]
    overlap_keys = {_normalize_token(item) for item in structured_input.overlap_skills}
    resume_keys = {_normalize_token(item) for item in structured_input.resume_skills}
    jd_keys = {_normalize_token(item) for item in structured_input.jd_skills}
    project_keys = {_normalize_token(item) for item in structured_input.resume_projects}

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
        score += 0.8
    if len(_clean(question.get("text"))) >= 30:
        score += 0.2
    return round(score, 3)


def _normalize_llm_questions(
    *,
    raw_questions: list[object],
    structured_input: StructuredQuestionInput,
    question_count: int,
) -> list[dict[str, object]]:
    normalized: list[dict[str, object]] = []
    seen_text: set[str] = set()
    used_categories: dict[str, int] = {}

    for index, item in enumerate(raw_questions):
        if not isinstance(item, dict):
            continue
        text = _clean(item.get("text"))
        if not text or len(text) < 18 or "?" not in text:
            continue
        similarity = _similarity_key(text)
        if not similarity or similarity in seen_text:
            continue

        category = _normalize_category(item.get("category"), text)
        focus_skill = _clean(item.get("focus_skill")) or None
        project_name = _clean(item.get("project_name")) or None
        reference_answer = _clean(item.get("reference_answer"))
        if len(reference_answer) < 24:
            reference_answer = "A strong answer should explain the candidate's real contribution, decisions, trade-offs, execution details, and outcomes."
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
            "priority_source": _clean(item.get("priority_source")) or _choose_priority_source(category, focus_skill, structured_input),
            "role_alignment": 1.0 if category == "intro" else 0.8,
            "resume_alignment": 0.85 if category in {"intro", "project", "leadership"} else 0.75,
            "jd_alignment": 0.9 if category in {"deep_dive", "architecture"} else 0.75,
            "metadata": {
                "category": category,
                "priority_source": _clean(item.get("priority_source")) or _choose_priority_source(category, focus_skill, structured_input),
                "skill_or_topic": _clean(focus_skill or project_name or category),
                "role_alignment": 1.0 if category == "intro" else 0.8,
                "resume_alignment": 0.85 if category in {"intro", "project", "leadership"} else 0.75,
                "jd_alignment": 0.9 if category in {"deep_dive", "architecture"} else 0.75,
                "relevance_score": 0.0,
                "role_family": structured_input.seniority,
                "seniority": structured_input.experience_level,
                "evidence_excerpt": _clean(item.get("rationale")) or None,
            },
        }
        relevance = _question_relevance_score(question, structured_input)
        if relevance < 1.0 and category not in {"intro", "behavioral"}:
            continue
        question["metadata"]["relevance_score"] = relevance
        normalized.append(question)
        seen_text.add(similarity)
        used_categories[category] = used_categories.get(category, 0) + 1
        if len(normalized) >= max(question_count * 2, question_count + 3):
            break

    normalized.sort(
        key=lambda item: (
            0 if item.get("category") == "intro" else 1,
            -(float((item.get("metadata") or {}).get("relevance_score") or 0.0)),
            len(str(item.get("text") or "")),
        )
    )

    final_questions: list[dict[str, object]] = []
    category_caps = {"behavioral": 2, "leadership": 2, "architecture": 3, "deep_dive": 4, "project": 3, "intro": 1}
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
    response = _get_client().chat.completions.create(
        model=_llm_model(),
        messages=[
            {"role": "system", "content": LLM_QUESTION_SYSTEM_PROMPT},
            {"role": "user", "content": _llm_user_prompt(structured_input, max(2, int(question_count)))},
        ],
        temperature=0.35,
        max_tokens=2200,
    )
    payload = _extract_json_object(response.choices[0].message.content or "")
    questions = _normalize_llm_questions(
        raw_questions=list(payload.get("questions") or []),
        structured_input=structured_input,
        question_count=max(2, int(question_count)),
    )
    if len(questions) < max(2, int(question_count)):
        raise ValueError(f"LLM returned only {len(questions)} usable questions")
    return {
        "questions": questions[: max(2, int(question_count))],
        "structured_input": asdict(structured_input),
        "system_prompt": LLM_QUESTION_SYSTEM_PROMPT,
        "user_prompt": _llm_user_prompt(structured_input, max(2, int(question_count))),
        "llm_model": _llm_model(),
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
    )
    try:
        llm_bundle = generate_llm_questions(
            jd_text=_build_jd_text(jd_title, jd_skill_scores, jd_text=jd_text),
            resume_text=resume_text,
            question_count=desired_count,
            jd_title=jd_title,
            jd_skill_scores=jd_skill_scores or {},
        )
        questions = llm_bundle["questions"]
        project_like_count = sum(1 for item in questions if item.get("category") in {"deep_dive", "project", "architecture", "leadership"})
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
                "project_ratio_requested": project_ratio,
            },
        }
    except Exception as exc:
        logger.warning("LLM question generation failed, using deterministic fallback: %s", exc)
        meta = dict(fallback_bundle.get("meta") or {})
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
        fallback_bundle["meta"] = meta
        return fallback_bundle
