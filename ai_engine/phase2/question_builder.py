"""Single final interview-question generation flow for demo and future tuning."""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Mapping, Sequence

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
    "internship", "internships", "training", "languages", "hobbies", "strengths", "declaration",
}
_ACTION_VERBS = {
    "developed", "built", "implemented", "created", "designed", "worked", "led", "managed", "optimized",
    "tested", "debugged", "deployed", "used", "integrated", "configured", "engineered", "delivered",
}
_CONTRIBUTION_VERBS = {
    "developed", "implemented", "designed", "integrated", "built", "created", "optimized", "debugged", "tested",
}
_PROJECT_SECTION_HINTS = {
    "projects", "project", "academic projects", "personal projects", "major projects", "relevant projects",
    "academic project", "personal project", "project experience",
}
_TECH_KEYWORDS = {
    "python", "java", "javascript", "typescript", "c", "c++", "c#", "sql", "mysql", "postgresql", "mongodb",
    "h2", "sqlite", "oracle", "redis", "html", "css", "react", "angular", "angularjs", "vue", "node", "node.js",
    "express", "spring", "spring boot", "django", "flask", "fastapi", "hibernate", "jpa", "bootstrap", "tailwind",
    "docker", "kubernetes", "aws", "azure", "gcp", "git", "github", "rest", "rest api", "microservices", "jwt",
    "linux", "pandas", "numpy", "scikit-learn", "tensorflow", "pytorch", "opencv", "firebase", "supabase",
}
_SKILL_QUESTION_BLUEPRINTS = [
    {
        "intent": "Assess whether the candidate can connect a claimed skill to concrete implementation decisions.",
        "reference_answer": "A strong answer ties the skill to an actual feature, explains how it was used in the project, and discusses one practical trade-off or lesson.",
    },
    {
        "intent": "Assess practical debugging and problem-solving with a skill the candidate has actually used.",
        "reference_answer": "A strong answer describes a real issue, how the candidate diagnosed it, the fix applied, and how they verified the outcome.",
    },
    {
        "intent": "Assess depth beyond definitions by asking how a skill shaped architecture, performance, or maintainability.",
        "reference_answer": "A strong answer explains the role of the skill in the system design and gives a practical rationale for the chosen approach.",
    },
]


