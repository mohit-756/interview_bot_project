# AI Interview Platform
An intelligent interview bot platform that uses AI to conduct technical interviews, generate questions, and evaluate candidates.
## Tech Stack
- **Backend**: FastAPI (Python 3.10+)
- **Frontend**: React 19 + Vite + TailwindCSS
- **Database**: PostgreSQL (production) / SQLite (development)
- **AI/ML**: OpenAI GPT models, sentence transformers
- **Auth**: JWT with refresh tokens
## Project Structure
```
interview_bot_project_1-main/
├── main.py                    # FastAPI app entry point
├── database.py                # SQLAlchemy models & DB config
├── auth.py                    # Authentication logic
├── requirements.txt           # Python dependencies
│
├── routes/                    # API endpoints
│   ├── auth.py               # Login, register, sessions
│   ├── common.py            # Shared endpoints
│   ├── faq.py               # FAQ endpoints
│   ├── schemas.py           # Pydantic request/response models
│   ├── dependencies.py      # FastAPI dependencies
│   ├── candidate/           # Candidate-specific routes
│   │   └── workflow.py
│   ├── hr/                  # HR/admin routes
│   │   ├── management.py
│   │   └── interview_review.py
│   └── interview/           # Interview session routes
│       ├── runtime.py
│       └── evaluation.py
│
├── services/                 # Business logic
│   ├── llm/                 # LLM client wrapper
│   ├── auth/                # Auth utilities (JWT)
│   ├── pipeline.py          # Interview pipeline orchestration
│   ├── question_generation.py
│   ├── scoring.py          # Candidate evaluation
│   ├── resume_parser.py    # Resume parsing
│   ├── pdf_report.py       # Generate PDF reports
│   ├── rate_limit.py       # API rate limiting
│   └── hr_dashboard.py     # HR dashboard data
│
├── ai_engine/               # Core AI logic
│   ├── phase1/              # Resume matching & scoring
│   │   ├── matching.py
│   │   └── scoring.py
│   ├── phase2/              # Question generation
│   │   ├── question_generation.py
│   │   ├── question_plan.py
│   │   └── llm_question_generator.py
│   └── phase3/              # Runtime question flow
│       └── question_flow.py
│
├── utils/                   # Utility functions
│   ├── email_service.py    # Email sending
│   ├── s3_utils.py         # AWS S3 operations
│   ├── token_utils.py      # Token utilities
│   ├── stt_whisper.py      # Speech-to-text
│   └── proctoring_cv.py    # Face detection for proctoring
│
├── alembic/                # Database migrations
│   └── versions/
│
└── interview-frontend/    # React frontend app
    └── src/
        ├── pages/         # Page components
        ├── components/    # Reusable UI components
        ├── context/       # React context providers
        ├── hooks/         # Custom hooks
        ├── services/      # API calls
        └── utils/         # Frontend utilities
```
## Prerequisites
- Python 3.10+
- Node.js 18+
- PostgreSQL (or use SQLite for dev)
## Quick Start
### 1. Clone & Setup
```powershell
cd interview_bot_project_1-main
# Create virtual environment
python -m venv .venv
.venv\Scripts\Activate
# Install Python dependencies
pip install -r requirements.txt
```
### 2. Environment Variables
Create a `.env` file with these variables:
```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/interview_bot
# Or for SQLite: sqlite:///./app.db
# JWT Secrets
JWT_SECRET_KEY=your-secret-key-min-32-chars
JWT_REFRESH_SECRET_KEY=your-refresh-secret-key
# OpenAI
OPENAI_API_KEY=sk-...
# AWS S3 (for resume storage)
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
S3_BUCKET_NAME=your-bucket
# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email
SMTP_PASS=your-app-password
# Frontend URL (for email links)
FRONTEND_URL=http://localhost:5173
```
### 3. Start Backend
```powershell
# Run migrations
alembic upgrade head
# Start FastAPI server
uvicorn main:app --reload --port 8000
```
Backend runs at: `http://localhost:8000`
API docs: `http://localhost:8000/docs`
### 4. Start Frontend
```powershell
cd interview-frontend
npm install
npm run dev
```
Frontend runs at: `http://localhost:5173`
## How It Works
### Interview Flow
1. **Candidate Applies** - Uploads resume, fills basic info
2. **HR Reviews** - HR sees candidate, reviews resume, schedules interview
3. **Phase 1: Matching** - AI scores candidate based on JD vs resume
4. **Phase 2: Question Generation** - AI generates personalized questions from job description
5. **Phase 3: Interview** - Live session with dynamic follow-up questions
6. **Evaluation** - AI scores answers, generates report
### Key Features
- JWT authentication with refresh tokens
- Rate limiting on sensitive endpoints
- Resume parsing and scoring
- AI-generated technical questions
- Follow-up question logic based on answers
- Interview recording (optional)
- PDF report generation for HR
## API Base URLs
- Backend: `http://localhost:8000/api`
- Frontend proxy configured in `vite.config.js`
## Common Commands
```powershell
# Run tests
pytest
# Run specific test file
pytest tests/test_phase1_api.py -v
# Apply new migration
alembic revision --autogenerate -m "description"
alembic upgrade head
# Revert migration
alembic downgrade -1
```
## Troubleshooting
- **Import errors**: Make sure `.venv` is activated
- **Database connection**: Check DATABASE_URL in `.env`
- **LLM errors**: Verify OPENAI_API_KEY is set
- **CORS issues**: Backend runs on 8000, frontend on 5173
## License
