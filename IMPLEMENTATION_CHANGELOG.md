# Implementation Changelog

## Project
AI Interview Bot

## Repo
`C:\Users\mohit\Downloads\phone\all\interview_bot_project_1-main`

## Scope of This Upgrade
This changelog summarizes the ATS-style upgrade implemented directly in this repo without changing the repo architecture.

### Kept as-is
- FastAPI backend
- SQLite + SQLAlchemy
- React + Vite frontend in `interview-frontend/`
- Existing auth/session flow
- Existing JD/job flow
- Existing interview runtime structure

### Main upgrade goals completed
- ATS pipeline stages
- Stage history tracking
- Structured resume parsing storage
- Centralized scoring/ranking support
- Per-answer interview evaluation
- Interview-level summary
- HR ranking and comparison endpoints
- Visible frontend upgrades across HR and candidate pages

---

# 1. Repo Architecture Summary

## Frontend
- React + Vite
- Main app shell: `interview-frontend/src/App.jsx`
- Main pages under: `interview-frontend/src/pages/`

## Backend
- FastAPI
- Main entry: `main.py`
- API routers under: `routes/`

## Database
- SQLite
- ORM: SQLAlchemy
- Safe backfill/init handled in `main.py -> ensure_schema()`

---

# 2. Backend / DB Changes

## 2.1 ATS pipeline stages added
Central ATS stages introduced:
- `applied`
- `screening`
- `shortlisted`
- `interview_scheduled`
- `interview_completed`
- `selected`
- `rejected`

## 2.2 New/updated DB fields

### `candidates`
Added:
- `resume_text`
- `parsed_resume_json`

Purpose:
- store raw extracted resume text
- store structured parsed resume sections for ATS views and scoring

### `results`
Added:
- `stage`
- `stage_updated_at`
- `final_score`
- `score_breakdown_json`
- `recommendation`

Purpose:
- persist ATS pipeline state
- persist weighted score and recommendation
- support HR ranking, candidate status, analytics, and comparison

### `interview_answers`
Added:
- `evaluation_json`

Purpose:
- store structured per-answer ATS evaluation

### `interview_sessions`
Added:
- `evaluation_summary_json`

Purpose:
- store interview-level summary for candidate completed page and HR review

### New table
#### `application_stage_history`
Fields:
- `result_id`
- `stage`
- `note`
- `changed_by_role`
- `changed_by_user_id`
- `created_at`

Purpose:
- stage movement audit trail
- visible stage timeline in HR candidate detail

## 2.3 Safe backfill behavior
Implemented in `main.py -> ensure_schema()`.

Backfill logic:
- if `hr_decision` is selected/rejected -> result stage uses that
- if `interview_date` exists -> `interview_scheduled`
- if shortlisted -> `shortlisted`
- if score exists -> `screening`
- otherwise -> `applied`

This keeps old local DBs runnable without requiring a manual migration tool.

---

# 3. New Services Added

## `services/pipeline.py`
Shared ATS stage helper layer.

Provides:
- stage normalization
- UI-friendly stage metadata
- `record_stage_change(...)`

Used for:
- candidate screening
- interview flow updates
- HR manual stage updates
- final HR interview decisions

## `services/resume_parser.py`
Structured resume parsing service.

Extracts/stores:
- full name
- email
- phone
- summary
- skills
- education
- projects
- experience
- certifications

Used for:
- candidate dashboard quick summary
- HR candidate detail page
- ATS matching/ranking support

## `services/scoring.py`
Central ATS scoring/evaluation service.

Provides:
- weighted application scoring
- recommendation generation
- per-answer structured evaluation
- interview-level summary builder

Scoring dimensions:
- resume/JD match
- skills match
- interview performance
- communication/behavior
- final weighted score

Recommendations:
- Strong Hire
- Hire
- Weak
- Reject

---

# 4. Active Backend Flow Integration

## 4.1 Candidate upload / screening
Integrated in `routes/common.py`.

Now on screening:
- resume text is extracted and stored
- parsed structured resume is stored
- ATS score breakdown is generated
- final weighted score is stored
- recommendation is stored
- ATS stage is set (`screening` or `shortlisted`)
- stage history is written

