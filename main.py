"""
main.py — FastAPI application entrypoint for Interview Bot backend.

FIXES applied:
  1. ensure_schema() migrates all new columns added to models.py
     (hr_decision, hr_final_score, hr_behavioral_score, hr_communication_score,
      hr_notes, hr_red_flags on results; llm_eval_status on interview_sessions;
      education_requirement + experience_requirement on job_descriptions)
  2. @app.on_event("startup") pre-loads the SentenceTransformer model so the
     first resume upload does not have a 10-second cold-start delay.
  3. GROQ_API_KEY is checked at startup — a clear warning is printed if it is
     missing so engineers catch it immediately instead of seeing 500 errors
     during interviews.
"""
from __future__ import annotations
from dotenv import load_dotenv
# Load .env for local dev only — NEVER override real platform env vars on Render.
load_dotenv()
import logging
import os
import threading
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from starlette.middleware.sessions import SessionMiddleware

from database import SessionLocal, engine
from models import Base, Candidate
from routes.api_routes import api_router
from routes.common import ensure_candidate_profile



logger = logging.getLogger(__name__)

app = FastAPI(title="Interview Bot API", version="1.0.0")

# Keep startup table creation for local/dev environments.
Base.metadata.create_all(bind=engine)


# ── LLM provider startup checks ─────────────────────────────────────────────

# Standardized LLM provider and model checks
_llm_provider = os.getenv("LLM_PROVIDER", "cerebras").strip().lower()
_llm_model = os.getenv("LLM_MODEL_PRIMARY", "qwen-3-235b-a22b-instruct-2507").strip()
_llm_api_key = os.getenv("LLM_API_KEY")

logger.info(f"LLM provider is {_llm_provider} with model={_llm_model}")

if not _llm_api_key:
    logger.warning(
        f"LLM_API_KEY is not set. "
        f"LLM features for {_llm_provider} may be unavailable. "
        f"Set LLM_API_KEY in .env."
    )


# ── FIX: Pre-load SentenceTransformer on startup ────────────────────────────
# Without this the first resume upload triggers a ~10s model load during the
# request, causing a timeout-like experience for the candidate.
@app.on_event("startup")
async def _preload_ml_model() -> None:
    """Warm up the SentenceTransformer model without blocking backend startup."""
    def _load_model() -> None:
        try:
            from ai_engine.phase1.matching import _get_model, SEMANTIC_SEARCH_ENABLED
            if not SEMANTIC_SEARCH_ENABLED:
                logger.info("Lite Mode: Skipping SentenceTransformer preload.")
                return
            _get_model()
            logger.info("✅  SentenceTransformer model loaded and ready.")
        except Exception as exc:
            logger.warning("SentenceTransformer preload failed (non-fatal): %s", exc)

    threading.Thread(target=_load_model, name="st-model-preload", daemon=True).start()


# ── Environment & Production Safety ──────────────────────────────────────────
IS_PROD = os.getenv("ENV", "development").strip().lower() == "production"
logger.info(f"STARTUP: mode={'PRODUCTION' if IS_PROD else 'DEVELOPMENT'}")

_secret_key = os.getenv("SECRET_KEY")
if not _secret_key:
    if IS_PROD:
        raise RuntimeError("SECRET_KEY MUST be set in production via environment variables.")
    else:
        logger.warning("SECRET_KEY not set. Using insecure default for local development.")
        _secret_key = "dev-secret-key-12345"

app.add_middleware(
    SessionMiddleware,
    secret_key=_secret_key,
    same_site="none",
    https_only=True,
    session_cookie="interview_bot_sid",
)

# ── CORS Configuration ───────────────────────────────────────────────────────
# In production, allow the Vercel domain + localhost for dev.
# Use allow_origin_regex to also cover Vercel preview deployments.
DEFAULT_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173,https://interview-bot-project-1.vercel.app"
raw_origins = os.getenv("CORS_ORIGINS", DEFAULT_ORIGINS)
allow_origins = [o.strip() for o in raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_origin_regex=r"https://interview-bot-project-1(-[a-zA-Z0-9_-]+)?\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

uploads_dir = Path("uploads")
uploads_dir.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")
# NOTE: Mount the aggregate API router exactly once. Double-registration creates
# duplicate/conflicting route entries and can surface as incorrect 404/405 behavior.
app.include_router(api_router)


# NOTE: Lightweight health endpoints for local startup verification.
@app.get("/")
def root() -> dict[str, str]:
    return {"ok": "true", "service": "interview-bot-api"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/usage")
def usage() -> dict:
    from utils.token_utils import get_snapshot
    snap = get_snapshot()
    return {
        "provider": _llm_provider,
        "model": _llm_model,
        **snap,
        "status": "ok" if snap["rpm_pct"] < 90 and snap["tpm_pct"] < 90 else "near_limit",
    }
