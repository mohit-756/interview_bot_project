"""Single final interview-question generation flow for demo and future tuning."""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Mapping

logger = logging.getLogger(__name__)

# Final single config source for interview generation.
INTERVIEW_CONFIG: dict[str, object] = {
    "total_questions": 8,
    "intro_question_count": 1,
    "project_question_ratio": 0.80,
    "hr_question_ratio": 0.20,
    "tone": "natural_interviewer",
    "audience": "fresher_junior",
    "difficulty": "medium",
}

INTRO_QUESTION = {
    "text": "Please start with a brief introduction about yourself and the project you are most proud of.",
    "type": "intro",
    "topic": "intro:self_introduction",
    "intent": "Understand the candidate's background, strongest project context, and communication style.",
    "focus_skill": None,
    "project_name": None,
    "reference_answer": "A strong answer briefly covers education/background, current interests, one meaningful project, the candidate's exact contribution, and what they learned from it.",
    "difficulty": "easy",
}

PROJECT_QUESTION_PATTERNS = [
    {
        "template": "Can you walk me through {project} and your exact contribution to it?",
        "intent": "Check ownership, clarity, and practical involvement in a real project.",
        "reference_answer": "A strong answer explains the project goal, the candidate's role, the main modules handled, and the final outcome or impact.",
    },
    {
        "template": "Why did you choose {skill} for {project}, and what alternatives did you consider?",
        "intent": "Assess technology choices, trade-off thinking, and practical understanding of tools used.",
        "reference_answer": "A strong answer explains why the chosen technology fit the project needs, mentions alternatives, and discusses trade-offs clearly.",
    },
    {
        "template": "What challenge did you face while building {project}, and how did you solve it using {skill}?",
        "intent": "Assess debugging skill, problem-solving approach, and real implementation depth.",
        "reference_answer": "A strong answer describes one real challenge, how the root cause was identified, the fix applied, and what improved afterward.",
    },
    {
        "template": "If {project} had to scale further, what would you improve first and why?",
        "intent": "Assess system thinking and the ability to identify practical bottlenecks.",
        "reference_answer": "A strong answer identifies likely bottlenecks and suggests practical improvements like indexing, caching, modularization, better APIs, or infra changes.",
    },
    {
        "template": "How did you test or validate {project} before calling it complete?",
        "intent": "Assess engineering discipline and quality mindset.",
        "reference_answer": "A strong answer mentions validation, testing, debugging, edge cases, or feedback loops used before release.",
    },
    {
        "template": "I see {skill} is important for this role. Have you used it practically in {project} or any other work?",
        "intent": "Check real skill usage and how well it maps to the selected JD.",
        "reference_answer": "A strong answer connects the skill to actual usage, where it was applied, and what the candidate learned from using it.",
    },
]

HR_QUESTION_PATTERNS = [
    {
        "text": "Tell me about a time you had to learn something quickly to finish a task or project.",
        "intent": "Assess learning agility and self-driven problem solving.",
        "reference_answer": "A strong answer explains the situation, what had to be learned, how it was learned quickly, and the final result.",
    },
    {
        "text": "How do you handle deadlines or pressure when multiple things are pending?",
        "intent": "Assess prioritization and work habits under pressure.",
        "reference_answer": "A strong answer explains prioritization, breaking work into steps, communication, and staying calm under deadlines.",
    },
    {
        "text": "Tell me about a time you received feedback on your work. What did you change after that?",
        "intent": "Assess coachability and reflection.",
        "reference_answer": "A strong answer shows openness to feedback, a specific change made, and what was learned from it.",
    },
    {
        "text": "How do you work with teammates when opinions differ on how to solve a problem?",
        "intent": "Assess teamwork and conflict handling.",
        "reference_answer": "A strong answer focuses on listening, comparing options, discussing trade-offs respectfully, and reaching a practical solution.",
    },
]

