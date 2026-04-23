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
from core.config import config
import logging
import threading
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.requests import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
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


def _run_migrations():
    """Add new columns to existing tables that SQLAlchemy create_all won't touch."""
    from sqlalchemy import inspect, text
    inspector = inspect(engine)
    with engine.begin() as conn:
        if "candidates" in inspector.get_table_names():
            cols = [c["name"] for c in inspector.get_columns("candidates")]
            if "avatar_path" not in cols:
                conn.execute(text("ALTER TABLE candidates ADD COLUMN avatar_path VARCHAR(300)"))
                logger.info("Added avatar_path to candidates")
        if "hr" in inspector.get_table_names():
            cols = [c["name"] for c in inspector.get_columns("hr")]
            if "avatar_path" not in cols:
                conn.execute(text("ALTER TABLE hr ADD COLUMN avatar_path VARCHAR(300)"))
                logger.info("Added avatar_path to hr")
        if "password_reset_tokens" not in inspector.get_table_names():
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS password_reset_tokens (
                    id SERIAL PRIMARY KEY,
                    email VARCHAR(120) NOT NULL,
                    token VARCHAR(128) UNIQUE NOT NULL,
                    expires_at TIMESTAMP NOT NULL,
                    used BOOLEAN DEFAULT FALSE NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW() NOT NULL
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_id ON password_reset_tokens (id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_email ON password_reset_tokens (email)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_token ON password_reset_tokens (token)"))
            logger.info("Created password_reset_tokens table")
        if "user_preferences" not in inspector.get_table_names():
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS user_preferences (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    role VARCHAR(20) NOT NULL,
                    preferences_json JSON,
                    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_user_preferences_id ON user_preferences (id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_user_preferences_user_id ON user_preferences (user_id)"))
            logger.info("Created user_preferences table")


_run_migrations()


# ── LLM provider startup checks ─────────────────────────────────────────────

# Standardized LLM provider and model checks
_llm_provider = config.LLM_PROVIDER
_llm_model = config.LLM_MODEL_PRIMARY
_llm_api_key = config.LLM_API_KEY

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


# ── Security Headers Middleware ─────────────────────────────────────────────
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        return response


# ── Environment & Production Safety ──────────────────────────────────────────
IS_PROD = config.ENV == "production"
logger.info(f"STARTUP: mode={'PRODUCTION' if IS_PROD else 'DEVELOPMENT'}")

_secret_key = config.SECRET_KEY

if IS_PROD and not _secret_key:
    raise RuntimeError("SECRET_KEY MUST be set in production via environment variables.")

if not _secret_key:
    logger.warning("SECRET_KEY not set. Using fallback for local development.")

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    SessionMiddleware,
    secret_key=_secret_key or "dev-fallback-key-change-in-production",
    same_site="none" if IS_PROD else "lax",
    https_only=IS_PROD,
    session_cookie="interview_bot_sid",
)

# ── CORS Configuration ───────────────────────────────────────────────────────
# LOCAL DEV: Uses Vite proxy -> http://127.0.0.1:8000 (no CORS needed for proxy)
# PRODUCTION: Update CORS_ORIGINS env var
allow_origins = [o.strip() for o in config.CORS_ORIGINS.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_origin_regex=r"https://interview-bot-project-1(-[a-zA-Z0-9_-]+)?\.vercel\.app|https://[a-z0-9]+\.cloudfront\.net",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

uploads_dir = config.UPLOAD_DIR
uploads_dir.mkdir(exist_ok=True, parents=True)
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
    return {
        "status": "ok",
        "message": "Token tracking disabled"
    }
