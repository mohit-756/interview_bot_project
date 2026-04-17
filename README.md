# AI Interview Platform

**End-to-end AI-powered interview workflow with FastAPI backend, React 19 + Vite frontend, and provider-based LLM integration (Gemini default, Ollama optional).**

- 🔐 Session-cookie auth for candidate and HR users
- 📊 Deterministic resume scoring (v2) against HR-managed JDs with academic cutoff validation
- 💡 AI resume advice and practice-kit generation from uploaded resumes
- ⏱️ Timed interview sessions with adaptive follow-up questions
- 📹 Webcam proctoring with OpenCV frame analysis, lightning-fast cloud speech-to-text (Groq Whisper API), and HR review/finalization
- 🤖 LLM-powered answer scoring (Gemini) with unbreakable emergency local fallback rubric
- ✅ Dedicated HR decision columns (no more JSON blob conflicts)
- 🛡️ Extremely robust LLM fallbacks ensuring demo/uptime functionality regardless of API status
- 🗄️ Resume text persisted in PostgreSQL — survives server restarts on ephemeral platforms (Render, Heroku)

---

## Current Architecture

### Backend

- **Entrypoint**: `main.py`
- **API Router**: `routes/api_routes.py`
- **Route Groups**:
   - `routes/auth/sessions.py` — signup, login, logout, profile updates, password changes, LLM provider health check
  - `routes/candidate/workflow.py` — dashboard, JD selection, resume upload, practice kit
  - `routes/hr/management.py` — JD CRUD, candidate search, skill generation, bulk scoring
  - `routes/hr/interview_review.py` — interview detail, finalization, **re-evaluation endpoint**
  - `routes/interview/runtime.py` — session start, answer submission, transcription, proctoring events
  - `routes/interview/evaluation.py` — post-interview LLM scoring with graceful fallback
- **ORM + DB**: `models.py`, `database.py`
- **Default DB**: `sqlite:///./app.db` (Configured via DATABASE_URL)
- **File Storage**: `uploads/` (resumes, proctoring snapshots, exports)
  - **⚠️ Ephemeral on Render/Heroku**: Files in `uploads/` are wiped on every server restart
  - **Resume text**: Extracted and stored in `candidates.resume_text` (PostgreSQL) — survives restarts
  - **Proctoring images**: Stored as `uploads/proctoring/{session_id}/{timestamp}.jpg` — lost on restart (see Known Issues)

### Frontend

- **Active App**: `interview-frontend/`
- **Stack**: React 19 + Vite
- **API Client**: Vite proxy default to `/api`
- **Main Flows**: login/signup, candidate dashboard, HR dashboard, candidate manager, interview review, pre-check, live interview

### AI / Workflow Modules

- **Phase 1** (Resume Screening):
  - `ai_engine/phase1/matching.py` — text extraction, semantic matching, skill extraction
  - `ai_engine/phase1/scoring.py` — resume scorecard v2, answer rubric scoring
  - Logic: Semantic similarity (30%), skill match (25%), experience (15%), education (10%), academic % (5%), resume quality (5%)
  
- **Phase 2** (Question Generation):
   - `ai_engine/phase2/question_plan.py` — dynamic question planning and slot prioritization
   - `ai_engine/phase2/llm_question_generator.py` — LLM-first generation with deterministic fallback
   - `services/question_generation.py` — runtime-facing public question bundle entrypoint
  - Projects extracted from resume + weighted skill distribution
  - Ratio: 80% technical (project-based) + 20% behavioral
  
- **Phase 3** (Interview Runtime):
  - `ai_engine/phase3/question_flow.py` — adaptive question selection + dynamic time allocation
  - Stages: intro (easy), project (hard), HR (medium)

- **Services**:
   - `services/llm/client.py` — provider-based LLM integration (Gemini/Ollama)
  - `services/practice.py` — practice kit generation
  - `services/resume_advice.py` — deterministic resume improvement suggestions
  - `services/jd_sync.py` — sync legacy jobs and JD config rows
  - `services/hr_dashboard.py` — analytics aggregation
  - `services/local_exports.py` — backup archive creation
   - `utils/stt_whisper.py` — lightning-fast audio transcription via Groq API
   - `utils/proctoring_cv.py` — OpenCV logic wrapped in robust exception handlers

---

## Key Features

### ✨ What's New / Recently Fixed

