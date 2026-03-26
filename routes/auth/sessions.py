"""Health and authentication endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth import hash_password, password_needs_upgrade, verify_password
from database import get_db
from models import Candidate, HR
from routes.common import ensure_candidate_profile, get_candidate_or_404, get_hr_or_404
from routes.dependencies import SessionUser, get_current_user
from routes.schemas import LoginBody, SignupBody

router = APIRouter()


@router.get("/health")
def health() -> dict[str, object]:
    return {"ok": True, "status": "healthy"}


# LLM provider health check endpoint.
# Kept at /health/groq for backward compatibility with existing frontend calls.
@router.get("/health/groq")
@router.get("/health/llm")
def llm_health() -> dict[str, object]:
    """Check configured LLM provider reachability without failing the endpoint."""
    import os
    import requests

    provider = (os.getenv("LLM_PROVIDER") or "ollama").strip().lower()

    if provider == "ollama":
        ollama_url = (os.getenv("OLLAMA_CHAT_URL") or "http://localhost:11434/api/chat").strip()
        ollama_model = (os.getenv("OLLAMA_MODEL") or "qwen2.5-coder:3b").strip()
        try:
            response = requests.post(
                ollama_url,
                json={
                    "model": ollama_model,
                    "messages": [{"role": "user", "content": "ping"}],
                    "stream": False,
                    "options": {"num_predict": 2},
                },
                timeout=10,
            )
            response.raise_for_status()
            return {
                "ok": True,
                "provider": "ollama",
                "status": "reachable",
                "degraded": False,
                "model": ollama_model,
                "message": "Ollama is reachable and ready.",
            }
        except Exception as exc:
            return {
                "ok": True,
                "provider": "ollama",
                "status": "unreachable",
                "degraded": True,
                "model": ollama_model,
                "message": f"Ollama health check failed: {str(exc)[:200]}",
            }

    if provider == "groq":
        api_key = os.getenv("GROQ_API_KEY", "")
        if not api_key:
            return {
                "ok": True,
                "provider": "groq",
                "status": "unconfigured",
                "degraded": True,
                "message": "GROQ_API_KEY is not set.",
            }
        try:
            from groq import Groq

            client = Groq(api_key=api_key)
            models = client.models.list()
            model_ids = [m.id for m in (models.data or [])]
            return {
                "ok": True,
                "provider": "groq",
                "status": "reachable",
                "degraded": False,
                "models_available": len(model_ids),
                "message": "Groq API is reachable and ready.",
            }
        except Exception as exc:
            return {
                "ok": True,
                "provider": "groq",
                "status": "unreachable",
                "degraded": True,
                "message": f"Groq health check failed: {str(exc)[:200]}",
            }

    return {
        "ok": True,
        "provider": provider or "unknown",
        "status": "unsupported",
        "degraded": True,
        "message": "Unsupported LLM_PROVIDER. Expected 'ollama' or 'groq'.",
    }
    
# Add these two routes to routes/auth/sessions.py

# ── PUT /api/auth/profile ────────────────────────────────────────────────────
# Allows a logged-in user to update their display name.

from pydantic import BaseModel as _BaseModel

class ProfileUpdateBody(_BaseModel):
    name: str

@router.put("/auth/profile")
def update_profile(
    payload: ProfileUpdateBody,
    current_user: SessionUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")

    if current_user.role == "candidate":
        user = db.query(Candidate).filter(Candidate.id == current_user.user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        user.name = name
    else:
        user = db.query(HR).filter(HR.id == current_user.user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        user.company_name = name

    db.commit()
    return {"ok": True, "name": name}


# ── POST /api/auth/change-password ──────────────────────────────────────────
# Allows a logged-in user to change their password after verifying current one.

class ChangePasswordBody(_BaseModel):
    current_password: str
    new_password: str

@router.post("/auth/change-password")
def change_password(
    payload: ChangePasswordBody,
    current_user: SessionUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")

    if current_user.role == "candidate":
        user = db.query(Candidate).filter(Candidate.id == current_user.user_id).first()
    else:
        user = db.query(HR).filter(HR.id == current_user.user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not verify_password(payload.current_password, user.password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    user.password = hash_password(payload.new_password)
    db.commit()
    return {"ok": True, "message": "Password updated successfully"}



@router.post("/auth/signup")
def signup(payload: SignupBody, db: Session = Depends(get_db)) -> dict[str, object]:
    role = payload.role.strip().lower()
    if role not in {"candidate", "hr"}:
        raise HTTPException(status_code=400, detail="Role must be candidate or hr")

    existing = db.query(Candidate).filter(Candidate.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    existing_hr = db.query(HR).filter(HR.email == payload.email).first()
    if existing_hr:
        raise HTTPException(status_code=400, detail="Email already registered")

    if role == "candidate":
        user = Candidate(
            name=payload.name,
            email=payload.email,
            password=hash_password(payload.password),
            gender=payload.gender,
        )
        ensure_candidate_profile(user, db)
    else:
        user = HR(
            company_name=payload.name,
            email=payload.email,
            password=hash_password(payload.password),
        )

    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Email already registered")
    db.refresh(user)
    return {"ok": True, "id": user.id, "role": role}


@router.post("/auth/login")
def login(
    payload: LoginBody,
    request: Request,
    db: Session = Depends(get_db),
) -> dict[str, object]:
    candidate = db.query(Candidate).filter(Candidate.email == payload.email).first()
    if candidate and verify_password(payload.password, candidate.password):
        if password_needs_upgrade(candidate.password):
            candidate.password = hash_password(payload.password)
            db.commit()
        request.session["user_id"] = candidate.id
        request.session["role"] = "candidate"
        return {"ok": True, "role": "candidate", "user_id": candidate.id}

    hr_user = db.query(HR).filter(HR.email == payload.email).first()
    if hr_user and verify_password(payload.password, hr_user.password):
        if password_needs_upgrade(hr_user.password):
            hr_user.password = hash_password(payload.password)
            db.commit()
        request.session["user_id"] = hr_user.id
        request.session["role"] = "hr"
        return {"ok": True, "role": "hr", "user_id": hr_user.id}

    raise HTTPException(status_code=401, detail="Invalid credentials")


@router.post("/auth/logout")
def logout(request: Request) -> dict[str, object]:
    request.session.clear()
    return {"ok": True}


@router.get("/auth/me")
def me(
    current_user: SessionUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    if current_user.role == "candidate":
        candidate = get_candidate_or_404(db, current_user.user_id)
        return {
            "ok": True,
            "user_id": candidate.id,
            "candidate_uid": candidate.candidate_uid,
            "role": "candidate",
            "name": candidate.name,
            "email": candidate.email,
        }
    hr_user = get_hr_or_404(db, current_user.user_id)
    return {
        "ok": True,
        "user_id": hr_user.id,
        "role": "hr",
        "name": hr_user.company_name,
        "email": hr_user.email,
    }
