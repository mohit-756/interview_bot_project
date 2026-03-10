"""Shared constants and helper functions used by route modules."""
from __future__ import annotations

from datetime import datetime
import os
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ai_engine.phase1.scoring import compute_resume_scorecard
from ai_engine.phase1.matching import extract_text_from_file
from models import Candidate, HR, JobDescription, JobDescriptionConfig, Result

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


def frontend_base_url() -> str:
    return os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")


def interview_entry_url(result_id: int | None) -> str | None:
    if not result_id:
        return None
    return f"{frontend_base_url()}/interview/{int(result_id)}"


def generate_candidate_uid() -> str:
    stamp = datetime.utcnow().strftime("%Y%m%d")
    return f"CAND-{stamp}-{uuid4().hex[:6].upper()}"


def ensure_candidate_profile(candidate: Candidate, db: Session) -> bool:
    changed = False

    if not candidate.created_at:
        candidate.created_at = datetime.utcnow()
        changed = True

    if candidate.candidate_uid:
        return changed

    for _ in range(10):
        candidate_uid = generate_candidate_uid()
        query = db.query(Candidate).filter(Candidate.candidate_uid == candidate_uid)
        if candidate.id is not None:
            query = query.filter(Candidate.id != candidate.id)
        exists = query.first()
        if exists:
            continue
        candidate.candidate_uid = candidate_uid
        changed = True
        return changed

    raise RuntimeError("Unable to allocate a unique candidate ID after multiple attempts.")


def get_candidate_or_404(db: Session, candidate_id: int) -> Candidate:
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return candidate


def get_hr_or_404(db: Session, hr_id: int) -> HR:
    hr_user = db.query(HR).filter(HR.id == hr_id).first()
    if not hr_user:
        raise HTTPException(status_code=404, detail="HR user not found")
    return hr_user


def list_available_jobs(db: Session) -> list[dict[str, object]]:
    jobs = db.query(JobDescription).order_by(JobDescription.id.desc()).all()
    companies = {item.id: item.company_name for item in db.query(HR).all()}
    payload: list[dict[str, object]] = []
    for job in jobs:
        payload.append(
            {
                "id": job.id,
                "company_id": job.company_id,
                "company_name": companies.get(job.company_id, "Unknown Company"),
                "jd_title": job.jd_title or Path(job.jd_text).name,
                "jd_name": Path(job.jd_text).name,
                "gender_requirement": None,
                "education_requirement": job.education_requirement,
                "experience_requirement": job.experience_requirement,
                "skill_scores": job.skill_scores or {},
                "cutoff_score": float(job.cutoff_score if job.cutoff_score is not None else 65.0),
                "question_count": int(job.question_count if job.question_count is not None else 8),
            }
        )
    return payload


def list_active_jds(db: Session) -> list[dict[str, object]]:
    jds = db.query(JobDescriptionConfig).order_by(JobDescriptionConfig.id.desc()).all()
    if not jds:
        legacy_jobs = db.query(JobDescription).order_by(JobDescription.id.desc()).all()
        return [
            {
                "id": job.id,
                "title": (job.jd_title or Path(job.jd_text or "").name or "Untitled JD"),
                "jd_text": job.jd_text or "",
                "jd_dict_json": {},
                "weights_json": job.skill_scores or {},
                "qualify_score": float(job.cutoff_score if job.cutoff_score is not None else 65.0),
                "min_academic_percent": 0.0,
                "total_questions": int(job.question_count if job.question_count is not None else 8),
                "project_question_ratio": 0.8,
                "created_at": None,
            }
            for job in legacy_jobs
        ]
    payload: list[dict[str, object]] = []
    for jd in jds:
        payload.append(
            {
                "id": jd.id,
                "title": jd.title,
                "jd_text": jd.jd_text,
                "jd_dict_json": jd.jd_dict_json or {},
                "weights_json": jd.weights_json or {},
                "qualify_score": float(jd.qualify_score if jd.qualify_score is not None else 65.0),
                "min_academic_percent": float(
                    jd.min_academic_percent if jd.min_academic_percent is not None else 0.0
                ),
                "total_questions": int(jd.total_questions if jd.total_questions is not None else 8),
                "project_question_ratio": float(
                    jd.project_question_ratio if jd.project_question_ratio is not None else 0.8
                ),
                "created_at": jd.created_at,
            }
        )
    return payload


