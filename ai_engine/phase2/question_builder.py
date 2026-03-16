"""Interview question generation — clean 3-section structure.

Section layout (for any question_count):
  1  Self-intro       — always Q1, warm-up
  N  Project questions — 80 % of remaining (rounds down)
  M  HR / behavioural — 20 % of remaining (the rest)

All questions are written as natural, conversational prompts a real
interviewer would actually ask — no robotic template wording.
"""

from __future__ import annotations

import re
from collections.abc import Mapping

# ── Project hints for resume extraction ──────────────────────────────────────
PROJECT_HINTS = (
    "project", "application", "platform", "system", "portal",
    "dashboard", "service", "app", "tool", "module", "engine",
)

# ── Self-intro question (always Q1) ──────────────────────────────────────────
SELF_INTRO_QUESTION = (
    "Please start with a brief introduction — your name, your background, "
    "and the one project or achievement you're most proud of."
)

# ── Project deep-dive questions ───────────────────────────────────────────────
# {project} = project title, {skill} = a relevant skill from the JD
PROJECT_QUESTIONS = [
    "Walk me through {project} from start to finish — what problem were you solving, "
    "how did you design it, and what role did {skill} play in that?",

    "In {project}, what was the hardest technical challenge you faced and how did you solve it? "
    "Be specific about the {skill} decisions you made.",

    "Tell me about a real bug or failure in {project} that took you a while to debug. "
    "How did you find the root cause and what did you change?",

    "How did you test and validate the quality of {project}? "
    "What would you do differently now knowing what you know about {skill}?",

    "If you had to scale {project} to 10× the current load, "
    "what would break first and how would you fix it?",

    "What trade-offs did you make in {project} — speed vs quality, "
    "simple vs flexible — and looking back, were they the right calls?",

    "Describe the deployment and release process for {project}. "
    "How did you handle rollbacks or hotfixes?",

    "How did {project} use {skill} specifically — "
    "and what alternatives did you consider before choosing that approach?",
]

# ── HR / Behavioural questions ────────────────────────────────────────────────
HR_QUESTIONS = [
    "Tell me about a time you disagreed with a technical decision your team made. "
    "How did you handle it and what was the outcome?",

    "Describe a situation where you had to learn something completely new under a tight deadline. "
    "How did you approach it?",

    "Give me an example of a time you received critical feedback on your work. "
    "How did you respond and what did you change?",

    "Tell me about a project where things did not go as planned. "
    "What went wrong and what did you learn from it?",

    "Describe a time you had to work with someone whose style was very different from yours. "
    "How did you make it work?",

    "What does your ideal work environment look like, "
    "and how do you handle situations when things are unclear or ambiguous?",

    "Tell me about a time you went beyond your assigned scope to help a teammate or improve something. "
    "What drove you to do that?",

    "Where do you see yourself in two to three years, "
    "and how does this role fit into that picture?",
]


# ── helpers ───────────────────────────────────────────────────────────────────

