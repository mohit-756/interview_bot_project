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
    "max_total_questions": 20,
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
    "machine learning", "deep learning", "artificial intelligence", "ai", "ml", "nlp", "computer vision",
    "llm", "rag", "genai", "generative ai", "cnn", "rnn", "lstm", "bert", "transformer",
    "sagemaker", "ec2", "lambda", "s3", "rds", "dynamodb", "api gateway", "cloudwatch", "iam", "terraform",
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

_TECH_CATEGORY_RULES = {
    "ml_ai": {
        "keywords": {
            "ai", "ml", "machine learning", "deep learning", "tensorflow", "pytorch", "scikit-learn",
            "llm", "rag", "nlp", "computer vision", "bert", "transformer", "cnn", "rnn", "lstm",
            "genai", "generative ai",
        },
        "facets": [
            "model choice and representation trade-offs",
            "training data quality, leakage, and bias control",
            "feature engineering or context construction",
            "evaluation metrics and production failure modes",
            "drift monitoring, retraining strategy, and guardrails",
        ],
    },
    "cloud": {
        "keywords": {
            "aws", "azure", "gcp", "s3", "ec2", "lambda", "cloudwatch", "rds", "dynamodb", "iam",
            "terraform", "api gateway", "sagemaker",
        },
        "facets": [
            "service decomposition and why those cloud services fit the workload",
            "security boundaries, IAM, and data protection decisions",
            "scaling, latency, and reliability trade-offs",
            "observability, alerting, and incident diagnosis",
            "cost control and architecture efficiency decisions",
        ],
    },
    "backend": {
        "keywords": {
            "python", "java", "fastapi", "flask", "django", "spring", "spring boot", "node", "node.js",
            "express", "microservices", "rest", "rest api", "jwt",
        },
        "facets": [
            "API design and contract decisions",
            "state management, validation, and error handling",
            "concurrency, idempotency, and consistency",
            "performance bottlenecks and reliability safeguards",
            "authorization, security, and edge-case handling",
        ],
    },
    "data": {
        "keywords": {
            "sql", "postgresql", "mysql", "mongodb", "sqlite", "oracle", "redis", "pandas", "numpy",
            "postgres", "database",
        },
        "facets": [
            "schema design and data modeling trade-offs",
            "query performance, indexing, and access patterns",
            "consistency, freshness, and data correctness",
            "batch versus realtime data flow choices",
            "data quality checks, backfills, and recovery strategy",
        ],
    },
    "frontend": {
        "keywords": {
            "react", "angular", "angularjs", "vue", "javascript", "typescript", "html", "css", "tailwind",
            "bootstrap",
        },
        "facets": [
            "state management and component boundary decisions",
            "user flow, rendering, and responsiveness trade-offs",
            "error recovery and degraded UX handling",
            "integration boundaries between frontend and backend",
            "performance, caching, and maintainability choices",
        ],
    },
    "devops": {
        "keywords": {
            "docker", "kubernetes", "linux", "git", "github",
        },
        "facets": [
            "deployment design and environment isolation",
            "release reliability and rollback strategy",
            "runtime debugging and operational visibility",
            "resource efficiency and scaling controls",
            "configuration safety and automation trade-offs",
        ],
    },
}


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


