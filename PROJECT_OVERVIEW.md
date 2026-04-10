# PROJECT_OVERVIEW.md

## 1. Project Summary

- This is an **AI-powered interview platform** that helps HR teams screen resumes, shortlist candidates, schedule interviews, run technical interviews, and review results.
- It combines **resume screening**, **AI-based question generation**, **live interview flow**, **answer evaluation**, and **proctoring support** in one system.
- Main goal: **reduce manual hiring effort** and make the interview pipeline more structured, faster, and easier to review.

## 2. Tech Stack

### Frontend
- **React 19** with Vite
- **React Router** for navigation
- **Axios** for API calls
- UI helpers: **lucide-react**, **clsx**, **tailwind-merge**
- **Tailwind CSS** for styling

### Backend
- **FastAPI** (Python)
- **SQLAlchemy ORM**
- **Pydantic** for request validation
- **Starlette** session middleware for auth
- **PostgreSQL** (default) / SQLite (optional)

### AI / LLM
- **Cerebras** (primary) or Groq/OpenAI for:
  - JD skill extraction
  - Answer evaluation (LLM)
  - Transcription (needs API key)
- **Sentence Transformers** for semantic similarity
- Local deterministic logic for:
  - Resume scoring fallback
  - Answer rubric scoring
- Resume/JD analysis in `ai_engine/phase1`, `phase2`, `phase3`

---

## 3. High-Level Workflow

### End-to-end flow
```
HR creates JD → Candidate uploads resume → Resume scored → Interview scheduled 
→ Questions generated → Interview runs → Answers evaluated → HR reviews & decides
```

1. **HR creates JD**
   - HR uploads or creates job description
   - JD skills and weights are stored
   - Custom scoring weights can be set per JD

2. **Candidate uploads resume**
   - Resume file uploaded to backend storage
   - Resume text extracted (PDF/DOCX/TXT)
   - Resume scored against JD (AI + rules)

3. **Resume screening**
   - Resume matched against JD
   - Skills, education, experience, similarity scored
   - Candidate shortlisted or rejected

4. **Interview scheduled**
   - Shortlisted candidate selects interview date
   - Interview link generated

5. **Questions generated**
   - Resume + JD used to create question bank
   - Questions stored in result/interview context

6. **Interview runs**
   - Candidate starts interview session
   - Questions served one by one
   - Text or voice answers submitted

7. **Evaluation happens**
   - Answers scored locally and/or with LLM
   - Final weighted score calculated
   - HR reviews and finalizes decision

---

## 4. Backend Structure

### `routes/`
- `routes/auth/` → Login, signup, profile, password, health
- `routes/candidate/` → Dashboard, JD selection, resume upload, practice
- `routes/hr/` → JD management, candidate management, interview review
- `routes/interview/` → Start, answer, transcription, evaluation, proctoring
- `routes/api_routes.py` → Combines all under `/api`

### `services/`
- `services/llm/client.py` → LLM API calls
- `services/scoring.py` → Weighted scoring logic
- `services/practice.py` → Practice question kit
- `services/hr_dashboard.py` → Dashboard aggregation

### `ai_engine/phase1/`
- `scoring.py` → Resume & answer scoring
- `matching.py` → Semantic matching, extraction
- `question_builder.py` → Question generation

### `models.py`
- Candidate, HR, JobDescription, Result
- InterviewSession, InterviewQuestion, InterviewAnswer
- ProctorEvent

---

## 5. Key APIs

