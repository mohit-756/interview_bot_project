# PROJECT_OVERVIEW.md

## 1. Project Summary

- This is an **AI-powered interview platform** that helps HR teams screen resumes, shortlist candidates, schedule interviews, run technical interviews, and review results.
- It combines **resume screening**, **AI-based question generation**, **live interview flow**, **answer evaluation**, and **proctoring support** in one system.
- Main goal: **reduce manual hiring effort** and make the interview pipeline more structured, faster, and easier to review.

## 2. Tech Stack

### Frontend
- **React 19**
- **Vite**
- **React Router**
- **Axios**
- UI helper libraries like **lucide-react**, **clsx**, **tailwind-merge**

### Backend
- **FastAPI**
- **Python**
- **SQLAlchemy ORM**
- **Pydantic** for request validation
- **Starlette session middleware** for session-cookie auth

### Database
- **SQLite** by default (`app.db` / local DB)
- Schema handled through SQLAlchemy models plus startup backfill logic in `main.py`

### AI / LLM Usage
- **Groq API** for:
  - JD skill extraction
  - answer evaluation
  - transcription / Whisper support
- Local deterministic logic for:
  - resume scoring
  - question fallback generation
  - answer rubric scoring when LLM is unavailable
- Resume/JD analysis logic is organized in `ai_engine/phase1`, `phase2`, and `phase3`

## 3. High-Level Workflow

### End-to-end flow
- **HR creates JD**
  - HR uploads or creates a job description
  - JD skills and weights are stored
- **Candidate uploads resume**
  - Resume file is uploaded to backend storage
  - Resume text is extracted
- **Resume screening happens**
  - Resume is matched against JD
  - Skills, education, academics, and similarity are scored
  - Candidate is shortlisted or rejected
- **Interview is scheduled**
  - Shortlisted candidate selects an interview date
  - Interview link is generated and email can be sent
- **Questions are generated**
  - Resume + JD are used to create an interview question bank
  - Questions are stored in the result/interview context
- **Interview runs**
  - Candidate starts interview session
  - Questions are served one by one
  - Candidate submits answers by text or transcription
- **Evaluation happens**
  - Answers are scored locally and/or with LLM help
  - HR can review answers, scores, and proctoring data
  - HR finalizes selected/rejected decision

## 4. Backend Structure

### `routes/`
- Contains all API endpoints
- Split by domain:
  - `routes/auth/` → login, signup, profile, password, health
  - `routes/candidate/` → dashboard, JD selection, resume upload, practice kit
  - `routes/hr/` → JD management, candidate management, interview review
  - `routes/interview/` → start interview, submit answers, transcription, evaluation, proctoring runtime
- `routes/api_routes.py` combines all route groups under `/api`

### `services/`
- Contains reusable business helpers
- Examples:
  - `services/llm/client.py` → Groq-based AI calls
  - `services/practice.py` → practice question kit
  - `services/resume_advice.py` → resume advice generation
  - `services/hr_dashboard.py` → HR dashboard aggregation
  - `services/jd_sync.py` → syncs JD config and legacy job records

### `models.py`
- Contains SQLAlchemy database models
- Main tables/entities:
  - `Candidate`
  - `HR`
  - `JobDescription`
  - `JobDescriptionConfig`
  - `Result`
  - `InterviewSession`
  - `InterviewQuestion`
  - `InterviewAnswer`
  - `ProctorEvent`

## 5. Key APIs (IMPORTANT)

### `/api/auth/*`
- `POST /api/auth/signup`
  - Register candidate or HR user
- `POST /api/auth/login`
  - Login and create session
- `POST /api/auth/logout`
  - Clear session
- `GET /api/auth/me`
  - Return logged-in user info
- `PUT /api/auth/profile`
  - Update display name/company name
- `POST /api/auth/change-password`
  - Change password after verifying current password
- `GET /api/health/groq`
  - Check whether Groq services are reachable

### `/api/hr/*`
- `POST /api/hr/jds`
  - Create JD config
- `GET /api/hr/jds`
  - List HR-owned JDs
- `PUT /api/hr/jds/{jd_id}`
  - Update JD settings like weights, score cutoff, question count
- `POST /api/hr/upload-jd`
  - Upload JD file and extract initial skills
- `POST /api/hr/confirm-jd`
  - Confirm JD and score candidates against it
- `POST /api/hr/update-skill-weights`
  - Update JD skill weights and recalculate scores
- `GET /api/hr/dashboard`
  - HR dashboard with jobs, shortlisted candidates, analytics
- `GET /api/hr/candidates`
  - Candidate manager list
- `GET /api/hr/candidates/{candidate_uid}`
  - Candidate detail page
- `POST /api/hr/candidate/{candidate_id}/generate-questions`
  - Generate interview questions for a candidate
- `GET /api/hr/interviews`
  - List interview sessions
- `GET /api/hr/interviews/{interview_id}`
  - View interview detail, answers, and events
- `POST /api/hr/interviews/{interview_id}/finalize`
  - Final HR decision and score
- `POST /api/hr/interviews/{interview_id}/re-evaluate`
  - Re-trigger AI evaluation

### `/api/candidate/*`
- `GET /api/candidate/dashboard`
  - Candidate dashboard summary
