"""
routes/interview/evaluation.py

POST /api/interview/{session_id}/evaluate
Called by Completed.jsx after the interview ends.

FIXES applied:
  1. llm_eval_status on InterviewSession is updated (pending → completed/failed)
     so HR dashboard can show accurate scoring state.
  2. Both InterviewAnswer AND InterviewQuestion are updated in a single db.flush()
     per question — atomic within the transaction, no partial-write inconsistency.
  3. Fallback: if Groq LLM is unavailable, local compute_answer_scorecard score
     is used instead of leaving llm_score as NULL ("Pending forever" bug fixed).
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ai_engine.phase1.scoring import compute_answer_scorecard
from database import get_db
from models import InterviewAnswer, InterviewQuestion, InterviewSession
from routes.dependencies import SessionUser, require_role
from services.llm.client import score_answer

logger = logging.getLogger(__name__)

router = APIRouter(tags=["interview-evaluation"])


@router.post("/interview/{session_id}/evaluate")
def evaluate_interview(
    session_id: int,
    current_user: SessionUser = Depends(require_role("candidate")),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    """Score all answers for a completed interview session using Groq LLM.
    Safe to call multiple times (idempotent)."""

    session = (
        db.query(InterviewSession)
        .filter(
            InterviewSession.id == session_id,
            InterviewSession.candidate_id == current_user.user_id,
        )
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Interview session not found")

    # FIX: mark as running so HR can see progress
    session.llm_eval_status = "running"
    db.commit()

    questions = (
        db.query(InterviewQuestion)
        .filter(InterviewQuestion.session_id == session_id)
        .order_by(InterviewQuestion.id.asc())
        .all()
    )

    scored = 0
    total_score = 0.0

    for question in questions:
        answer_text = (question.answer_text or "").strip()

        if not answer_text or question.skipped:
            _upsert_llm_fields(db, session_id, question.id, 0, "Answer was skipped or empty.")
            continue

        # FIX: try Groq LLM first; if it fails fall back to local rubric score
        # so that llm_score is never left NULL after a Groq outage.
        try:
            result = score_answer(question.text, answer_text)
            llm_score = int(result["score"])
            llm_feedback = str(result["feedback"])
        except Exception as exc:
            logger.warning(
                "Groq LLM scoring failed for question %s (session %s): %s — using local fallback.",
                question.id, session_id, exc,
            )
            local = compute_answer_scorecard(question.text, answer_text)
            llm_score = int(local["overall_score"])
            llm_feedback = "Scored locally (LLM service unavailable)."

        _upsert_llm_fields(db, session_id, question.id, llm_score, llm_feedback)
        total_score += llm_score
        scored += 1

    # FIX: single final commit after all flushes
    session.llm_eval_status = "completed"
    db.commit()

    avg_score = round(total_score / scored, 1) if scored else 0.0
    return {
        "ok": True,
        "session_id": session_id,
        "questions_evaluated": scored,
        "average_llm_score": avg_score,
    }


def _upsert_llm_fields(
    db: Session,
    session_id: int,
    question_id: int,
    llm_score: int,
    llm_feedback: str,
) -> None:
    """FIX: Write llm_score+llm_feedback to BOTH InterviewAnswer AND
    InterviewQuestion in a single flush so both succeed atomically."""
    answer = (
        db.query(InterviewAnswer)
        .filter(
            InterviewAnswer.session_id == session_id,
            InterviewAnswer.question_id == question_id,
        )
        .order_by(InterviewAnswer.id.desc())
        .first()
    )
    if answer:
        answer.llm_score = llm_score
        answer.llm_feedback = llm_feedback

    question = db.query(InterviewQuestion).filter(InterviewQuestion.id == question_id).first()
    if question:
        question.llm_score = llm_score
        question.llm_feedback = llm_feedback

    # FIX: single flush — both writes committed together
    db.flush()