#### Resume Scoring (Phase 1)
- ✅ **Scorecard v2**: Stable 0-100 final score with component breakdown
- ✅ **Academic Cutoff**: Validates 10th, 12th, engineering % independently
- ✅ **Smart Education Matching**: Bachelor/Master/PhD rank-based validation
- ✅ **Weighted Skill Matching**: Skills ranked by JD importance
- ✅ Screening bands: `strong_shortlist` (≥80), `review_shortlist` (65-79), `reject` (<65)
- ✅ **Resume Text Persistence**: Extracted text stored in `candidates.resume_text` (PostgreSQL). Interview access reads from DB — never re-reads from ephemeral filesystem
- ✅ **Upload Validation**: Returns HTTP 400 if resume text extraction fails — no silent empty uploads
- ✅ **Practice Kit Generation**: Generates timed practice question bundles from resume + JD for candidate preparation

#### HR Dashboard
- ✅ **Analytics Charts**: Pipeline visualization with candidate shortlist/review/reject distribution
- ✅ **Score Matrix**: Interactive ranking table sortable by score, date, status
- ✅ **Candidate Detail View**: Comprehensive candidate profile with resume, scores, interview history
- ✅ **Bulk Actions**: Multi-select candidates for bulk shortlisting/rejection
- ✅ **Interview Calendar**: Interactive modal for scheduling candidate interviews

#### Interview Workflow (Phase 3)
- ✅ **Indestructible AI Generation**: The LLM question generator and LLM answer evaluator have extreme, unbreakable fallbacks ensuring your interview flow cannot crash even if the LLM provider times out or responds with garbage JSON.
- ✅ **Groq Whisper STT**: The backend now perfectly connects to the Groq API to deliver instantaneous speech-to-text transcriptions of candidate audio answers.
- ✅ **LLM Answer Scoring**: provider-based (Gemini/Ollama) with local emergency fallback (never "Pending forever")
- ✅ **llm_eval_status Tracking**: `pending` → `running` → `completed` / `failed`
- ✅ **Graceful CV Failure**: OpenCV proctoring errors are swallowed securely to prevent backend 500 crashes during demonstrations.
- ✅ **Integrated Proctoring**: Real-time webcam analysis with face detection, motion tracking, shoulder visibility
- ✅ **Audio Recording & TTS**: Browser-based audio recording with Web Speech API TTS for question reading
- ✅ **Session Persistence**: Interview session state persisted in database for resume capability

#### HR Decision Management
- ✅ **Dedicated Columns**: `hr_decision`, `hr_final_score`, `hr_behavioral_score`, `hr_communication_score`, `hr_notes`, `hr_red_flags`
- ✅ **No JSON Conflicts**: Prevents silent data loss from concurrent explanation edits

#### Authentication
- ✅ **New Endpoints**:
  - `PUT /api/auth/profile` — update display name
  - `POST /api/auth/change-password` — change password with verification
   - `GET /api/health/groq` / `GET /api/health/llm` — provider-aware LLM health route

#### Proctoring
- ✅ **OpenCV Frame Analysis**: Face detection, motion tracking, shoulder visibility
- ✅ **Baseline Capture**: Prevents re-capture on reconnect
- ✅ **Pause on Warnings**: Optional enforcement (PROCTOR_PAUSE_ENABLED env var)
- ✅ **Periodic Snapshots**: Configurable interval for suspicious events only

---

## Operations & Setup

### Requirements

- Python 3.10+
- Node.js LTS
- npm
- **Gemini API Key** (default LLM)
- **Groq API Key** (required for ultra-fast Whisper speech-to-text)

### Environment Variables

Create a `.env` file in the project root:

```env
# Database
DATABASE_URL=sqlite:///./app.db

# Authentication
SECRET_KEY=replace_with_a_long_random_secret_key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# LLM runtime (default: gemini)
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key_here

# Groq API (required for STT Whisper Transcription)
GROQ_API_KEY=your_groq_api_key_here
GROQ_WHISPER_MODEL=whisper-large-v3-turbo

# Ollama API (only required when LLM_PROVIDER=ollama)
OLLAMA_MODEL=gemma3:4b
OLLAMA_CHAT_URL=http://localhost:11434/api/chat

# Email (required for interview scheduling emails)
EMAIL_ADDRESS=your_email@gmail.com
EMAIL_PASSWORD=your_app_password

# Frontend
VITE_API_BASE_URL=http://43.205.95.22:8000
PROCTOR_PAUSE_ENABLED=false
```