## 4.2 Interview answer save
Integrated in `routes/interview/runtime.py`.

Now on each answer save:
- structured answer evaluation is generated
- `InterviewAnswer.evaluation_json` is stored

Per-answer evaluation includes:
- relevance
- technical correctness
- clarity
- confidence/communication
- strengths
- weaknesses
- improvement suggestion

## 4.3 Interview completion
Integrated in `routes/interview/runtime.py`.

Now on interview completion:
- interview-level summary is generated
- `InterviewSession.evaluation_summary_json` is stored
- answered count and total question count are stored in summary
- final weighted score is recalculated
- recommendation is updated
- ATS stage becomes `interview_completed`
- stage history is written

## 4.4 HR endpoints added/updated
Integrated in `routes/hr/management.py` and `routes/hr/interview_review.py`.

### Added
- `POST /api/hr/results/{result_id}/stage`
- `GET /api/hr/candidates/ranked`
- `POST /api/hr/candidates/compare`

### Upgraded
- HR interview detail payload now includes:
  - ATS stage
  - interview summary
  - per-answer evaluation
- HR final interview decision now updates:
  - stage
  - score breakdown
  - recommendation
  - final weighted score

---

# 5. Frontend / Visible UI Changes

## 5.1 HR Dashboard
Updated file:
- `interview-frontend/src/pages/HRDashboardPage.jsx`

Visible upgrades:
- total candidates
- shortlisted count
- rejected count
- completed interviews
- average score
- selection rate
- top ranked candidates widget
- recommendation highlight section
- ATS pipeline section
- top skills summary

## 5.2 HR Candidates List
Updated file:
- `interview-frontend/src/pages/HRCandidatesPage.jsx`

Visible upgrades:
- search bar
- stage filter
- JD filter
- score range filter
- sorting
- rank column
- stage badge
- final score
- recommendation tag
- quick detail action
- stage move action
- compare selection checkbox
- compare navigation

## 5.3 HR Candidate Detail
Updated file:
- `interview-frontend/src/pages/HRCandidateDetailPage.jsx`

Visible upgrades:
- candidate summary hero
- current stage badge
- final score
- recommendation summary
- ATS score breakdown
- parsed resume sections
- stage history timeline
- latest interview summary
- stage move action
- compare navigation

## 5.4 HR Interview Detail
Updated file:
- `interview-frontend/src/pages/HRInterviewDetailPage.jsx`

Visible upgrades:
- overall interview summary
- recommendation
- suspicious event summary
- each question + answer review
- per-answer ATS evaluation
- strengths / weaknesses / suggestion
- final HR decision panel

## 5.5 Candidate Dashboard
Updated file:
- `interview-frontend/src/pages/CandidateDashboardPage.jsx`

Visible upgrades:
- current ATS stage/status
- final score
- recommendation
- selected JD summary
- ATS score breakdown
- parsed resume quick summary
- interview status
- next-step guidance

## 5.6 Completed Page
Updated file:
- `interview-frontend/src/pages/Completed.jsx`

Visible upgrades:
- completion confirmation
- answered count
- interview score
- communication score
- strengths
- improvement areas
- recommendation
- next-step guidance

## 5.7 Candidate Comparison
Updated file:
- `interview-frontend/src/pages/CandidateComparisonPage.jsx`

Visible upgrades:
- select 2–3 candidates
- compare final score
- compare recommendation
- compare stage
- compare score breakdown
- compare parsed skills
- compare interview summary

## 5.8 Frontend data shaping
Updated file:
- `interview-frontend/src/services/api.js`

Changes:
- frontend normalization now maps ATS fields cleanly
- compare/stage-update/session-summary endpoints added
- richer result/application/candidate data is exposed to UI pages

## 5.9 Shared UI styling
Updated file:
- `interview-frontend/src/App.css`

Added:
- stage timeline support styles
- comparison layout support styles

---

# 6. Files Changed

