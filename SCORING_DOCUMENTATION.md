# Interview Bot - Complete Scoring System Documentation

## Table of Contents
1. [Overview](#overview)
2. [Phase 1: Resume Scoring](#phase-1-resume-scoring)
3. [Phase 2: Answer Scoring](#phase-2-answer-scoring)
4. [Phase 3: LLM Evaluation](#phase-3-llm-evaluation)
5. [Phase 4: Final Weighted Score](#phase-4-final-weighted-score)
6. [Scoring Weights Summary](#scoring-weights-summary)
7. [Recommendations](#recommendations)
8. [Database Storage](#database-storage)
9. [Key File Locations](#key-file-locations)

---

## Overview

The scoring system has **4 phases** that occur at different stages:

| Phase | When | What It Does |
|-------|------|--------------|
| Phase 1 | Resume Upload | Score resume against JD |
| Phase 2 | During Interview | Score each interview answer |
| Phase 3 | After Interview | AI-powered LLM evaluation |
| Phase 4 | Interview Complete | Combine all scores into final score |

---

## Phase 1: Resume Scoring

**When**: When candidate uploads resume and applies for a job

**Purpose**: Evaluate how well the candidate's resume matches the job requirements

### What Scores Are Calculated

| Component | Weight | Description |
|-----------|--------|-------------|
| **Weighted Skill Score** | 50% | How many required skills from JD are found in resume |
| **Semantic Score** | 15% | Semantic similarity between JD text and resume (AI-powered) |
| **Experience Score** | 15% | Detected years of experience vs required |
| **Education Score** | 10% | Education level match (Bachelor/Master/PhD) |
| **Academic Cutoff Score** | 5% | Whether academic percentage meets minimum |
| **Resume Quality Score** | 5% | Whether resume has proper sections |

### Formula
```
final_resume_score = (skill*0.50) + (semantic*0.15) + (experience*0.15) + (education*0.10) + (academic*0.05) + (quality*0.05)
```

### Screening Bands
| Score | Band | Action |
|-------|------|--------|
| ≥80 | Strong Shortlist | Direct shortlist |
| ≥65 | Review Shortlist | Manager review needed |
| <65 | Reject | Does not meet criteria |

### Storage Location
- `Result.score` - The final resume score
- `Result.explanation` - JSON containing all component scores

---

## Phase 2: Answer Scoring

**When**: During and after the interview - scores each answer as it's submitted

**Purpose**: Evaluate the quality of each answer during the interview

### What Scores Are Calculated (Per Answer)

| Dimension | Weight | Description |
|-----------|--------|-------------|
| **Relevance** | 40% | How well answer addresses question + mentions JD skills |
| **Completeness** | 25% | Word count + action words + numbers |
| **Clarity** | 20% | Vocabulary diversity + sentence structure |
| **Time Fit** | 15% | Time used vs allotted (40-95% = optimal) |

### Formula (Per Answer)
```
answer_score = (relevance*0.40) + (completeness*0.25) + (clarity*0.20) + (time_fit*0.15)
```

### After Interview Completion
The system calculates averages across all answers:
```
interview_score = average of all answer scores
communication_score = average of all confidence scores
```

### Storage Location
- `InterviewAnswer.evaluation_json` - Individual answer evaluation
- `InterviewSession.evaluation_summary_json` - Interview summary

---

## Phase 3: LLM Evaluation

**When**: Automatically after interview completes (background task)

**Purpose**: AI-powered evaluation using Large Language Model

### What It Does
- Uses configured LLM (Cerebras/Groq/OpenAI) to evaluate all answers
- Single API call evaluates ALL answers at once
- Falls back to local scoring if LLM fails

### LLM Evaluates
- **Relevance**: How well answer addresses the question
- **Correctness**: Technical accuracy
- **Completeness**: Depth and substance
- **Clarity**: How clear and structured
- **Confidence**: Communication confidence
- Plus: strengths, weaknesses, feedback

### Storage Location
- `InterviewQuestion.llm_score` - Question-level LLM score
- `InterviewQuestion.llm_feedback` - Question-level feedback
- `InterviewAnswer.llm_score` - Answer-level LLM score

---

## Phase 4: Final Weighted Score

**When**: After interview completion - combines all scores

**Purpose**: Calculate the final application score combining resume + interview + communication

### Default Weights
```
final_score = (resume*0.35) + (skills*0.25) + (interview*0.25) + (communication*0.15)
```

### Custom Weights (Per JD)
You can customize weights per job description using `score_weights_json`:
```json
{
  "resume": 0.40,
  "skills": 0.20,
  "interview": 0.30,
  "communication": 0.10
}
```

### Storage Location
- `Result.final_score` - Final weighted score
- `Result.score_breakdown_json` - Complete score breakdown
- `Result.recommendation` - Final recommendation

---

## Scoring Weights Summary

### Resume Scorecard (0-100)
| Component | Weight |
|------------|--------|
| Skill Match | 50% |
| Semantic Similarity | 15% |
| Experience | 15% |
| Education | 10% |
| Academic Cutoff | 5% |
| Resume Quality | 5% |

### Answer Scorecard (0-100)
| Dimension | Weight |
|-----------|--------|
| Relevance | 40% |
| Completeness | 25% |
| Clarity | 20% |
| Time Fit | 15% |

### Final Application Score (0-100)
| Component | Default Weight |
|-----------|----------------|
| Resume Score | 35% |
| Skills Match | 25% |
| Interview Score | 25% |
| Communication Score | 15% |

---

## Recommendations

Based on final score:

| Score | Recommendation |
|-------|----------------|
| ≥80 | Strong Hire |
| ≥65 | Hire |
| ≥50 | Weak |
| <50 | Reject |

---

## Database Storage

### Result Table
| Field | Description |
|-------|-------------|
| `score` | Resume screening score |
| `final_score` | Final weighted score |
| `explanation` | Resume scorecard JSON |
| `score_breakdown_json` | Full application breakdown |
| `recommendation` | "Strong Hire" / "Hire" / "Weak" / "Reject" |
| `shortlisted` | Boolean |

### InterviewSession Table
| Field | Description |
|-------|-------------|
| `evaluation_summary_json` | Interview summary |
| `llm_eval_status` | "pending" / "running" / "completed" |

### InterviewQuestion Table
| Field | Description |
|-------|-------------|
| `llm_score` | LLM evaluation score |
| `llm_feedback` | LLM feedback |
| `evaluation_json` | Full evaluation |

---

## Key File Locations

| File | Purpose | Key Lines |
|------|---------|------------|
| `ai_engine/phase1/scoring.py` | Resume & answer scoring | 301-418, 520-557 |
| `ai_engine/phase1/matching.py` | Semantic matching, extraction | 119-147, 225-244 |
| `routes/common.py` | Resume evaluation endpoint | 273-321 |
| `routes/interview/runtime.py` | Interview answer scoring | 2003-2041 |
| `routes/interview/evaluation.py` | LLM evaluation | 220-283 |
| `services/scoring.py` | Final weighted score | 160-196 |
| `models.py` | Score storage fields | 100-141 |

---

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CANDIDATE APPLIES FOR JOB                       │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 1: RESUME SCORING                                           │
│  • Extract resume text                                              │
│  • Score: skill(50%) + semantic(15%) + experience(15%) +          │
│          education(10%) + academic(5%) + quality(5%)               │
│  • Result: final_resume_score (0-100)                               │
│  • Store: Result.score, Result.explanation                          │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    CANDIDATE TAKES INTERVIEW                        │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 2: ANSWER SCORING                                            │
│  For EACH answer:                                                   │
│  • Score: relevance(40%) + completeness(25%) + clarity(20%) +      │
│          time_fit(15%)                                              │
│  After ALL answers:                                                  │
│  • interview_score = average of all answer scores                   │
│  • communication_score = average of all confidence scores            │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 3: LLM EVALUATION (Background)                              │
│  • Batch evaluate all answers using LLM                             │
│  • Store: question.llm_score, answer.llm_score                      │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 4: FINAL WEIGHTED SCORE                                     │
│  • final_score = resume(35%) + skills(25%) + interview(25%) +    │
│                   communication(15%)                               │
│  • recommendation = based on final_score                          │
│  • Store: Result.final_score, Result.score_breakdown_json          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Notes

- **Configurable**: Weights can be customized per JD
- **Fallback**: If LLM fails, uses local hardcoded scoring
- **LLM Experience/Education**: Can use LLM for better extraction (set `use_llm=True` in `compute_resume_scorecard`)
- **Microphone**: Transcription needs GROQ_API_KEY or OPENAI_API_KEY

---

*Generated: Interview Bot Project Documentation*