**Notes**:
- For Gmail: Use [App Password](https://support.google.com/accounts/answer/185833), not your main password
- Groq key (for transcription): Get from [console.groq.com](https://console.groq.com)
- Gemini key (for intelligence): Get from [Google AI Studio](https://aistudio.google.com/)

---

## Quick Start

### 1. Backend Setup

Open a terminal in the root directory:

```bash
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 2. Frontend Setup

Open *another* terminal or navigate to the frontend directory:

```bash
cd interview-frontend
npm install
```

### 3. Run Backend

In your backend terminal (with `.venv` activated):

```bash
uvicorn main:app --reload
```

Health check: `http://127.0.0.1:8000/health`

### 4. Run Frontend

In your frontend terminal (`interview-frontend` folder):

```bash
npm run dev
```

Frontend URL: `http://localhost:5173`

---

## API Surface

**Main router**: `routes/api_routes.py`

### Health & System
- `GET /health` — basic health check
- `GET /api/health/llm` — provider-aware LLM health status endpoint

### Candidate Endpoints
- `GET /api/candidate/dashboard` — candidate overview with current result
- `GET /api/candidate/jds` — list active JDs
- `POST /api/candidate/select-jd` — select target JD
- `POST /api/candidate/upload-resume` — upload + auto-score
- `POST /api/candidate/select-interview-date` — schedule interview
- `GET /api/candidate/practice-kit` — timed practice questions
- `GET /api/candidate/results` — candidate's screening results history
- `GET /api/candidate/results/:id` — detailed result view with scores breakdown

### HR Endpoints
- `POST /api/hr/jds` / `GET /api/hr/jds` — CRUD JD configurations
- `GET /api/hr/candidates` — paginated search with filters
- `GET /api/hr/dashboard` — shortlist pipeline + analytics
- `GET /api/hr/candidates/:id` — detailed candidate profile with scores & interview history
- `POST /api/hr/candidates/:id/shortlist` — shortlist candidate
- `POST /api/hr/candidates/:id/reject` — reject candidate
- `POST /api/hr/upload-jd` — upload JD file → extract skills
- `GET /api/hr/interviews/{interview_id}` — session detail + answer scores + proctoring timeline
- `POST /api/hr/interviews/{interview_id}/re-evaluate` — retry LLM scoring
- `GET /api/hr/proctoring/{session_id}` — proctoring event timeline + snapshots

### Interview Runtime
- `POST /api/interview/start` — start new session + first question
- `POST /api/interview/answer` — submit answer → next question
- `POST /api/interview/transcribe` — send audio → get Groq transcript
- `POST /proctor/frame` — upload webcam frame → OpenCV proctoring analysis

---

## Workflow Summary

### Phase 1: Resume Screening
1. HR uploads JD → AI extracts skills + weights
2. Candidate uploads resume → AI scores resume (v2):
   - Semantic similarity, skill match, experience, education, academic %, resume quality
3. **Result**: Screening band (strong/review/reject) + explanations

### Phase 2: Question Generation
1. HR triggers question generation for candidate
2. Gemini extracts projects from resume + selects top 3
3. Generates **80% technical (project-based)** and **20% behavioral (HR)** questions
4. **Resiliency**: If Gemini times out, the backend injects an unbreakable emergency question block so the candidate is never stuck.

### Phase 3: Interview Runtime
1. **Pre-Check**: Consent → baseline webcam capture → frame quality check
2. **Per Question**:
   - Audio answer recorded and instantly transcribed using **Groq Whisper** API.
   - Local rubric score computed immediately.
3. **Session End**: Gemini evaluates all answers in the background.
4. **Resiliency**: If evaluation fails, an emergency local fallback score is applied preventing a 500 server crash or indefinite pending state.

---

## Interview Flow (Detailed)

### The Complete Interview Routing Flow

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                         INTERVIEW FLOW DIAGRAM                               │
└─────────────────────────────────────────────────────────────────────────────────────────────┘

1. CANDIDATE DASHBOARD
   └── "Start Interview" button → /interview/{resultId} (PreCheck)

2. PRE-CHECK (/interview/:resultId)
   ├── Check: Camera, Microphone, Internet, Voice Recorder
   ├── User clicks "Start Interview"
   ├── POST /api/interview/{resultId}/access  → Validates access state
   │   - Must be shortlisted (result.shortlisted = true)
   │   - Must have interview_date scheduled
   │   - Must not have completed session
   │   - Generates question bank if needed
   ├── On success: Store consent in sessionStorage
   │   sessionStorage.setItem(`interview-consent:${resultId}`, "true")
   └── Navigate → /interview/{resultId}/live

3. LIVE INTERVIEW (/interview/:resultId/live)
   ├── Component mounts → useEffect triggers loadSession()
   ├── READ consent from sessionStorage
   ├── POST /api/interview/start
   │   {
   │     result_id: Number(resultId),
   │     consent_given: (from sessionStorage)
   │   }
   ├── BACKEND:
   │   a. Validate candidate owns the result
   │   b. Check interview_access_state (shortlisted, scheduled, not completed)
   │   c. Create InterviewSession (if not exists)
   │   d. Materialize questions from result.interview_questions
   │   e. Return first question
   └── Frontend: Display question, start TTS, begin recording
```

### Interview Access Rules

Located in `routes/common.py` - function `interview_access_state()`:

| Condition | Result |
|----------|--------|
| `result.shortlisted` is False | Locked: "shortlist_required" |
| `result.interview_date` is empty | Locked: "schedule_required" |
| Existing session status = "in_progress" | Ready (can resume) |
| Existing session ended/completed/selected/rejected | Locked: "already_completed" |
| Otherwise | Ready to start |

### Backend Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/interview/{result_id}/access` | Pre-validation + question bank prep |
| `POST /api/interview/start` | Start/create session, return first question |
| `POST /api/interview/answer` | Submit answer, get next question |
| `GET /api/interview/{result_id}` | Legacy redirect to SPA |

### Common Interview Issues

#### Issue: "Interview questions are not ready yet"
**Cause**: Question bank not generated or failed generation
**Fix**: 
1. Ensure JD has `question_count` set (default 8)
2. Check that resume was uploaded and scored
3. Verify `result.interview_questions` has data

#### Issue: "Only shortlisted candidates can start interviews"  
**Cause**: Candidate not shortlisted by HR
**Fix**: HR must shortlist candidate in HR dashboard

#### Issue: "Schedule your interview before starting"
**Cause**: No interview_date set
**Fix**: Candidate must select interview date first via `/api/candidate/select-interview-date`

#### Issue: "Interview session is already in progress"
**Cause**: Resume functionality - session exists
**Fix**: Session auto-completes after all questions answered or time runs out

### Interview Entry URL Format

Generated in `routes/common.py` - function `interview_entry_url()`:

```python
# CloudFront/Vercel deployments:
return f"{base_url}/#/interview/{int(result_id)}"

# Other deployments:  
return f"{base_url}/interview/{int(result_id)}"
```

Frontend routes in `App.jsx`:
- `/interview/:resultId` → PreCheck component
- `/interview/:resultId/live` → Interview component  
- `/interview/:resultId/completed` → Completed component

---

## Operational Notes
- **Startup Migrations**: `main.py` runs `ensure_schema()` to backfill columns on existing SQLite DBs (non-breaking).
- **Proctoring Integrity**: Webcam snapshots are only saved for suspicious events (no-face, high-motion, face-mismatch) to save disk space. Max 50 frames per session.
- **Fail-Safes Built For Demos**: All brittle endpoints (Transcription, LLM Question Generation, Post-Interview Scoring, OpenCV Frame Analysis) are heavily guarded with robust try-catch blocks and hardcoded fallbacks to ensure the interview can always progress seamlessly.
- **Resume Persistence**: `candidate.resume_text` is the source of truth for interview question generation. The system reads from the database, not the filesystem, ensuring compatibility with ephemeral hosting (Render, Heroku).
- **Proctoring Image Backfill**: If `candidate.resume_text` is empty during interview access, the system attempts a one-time file read and backfills the DB. This handles legacy records that predate the fix.

## Known Issues

- **Proctoring images lost on restart**: Images in `uploads/proctoring/` are wiped on Render server restarts. The `proctor_events.image_path` column still holds the paths, but the `.jpg` files are gone. Fix: migrate to cloud storage (S3, Cloudflare R2, or Render Persistent Disk).
#   Q u a d r a n t _ B o t  
 #   Q u a d r a n t _ B o t  
 