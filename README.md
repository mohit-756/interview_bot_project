# AI Interview Platform

An end-to-end interview workflow with a FastAPI backend and a React + Vite frontend.

- Session-cookie auth for candidate and HR users
- Deterministic resume scoring against HR-managed JDs
- Resume advice and practice-kit generation from uploaded resumes
- Timed interview sessions with adaptive follow-up questions
- Webcam proctoring, local speech-to-text, and HR review/finalization tools

## Current Architecture

### Backend

- Entrypoint: `main.py`
- API router: `routes/api_routes.py`
- Route groups:
  - `routes/auth/sessions.py`
  - `routes/candidate/workflow.py`
  - `routes/hr/management.py`
  - `routes/hr/interview_review.py`
  - `routes/interview/runtime.py`
- ORM and DB wiring: `models.py`, `database.py`
- Default local database: `sqlite:///./interview_bot.db`
- Uploaded files and proctoring snapshots are stored under `uploads/`

### Frontend

- Active app: `interview-frontend/`
- Stack: React 19 + Vite
- API client defaults to `/api` and uses the Vite proxy in `interview-frontend/vite.config.js`
- Main flows include login/signup, candidate dashboard, HR dashboard, candidate manager, interview review, pre-check, and live interview pages

### AI / workflow modules

- `ai_engine/phase1/`: resume parsing, matching, and scoring
- `ai_engine/phase2/`: JD-aware interview question generation
- `ai_engine/phase3/`: interview runtime and adaptive question flow
- `services/`: dashboard analytics, practice kit, resume advice, local export helpers

Note: the maintained frontend is `interview-frontend/`. The root `frontend/` folder is not the active application.

## Feature Overview

### Candidate flow

- Sign up, log in, and persist session via cookies
- View active JDs and choose a target JD
- Upload a resume and get:
  - an explainable resume score
  - matched and missing skills
  - resume rewrite guidance
- Schedule an interview after shortlist and receive an emailed interview link
- Open a practice kit generated from the selected JD and uploaded resume
- Complete a timed interview with:
  - candidate-authenticated start flow
  - per-question time limits
  - local speech transcription
  - webcam pre-check and proctoring events

### HR flow

- Sign up and manage company-specific JD inventory
- Upload JD files, confirm extracted skill weights, and tune shortlist cutoff/question counts
- Create, list, fetch, and update canonical JD configs through `/api/hr/jds`
- View dashboard analytics and shortlist pipeline for owned jobs
- Search, filter, inspect, and delete candidate records
- Generate candidate-specific interview question bundles
- Review interview answers, answer score breakdowns, and proctoring timelines
- Finalize interview outcomes and download a local backup archive

## Requirements

- Python 3.10+
- Node.js LTS
- npm

## Environment Variables

Create a `.env` file in the project root if you want to override defaults:

```env
# Optional. If omitted, the backend falls back to sqlite:///./interview_bot.db
DATABASE_URL=sqlite:///./interview_bot.db

# Recommended for any non-dev usage
SECRET_KEY=replace_with_a_long_random_secret

# Whisper STT configuration
WHISPER_MODEL_SIZE=small
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
WHISPER_BEAM_SIZE=1
WHISPER_VAD_FILTER=true
WHISPER_MODEL_PATH=
WHISPER_IGNORE_PROXY=false

# Required only if you want interview emails to be sent
EMAIL_ADDRESS=
EMAIL_PASSWORD=

# Used when composing interview links in emails and redirects
FRONTEND_URL=http://localhost:5173
```

Optional frontend override:

```env
VITE_API_BASE_URL=/api
```

Notes:

- For Gmail, `EMAIL_PASSWORD` must be an App Password.
- The first transcription request can trigger a Whisper model download.
- If model download is blocked, point `WHISPER_MODEL_PATH` to a local Faster Whisper model directory.

## Quick Start

### 1. Backend setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 2. Frontend setup

```powershell
cd interview-frontend
npm install
cd ..
```

### 3. Run the backend