### `/api/auth/*`
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/signup` | POST | Register candidate or HR |
| `/auth/login` | POST | Login and create session |
| `/auth/logout` | POST | Clear session |
| `/auth/me` | GET | Get current user |
| `/auth/profile` | PUT | Update profile |
| `/auth/change-password` | POST | Change password |
| `/auth/forgot-password` | POST | Request password reset |
| `/auth/reset-password` | POST | Reset with token |

### `/api/hr/*`
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/hr/dashboard` | GET | HR dashboard metrics |
| `/hr/jds` | GET/POST | List/Create JDs |
| `/hr/jds/:jd_id` | GET/PUT | JD details/Update |
| `/hr/candidates` | GET | List candidates |
| `/hr/candidates/:uid` | GET | Candidate detail |
| `/hr/candidates/compare` | POST | Compare candidates |
| `/hr/interviews` | GET | List interviews |
| `/hr/interviews/:id` | GET | Interview detail |
| `/hr/interviews/:id/finalize` | POST | HR final decision |
| `/hr/interviews/:id/re-evaluate` | POST | Re-run LLM evaluation |
| `/hr/proctoring/:session_id` | GET | Proctoring timeline |

### `/api/candidate/*`
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/candidate/dashboard` | GET | Candidate dashboard |
| `/candidate/jds` | GET | List active JDs |
| `/candidate/select-jd` | POST | Select target JD |
| `/candidate/upload-resume` | POST | Upload & score resume |
| `/candidate/select-interview-date` | POST | Schedule interview |
| `/candidate/practice-kit` | GET | Practice questions |

### `/api/interview/*`
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/interview/:result_id/access` | GET | Check access |
| `/interview/start` | POST | Start session |
| `/interview/answer` | POST | Submit answer |
| `/interview/transcribe` | POST | Audio to text |
| `/interview/:session_id/evaluate` | POST | Run LLM evaluation |
| `/proctor/frame` | POST | Upload webcam frame |

---

## 6. Scoring System (Complete)

### Phase 1: Resume Scoring (0-100)
| Component | Weight | Source |
|-----------|--------|--------|
| Skill Match | 50% | JD skills found in resume |
| Semantic | 15% | AI (sentence-transformers) |
| Experience | 15% | Years detected vs required |
| Education | 10% | Bachelor/Master/PhD match |
| Academic | 5% | Percentage threshold |
| Quality | 5% | Resume structure |

### Phase 2: Answer Scoring (Per Answer: 0-100)
| Dimension | Weight | Description |
|-----------|--------|-------------|
| Relevance | 40% | Q&A overlap + JD skills |
| Completeness | 25% | Word count + action verbs |
| Clarity | 20% | Vocabulary diversity |
| Time Fit | 15% | Time management |

### Phase 3: LLM Evaluation
- Batch evaluates all answers using LLM
- Falls back to local scoring if unavailable

### Phase 4: Final Weighted Score (0-100)
**Default:**
```
final = resume*0.35 + skills*0.25 + interview*0.25 + communication*0.15
```

**Custom weights** can be set per JD via `score_weights_json`

### Recommendations
| Score | Recommendation |
|-------|----------------|
| ≥80 | Strong Hire |
| ≥65 | Hire |
| ≥50 | Weak |
| <50 | Reject |

---

## 7. Question Generation Logic

- **Location**: `ai_engine/phase2/question_builder.py`
- Reads: resume text, JD title, JD skill weights
- Extracts project info: name, summary, tech stack, features
- **Two paths**:
  - LLM path → uses Cerebras/Groq API
  - Deterministic fallback → local templates
- Prefers real project names and JD-relevant skills

---

## 8. Interview Flow

### How interview starts
1. Candidate hits `POST /api/interview/start`
2. Backend validates session, result, consent
3. Creates `InterviewSession` if none exists
4. Returns first question from stored bank

### Questions stored
- Generated during resume upload
- Stored in `Result.interview_questions`
- Runtime questions in `InterviewQuestion`

### Answer submission
1. Candidate submits to `POST /api/interview/answer`
2. Validates session, question ownership
3. Stores `InterviewAnswer`, updates `InterviewQuestion`
4. Computes local score, returns next question

### Interview completion
- When: no questions left OR max reached OR time = 0
- Sets: `session.status = "completed"`, `llm_eval_status = "pending"`

---

## 9. Database Models

### Core Tables
| Model | Purpose |
|-------|---------|
| Candidate | Job seeker users |
| HR | Recruiter users |
| JobDescription | Job postings with skills/weights |
| Result | Application state & scores |
| InterviewSession | Interview instance |
| InterviewQuestion | Questions in session |
| InterviewAnswer | Candidate answers |
| ProctorEvent | Webcam/screen events |

### Score Storage
- `Result.score` → Resume screening score
- `Result.final_score` → Final weighted score
- `Result.explanation` → Resume scorecard JSON
- `Result.score_breakdown_json` → Full breakdown
- `Result.recommendation` → "Hire"/"Reject"

---

## 10. Features & Improvements Made

### Recent Improvements
1. **Configurable JD weights** - Custom scoring weights per JD
2. **LLM resume parsing** - Experience/education detection via LLM
3. **LLM answer scoring** - Better evaluation using AI
4. **Candidate page optimization** - More concise UI
5. **Database column** - Added `score_weights_json` column

### Known Limitations
- **Microphone transcription** - Needs `GROQ_API_KEY` or `OPENAI_API_KEY`
- **Frontend lint warnings** - Pre-existing unused variables (cosmetic)

---

## 11. How to Run

### Backend
```bash
cd interview_bot_project_1-main
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend
```bash
cd interview-frontend
npm install
npm run dev
```

### Environment Variables (.env)
```
LLM_PROVIDER=cerebras
LLM_API_KEY=your_key
DATABASE_URL=postgresql://...
```

---

## 12. Interview-Ready Short Explanation

> I built an **AI-powered interview platform** for HR and candidates. HR creates job descriptions, candidates upload resumes which get scored against the JD using AI. Shortlisted candidates schedule interviews where AI generates personalized technical questions based on their resume. During the interview, answers are evaluated locally and with LLM. HR then reviews all scores, proctoring data, and makes hiring decisions. The backend is FastAPI, frontend is React, and AI is used for skill extraction, question generation, transcription, and answer evaluation.

---

*Last Updated: April 2026*