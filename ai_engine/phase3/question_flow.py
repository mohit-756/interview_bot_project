"""Adaptive interview question flow helpers — runtime stage awareness."""

from __future__ import annotations

import re

STOPWORDS = {
    "about", "after", "also", "because", "could", "from", "have",
    "just", "like", "make", "more", "should", "that", "them", "then",
    "they", "this", "what", "when", "with", "your",
}

# Fallback questions per stage used when the source bank runs out
FALLBACK_STAGE_QUESTIONS: dict[str, tuple[str, ...]] = {
    "intro": (
        "Please give us a quick introduction — your background, current role, "
        "and the project you are most proud of.",
    ),
    "project": (
        "Walk me through one of your key projects — the problem, your approach, and the outcome.",
        "Tell me about a production issue you faced in one of your projects and how you resolved it.",
        "If you could redesign one part of a project you built, what would it be and why?",
    ),
    "hr": (
        "Describe a time you had to learn something new very quickly under pressure.",
        "Tell me about a time you disagreed with your team. How did you handle it?",
        "Where do you see yourself in the next two to three years?",
    ),
}

# Stage boundaries — index-based
# index 0        → intro
# index 1 to N-2 → project  (80 %)
# last 1–2       → hr        (20 %)
def stage_for_question_index(index: int, max_questions: int = 8) -> str:
    if index == 0:
        return "intro"
    hr_start = max(2, max_questions - max(1, round(max_questions * 0.20)))
    if index >= hr_start:
        return "hr"
    return "project"


def normalize_result_questions(payload: object) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    if isinstance(payload, list):
        candidates: list[object] = payload
    elif isinstance(payload, dict) and isinstance(payload.get("questions"), list):
        candidates = payload["questions"]
    else:
        candidates = []

    for item in candidates:
        if isinstance(item, str):
            text = item.strip()
            if text:
                normalized.append({"text": text, "difficulty": "medium", "topic": "general", "type": "project"})
            continue
        if not isinstance(item, dict):
            continue
        text = str(item.get("text") or item.get("question") or "").strip()
        if not text:
            continue
        normalized.append({
            "text":       text,
            "difficulty": str(item.get("difficulty") or "medium"),
            "topic":      str(item.get("topic") or "general"),
            "type":       str(item.get("type") or "project"),
        })
    return normalized


def compute_dynamic_seconds(
    base_seconds: int,
    question_index: int,
    last_answer: str,
    max_questions: int = 8,
) -> int:
    stage = stage_for_question_index(question_index, max_questions)
    stage_bonus = {"intro": -10, "project": 10, "hr": 5}.get(stage, 0)
    words = len((last_answer or "").split())
    answer_adjust = -10 if words < 15 else (15 if words > 80 else 0)
    return max(30, min(180, int(base_seconds) + stage_bonus + answer_adjust))


def next_question_payload(
    source_questions: list[dict[str, str]],
    asked_questions: list[str],
    question_index: int,
    last_answer: str,
    jd_title: str | None,
    max_questions: int = 8,
) -> dict[str, str]:
    asked_set = {t.strip().lower() for t in asked_questions if t.strip()}

    # Try to pick the next unasked question from the source bank
    for item in source_questions:
        text = item["text"].strip()
        if text.lower() not in asked_set:
            return {
                "text":       text,
                "difficulty": item.get("difficulty", "medium"),
                "topic":      item.get("topic", "general"),
                "type":       item.get("type", "project"),
            }

    # Fallback: generate contextual question from the appropriate stage
    stage = stage_for_question_index(question_index, max_questions)
    pool  = FALLBACK_STAGE_QUESTIONS.get(stage, FALLBACK_STAGE_QUESTIONS["project"])
    base  = pool[question_index % len(pool)]
    focus = _focus_phrase(last_answer) or (jd_title or "your recent project")

    if stage == "project":
        text = f"{base} Make sure to include specific details about {focus}."
    elif stage == "hr":
        text = base
    else:
        text = base

    return {"text": text, "difficulty": _difficulty_for_stage(stage), "topic": stage, "type": stage}


def _difficulty_for_stage(stage: str) -> str:
    return {"intro": "easy", "project": "medium", "hr": "medium"}.get(stage, "medium")


def _focus_phrase(last_answer: str) -> str:
    tokens = re.findall(r"[A-Za-z][A-Za-z0-9+#.-]{2,}", (last_answer or "").lower())
    filtered = [t for t in tokens if t not in STOPWORDS]
    return " ".join(filtered[:4]) if filtered else ""
