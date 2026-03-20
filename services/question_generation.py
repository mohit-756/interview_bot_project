"""Thin service wrapper around the phase2 question builder.

This module is imported by interview runtime routes. It must not be a stub,
otherwise interviews can fail when a question bank needs to be generated
on-demand.
"""

from __future__ import annotations

from collections.abc import Mapping

from ai_engine.phase2.question_builder import build_question_bundle as _build_question_bundle


def build_question_bundle(
    *,
    resume_text: str,
    jd_title: str | None,
    jd_skill_scores: Mapping[str, int] | None,
    question_count: int | None = None,
    project_ratio: float | None = None,
) -> dict[str, object]:
    return dict(
        _build_question_bundle(
            resume_text=resume_text,
            jd_title=jd_title,
            jd_skill_scores=jd_skill_scores or {},
            question_count=question_count,
            project_ratio=project_ratio,
        )
    )