_SECTION_WORDS = {
    "experience", "education", "skills", "summary", "certifications", "achievements", "references", "objective",
    "profile", "projects", "project", "workshops", "personal", "technical", "professional", "career", "academic",
}
_ACTION_VERBS = {"developed", "built", "implemented", "created", "designed", "worked", "led", "managed", "optimized", "tested", "debugged", "deployed", "used"}


def _normalize(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9+.# ]", " ", value or "")
    return re.sub(r"\s+", " ", cleaned).strip().lower()


def _clean_line(value: str) -> str:
    line = re.sub(r"^[\-\*\u2022\d\.\)\(]+\s*", "", (value or "").strip())
    return re.sub(r"\s+", " ", line).strip()


def _is_section_heading(line: str) -> bool:
    value = (line or "").strip()
    return bool(value and len(value) <= 50 and (value.lower() in _SECTION_WORDS or re.fullmatch(r"[A-Z][A-Z\s/&\-]+", value)))


def _starts_with_action_verb(line: str) -> bool:
    first_word = (line or "").strip().split()[0].lower().rstrip(".,;") if line.strip() else ""
    return first_word in _ACTION_VERBS


def extract_projects_from_resume(resume_text: str, *, known_skills: Mapping[str, int] | None = None, max_projects: int = 5) -> list[dict[str, object]]:
    known_skill_set = {_normalize(s) for s in (known_skills or {}).keys() if _normalize(s)}
    lines = [_clean_line(ln) for ln in (resume_text or "").splitlines() if _clean_line(ln)]
    projects: list[dict[str, object]] = []
    seen: set[str] = set()
    in_projects = False
    for i, line in enumerate(lines):
        lowered = line.lower().strip()
        if re.match(r"^projects?\s*$", lowered):
            in_projects = True
            continue
        if in_projects and _is_section_heading(line) and not re.match(r"^projects?\s*$", lowered):
            in_projects = False
            continue
        if not in_projects or _starts_with_action_verb(line) or len(line) > 90:
            continue
        if len(line.split()) <= 10:
            key = line.lower()
            if key not in seen:
                seen.add(key)
                tech_stack = [s for s in known_skill_set if s and re.search(rf"\b{re.escape(s)}\b", line.lower())][:5]
                for j in range(i + 1, min(i + 4, len(lines))):
                    probe = lines[j].lower()
                    if re.match(r"(technologies|tech|stack|tools|built with|using)\s*[:\-]", probe):
                        tech_stack = [t.strip().lower() for t in re.split(r"[,/|;]", re.split(r"[:\-]", lines[j], 1)[1]) if t.strip()][:6]
                        break
                    if _is_section_heading(lines[j]):
                        break
                projects.append({"title": line, "tech_stack": tech_stack, "summary": line})
                if len(projects) >= max_projects:
                    break
    if not projects:
        top_skills = [s for s, _ in sorted((known_skills or {}).items(), key=lambda x: -x[1])][:3]
        return [{"title": "your main project", "tech_stack": top_skills, "summary": "primary project"}]
    return projects


def _section_counts(total_questions: int, project_ratio: float | None = None) -> dict[str, int]:
    total = max(4, int(total_questions or INTERVIEW_CONFIG["total_questions"]))
    intro_count = int(INTERVIEW_CONFIG["intro_question_count"])
    remaining = max(1, total - intro_count)
    p_ratio = float(project_ratio if project_ratio is not None else INTERVIEW_CONFIG["project_question_ratio"])
    p_ratio = max(0.0, min(1.0, p_ratio))
    project_count = max(1, int(round(remaining * p_ratio)))
    hr_count = max(1, remaining - project_count)
    while intro_count + project_count + hr_count > total:
        if project_count > hr_count and project_count > 1:
            project_count -= 1
        elif hr_count > 1:
            hr_count -= 1
        else:
            break
    while intro_count + project_count + hr_count < total:
        if project_count <= hr_count:
            project_count += 1
        else:
            hr_count += 1
    return {"intro": intro_count, "project": project_count, "hr": hr_count}


def _project_skill_pairs(projects: list[dict[str, object]], jd_skill_scores: Mapping[str, int]) -> list[tuple[dict[str, object], str | None]]:
    ranked_skills = [s for s, _ in sorted((jd_skill_scores or {}).items(), key=lambda x: -x[1])]
    pairs: list[tuple[dict[str, object], str | None]] = []
    for idx, project in enumerate(projects):
        preferred = None
        project_tech = {_normalize(t) for t in project.get("tech_stack", [])}
        for skill in ranked_skills:
            if _normalize(skill) in project_tech:
                preferred = skill
                break
        preferred = preferred or (ranked_skills[idx % len(ranked_skills)] if ranked_skills else None)
        pairs.append((project, preferred))
    return pairs or [({"title": "your main project", "tech_stack": []}, ranked_skills[0] if ranked_skills else None)]


def _build_project_questions(projects: list[dict[str, object]], jd_skill_scores: Mapping[str, int], count: int) -> list[dict[str, object]]:
    pairs = _project_skill_pairs(projects, jd_skill_scores)
    questions: list[dict[str, object]] = []
    used: set[str] = set()
    for index in range(count):
        pattern = PROJECT_QUESTION_PATTERNS[index % len(PROJECT_QUESTION_PATTERNS)]
        project, skill = pairs[index % len(pairs)]
        project_name = str(project.get("title") or "your project")
        focus_skill = skill or "the technologies you used"
        text = pattern["template"].format(project=project_name, skill=focus_skill)
        if text in used:
            text = f"In {project_name}, what was the most important technical decision you made and why?"
        used.add(text)
        questions.append({
            "text": text if text.endswith("?") else f"{text}?",
            "type": "project",
            "topic": f"project:{_normalize(focus_skill) or 'general'}",
            "intent": pattern["intent"],
            "focus_skill": focus_skill,
            "project_name": project_name,
            "reference_answer": pattern["reference_answer"],
            "difficulty": str(INTERVIEW_CONFIG["difficulty"]),
        })
    return questions


def _build_hr_questions(count: int) -> list[dict[str, object]]:
    questions: list[dict[str, object]] = []
    for index in range(count):
        pattern = HR_QUESTION_PATTERNS[index % len(HR_QUESTION_PATTERNS)]
        questions.append({
            "text": pattern["text"],
            "type": "hr",
            "topic": "hr:behavioral",
            "intent": pattern["intent"],
            "focus_skill": None,
            "project_name": None,
            "reference_answer": pattern["reference_answer"],
            "difficulty": str(INTERVIEW_CONFIG["difficulty"]),
        })
    return questions


def _build_llm_prompt(*, resume_text: str, jd_title: str | None, jd_skill_scores: Mapping[str, int], projects: list[dict[str, object]], counts: Mapping[str, int]) -> str:
    skills_str = ", ".join(f"{s} ({w}/10)" for s, w in sorted((jd_skill_scores or {}).items(), key=lambda x: -x[1])[:10]) or "general technical skills"
    projects_str = "\n".join(f"- {p['title']}" + (f" (stack: {', '.join(p.get('tech_stack', [])[:4])})" if p.get('tech_stack') else "") for p in projects[:4])
    resume_snippet = re.sub(r"\s+", " ", (resume_text or "").strip())[:1400]
    return f"""You are conducting a realistic fresher/junior interview for the role: {jd_title or 'Software Developer'}.
Return ONLY a valid JSON array of exactly {sum(counts.values())} questions.

Question distribution:
- {counts['intro']} self-introduction / warm-up question
- {counts['project']} practical technical questions based on projects, resume, and JD skills
- {counts['hr']} HR / behavioral questions

Candidate resume snippet:
{resume_snippet}

Important JD skills:
{skills_str}

Candidate projects:
{projects_str}

Rules:
- natural interviewer tone
- suitable for fresher/junior candidates
- practical and realistic
- avoid robotic, vague, repetitive, or overly theoretical wording
- each JSON item must contain: text, type, topic, intent, focus_skill, project_name, reference_answer, difficulty
- type must be one of: intro, project, hr
"""


def _call_llm_for_questions(*, resume_text: str, jd_title: str | None, jd_skill_scores: Mapping[str, int], projects: list[dict[str, object]], counts: Mapping[str, int]) -> list[dict[str, object]] | None:
    try:
        import os
        from groq import Groq
        api_key = os.getenv("GROQ_API_KEY", "")
        if not api_key:
            return None
        response = Groq(api_key=api_key).chat.completions.create(
            model=os.getenv("GROQ_LLM_MODEL", "llama-3.1-8b-instant"),
            messages=[{"role": "user", "content": _build_llm_prompt(resume_text=resume_text, jd_title=jd_title, jd_skill_scores=jd_skill_scores, projects=projects, counts=counts)}],
            temperature=0.55,
            max_tokens=2600,
        )
        raw = (response.choices[0].message.content or "").strip()
        raw = re.sub(r"```(?:json)?", "", raw).strip().strip("`")
        match = re.search(r"\[.*\]", raw, re.DOTALL)
        if match:
            raw = match.group(0)
        data = json.loads(raw)
        if not isinstance(data, list):
            return None
        result: list[dict[str, object]] = []
        for item in data:
            if not isinstance(item, dict):
                continue
            text = str(item.get("text") or "").strip()
            if not text:
                continue
            result.append({
                "text": text if text.endswith("?") else f"{text}?",
                "type": str(item.get("type") or "project"),
                "topic": str(item.get("topic") or "general"),
                "intent": str(item.get("intent") or "Assess candidate understanding and communication."),
                "focus_skill": item.get("focus_skill"),
                "project_name": item.get("project_name"),
                "reference_answer": str(item.get("reference_answer") or "A strong answer should be relevant, practical, and clearly explained."),
                "difficulty": str(item.get("difficulty") or INTERVIEW_CONFIG["difficulty"]),
            })
        return result if len(result) >= sum(counts.values()) else None
    except Exception as exc:
        logger.warning("LLM question generation failed (%s). Using deterministic generator.", exc)
        return None


def build_question_bundle(*, resume_text: str, jd_title: str | None, jd_skill_scores: Mapping[str, int] | None, question_count: int | None = None, project_ratio: float | None = None) -> dict[str, object]:
    total = int(question_count or INTERVIEW_CONFIG["total_questions"])
    counts = _section_counts(total, project_ratio=project_ratio)
    projects = extract_projects_from_resume(resume_text, known_skills=jd_skill_scores or {})
    questions = _call_llm_for_questions(
        resume_text=resume_text,
        jd_title=jd_title,
        jd_skill_scores=jd_skill_scores or {},
        projects=projects,
        counts=counts,
    )
    generated_by = "llm"
    
    if not questions:
        questions = [dict(INTRO_QUESTION) for _ in range(counts["intro"])] + _build_project_questions(projects, jd_skill_scores or {}, counts["project"]) + _build_hr_questions(counts["hr"])
        generated_by = "deterministic"
    return {
        "questions": questions[:sum(counts.values())],
        "total_questions": sum(counts.values()),
        "project_questions_count": counts["project"],
        "theory_questions_count": counts["hr"],
        "projects": projects,
        "config": INTERVIEW_CONFIG,
        "generated_by": generated_by,
    }


def build_interview_question_bank(*, resume_text: str, jd_title: str | None, jd_skill_scores: Mapping[str, int] | None, question_count: int = 8, project_ratio: float = 0.80) -> list[dict[str, object]]:
    return list(build_question_bundle(
        resume_text=resume_text,
        jd_title=jd_title,
        jd_skill_scores=jd_skill_scores or {},
        question_count=question_count,
        project_ratio=project_ratio,
    )["questions"])