- `GET /api/candidate/jds`
  - List active JDs
- `POST /api/candidate/select-jd`
  - Candidate chooses target JD
- `POST /api/candidate/upload-resume`
  - Upload resume, score it, and prepare question bank
- `GET /api/candidate/skill-match/{job_id}`
  - View matched and missing skills
- `POST /api/candidate/select-interview-date`
  - Schedule interview date
- `GET /api/candidate/practice-kit`
  - Generate practice questions

### `/api/interview/*`
- `POST /api/interview/start`
  - Start interview session and return first question
- `POST /api/interview/answer`
  - Submit one answer and return next question
- `POST /api/interview/transcribe`
  - Convert recorded audio to text
- `POST /api/interview/{session_id}/evaluate`
  - Evaluate answers after interview
- `POST /proctor/frame`
  - Upload webcam frame for proctoring checks
- `POST /api/interview/{token}/event`
  - Store interview-related events

## 6. Question Generation Logic

- Main logic is in `ai_engine/phase2/question_builder.py`
- The system reads:
  - resume text
  - JD title
  - JD skill weights
- It extracts structured project information such as:
  - project name
  - summary
  - tech stack
  - notable features
  - implementation details
  - candidate contribution
- It then builds questions in two ways:
  - **LLM path** → uses Groq API with strong prompt instructions
  - **deterministic fallback** → uses local templates and structured project data
- The logic prefers:
  - real project names
  - JD-relevant skills
  - implementation/depth-based questions instead of generic textbook questions
- If LLM fails or no API key is available:
  - fallback question generation still works
  - question format stays consistent

## 7. Interview Flow (VERY IMPORTANT)

### How interview starts
- Candidate hits `POST /api/interview/start`
- Backend checks:
  - candidate session
  - result availability
  - consent/proctoring readiness
- If no active interview session exists:
  - new `InterviewSession` row is created
- First question is loaded from the stored question bank

### How questions are stored
- Question bank is generated during resume upload / interview preparation
- Questions are stored in `Result.interview_questions`
- During runtime, each served question is inserted into `InterviewQuestion`
- Runtime question metadata includes:
  - text
  - topic
  - difficulty
  - question type
  - focus skill
  - project name
  - reference answer

### How answers are submitted
- Candidate submits to `POST /api/interview/answer`
- Backend validates:
  - `session_id`
  - `question_id`
  - question belongs to current session
  - question is not already answered
- Then it:
  - stores/updates `InterviewAnswer`
  - updates matching `InterviewQuestion`
  - computes local summary and score
  - reduces remaining time
  - returns next question if available

### When interview is marked completed
- Interview is completed when:
  - no more valid questions remain, or
  - max question count is reached, or
  - total remaining time becomes 0
- Then backend sets:
  - `session.status = "completed"`
  - `session.llm_eval_status = "pending"`

## 8. Problems Faced (IMPORTANT FOR INTERVIEW)

### Question generation issues
- Problem:
  - questions were too generic
  - used wording like “main project” instead of actual project names
- Fix:
  - extracted structured project data from resume
  - forced question generation to use real project names and stack
  - improved LLM prompt and deterministic fallback

### API 401 issues
- Problem:
  - session-based auth can fail if cookie/session is missing
- Fix:
  - consistent session middleware usage
  - role-based guards in route dependencies
  - `/api/auth/me` and health endpoints help debug auth state

### API 500 issues
- Problem:
  - interview answer flow crashed when question bank got exhausted
- Fix:
  - runtime was updated to handle exhausted bank safely
  - instead of throwing 500, interview now completes cleanly

### Session bugs
- Problem:
  - mismatch between question generation output and runtime expectations
  - repeated answer submission could create race conditions
- Fix:
  - runtime checks question/session ownership carefully
  - already-answered cases are handled better
  - next-question generation now fails gracefully

### Data consistency issues
- Problem:
  - HR decision data was mixed into JSON blobs
- Fix:
  - moved HR review data into dedicated database columns
  - reduced silent overwrite/data-loss risk

## 9. Improvements (for discussion)

- Better AI question quality with richer resume parsing
- More intelligent follow-up questions based on previous answer quality
- Stronger answer scoring with hybrid rubric + LLM ranking
- Better project extraction for messy resumes
- Better proctoring analytics and dashboard visuals
- Async background jobs for heavy AI operations
- PostgreSQL + Redis for production scale
- Docker-based deployment
- Role-based audit logs and admin monitoring
- Exportable interview reports as PDF

## 10. How to Run Project

### Backend
- Create environment and install dependencies:
  - `pip install -r requirements.txt`
- Run backend:
  - `python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000`

### Frontend
- Move to frontend folder:
  - `cd interview-frontend`
- Install dependencies:
  - `npm install`
- Run frontend:
  - `npm run dev`

## Interview-Ready Short Explanation

- I built an **AI-based interview platform** for HR and candidates.
- HR can create JDs, screen candidates, generate technical interview questions, run interviews, and review results.
- The backend is in **FastAPI**, frontend is in **React**, and AI is used for **skill extraction, question generation, transcription, and answer evaluation**.
- One key part I worked on was improving **resume-based question generation** and fixing **runtime interview flow bugs** like question-bank exhaustion and answer submission failures.