## Backend / DB
- `main.py`
- `models.py`
- `routes/common.py`
- `routes/candidate/workflow.py`
- `routes/hr/interview_review.py`
- `routes/hr/management.py`
- `routes/interview/runtime.py`
- `routes/schemas.py`
- `services/hr_dashboard.py`
- `services/pipeline.py` (new)
- `services/resume_parser.py` (new)
- `services/scoring.py` (new)

## Frontend
- `interview-frontend/src/App.css`
- `interview-frontend/src/services/api.js`
- `interview-frontend/src/pages/HRDashboardPage.jsx`
- `interview-frontend/src/pages/HRCandidatesPage.jsx`
- `interview-frontend/src/pages/HRCandidateDetailPage.jsx`
- `interview-frontend/src/pages/HRInterviewDetailPage.jsx`
- `interview-frontend/src/pages/CandidateDashboardPage.jsx`
- `interview-frontend/src/pages/Completed.jsx`
- `interview-frontend/src/pages/CandidateComparisonPage.jsx`

---

# 7. Validation Completed

## Backend compile
Ran:
```powershell
python -m py_compile main.py models.py services\pipeline.py services\resume_parser.py services\scoring.py services\hr_dashboard.py routes\common.py routes\candidate\workflow.py routes\hr\management.py routes\hr\interview_review.py routes\interview\runtime.py routes\schemas.py
```

Result:
- Passed

## Frontend build
Ran:
```powershell
cd interview-frontend
npm run build
```

Result:
- Passed

Note:
- Vite emitted a large bundle warning only; build still succeeded.

---

# 8. How to Run

## Backend
From repo root:
```powershell
cd C:\Users\mohit\Downloads\phone\all\interview_bot_project_1-main
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

## Frontend
```powershell
cd C:\Users\mohit\Downloads\phone\all\interview_bot_project_1-main\interview-frontend
npm install
npm run dev
```

---

# 9. How to Test

## Candidate flow
1. Login as candidate
2. Open candidate dashboard
3. Select JD
4. Upload resume
5. Verify:
   - stage badge visible
   - score breakdown visible
   - recommendation visible
   - parsed resume quick summary visible
6. If shortlisted, schedule interview
7. Complete interview
8. Verify completed page shows:
   - answered count
   - interview score
   - communication score
   - strengths
   - weaknesses
   - recommendation

## HR flow
1. Login as HR
2. Open HR dashboard
3. Verify:
   - ATS summary cards
   - ranked candidates
   - pipeline counts
   - recommendation highlights
4. Open HR candidates list
5. Verify:
   - search/filter/sort
   - rank
   - stage badge
   - final score
   - recommendation
   - compare selection
6. Open HR candidate detail
7. Verify:
   - stage timeline
   - parsed resume
   - ATS score breakdown
   - interview summary
8. Open HR interview detail
9. Verify:
   - interview summary
   - per-answer evaluation
   - suspicious event summary
   - final decision form
10. Open compare page
11. Verify side-by-side comparison works

---

# 10. Final Status

| Feature | Status | Visible in UI | Notes |
|---|---|---:|---|
| ATS stages | Done | Yes | Full pipeline added |
| Stage history | Done | Yes | HR candidate detail timeline |
| Structured resume storage | Done | Yes | Candidate + HR visible |
| Final weighted score | Done | Yes | Candidate + HR visible |
| Score breakdown JSON | Done | Yes | Candidate + HR visible |
| Recommendation | Done | Yes | Candidate + HR + compare |
| Per-answer evaluation | Done | Yes | HR interview detail |
| Interview summary | Done | Yes | Completed page + HR review |
| Ranked candidates | Done | Yes | HR dashboard |
| Compare candidates | Done | Yes | Comparison page |
| Stage update endpoint/UI | Done | Yes | HR candidates + detail |
| Frontend build | Passed | N/A | Validated |
| Backend compile | Passed | N/A | Validated |

---

# 11. Notes
- All work summarized here was applied only in the correct repo:
  `C:\Users\mohit\Downloads\phone\all\interview_bot_project_1-main`
- No architecture switch was performed.
- No project-wide overwrite was done.
- Changes were applied incrementally and validated phase by phase.
