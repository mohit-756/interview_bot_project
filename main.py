"""FastAPI application entrypoint for Interview Bot backend."""
from __future__ import annotations
import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from starlette.middleware.sessions import SessionMiddleware
from database import SessionLocal, engine
from models import Base, Candidate
from routes.api_routes import api_router
from routes.common import ensure_candidate_profile

load_dotenv()
app = FastAPI(title="Interview Bot API", version="1.0.0")

# Keep startup table creation for local/dev environments.
Base.metadata.create_all(bind=engine)


def ensure_schema() -> None:
    """Backfill lightweight schema changes for existing local SQLite DBs."""

    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS job_descriptions (
                        id INTEGER PRIMARY KEY,
                        title VARCHAR(200) NOT NULL,
                        jd_text TEXT NOT NULL,
                        jd_dict_json JSON,
                        weights_json JSON,
                        qualify_score FLOAT NOT NULL DEFAULT 65,
                        min_academic_percent FLOAT NOT NULL DEFAULT 0,
                        total_questions INTEGER NOT NULL DEFAULT 8,
                        project_question_ratio FLOAT NOT NULL DEFAULT 0.8,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
            )
            rows = conn.execute(text("PRAGMA table_info(jobs)")).fetchall()
            columns = {row[1] for row in rows}
            if "jd_title" not in columns:
                conn.execute(text("ALTER TABLE jobs ADD COLUMN jd_title VARCHAR(150)"))
            if "cutoff_score" not in columns:
                conn.execute(text("ALTER TABLE jobs ADD COLUMN cutoff_score FLOAT DEFAULT 65 NOT NULL"))
            if "question_count" not in columns:
                conn.execute(text("ALTER TABLE jobs ADD COLUMN question_count INTEGER DEFAULT 8 NOT NULL"))

            # candidate identifiers
            rows = conn.execute(text("PRAGMA table_info(candidates)")).fetchall()
            candidate_cols = {row[1] for row in rows}
            if "candidate_uid" not in candidate_cols:
                conn.execute(text("ALTER TABLE candidates ADD COLUMN candidate_uid VARCHAR(32)"))
            if "created_at" not in candidate_cols:
                conn.execute(text("ALTER TABLE candidates ADD COLUMN created_at DATETIME"))
            if "selected_jd_id" not in candidate_cols:
                conn.execute(text("ALTER TABLE candidates ADD COLUMN selected_jd_id INTEGER"))
            if "questions_json" not in candidate_cols:
                conn.execute(text("ALTER TABLE candidates ADD COLUMN questions_json TEXT"))

            # application_id on results
            rows = conn.execute(text("PRAGMA table_info(results)")).fetchall()
            res_cols = {row[1] for row in rows}
            if "application_id" not in res_cols:
                conn.execute(text("ALTER TABLE results ADD COLUMN application_id VARCHAR(64)"))
            if "events_json" not in res_cols:
                conn.execute(text("ALTER TABLE results ADD COLUMN events_json TEXT"))

            # new columns on interview_questions_v2
            rows = conn.execute(text("PRAGMA table_info(interview_questions_v2)")).fetchall()
            q_cols = {row[1] for row in rows}
            if "answer_summary" not in q_cols:
                conn.execute(text("ALTER TABLE interview_questions_v2 ADD COLUMN answer_summary TEXT"))
            if "relevance_score" not in q_cols:
                conn.execute(text("ALTER TABLE interview_questions_v2 ADD COLUMN relevance_score FLOAT"))
            if "time_taken_seconds" not in q_cols:
                conn.execute(text("ALTER TABLE interview_questions_v2 ADD COLUMN time_taken_seconds INTEGER"))
            if "skipped" not in q_cols:
                conn.execute(text("ALTER TABLE interview_questions_v2 ADD COLUMN skipped BOOLEAN DEFAULT 0 NOT NULL"))
            if "answer_text" not in q_cols:
                conn.execute(text("ALTER TABLE interview_questions_v2 ADD COLUMN answer_text TEXT"))
            if "allotted_seconds" not in q_cols:
                conn.execute(
                    text("ALTER TABLE interview_questions_v2 ADD COLUMN allotted_seconds INTEGER DEFAULT 60 NOT NULL")
                )

            # new columns on interview_sessions
            rows = conn.execute(text("PRAGMA table_info(interview_sessions)")).fetchall()
            session_cols = {row[1] for row in rows}
            if "total_time_seconds" not in session_cols:
                conn.execute(
                    text("ALTER TABLE interview_sessions ADD COLUMN total_time_seconds INTEGER DEFAULT 1200 NOT NULL")
                )
            if "remaining_time_seconds" not in session_cols:
                conn.execute(
                    text(
                        "ALTER TABLE interview_sessions ADD COLUMN remaining_time_seconds INTEGER DEFAULT 1200 NOT NULL"
                    )
                )
            if "max_questions" not in session_cols:
                conn.execute(
                    text("ALTER TABLE interview_sessions ADD COLUMN max_questions INTEGER DEFAULT 8 NOT NULL")
                )
            if "baseline_face_signature" not in session_cols:
                conn.execute(text("ALTER TABLE interview_sessions ADD COLUMN baseline_face_signature TEXT"))
            if "baseline_face_captured_at" not in session_cols:
                conn.execute(text("ALTER TABLE interview_sessions ADD COLUMN baseline_face_captured_at DATETIME"))
            if "consent_given" not in session_cols:
                conn.execute(text("ALTER TABLE interview_sessions ADD COLUMN consent_given BOOLEAN DEFAULT 0 NOT NULL"))
            if "warning_count" not in session_cols:
                conn.execute(text("ALTER TABLE interview_sessions ADD COLUMN warning_count INTEGER DEFAULT 0 NOT NULL"))
            if "consecutive_violation_frames" not in session_cols:
                conn.execute(
                    text("ALTER TABLE interview_sessions ADD COLUMN consecutive_violation_frames INTEGER DEFAULT 0 NOT NULL")
                )
            if "paused_until" not in session_cols:
                conn.execute(text("ALTER TABLE interview_sessions ADD COLUMN paused_until DATETIME"))

            # Migrate legacy token-flow proctor events into unified proctor_events.
            legacy_table = conn.execute(
                text(
                    """
                    SELECT name
                    FROM sqlite_master
                    WHERE type = 'table' AND name = 'interview_proctor_events'
                    """
                )
            ).first()
            if legacy_table:
                conn.execute(
                    text(
                        """
                        INSERT INTO proctor_events (
                            session_id,
                            created_at,
                            event_type,
                            score,
                            meta_json,
                            image_path
                        )
                        SELECT
                            legacy.interview_id,
                            legacy.created_at,
                            legacy.event_type,
                            legacy.confidence,
                            '{"migrated_from":"interview_proctor_events"}',
                            CASE
                                WHEN legacy.snapshot_path LIKE 'uploads/%'
                                    THEN substr(legacy.snapshot_path, 9)
                                ELSE legacy.snapshot_path
                            END
                        FROM interview_proctor_events legacy
                        WHERE NOT EXISTS (
                            SELECT 1
                            FROM proctor_events current
                            WHERE current.session_id = legacy.interview_id
                                AND current.created_at = legacy.created_at
                                AND current.event_type = legacy.event_type
                                AND COALESCE(current.image_path, '') = COALESCE(
                                    CASE
                                        WHEN legacy.snapshot_path LIKE 'uploads/%'
                                            THEN substr(legacy.snapshot_path, 9)
                                        ELSE legacy.snapshot_path
                                    END,
                                    ''
                                )
                        )
                        """
                    )
                )
            conn.execute(text("UPDATE candidates SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"))
    except Exception:
        # Non-blocking schema migration best effort.
        return

    try:
        db = SessionLocal()
        try:
            candidates = (
                db.query(Candidate)
                .filter((Candidate.candidate_uid.is_(None)) | (Candidate.candidate_uid == "") | (Candidate.created_at.is_(None)))
                .all()
            )
            changed = False
            for candidate in candidates:
                changed = ensure_candidate_profile(candidate, db) or changed
            if changed:
                db.commit()
        finally:
            db.close()

        with engine.begin() as conn:
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ux_candidates_candidate_uid ON candidates(candidate_uid)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_candidates_created_at ON candidates(created_at)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_candidates_selected_jd_id ON candidates(selected_jd_id)"))
    except Exception:
        # Non-blocking schema migration best effort.
        pass


ensure_schema()

app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SECRET_KEY", "dev-session-secret-change-me"),
    same_site="lax",
    https_only=False,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

uploads_dir = Path("uploads")
uploads_dir.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")
app.include_router(api_router)