def serialize_result(result: Result | None) -> dict[str, object] | None:
    if not result:
        return None
    return {
        "id": result.id,
        "score": float(result.score or 0),
        "shortlisted": bool(result.shortlisted),
        "explanation": result.explanation or {},
        "interview_date": result.interview_date,
        # Always expose the current SPA entry route, even if legacy rows still
        # store an old backend/token URL in app.db.
        "interview_link": interview_entry_url(result.id),
    }


def safe_delete_upload(stored_path: str | None) -> bool:
    if not stored_path:
        return False

    try:
        candidate_path = Path(stored_path)
        if not candidate_path.is_absolute():
            candidate_path = Path.cwd() / candidate_path
        resolved_path = candidate_path.resolve()
        upload_root = (Path.cwd() / UPLOAD_DIR).resolve()
        if upload_root != resolved_path and upload_root not in resolved_path.parents:
            return False
        if not resolved_path.is_file():
            return False
        resolved_path.unlink(missing_ok=True)
        return True
    except Exception:
        return False


def _load_jd_text(jd_text_value: str) -> str:
    raw = (jd_text_value or "").strip()
    if not raw:
        return ""
    possible_path = Path(raw)
    if possible_path.is_file():
        return extract_text_from_file(raw)
    return raw


def evaluate_resume_for_job(
    candidate: Candidate,
    job: JobDescription | JobDescriptionConfig,
) -> tuple[float, dict[str, object], list[dict[str, str]]]:
    resume_text = extract_text_from_file(candidate.resume_path or "")
    jd_text = _load_jd_text(getattr(job, "jd_text", "") or "")
    jd_skill_scores = (
        getattr(job, "skill_scores", None)
        or getattr(job, "weights_json", None)
        or {}
    )
    education_requirement = getattr(job, "education_requirement", None)
    experience_requirement = int(getattr(job, "experience_requirement", 0) or 0)
    cutoff_score = float(
        getattr(job, "cutoff_score", None)
        if getattr(job, "cutoff_score", None) is not None
        else getattr(job, "qualify_score", 65.0)
    )
    question_count = int(
        getattr(job, "question_count", None)
        if getattr(job, "question_count", None) is not None
        else getattr(job, "total_questions", 8)
    )
    jd_title = getattr(job, "jd_title", None) or getattr(job, "title", None)
    project_ratio = float(getattr(job, "project_question_ratio", 0.80) or 0.80)
    project_ratio = max(0.0, min(1.0, project_ratio))
    explanation = compute_resume_scorecard(
        resume_text=resume_text,
        jd_text=jd_text,
        jd_skill_scores=jd_skill_scores,
        education_requirement=education_requirement,
        experience_requirement=experience_requirement,
    )
    explanation["cutoff_score_used"] = cutoff_score
    explanation["question_count_used"] = question_count
    explanation["project_ratio_used"] = project_ratio
    # Question generation is triggered explicitly from HR endpoint and stored on candidates.questions_json.
    return float(explanation["final_resume_score"]), explanation, []


def upsert_result(
    db: Session,
    candidate_id: int,
    job_id: int,
    score: float,
    explanation: dict[str, object],
    interview_questions: list[dict[str, str]] | None = None,
    cutoff_score: float = 65.0,
) -> Result:
    current = (
        db.query(Result)
        .filter(Result.candidate_id == candidate_id, Result.job_id == job_id)
        .order_by(Result.id.desc())
        .first()
    )
    shortlisted = score >= float(cutoff_score)
    if current:
        current.score = score
        current.shortlisted = shortlisted
        current.explanation = explanation
        current.interview_questions = None
        if not current.application_id:
            current.application_id = f"APP-{job_id}-{candidate_id}-{uuid4().hex[:6].upper()}"
        current.interview_date = None
        current.interview_link = None
        current.interview_token = None
        db.commit()
        db.refresh(current)
        return current

    result = Result(
        candidate_id=candidate_id,
        job_id=job_id,
        score=score,
        shortlisted=shortlisted,
        explanation=explanation,
        application_id=f"APP-{job_id}-{candidate_id}-{uuid4().hex[:6].upper()}",
        interview_questions=None,
    )
    db.add(result)
    db.commit()
    db.refresh(result)
    return result
