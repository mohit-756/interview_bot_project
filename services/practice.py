"""Helpers for local practice interview preparation."""

from __future__ import annotations

from services.question_generation import build_question_bundle

def build_practice_kit(
    *,
    resume_text: str,
    jd_title: str | None,
    jd_skill_scores: dict[str, int] | None,
    question_count: int = 6,
) -> dict[str, object]:
    bundle = build_question_bundle(
        resume_text=resume_text,
        jd_title=jd_title,
        jd_skill_scores=jd_skill_scores or {},
        question_count=max(4, min(12, int(question_count or 6))),
        project_ratio=0.65,
    )
    return {
        "questions": list(bundle["questions"]),
        "meta": {
            "total_questions": int(bundle.get("total_questions", len(bundle.get("questions", [])))),
            "project_questions_count": int(bundle.get("by_type", {}).get("project", 0)) + int(bundle.get("by_type", {}).get("role_specific", 0)) + int(bundle.get("by_type", {}).get("decision", 0)) + int(bundle.get("by_type", {}).get("debugging", 0)),
            "theory_questions_count": int(bundle.get("by_type", {}).get("behavioral", 0)) + int(bundle.get("by_type", {}).get("opener", 0)),
            "projects": bundle.get("projects", []),
        },
    }