def _normalize(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9+.# ]", " ", value or "")
    return re.sub(r"\s+", " ", cleaned).strip().lower()


def _clean_line(value: str) -> str:
    line = re.sub(r"^[\-\*\u2022\d\.\)\(]+\s*", "", (value or "").strip())
    return re.sub(r"\s+", " ", line).strip()


def _is_section_heading(line: str) -> bool:
    value = (line or "").strip()
    lowered = value.lower()
    return bool(value and len(value) <= 60 and (lowered in _SECTION_WORDS or lowered in _PROJECT_SECTION_HINTS or re.fullmatch(r"[A-Z][A-Z\s/&\-]+", value)))


def _starts_with_action_verb(line: str) -> bool:
    first_word = (line or "").strip().split()[0].lower().rstrip(".,;") if line.strip() else ""
    return first_word in _ACTION_VERBS


def _looks_like_project_title(line: str) -> bool:
    if not line:
        return False
    lowered = line.lower().strip(" :-")
    if lowered in _PROJECT_SECTION_HINTS or _is_section_heading(line):
        return False
    if len(line) > 110:
        return False
    if _starts_with_action_verb(line):
        return False
    if re.search(r"\b(project|system|portal|application|app|website|dashboard|platform|management|booking|tracker|prediction|analysis)\b", lowered):
        return True
    return len(line.split()) <= 12 and bool(re.search(r"[A-Za-z]", line))


def _split_items(text: str) -> list[str]:
    return [item.strip() for item in re.split(r"[,/|;]", text or "") if item.strip()]


def _clean_sentence(value: str) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip(" .;:-")
    text = re.sub(r"^(my role|role|responsible for|contribution)\s*[:\-]\s*", "", text, flags=re.IGNORECASE)
    return text.strip()


def _trim_project_phrase(value: str) -> str:
    text = _clean_sentence(value)
    text = re.sub(r"^(implemented|developed|built|designed|integrated|using)\s+", "", text, flags=re.IGNORECASE)
    text = re.split(r"\b(?:to track|to manage|for users to|that allows|which allows)\b", text, maxsplit=1, flags=re.IGNORECASE)[0].strip(" ,.") or text
    return text


def _dedupe_keep_order(values: Sequence[str], *, limit: int | None = None) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        item = re.sub(r"\s+", " ", str(value or "")).strip()
        key = _normalize(item)
        if not item or not key or key in seen:
            continue
        seen.add(key)
        result.append(item)
        if limit and len(result) >= limit:
            break
    return result


def _extract_tech_from_text(text: str, known_skills: Mapping[str, int] | None = None) -> list[str]:
    found: list[str] = []
    normalized_text = f" {_normalize(text)} "
    for skill in (known_skills or {}).keys():
        skill_key = _normalize(skill)
        if skill_key and f" {skill_key} " in normalized_text:
            found.append(str(skill))
    for keyword in sorted(_TECH_KEYWORDS, key=len, reverse=True):
        keyword_key = _normalize(keyword)
        if keyword_key and f" {keyword_key} " in normalized_text:
            found.append(keyword)
    using_match = re.search(r"(?:using|built with|tech(?:nologies)?|stack|tools)\s*[:\-]?\s*(.+)", text, re.IGNORECASE)
    if using_match:
        raw_items = _split_items(using_match.group(1))
        clean_items = []
        for item in raw_items:
            cleaned = re.split(r"\b(?:to|for|with|where|that|which)\b", item, maxsplit=1, flags=re.IGNORECASE)[0].strip(" .")
            cleaned = re.sub(r"^(and|with)\s+", "", cleaned, flags=re.IGNORECASE)
            if 1 <= len(cleaned.split()) <= 4 and cleaned.lower() not in {"and", "with"}:
                clean_items.append(cleaned)
        found.extend(clean_items)
    return _dedupe_keep_order(found, limit=8)


def _extract_named_segment(pattern: str, text: str) -> str | None:
    match = re.search(pattern, text, re.IGNORECASE)
    if not match:
        return None
    value = re.sub(r"\s+", " ", match.group(1)).strip(" .:-")
    return value or None


def _project_score(project: Mapping[str, object], jd_skill_scores: Mapping[str, int]) -> int:
    tech = {_normalize(value) for value in project.get("tech_stack", []) if value}
    jd_score = sum(int(weight) for skill, weight in (jd_skill_scores or {}).items() if _normalize(skill) in tech)
    details_score = len(project.get("implementation_details", []) or []) * 2
    feature_score = len(project.get("notable_features", []) or [])
    contribution_score = 2 if project.get("candidate_contribution") else 0
    summary_score = 1 if project.get("summary") else 0
    return jd_score + details_score + feature_score + contribution_score + summary_score


def extract_projects_from_resume(resume_text: str, *, known_skills: Mapping[str, int] | None = None, max_projects: int = 5) -> list[dict[str, object]]:
    lines = [_clean_line(ln) for ln in (resume_text or "").splitlines() if _clean_line(ln)]
    projects: list[dict[str, object]] = []
    current: dict[str, object] | None = None
    in_projects = False

    def flush_current() -> None:
        nonlocal current
        if not current:
            return
        title = str(current.get("title") or "").strip()
        if not title:
            current = None
            return
        current["tech_stack"] = _dedupe_keep_order([_clean_sentence(v) for v in current.get("tech_stack", [])], limit=8)
        current["notable_features"] = _dedupe_keep_order([_clean_sentence(v) for v in current.get("notable_features", [])], limit=5)
        current["implementation_details"] = _dedupe_keep_order([_clean_sentence(v) for v in current.get("implementation_details", [])], limit=5)
        contributions = _dedupe_keep_order([_clean_sentence(v) for v in current.get("candidate_contribution", [])], limit=3)
        current["candidate_contribution"] = contributions[0] if contributions else None
        summary = _clean_sentence(str(current.get("summary") or ""))
        if not summary:
            detail_parts = list(current.get("implementation_details", [])) or list(current.get("notable_features", []))
            summary = detail_parts[0] if detail_parts else title
        current["summary"] = summary
        current["score"] = _project_score(current, known_skills or {})
        projects.append(current)
        current = None

    for line in lines:
        lowered = line.lower().strip()
        if lowered in _PROJECT_SECTION_HINTS:
            flush_current()
            in_projects = True
            continue
        if in_projects and _is_section_heading(line) and lowered not in _PROJECT_SECTION_HINTS:
            flush_current()
            in_projects = False
            continue
        if not in_projects:
            continue
        if _looks_like_project_title(line):
            flush_current()
            title_text = re.split(r"\s*[|:\-]\s*", line, maxsplit=1)[0].strip()
            current = {
                "title": title_text,
                "summary": None,
                "tech_stack": _extract_tech_from_text(line, known_skills),
                "notable_features": [],
                "implementation_details": [],
                "candidate_contribution": [],
            }
            remainder = line[len(title_text):].strip(" :-|")
            if remainder:
                current["summary"] = remainder
                current["implementation_details"].append(remainder)
            continue
        if not current:
            continue

        line_tech = _extract_tech_from_text(line, known_skills)
        if line_tech:
            current.setdefault("tech_stack", []).extend(line_tech)

        contribution = _extract_named_segment(r"(?:my role|role|responsible for|contribution)\s*[:\-]?\s*(.+)", line)
        if not contribution and current.get("candidate_contribution"):
            lower_line = line.lower()
            if any(lower_line.startswith(f"{verb} ") for verb in _CONTRIBUTION_VERBS):
                contribution = line
        if contribution and len(contribution.split()) >= 3:
            current.setdefault("candidate_contribution", []).append(contribution)

        feature = _extract_named_segment(r"(?:features?|modules?|functionalities|including)\s*[:\-]?\s*(.+)", line)
        if feature:
            current.setdefault("notable_features", []).extend(_split_items(feature) or [feature])
        elif re.search(r"\b(implemented|developed|built|designed|integrated)\b", line, re.IGNORECASE):
            current.setdefault("notable_features", []).append(_trim_project_phrase(line))

        if not current.get("summary") and len(line.split()) >= 5:
            current["summary"] = _clean_sentence(line)

        if len(line.split()) >= 4:
            current.setdefault("implementation_details", []).append(_clean_sentence(line))

    flush_current()

    if not projects:
        return []

    ranked = sorted(projects, key=lambda item: int(item.get("score") or 0), reverse=True)
    return ranked[:max_projects]


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


def _sorted_jd_skills(jd_skill_scores: Mapping[str, int]) -> list[str]:
    return [skill for skill, _ in sorted((jd_skill_scores or {}).items(), key=lambda item: (-int(item[1]), item[0])) if str(skill).strip()]


def _project_to_structured_context(project: Mapping[str, object]) -> dict[str, object]:
    return {
        "project_name": str(project.get("title") or "").strip(),
        "what_it_does": str(project.get("summary") or "").strip(),
        "tech_stack": list(project.get("tech_stack", []) or []),
        "notable_features": list(project.get("notable_features", []) or []),
        "implementation_details": list(project.get("implementation_details", []) or []),
        "candidate_contribution": project.get("candidate_contribution"),
    }


def _structured_projects_payload(projects: list[dict[str, object]]) -> list[dict[str, object]]:
    return [_project_to_structured_context(project) for project in projects]


def _build_project_question_from_context(project: Mapping[str, object], focus_skill: str | None, angle_index: int) -> tuple[str, str, str]:
    context = _project_to_structured_context(project)
    project_name = str(context["project_name"] or "this project")
    summary = str(context["what_it_does"] or "").strip()
    tech_stack = list(context["tech_stack"] or [])
    features = list(context["notable_features"] or [])
    details = list(context["implementation_details"] or [])
    contribution = str(context.get("candidate_contribution") or "").strip()
    stack_phrase = ", ".join(tech_stack[:3]) if tech_stack else None
    detail = details[0] if details else summary
    feature = features[0] if features else None
    focus_area = _trim_project_phrase(feature or detail or 'the core workflow') or 'the core workflow'

    question_templates = [
        (
            f"In {project_name}, how did you design and implement {focus_area}, and what trade-offs did you make along the way?",
            "Assess architecture and implementation depth using the candidate's real project context.",
            "A strong answer explains the end-to-end implementation, why specific components or flows were chosen, and the trade-offs involved.",
        ),
        (
            f"You mentioned {project_name}" + (f" using {stack_phrase}" if stack_phrase else "") + f" — how did you split responsibilities across the system and make sure {focus_area} worked reliably?",
            "Assess understanding of component boundaries, system responsibilities, and reliability decisions.",
            "A strong answer breaks down the frontend/backend or module responsibilities and explains how the core feature was validated or stabilized.",
        ),
        (
            f"What was the trickiest technical decision in {project_name}, especially around {focus_skill or feature or 'the main implementation'}, and how did you resolve it?",
            "Assess decision-making, technical judgment, and practical problem solving in a real project.",
            "A strong answer identifies a genuine decision point, compares options, and explains why the chosen solution fit the project best.",
        ),
        (
            f"If you had to extend {project_name} further, what would you improve first in the current design or implementation, and why?",
            "Assess whether the candidate can reason about bottlenecks, maintainability, and next-step improvements.",
            "A strong answer identifies a concrete limitation and proposes a realistic improvement grounded in the actual project design.",
        ),
        (
            f"While building {project_name}, what debugging or edge-case issue came up around {focus_area if focus_area else (focus_skill or 'the core flow')}, and how did you verify the fix?",
            "Assess debugging process, edge-case handling, and quality mindset.",
            "A strong answer describes a real issue, the diagnosis process, the fix, and how the outcome was verified.",
        ),
    ]

    if contribution:
        question_templates.insert(
            1,
            (
                f"In {project_name}, your contribution included {contribution}. How did that piece fit into the overall system, and what implementation choices mattered most?",
                "Assess ownership and implementation depth based on the candidate's stated contribution.",
                "A strong answer clearly explains the candidate's exact ownership, the surrounding system context, and the important engineering choices.",
            ),
        )

    return question_templates[angle_index % len(question_templates)]


def _select_relevant_projects(projects: list[dict[str, object]], jd_skill_scores: Mapping[str, int], count: int) -> list[dict[str, object]]:
    ranked = sorted(projects, key=lambda item: _project_score(item, jd_skill_scores or {}), reverse=True)
    return ranked[: max(1, min(len(ranked), count))]


def _build_skill_question(skill: str, project: Mapping[str, object] | None, variant_index: int) -> tuple[str, str, str]:
    blueprint = _SKILL_QUESTION_BLUEPRINTS[variant_index % len(_SKILL_QUESTION_BLUEPRINTS)]
    project_name = str((project or {}).get("title") or "").strip()
    details = list((project or {}).get("implementation_details", []) or [])
    features = list((project or {}).get("notable_features", []) or [])
    detail = _trim_project_phrase(details[0] if details else (features[0] if features else None)) if (details or features) else None

    if project_name:
        prompts = [
            f"In {project_name}, where did {skill} matter most in the implementation, and what did it help you solve in practice?",
            f"Think about your work on {project_name}: what problem did you hit while using {skill}, and how did you debug or improve that part of the system?",
            f"In {project_name}, how did {skill} influence your design choices" + (f" around {detail}" if detail else "") + "?",
        ]
    else:
        prompts = [
            f"You have {skill} in your resume — can you describe a real feature or implementation where you used it and what design decision depended on it?",
            f"Tell me about a practical issue you handled using {skill}. What was happening, and how did you solve it?",
            f"Where have you applied {skill} in a real build, and how did it affect the performance, maintainability, or correctness of the solution?",
        ]

    return prompts[variant_index % len(prompts)], blueprint["intent"], blueprint["reference_answer"]


def _build_practical_questions(projects: list[dict[str, object]], jd_skill_scores: Mapping[str, int], count: int) -> list[dict[str, object]]:
    if count <= 0:
        return []

    selected_projects = _select_relevant_projects(projects, jd_skill_scores, count)
    if not selected_projects:
        return []

    jd_skills = _sorted_jd_skills(jd_skill_scores)
    resume_skills = _dedupe_keep_order(
        [skill for project in selected_projects for skill in project.get("tech_stack", [])],
        limit=12,
    )

    matched_skills: list[str] = []
    for skill in jd_skills:
        skill_key = _normalize(skill)
        if any(skill_key == _normalize(resume_skill) for resume_skill in resume_skills):
            matched_skills.append(skill)

    practical_skill_targets = matched_skills or [skill for skill in resume_skills if skill][: max(1, min(4, len(resume_skills)))]
    project_question_target = max(1, count - min(len(practical_skill_targets), max(1, count // 2)))
    skill_question_target = max(0, count - project_question_target)

    questions: list[dict[str, object]] = []
    used_texts: set[str] = set()

    for index in range(project_question_target):
        project = selected_projects[index % len(selected_projects)]
        project_skills = list(project.get("tech_stack", []) or [])
        focus_skill = next((skill for skill in jd_skills if any(_normalize(skill) == _normalize(project_skill) for project_skill in project_skills)), None)
        if not focus_skill and project_skills:
            focus_skill = project_skills[0]
        text, intent, reference_answer = _build_project_question_from_context(project, focus_skill, index)
        if text in used_texts:
            continue
        used_texts.add(text)
        questions.append({
            "text": text if text.endswith("?") else f"{text}?",
            "type": "project",
            "topic": f"project:{_normalize(focus_skill or project.get('title') or 'implementation')}",
            "intent": intent,
            "focus_skill": focus_skill,
            "project_name": project.get("title"),
            "reference_answer": reference_answer,
            "difficulty": str(INTERVIEW_CONFIG["difficulty"]),
        })

    for index in range(skill_question_target):
        skill = practical_skill_targets[index % len(practical_skill_targets)]
        attached_project = next(
            (project for project in selected_projects if any(_normalize(skill) == _normalize(project_skill) for project_skill in project.get("tech_stack", []))),
            selected_projects[index % len(selected_projects)],
        )
        text, intent, reference_answer = _build_skill_question(skill, attached_project, index)
        if text in used_texts:
            continue
        used_texts.add(text)
        questions.append({
            "text": text if text.endswith("?") else f"{text}?",
            "type": "project",
            "topic": f"skill:{_normalize(skill)}",
            "intent": intent,
            "focus_skill": skill,
            "project_name": attached_project.get("title") if attached_project else None,
            "reference_answer": reference_answer,
            "difficulty": str(INTERVIEW_CONFIG["difficulty"]),
        })

    fill_index = 0
    while len(questions) < count and selected_projects:
        project = selected_projects[fill_index % len(selected_projects)]
        fallback_skill = (project.get("tech_stack") or [None])[0]
        text, intent, reference_answer = _build_project_question_from_context(project, fallback_skill, fill_index + len(questions))
        if text not in used_texts:
            used_texts.add(text)
            questions.append({
                "text": text if text.endswith("?") else f"{text}?",
                "type": "project",
                "topic": f"project:{_normalize(fallback_skill or project.get('title') or 'implementation')}",
                "intent": intent,
                "focus_skill": fallback_skill,
                "project_name": project.get("title"),
                "reference_answer": reference_answer,
                "difficulty": str(INTERVIEW_CONFIG["difficulty"]),
            })
        fill_index += 1

    return questions[:count]


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
    jd_skills = [
        {"skill": str(skill), "weight": int(weight)}
        for skill, weight in sorted((jd_skill_scores or {}).items(), key=lambda x: -x[1])[:12]
        if str(skill).strip()
    ]
    structured_projects = _structured_projects_payload(projects[:4])
    resume_snippet = re.sub(r"\s+", " ", (resume_text or "").strip())[:2200]
    response_schema = [
        {
            "text": "string",
            "type": "intro|project|hr",
            "topic": "string",
            "intent": "string",
            "focus_skill": "string|null",
            "project_name": "string|null",
            "reference_answer": "string",
            "difficulty": "easy|medium|hard",
        }
    ]
    return f"""You are an expert technical interviewer.
Generate deeply specific interview questions for the role: {jd_title or 'Software Developer'}.
Return ONLY a valid JSON array of exactly {sum(counts.values())} objects.

Question distribution:
- {counts['intro']} self-introduction / warm-up question
- {counts['project']} deep technical questions based on the candidate's ACTUAL projects and matched JD skills
- {counts['hr']} HR / behavioral questions

Candidate resume snippet:
{resume_snippet}

JD skills (weighted):
{json.dumps(jd_skills, ensure_ascii=False, indent=2)}

Structured extracted projects:
{json.dumps(structured_projects, ensure_ascii=False, indent=2)}

Hard requirements:
- Keep self-intro and HR questions natural; do not rewrite them into robotic wording.
- Every project question must mention the exact extracted project_name.
- Never use placeholder phrases like 'main project', 'one of your projects', 'your project', or 'tell me about your main project'.
- Skill questions must be practical and tied to actual project usage, implementation decisions, debugging, architecture, database design, backend logic, validations, performance, concurrency, edge cases, integrations, or deployment choices.
- Do NOT ask textbook questions like 'What is Java?', 'Explain SQL joins', or 'What is Spring Boot?'
- Prefer the strongest and most JD-relevant projects first.
- Questions should become progressively deeper: project understanding -> implementation -> trade-offs/challenges.
- Avoid repeated angles across questions.
- If project details are limited, still anchor the question to the real project name and known stack.
- Use stack names naturally when present.

Quality bar examples:
- Good: 'In Movie Ticket Booking System, how did you implement seat selection and prevent users from booking invalid or expired shows?'
- Good: 'You used Spring Boot and AngularJS in Movie Ticket Booking System — how did you split responsibilities between frontend and backend?'
- Bad: 'Tell me about your main project.'
- Bad: 'What is Java?'

Each JSON object must match this shape:
{json.dumps(response_schema, ensure_ascii=False, indent=2)}
"""


def _call_llm_for_questions(*, resume_text: str, jd_title: str | None, jd_skill_scores: Mapping[str, int], projects: list[dict[str, object]], counts: Mapping[str, int]) -> list[dict[str, object]] | None:
    try:
        import os
        from groq import Groq
        api_key = os.getenv("GROQ_API_KEY") or os.getenv("LLM_API_KEY") or os.getenv("API_KEY") or ""
        if not api_key:
            logger.info("No LLM API key found for interview question generation.")
            return None
        system_prompt = (
            "You are a senior technical interviewer. "
            "Write sharp, resume-grounded interview questions. "
            "Prefer concrete implementation depth over generic theory."
        )
        response = Groq(api_key=api_key).chat.completions.create(
            model=os.getenv("GROQ_LLM_MODEL", "llama-3.1-8b-instant"),
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": _build_llm_prompt(resume_text=resume_text, jd_title=jd_title, jd_skill_scores=jd_skill_scores, projects=projects, counts=counts)},
            ],
            temperature=0.35,
            max_tokens=3200,
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
        project_names = {str(project.get("title") or "").strip().lower() for project in projects if str(project.get("title") or "").strip()}
        for item in data:
            if not isinstance(item, dict):
                continue
            text = str(item.get("text") or "").strip()
            q_type = str(item.get("type") or "project")
            project_name = str(item.get("project_name") or "").strip() or None
            if not text:
                continue
            lowered_text = text.lower()
            if any(phrase in lowered_text for phrase in ["main project", "one of your projects", "your project", "tell me about your main project"]):
                continue
            if q_type == "project":
                resolved_project_name = (project_name or "").strip().lower()
                mentions_real_project = any(name and name in lowered_text for name in project_names)
                if not mentions_real_project and resolved_project_name not in project_names:
                    continue
            result.append({
                "text": text if text.endswith("?") else f"{text}?",
                "type": q_type,
                "topic": str(item.get("topic") or "general"),
                "intent": str(item.get("intent") or "Assess candidate understanding and communication."),
                "focus_skill": item.get("focus_skill"),
                "project_name": project_name,
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
        practical_questions = _build_practical_questions(projects, jd_skill_scores or {}, counts["project"])
        if len(practical_questions) < counts["project"] and projects:
            practical_questions.extend(_build_practical_questions(projects, {}, counts["project"] - len(practical_questions)))
        questions = [dict(INTRO_QUESTION) for _ in range(counts["intro"])] + practical_questions[:counts["project"]] + _build_hr_questions(counts["hr"])
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
