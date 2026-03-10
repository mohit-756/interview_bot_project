"""Interview question generation with project extraction and weighted distribution."""

from __future__ import annotations

import re
from collections.abc import Mapping

PROJECT_HINTS = ("project", "application", "platform", "system", "portal", "dashboard", "service")
GENERAL_THEORY_SKILLS = ("python", "sql", "api", "testing", "deployment", "system design")
PROJECT_QUESTION_PATTERNS = (
    "In {project}, what business goal were you solving, how did you design the architecture, and why did you choose {skill}?",
    "In {project}, what was your exact role, which {skill} trade-offs did you make, and what would you change now?",
    "In {project}, describe one edge case tied to {skill}, how you debugged it, and what safeguard you added.",
    "In {project}, how did you validate quality for {skill} with tests, metrics, and production checks?",
    "In {project}, explain your deployment path, rollback strategy, and monitoring signals related to {skill}.",
)
THEORY_QUESTION_PATTERNS = (
    "Give a crisp definition of {skill} and one practical failure mode you have handled.",
    "What are two best practices for {skill} in production systems?",
    "How would you evaluate a junior engineer's implementation of {skill} in code review?",
    "Which performance bottlenecks are common in {skill}, and how do you detect them early?",
)


def _normalize_skill(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9+.# ]", " ", value or "")
    return re.sub(r"\s+", " ", cleaned).strip().lower()


def _clean_line(value: str) -> str:
    line = re.sub(r"^[\-\*\u2022\d\.\)\(]+\s*", "", (value or "").strip())
    return re.sub(r"\s+", " ", line).strip()


def _is_heading(line: str) -> bool:
    value = (line or "").strip()
    if not value:
        return False
    if len(value) > 45:
        return False
    lowered = value.lower()
    if lowered in {"projects", "project", "experience", "education", "skills", "certifications", "summary"}:
        return True
    return bool(re.fullmatch(r"[A-Z][A-Z\s/&-]+", value))


def _split_tech_values(raw: str) -> list[str]:
    values: list[str] = []
    for chunk in re.split(r"[,/|;]", raw or ""):
        skill = _normalize_skill(chunk)
        if skill and skill not in values:
            values.append(skill)
    return values


def _extract_inline_tech_stack(line: str, known_skills: set[str]) -> list[str]:
    lower = (line or "").lower()
    match = re.search(r"(tech stack|technologies|tools|built with|using)\s*[:\-]\s*(.+)$", lower)
    if match:
        values = _split_tech_values(match.group(2))
        if values:
            return values[:6]

    detected = [skill for skill in known_skills if skill and re.search(rf"\b{re.escape(skill)}\b", lower)]
    return detected[:6]


def extract_projects_from_resume(
    resume_text: str,
    *,
    known_skills: Mapping[str, int] | None = None,
    max_projects: int = 8,
) -> list[dict[str, object]]:
    text = resume_text or ""
    known_skill_set = {_normalize_skill(skill) for skill in (known_skills or {}).keys() if _normalize_skill(skill)}

    lines = [_clean_line(line) for line in text.splitlines()]
    lines = [line for line in lines if line]

    candidates: list[str] = []
    in_projects = False
    for line in lines:
        lowered = line.lower()
        if re.match(r"^projects?\b", lowered):
            in_projects = True
            continue
        if in_projects and _is_heading(line) and "project" not in lowered:
            in_projects = False
        if in_projects or any(hint in lowered for hint in PROJECT_HINTS):
            candidates.append(line)

    projects: list[dict[str, object]] = []
    seen: set[str] = set()
    for line in candidates:
        title_parts = re.split(r"\s+\-\s+|:\s+", line, maxsplit=1)
        title = _clean_line(title_parts[0])[:90]
        summary = _clean_line(title_parts[1])[:260] if len(title_parts) > 1 else line[:260]
        if len(title) < 3:
            continue
        key = title.lower()
        if key in seen:
            continue
        seen.add(key)
        tech_stack = _extract_inline_tech_stack(line, known_skill_set)
        projects.append({"title": title, "tech_stack": tech_stack, "summary": summary})
        if len(projects) >= max_projects:
            break

    if projects:
        return projects

    fallback_title = "Primary Project"
    snippet = re.sub(r"\s+", " ", text).strip()[:220]
    return [{"title": fallback_title, "tech_stack": list(known_skill_set)[:4], "summary": snippet}]


def _weighted_counts(weights: Mapping[str, float], total: int) -> dict[str, int]:
    if total <= 0:
        return {}

    normalized = {skill: max(0.0, float(value)) for skill, value in weights.items() if _normalize_skill(skill)}
    if not normalized:
        return {}
    total_weight = sum(normalized.values())
    if total_weight <= 0:
        base_count = max(1, total // len(normalized))
        allocation = {skill: base_count for skill in normalized.keys()}
        remainder = total - sum(allocation.values())
        ordered = sorted(normalized.keys(), key=lambda skill: skill)
        idx = 0
        while remainder > 0 and ordered:
            allocation[ordered[idx % len(ordered)]] += 1
            remainder -= 1
            idx += 1
        return allocation

    raw = {skill: (weight / total_weight) * total for skill, weight in normalized.items()}
    allocation = {skill: int(value) for skill, value in raw.items()}
    remainder = total - sum(allocation.values())
    if remainder > 0:
        ranked = sorted(
            normalized.keys(),
            key=lambda skill: (raw[skill] - int(raw[skill]), normalized[skill], skill),
            reverse=True,
        )
        idx = 0
        while remainder > 0 and ranked:
            allocation[ranked[idx % len(ranked)]] += 1
            remainder -= 1
            idx += 1
    return {skill: count for skill, count in allocation.items() if count > 0}


def _expand_weighted_skills(weighted_counts: Mapping[str, int]) -> list[str]:
    expanded: list[str] = []
    for skill, count in sorted(weighted_counts.items(), key=lambda item: (-int(item[1]), item[0])):
        expanded.extend([skill] * int(max(0, count)))
    return expanded


def build_question_bundle(
    *,
    resume_text: str,
    jd_title: str | None,
    jd_skill_scores: Mapping[str, int] | None,
    question_count: int = 8,
    project_ratio: float = 0.80,
) -> dict[str, object]:
    total_questions = max(1, min(50, int(question_count or 8)))
    ratio = max(0.0, min(1.0, float(project_ratio or 0.8)))
    project_questions_count = int(round(total_questions * ratio))
    project_questions_count = max(0, min(total_questions, project_questions_count))
    theory_questions_count = total_questions - project_questions_count

    normalized_weights: dict[str, float] = {}
    for raw_skill, raw_weight in (jd_skill_scores or {}).items():
        skill = _normalize_skill(str(raw_skill))
        if not skill:
            continue
        try:
            normalized_weights[skill] = max(0.0, float(raw_weight))
        except Exception:
            normalized_weights[skill] = 0.0

    projects = extract_projects_from_resume(resume_text, known_skills=normalized_weights)
    project_weighted_counts = _weighted_counts(normalized_weights, project_questions_count)
    project_skills = _expand_weighted_skills(project_weighted_counts)
    if project_questions_count > 0 and not project_skills:
        project_skills = ["architecture"] * project_questions_count

    questions: list[dict[str, str]] = []
    used_text: set[str] = set()

    for index in range(project_questions_count):
        project = projects[index % len(projects)]
        skill = project_skills[index % len(project_skills)] if project_skills else "architecture"
        template = PROJECT_QUESTION_PATTERNS[index % len(PROJECT_QUESTION_PATTERNS)]
        text = template.format(project=project["title"], skill=skill)
        dedupe = text.lower()
        if dedupe in used_text:
            continue
        used_text.add(dedupe)
        questions.append(
            {
                "text": text,
                "difficulty": "hard" if index % 3 == 2 else "medium",
                "topic": f"project:{skill}",
                "type": "project",
            }
        )

    if theory_questions_count > 0:
        intro_question = (
            f"Give a 60-second self-introduction for the {jd_title or 'role'}, focused on your strongest project impact."
        )
        if intro_question.lower() not in used_text:
            used_text.add(intro_question.lower())
            questions.append(
                {"text": intro_question, "difficulty": "easy", "topic": "theory:self_intro", "type": "theory"}
            )

    remaining_theory = max(0, theory_questions_count - 1)
    theory_weighted_counts = _weighted_counts(normalized_weights, remaining_theory)
    if remaining_theory > 0 and not theory_weighted_counts:
        fallback_allocation = _weighted_counts({skill: 1.0 for skill in GENERAL_THEORY_SKILLS}, remaining_theory)
        theory_weighted_counts = fallback_allocation

    theory_skills = _expand_weighted_skills(theory_weighted_counts)
    for index, skill in enumerate(theory_skills):
        template = THEORY_QUESTION_PATTERNS[index % len(THEORY_QUESTION_PATTERNS)]
        text = template.format(skill=skill)
        dedupe = text.lower()
        if dedupe in used_text:
            continue
        used_text.add(dedupe)
        questions.append({"text": text, "difficulty": "medium", "topic": f"theory:{skill}", "type": "theory"})

    if len(questions) < total_questions:
        fill_skills = theory_skills or list(normalized_weights.keys()) or list(GENERAL_THEORY_SKILLS)
        idx = 0
        while len(questions) < total_questions and fill_skills:
            skill = fill_skills[idx % len(fill_skills)]
            text = f"Describe one real-world use case where {skill} is preferable over alternatives."
            if text.lower() not in used_text:
                used_text.add(text.lower())
                questions.append({"text": text, "difficulty": "medium", "topic": f"theory:{skill}", "type": "theory"})
            idx += 1

    return {
        "questions": questions[:total_questions],
        "total_questions": total_questions,
        "project_questions_count": project_questions_count,
        "theory_questions_count": theory_questions_count,
        "projects": projects,
        "theory_weight_distribution": theory_weighted_counts,
        "project_weight_distribution": project_weighted_counts,
    }


def build_interview_question_bank(
    *,
    resume_text: str,
    jd_title: str | None,
    jd_skill_scores: Mapping[str, int] | None,
    question_count: int = 8,
    project_ratio: float = 0.80,
) -> list[dict[str, str]]:
    bundle = build_question_bundle(
        resume_text=resume_text,
        jd_title=jd_title,
        jd_skill_scores=jd_skill_scores,
        question_count=question_count,
        project_ratio=project_ratio,
    )
    return list(bundle["questions"])