def _normalize(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9+.# ]", " ", value or "")
    return re.sub(r"\s+", " ", cleaned).strip().lower()


def _clean_line(value: str) -> str:
    line = re.sub(r"^[\-\*\u2022\d\.\)\(]+\s*", "", (value or "").strip())
    return re.sub(r"\s+", " ", line).strip()


def _is_heading(line: str) -> bool:
    value = (line or "").strip()
    if not value or len(value) > 45:
        return False
    lowered = value.lower()
    if lowered in {"projects", "project", "experience", "education", "skills",
                   "certifications", "summary", "achievements"}:
        return True
    return bool(re.fullmatch(r"[A-Z][A-Z\s/&-]+", value))


def _split_tech(raw: str) -> list[str]:
    values: list[str] = []
    for chunk in re.split(r"[,/|;]", raw or ""):
        skill = _normalize(chunk)
        if skill and skill not in values:
            values.append(skill)
    return values


def _extract_inline_tech(line: str, known_skills: set[str]) -> list[str]:
    lower = (line or "").lower()
    match = re.search(
        r"(tech stack|technologies|tools|built with|using)\s*[:\-]\s*(.+)$", lower
    )
    if match:
        values = _split_tech(match.group(2))
        if values:
            return values[:6]
    return [s for s in known_skills if s and re.search(rf"\b{re.escape(s)}\b", lower)][:6]


def extract_projects_from_resume(
    resume_text: str,
    *,
    known_skills: Mapping[str, int] | None = None,
    max_projects: int = 8,
) -> list[dict[str, object]]:
    text = resume_text or ""
    known_skill_set = {
        _normalize(s) for s in (known_skills or {}).keys() if _normalize(s)
    }
    lines = [_clean_line(l) for l in text.splitlines() if _clean_line(l)]

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
    # Skip lines that look like section headers or are too generic
    skip_words = {"experience", "education", "skills", "summary", "certifications",
                  "achievements", "references", "objective", "profile"}
    for line in candidates:
        title_parts = re.split(r"\s+\-\s+|:\s+", line, maxsplit=1)
        title = _clean_line(title_parts[0])[:90]
        summary = _clean_line(title_parts[1])[:260] if len(title_parts) > 1 else line[:260]
        if len(title) < 4:
            continue
        # Skip generic section-header words
        if title.lower().strip() in skip_words:
            continue
        # Skip lines that are just a list of skills/years (no space = single word)
        word_count = len(title.split())
        if word_count == 1 and title.lower() in skip_words:
            continue
        key = title.lower()
        if key in seen:
            continue
        seen.add(key)
        tech_stack = _extract_inline_tech(line, known_skill_set)
        projects.append({"title": title, "tech_stack": tech_stack, "summary": summary})
        if len(projects) >= max_projects:
            break

    if projects:
        return projects

    # Fallback: treat the whole resume as one project
    snippet = re.sub(r"\s+", " ", text).strip()[:220]
    return [{"title": "Primary Project", "tech_stack": list(known_skill_set)[:4], "summary": snippet}]


def _weighted_counts(weights: Mapping[str, float], total: int) -> dict[str, int]:
    if total <= 0:
        return {}
    normalized = {s: max(0.0, float(w)) for s, w in weights.items() if _normalize(s)}
    if not normalized:
        return {}
    total_weight = sum(normalized.values())
    if total_weight <= 0:
        base = max(1, total // len(normalized))
        allocation = {s: base for s in normalized}
        remainder = total - sum(allocation.values())
        for s in sorted(normalized)[:remainder]:
            allocation[s] += 1
        return allocation

    raw = {s: (w / total_weight) * total for s, w in normalized.items()}
    allocation = {s: int(v) for s, v in raw.items()}
    remainder = total - sum(allocation.values())
    ranked = sorted(normalized, key=lambda s: (raw[s] - int(raw[s]), normalized[s], s), reverse=True)
    for i in range(remainder):
        allocation[ranked[i % len(ranked)]] += 1
    return {s: c for s, c in allocation.items() if c > 0}


def _expand_skills(weighted_counts: Mapping[str, int]) -> list[str]:
    expanded: list[str] = []
    for skill, count in sorted(weighted_counts.items(), key=lambda x: (-x[1], x[0])):
        expanded.extend([skill] * max(0, int(count)))
    return expanded


# ── main public API ───────────────────────────────────────────────────────────

def build_question_bundle(
    *,
    resume_text: str,
    jd_title: str | None,
    jd_skill_scores: Mapping[str, int] | None,
    question_count: int = 8,
    project_ratio: float = 0.80,
) -> dict[str, object]:
    """
    Build a structured interview question set:
      Q1              — self-intro
      next ~80 %      — project deep-dives (skill-weighted)
      final ~20 %     — HR / behavioural

    Returns a bundle dict compatible with the existing runtime.
    """
    total = max(4, min(50, int(question_count or 8)))

    # Always reserve Q1 for self-intro
    remaining = total - 1
    ratio = max(0.0, min(1.0, float(project_ratio or 0.8)))
    # Ensure at least 2 HR questions for any interview with 6+ questions
    min_hr = 2 if remaining >= 5 else 1
    project_count = max(1, round(remaining * ratio))
    hr_count = max(min_hr, remaining - project_count)
    # Adjust project count down if HR pushed us over
    project_count = remaining - hr_count

    # Re-balance if rounding pushed us over
    while project_count + hr_count + 1 > total:
        hr_count = max(1, hr_count - 1)

    # Extract projects from resume
    projects = extract_projects_from_resume(resume_text, known_skills=jd_skill_scores)

    # Distribute skills across project slots
    skill_weights = {
        _normalize(s): max(0.0, float(w))
        for s, w in (jd_skill_scores or {}).items()
        if _normalize(s)
    }
    weighted = _weighted_counts(skill_weights, project_count)
    skill_pool = _expand_skills(weighted) or ["your core stack"] * project_count

    questions: list[dict[str, str]] = []
    used: set[str] = set()

    # ── Section 1: Self-intro ─────────────────────────────────────────────────
    questions.append({
        "text":       SELF_INTRO_QUESTION,
        "difficulty": "easy",
        "topic":      "intro:self_introduction",
        "type":       "intro",
    })
    used.add(SELF_INTRO_QUESTION.lower())

    # ── Section 2: Project deep-dives ────────────────────────────────────────
    for i in range(project_count):
        project = projects[i % len(projects)]
        skill   = skill_pool[i % len(skill_pool)]
        template = PROJECT_QUESTIONS[i % len(PROJECT_QUESTIONS)]
        text = template.format(project=project["title"], skill=skill)
        if text.lower() in used:
            # Try next template
            for t in PROJECT_QUESTIONS:
                candidate = t.format(project=project["title"], skill=skill)
                if candidate.lower() not in used:
                    text = candidate
                    break
        used.add(text.lower())
        questions.append({
            "text":       text,
            "difficulty": "hard" if i % 3 == 2 else "medium",
            "topic":      f"project:{skill}",
            "type":       "project",
        })

    # ── Section 3: HR / Behavioural ──────────────────────────────────────────
    hr_pool = list(HR_QUESTIONS)
    for i in range(hr_count):
        text = hr_pool[i % len(hr_pool)]
        if text.lower() in used:
            for q in hr_pool:
                if q.lower() not in used:
                    text = q
                    break
        used.add(text.lower())
        questions.append({
            "text":       text,
            "difficulty": "medium",
            "topic":      "hr:behavioural",
            "type":       "hr",
        })

    return {
        "questions":               questions[:total],
        "total_questions":         total,
        "project_questions_count": project_count,
        "theory_questions_count":  hr_count,
        "projects":                projects,
        "theory_weight_distribution":  {},
        "project_weight_distribution": weighted,
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