def _question_signature(text: str) -> str:
    normalized = _normalize(text)
    normalized = re.sub(r"\b(how|what|why|when|where|tell me about|can you|please|did you)\b", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def _append_unique_question(
    questions: list[dict[str, object]],
    seen_signatures: set[str],
    payload: Mapping[str, object],
) -> bool:
    text = str(payload.get("text") or "").strip()
    if not text:
        return False
    signature = _question_signature(text)
    if not signature or signature in seen_signatures:
        return False
    seen_signatures.add(signature)
    questions.append(dict(payload))
    return True


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


def _section_counts(total_questions: int, *, project_ratio: float | None = None, project_coverage_target: int = 0) -> dict[str, int]:
    total = max(4, int(total_questions or INTERVIEW_CONFIG["total_questions"]))
    intro_count = int(INTERVIEW_CONFIG["intro_question_count"])
    remaining = max(1, total - intro_count)
    p_ratio = float(project_ratio if project_ratio is not None else INTERVIEW_CONFIG["project_question_ratio"])
    p_ratio = max(0.0, min(1.0, p_ratio))
    project_count = max(1, int(round(remaining * p_ratio)))
    hr_count = max(1, remaining - project_count)
    if project_coverage_target > 0 and remaining >= 2:
        project_count = max(project_count, min(project_coverage_target, remaining - 1))
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


def _desired_total_questions(requested_total: int, project_count: int) -> int:
    minimum_for_full_project_coverage = int(INTERVIEW_CONFIG["intro_question_count"]) + max(1, project_count) + 1
    desired = max(4, int(requested_total or INTERVIEW_CONFIG["total_questions"]), minimum_for_full_project_coverage)
    return min(int(INTERVIEW_CONFIG["max_total_questions"]), desired)


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


def _infer_project_categories(project: Mapping[str, object]) -> list[str]:
    tech_stack = [_normalize(str(value)) for value in project.get("tech_stack", []) if value]
    combined = " ".join([
        str(project.get("title") or ""),
        str(project.get("summary") or ""),
        " ".join(str(value) for value in project.get("implementation_details", []) if value),
        " ".join(str(value) for value in project.get("notable_features", []) if value),
    ])
    normalized_text = _normalize(combined)

    categories: list[str] = []
    for category, config in _TECH_CATEGORY_RULES.items():
        keywords = {_normalize(str(keyword)) for keyword in config["keywords"]}
        if any(skill in keywords for skill in tech_stack):
            categories.append(category)
            continue
        if any(keyword and keyword in normalized_text for keyword in keywords):
            categories.append(category)
    return categories or ["backend"]


def _project_anchor_phrase(project: Mapping[str, object]) -> str:
    details = list(project.get("implementation_details", []) or [])
    features = list(project.get("notable_features", []) or [])
    summary = str(project.get("summary") or "").strip()
    anchor = _trim_project_phrase(features[0] if features else (details[0] if details else summary))
    return anchor or "the core workflow"


def _project_focus_skills(project: Mapping[str, object], jd_skill_scores: Mapping[str, int], limit: int = 3) -> list[str]:
    project_skills = [str(value) for value in project.get("tech_stack", []) if str(value).strip()]
    jd_sorted = _sorted_jd_skills(jd_skill_scores)

    matched = [
        skill for skill in jd_sorted
        if any(_normalize(skill) == _normalize(project_skill) for project_skill in project_skills)
    ]
    if matched:
        return matched[:limit]
    return _dedupe_keep_order(project_skills, limit=limit)


def _project_concept_targets(project: Mapping[str, object], jd_skill_scores: Mapping[str, int]) -> list[dict[str, str | None]]:
    focus_skills = _project_focus_skills(project, jd_skill_scores, limit=3)
    categories = _infer_project_categories(project)
    anchor = _project_anchor_phrase(project)
    targets: list[dict[str, str | None]] = []

    if focus_skills:
        for index, skill in enumerate(focus_skills):
            category = categories[index % len(categories)]
            facets = list(_TECH_CATEGORY_RULES[category]["facets"])
            targets.append({
                "skill": skill,
                "category": category,
                "facet": facets[index % len(facets)],
                "anchor": anchor,
            })
        return targets

    for category in categories:
        facets = list(_TECH_CATEGORY_RULES[category]["facets"])
        targets.append({
            "skill": None,
            "category": category,
            "facet": facets[0],
            "anchor": anchor,
        })
    return targets


def _build_project_question_from_context(project: Mapping[str, object], focus_skill: str | None, angle_index: int) -> tuple[str, str, str]:
    context = _project_to_structured_context(project)
    project_name = str(context["project_name"] or "this project")
    contribution = str(context.get("candidate_contribution") or "").strip()
    targets = _project_concept_targets(project, {str(focus_skill): 1} if focus_skill else {})
    selected_target = targets[angle_index % len(targets)] if targets else {
        "skill": focus_skill,
        "category": "backend",
        "facet": "architecture and implementation trade-offs",
        "anchor": _project_anchor_phrase(project),
    }
    skill = str(selected_target.get("skill") or focus_skill or "the stack")
    category = str(selected_target.get("category") or "backend")
    facet = str(selected_target.get("facet") or "architecture and implementation trade-offs")
    anchor = str(selected_target.get("anchor") or _project_anchor_phrase(project))

    prompts = [
        (
            f"In {project_name}, how did {skill} shape the design of {anchor}, and what trade-offs did you make around {facet}?",
            "Assess whether the candidate can explain how an actual technology choice changed the architecture of a real project.",
            "A strong answer connects the technology choice to the project architecture, explains the trade-offs, and justifies the final design.",
        ),
        (
            f"In {project_name}, what was the deepest conceptual challenge in getting {anchor} right, especially around {skill} and {facet}?",
            "Assess conceptual depth, not just implementation narration, in the candidate's own project context.",
            "A strong answer explains the underlying concept, the hardest design constraint, and why the chosen approach worked better than alternatives.",
        ),
        (
            f"When building {project_name}, how did you reason about {facet} for {skill}, and what failure mode or edge case forced you to refine the design of {anchor}?",
            "Assess whether the candidate can reason about failure modes, not just happy-path implementation.",
            "A strong answer identifies a realistic failure mode, explains how it exposed a conceptual weakness, and shows how the design was improved.",
        ),
        (
            f"If {project_name} had to operate at higher scale or stricter production expectations, what would you revisit first in {anchor} because of {skill} and {facet}?",
            "Assess ability to generalize the current design toward production-grade constraints.",
            "A strong answer identifies the likely bottleneck or risk, explains why it matters, and proposes a principled redesign.",
        ),
    ]

    if contribution:
        prompts.append(
            (
                f"In {project_name}, your contribution was {contribution}. What conceptual decisions inside that area were the hardest, especially around {skill} and {facet}?",
                "Assess ownership depth using the candidate's stated contribution and its technical concepts.",
                "A strong answer explains the candidate's own design decisions, the concepts they had to understand deeply, and the trade-offs in that owned area.",
            ),
        )

    if category == "ml_ai":
        prompts.append(
            (
                f"In {project_name}, how did you decide whether the {skill} approach was actually the right modeling strategy for {anchor}, and how did you validate that it generalized instead of just fitting the dataset?",
                "Assess whether the candidate understands ML/AI model suitability and generalization, not just training steps.",
                "A strong answer compares modeling options, explains validation logic, and discusses overfitting, evaluation, and production behavior.",
            ),
        )
    elif category == "cloud":
        prompts.append(
            (
                f"In {project_name}, why was {skill} the right cloud building block for {anchor}, and what would break first if your assumptions about scale, latency, or security changed?",
                "Assess whether the candidate understands cloud architecture decisions under changing constraints.",
                "A strong answer explains why the service fit the workload, what assumptions it depended on, and how the design would evolve when those assumptions change.",
            ),
        )

    return prompts[angle_index % len(prompts)]


def _select_relevant_projects(projects: list[dict[str, object]], jd_skill_scores: Mapping[str, int], count: int) -> list[dict[str, object]]:
    ranked = sorted(projects, key=lambda item: _project_score(item, jd_skill_scores or {}), reverse=True)
    return ranked[: max(1, min(len(ranked), count))]


def _build_skill_question(skill: str, project: Mapping[str, object] | None, variant_index: int) -> tuple[str, str, str]:
    blueprint = _SKILL_QUESTION_BLUEPRINTS[variant_index % len(_SKILL_QUESTION_BLUEPRINTS)]
    project_name = str((project or {}).get("title") or "").strip()
    anchor = _project_anchor_phrase(project or {})
    categories = _infer_project_categories(project or {})
    category = categories[variant_index % len(categories)] if categories else "backend"
    facets = list(_TECH_CATEGORY_RULES[category]["facets"])
    facet = facets[variant_index % len(facets)]

    if project_name:
        prompts = [
            f"In {project_name}, where did {skill} become conceptually difficult in {anchor}, especially around {facet}, and how did you reason through it?",
            f"Think about {project_name}: what non-obvious trade-off did {skill} introduce in {anchor}, and how did you decide which side of that trade-off mattered more?",
            f"In {project_name}, what failure mode or design limitation forced you to understand {skill} more deeply while building {anchor}?",
        ]
    else:
        prompts = [
            f"You list {skill} in your resume. Describe the deepest architectural or conceptual decision where {skill} mattered, especially around {facet}.",
            f"What is a practical system-design mistake people make when using {skill}, and how did your own project experience make that clearer to you?",
            f"When {skill} shows up in a real build, what trade-off becomes most important first, and how did you see that in your own implementation work?",
        ]

    return prompts[variant_index % len(prompts)], blueprint["intent"], blueprint["reference_answer"]


def _build_cross_project_question(
    primary: Mapping[str, object],
    secondary: Mapping[str, object],
    focus_skill: str | None,
    angle_index: int,
) -> tuple[str, str, str]:
    first_name = str(primary.get("title") or "the first project").strip()
    second_name = str(secondary.get("title") or "the second project").strip()
    first_anchor = _project_anchor_phrase(primary)
    second_anchor = _project_anchor_phrase(secondary)
    first_categories = _infer_project_categories(primary)
    second_categories = _infer_project_categories(secondary)
    shared_categories = [category for category in first_categories if category in second_categories]
    category = shared_categories[0] if shared_categories else first_categories[0]
    facet = _TECH_CATEGORY_RULES[category]["facets"][angle_index % len(_TECH_CATEGORY_RULES[category]["facets"])]
    stack_phrase = focus_skill or ", ".join(_dedupe_keep_order([*primary.get("tech_stack", []), *secondary.get("tech_stack", [])], limit=3)) or "the technologies you used"
    prompts = [
        (
            f"{first_name} and {second_name} both rely on {stack_phrase}. How did the conceptual trade-offs differ between {first_anchor} in the first project and {second_anchor} in the second, especially around {facet}?",
            "Assess whether the candidate can compare technical trade-offs across projects instead of answering each project in isolation.",
            "A strong answer contrasts the constraints, explains why the design choices diverged, and ties those differences back to the underlying concept.",
        ),
        (
            f"If you had to merge the strongest ideas from {first_name} and {second_name} into one production-ready system, which assumptions about {stack_phrase} would you keep, and which would you redesign because of {facet}?",
            "Assess synthesis across projects and the ability to redesign under stronger production constraints.",
            "A strong answer identifies reusable design ideas, weak assumptions, and the conceptual reason some pieces should be redesigned.",
        ),
        (
            f"When you compare {first_name} with {second_name}, what deeper lesson about {stack_phrase} became clearer only after doing both projects, particularly around {facet}?",
            "Assess reflection, conceptual growth, and the ability to generalize engineering lessons across projects.",
            "A strong answer extracts a concrete conceptual lesson from both projects and shows how that lesson changed the candidate's design judgment.",
        ),
    ]
    return prompts[angle_index % len(prompts)]


def _build_practical_questions(projects: list[dict[str, object]], jd_skill_scores: Mapping[str, int], count: int) -> list[dict[str, object]]:
    if count <= 0:
        return []

    selected_projects = _select_relevant_projects(projects, jd_skill_scores, max(count, len(projects)))
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

    practical_skill_targets = matched_skills or [skill for skill in resume_skills if skill][: max(1, min(8, len(resume_skills)))]

    questions: list[dict[str, object]] = []
    seen_signatures: set[str] = set()

    project_rotation = selected_projects[: min(len(selected_projects), max(1, count))]
    for index, project in enumerate(project_rotation):
        concept_targets = _project_concept_targets(project, jd_skill_scores or {})
        preferred_target = concept_targets[index % len(concept_targets)] if concept_targets else {"skill": None}
        focus_skill = str(preferred_target.get("skill") or "") or None
        text, intent, reference_answer = _build_project_question_from_context(project, focus_skill, index)
        _append_unique_question(questions, seen_signatures, {
            "text": text if text.endswith("?") else f"{text}?",
            "type": "project",
            "topic": f"project:{_normalize(focus_skill or project.get('title') or 'implementation')}",
            "intent": intent,
            "focus_skill": focus_skill,
            "project_name": project.get("title"),
            "reference_answer": reference_answer,
            "difficulty": "hard" if focus_skill and _normalize(focus_skill) in {"aws", "ai", "ml", "machine learning", "deep learning", "tensorflow", "pytorch", "rag", "llm"} else str(INTERVIEW_CONFIG["difficulty"]),
        })

    cross_project_target = 1 if len(selected_projects) >= 2 and len(questions) < count else 0
    cross_project_target = min(max(0, count - len(questions)), max(cross_project_target, max(0, len(selected_projects) - 1)))
    for index in range(cross_project_target):
        primary = selected_projects[index % len(selected_projects)]
        secondary = selected_projects[(index + 1) % len(selected_projects)]
        shared_skills = [
            skill for skill in practical_skill_targets
            if any(_normalize(skill) == _normalize(project_skill) for project_skill in primary.get("tech_stack", []))
            and any(_normalize(skill) == _normalize(project_skill) for project_skill in secondary.get("tech_stack", []))
        ]
        focus_skill = shared_skills[0] if shared_skills else (practical_skill_targets[0] if practical_skill_targets else None)
        text, intent, reference_answer = _build_cross_project_question(primary, secondary, focus_skill, index)
        _append_unique_question(questions, seen_signatures, {
            "text": text if text.endswith("?") else f"{text}?",
            "type": "project",
            "topic": f"cross_project:{_normalize(focus_skill or primary.get('title') or 'comparison')}",
            "intent": intent,
            "focus_skill": focus_skill,
            "project_name": f"{primary.get('title')} | {secondary.get('title')}",
            "reference_answer": reference_answer,
            "difficulty": "hard",
        })

    remaining_slots = max(0, count - len(questions))
    for index in range(remaining_slots):
        skill = practical_skill_targets[index % len(practical_skill_targets)]
        attached_project = next(
            (project for project in selected_projects if any(_normalize(skill) == _normalize(project_skill) for project_skill in project.get("tech_stack", []))),
            selected_projects[index % len(selected_projects)],
        )
        text, intent, reference_answer = _build_skill_question(skill, attached_project, index)
        difficulty = "hard" if _normalize(skill) in {"aws", "ai", "ml", "machine learning", "deep learning", "tensorflow", "pytorch", "rag", "llm"} else str(INTERVIEW_CONFIG["difficulty"])
        _append_unique_question(questions, seen_signatures, {
            "text": text if text.endswith("?") else f"{text}?",
            "type": "project",
            "topic": f"skill:{_normalize(skill)}",
            "intent": intent,
            "focus_skill": skill,
            "project_name": attached_project.get("title") if attached_project else None,
            "reference_answer": reference_answer,
            "difficulty": difficulty,
        })

    fill_index = 0
    while len(questions) < count and selected_projects:
        project = selected_projects[fill_index % len(selected_projects)]
        fallback_targets = _project_concept_targets(project, jd_skill_scores or {})
        fallback_target = fallback_targets[(fill_index + len(questions)) % len(fallback_targets)] if fallback_targets else {"skill": None}
        fallback_skill = str(fallback_target.get("skill") or "") or (project.get("tech_stack") or [None])[0]
        text, intent, reference_answer = _build_project_question_from_context(project, fallback_skill, fill_index + len(questions))
        _append_unique_question(questions, seen_signatures, {
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

    has_cross_project = any("|" in str(question.get("project_name") or "") for question in questions)
    if count > len(selected_projects) and len(selected_projects) >= 2 and not has_cross_project:
        primary = selected_projects[0]
        secondary = selected_projects[1]
        shared_skills = [
            skill for skill in practical_skill_targets
            if any(_normalize(skill) == _normalize(project_skill) for project_skill in primary.get("tech_stack", []))
            and any(_normalize(skill) == _normalize(project_skill) for project_skill in secondary.get("tech_stack", []))
        ]
        focus_skill = shared_skills[0] if shared_skills else (practical_skill_targets[0] if practical_skill_targets else None)
        text, intent, reference_answer = _build_cross_project_question(primary, secondary, focus_skill, len(questions))
        cross_payload = {
            "text": text if text.endswith("?") else f"{text}?",
            "type": "project",
            "topic": f"cross_project:{_normalize(focus_skill or primary.get('title') or 'comparison')}",
            "intent": intent,
            "focus_skill": focus_skill,
            "project_name": f"{primary.get('title')} | {secondary.get('title')}",
            "reference_answer": reference_answer,
            "difficulty": "hard",
        }
        if len(questions) >= count and questions:
            questions[-1] = cross_payload
        else:
            questions.append(cross_payload)

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


def _ensure_cross_project_presence(
    questions: list[dict[str, object]],
    projects: list[dict[str, object]],
    jd_skill_scores: Mapping[str, int],
) -> list[dict[str, object]]:
    if len(questions) <= len(projects) or len(projects) < 2:
        return questions
    if any("|" in str(question.get("project_name") or "") for question in questions):
        return questions

    primary = projects[0]
    secondary = projects[1]
    practical_skill_targets = _dedupe_keep_order(
        [
            skill for skill in _sorted_jd_skills(jd_skill_scores)
            if any(_normalize(skill) == _normalize(project_skill) for project_skill in primary.get("tech_stack", []))
            or any(_normalize(skill) == _normalize(project_skill) for project_skill in secondary.get("tech_stack", []))
        ]
        or [skill for project in projects[:2] for skill in project.get("tech_stack", []) if skill],
        limit=6,
    )
    focus_skill = practical_skill_targets[0] if practical_skill_targets else None
    text, intent, reference_answer = _build_cross_project_question(primary, secondary, focus_skill, len(questions))
    cross_payload = {
        "text": text if text.endswith("?") else f"{text}?",
        "type": "project",
        "topic": f"cross_project:{_normalize(focus_skill or primary.get('title') or 'comparison')}",
        "intent": intent,
        "focus_skill": focus_skill,
        "project_name": f"{primary.get('title')} | {secondary.get('title')}",
        "reference_answer": reference_answer,
        "difficulty": "hard",
    }
    if questions:
        questions[-1] = cross_payload
    else:
        questions.append(cross_payload)
    return questions


def _build_llm_prompt(*, resume_text: str, jd_title: str | None, jd_skill_scores: Mapping[str, int], projects: list[dict[str, object]], counts: Mapping[str, int]) -> str:
    jd_skills = [
        {"skill": str(skill), "weight": int(weight)}
        for skill, weight in sorted((jd_skill_scores or {}).items(), key=lambda x: -x[1])[:12]
        if str(skill).strip()
    ]
    structured_projects = _structured_projects_payload(projects[:6])
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
- The first question must be the introduction question.
- The last questions must be HR / behavioral questions.
- The middle block must be only technical project or skill questions derived from the resume and JD.
- Keep self-intro and HR questions natural; do not rewrite them into robotic wording.
- Every project question must mention the exact extracted project_name.
- Cover every extracted project at least once when enough slots exist.
- If there are at least 2 extracted projects, include at least one cross-project comparison or interlinking question.
- Never use placeholder phrases like 'main project', 'one of your projects', 'your project', or 'tell me about your main project'.
- Skill questions must be practical and tied to actual project usage, implementation decisions, debugging, architecture, database design, backend logic, validations, performance, concurrency, edge cases, integrations, deployment choices, reliability, scalability, or failure handling.
- If the project uses AI/ML, AWS, cloud, data, backend, or frontend technologies, ask very deep conceptual questions about how those choices worked in the actual implementation.
- For AI/ML projects, prefer concepts like model choice, validation strategy, leakage, drift, inference design, failure modes, and production trade-offs over textbook definitions.
- For cloud/AWS projects, prefer concepts like service fit, IAM/security boundaries, observability, scaling assumptions, latency, failure handling, and cost trade-offs.
- For data/backend projects, prefer concepts like consistency, concurrency, idempotency, query patterns, validation, reliability, and edge-case handling.
- Do NOT ask textbook questions like 'What is Java?', 'Explain SQL joins', or 'What is Spring Boot?'
- Prefer the strongest and most JD-relevant projects first.
- Questions should become progressively deeper: project understanding -> implementation -> trade-offs/challenges.
- Avoid repeated angles across questions and never repeat the same question in different wording.
- If project details are limited, still anchor the question to the real project name and known stack.
- Use stack names naturally when present.
- The technical questions should feel fully generated from the resume and JD, not like a generic template list.

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
        seen_signatures: set[str] = set()
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
            _append_unique_question(result, seen_signatures, {
                "text": text if text.endswith("?") else f"{text}?",
                "type": q_type,
                "topic": str(item.get("topic") or "general"),
                "intent": str(item.get("intent") or "Assess candidate understanding and communication."),
                "focus_skill": item.get("focus_skill"),
                "project_name": project_name,
                "reference_answer": str(item.get("reference_answer") or "A strong answer should be relevant, practical, and clearly explained."),
                "difficulty": str(item.get("difficulty") or INTERVIEW_CONFIG["difficulty"]),
            })
        intro_questions = [item for item in result if str(item.get("type") or "").strip().lower() == "intro"]
        project_questions = [item for item in result if str(item.get("type") or "").strip().lower() == "project"]
        hr_questions = [item for item in result if str(item.get("type") or "").strip().lower() == "hr"]
        ordered = intro_questions[:counts["intro"]] + project_questions[:counts["project"]] + hr_questions[:counts["hr"]]
        return ordered if len(ordered) >= sum(counts.values()) else None
    except Exception as exc:
        logger.warning("LLM question generation failed (%s). Using deterministic generator.", exc)
        return None


def build_question_bundle(*, resume_text: str, jd_title: str | None, jd_skill_scores: Mapping[str, int] | None, question_count: int | None = None, project_ratio: float | None = None) -> dict[str, object]:
    projects = extract_projects_from_resume(resume_text, known_skills=jd_skill_scores or {})
    total = _desired_total_questions(int(question_count or INTERVIEW_CONFIG["total_questions"]), len(projects))
    counts = _section_counts(total, project_ratio=project_ratio, project_coverage_target=len(projects))
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