```powershell
.\.venv\Scripts\Activate.ps1
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Health check: `http://127.0.0.1:8000/health`

### 4. Run the frontend

```powershell
cd interview-frontend
npm run dev
```

Frontend URL: `http://localhost:5173`

## API Surface

Main router: `routes/api_routes.py`

### Health and auth

- `GET /health`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Candidate

- `GET /api/candidate/dashboard`
- `GET /api/candidate/jds`
- `POST /api/candidate/select-jd`
- `GET /api/candidate/skill-match/{job_id}`
- `POST /api/candidate/upload-resume`
- `POST /api/candidate/select-interview-date`
- `GET /api/candidate/practice-kit`

### HR

- `POST /api/hr/jds`
- `GET /api/hr/jds`
- `GET /api/hr/jds/{jd_id}`
- `PUT /api/hr/jds/{jd_id}`
- `GET /api/hr/dashboard`
- `GET /api/hr/candidates`
- `GET /api/hr/candidates/{candidate_uid}`
- `GET /api/hr/candidates/{candidate_uid}/skill-gap`
- `POST /api/hr/candidates/{candidate_uid}/delete`
- `POST /api/hr/candidate/{candidate_id}/generate-questions`
- `POST /api/hr/upload-jd`
- `POST /api/hr/confirm-jd`
- `POST /api/hr/update-skill-weights`
- `GET /api/hr/local-backup`
- `POST /api/hr/interview-score`
- `GET /api/hr/interviews`
- `GET /api/hr/interviews/{interview_id}`
- `POST /api/hr/interviews/{interview_id}/finalize`
- `GET /api/hr/proctoring/{session_id}`

### Interview runtime

- `GET /api/interview/{result_id}` redirects legacy links into the SPA flow
- `POST /api/interview/start`
- `POST /api/interview/answer`
- `POST /api/interview/transcribe`
- `POST /api/interview/{token}/event`
- `POST /api/proctor/frame`

## Project Structure

```text
.
|-- ai_engine/
|   |-- phase1/
|   |-- phase2/
|   `-- phase3/
|-- docs/
|   `-- PHASE_MAP.md
|-- interview-frontend/
|   |-- src/
|   `-- vite.config.js
|-- routes/
|   |-- auth/
|   |-- candidate/
|   |-- hr/
|   |-- interview/
|   |-- api_routes.py
|   |-- common.py
|   |-- dependencies.py
|   `-- schemas.py
|-- services/
|-- tests/
|-- utils/
|-- auth.py
|-- database.py
|-- main.py
|-- models.py
`-- requirements.txt
```

Phase-wise explanation map: `docs/PHASE_MAP.md`

## Tests

Backend test coverage currently lives under `tests/` and uses `unittest`.

```powershell
.\.venv\Scripts\Activate.ps1
python -m unittest discover -s tests -p "test_*.py"
```

Current tests cover:

- Phase 1 resume and answer scoring
- Resume upload and scoring flow
- Practice kit generation
- Interview start and answer submission
- HR dashboard and interview review payloads
- Candidate search, delete, and local backup export flows

## Operational Notes

- `main.py` performs a lightweight startup schema backfill for existing local SQLite databases.
- Authenticated APIs depend on the session cookie set by `/api/auth/login`.
- CORS is configured for `http://localhost:5173` and `http://127.0.0.1:5173`.
- The backend exposes `/uploads/*` so stored resumes and proctoring images can be reviewed locally.

## Troubleshooting

### `ECONNREFUSED 127.0.0.1:8000` from Vite

- The backend is not running or failed on startup.
- Restart the backend and re-check `http://127.0.0.1:8000/health`.

### Interview page cannot start or resume

- Make sure the candidate is logged in.
- Make sure the result exists and the backend is reachable.
- If the interview came from an email link, verify `FRONTEND_URL` points to the current frontend host.

### No interview email received

- Verify `EMAIL_ADDRESS` and `EMAIL_PASSWORD`.
- Use a Gmail App Password if you are sending through Gmail.
- Check spam or promotions folders.
