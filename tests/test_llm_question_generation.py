from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.llm_question_generator import (
    LLM_QUESTION_SYSTEM_PROMPT,
    build_structured_question_input,
    generate_llm_questions,
)
from services.question_generation import build_question_bundle


class _FakeMessage:
    def __init__(self, content: str):
        self.content = content


class _FakeChoice:
    def __init__(self, content: str):
        self.message = _FakeMessage(content)


class _FakeResponse:
    def __init__(self, content: str):
        self.choices = [_FakeChoice(content)]


class _FakeCompletions:
    def __init__(self, content: str):
        self._content = content

    def create(self, **kwargs):
        return _FakeResponse(self._content)


class _FakeChat:
    def __init__(self, content: str):
        self.completions = _FakeCompletions(content)


class _FakeClient:
    def __init__(self, content: str):
        self.chat = _FakeChat(content)


def test_generate_llm_questions_postprocesses_duplicates_and_noise(monkeypatch):
    fake_json = """
    {
      "questions": [
        {
          "text": "Please introduce yourself briefly and highlight the project or work that best matches this backend role?",
          "category": "intro",
          "focus_skill": null,
          "project_name": null,
          "intent": "Assess background fit and communication.",
          "reference_answer": "A strong answer should connect experience, strongest project, impact, and motivation.",
          "difficulty": "easy",
          "priority_source": "baseline",
          "rationale": "Opens with a resume-aware summary prompt."
        },
        {
          "text": "Walk me through the FastAPI service you built for the issue tracker and the trade-offs you handled around auth, logging, and SQLite?",
          "category": "deep_dive",
          "focus_skill": "FastAPI",
          "project_name": "Issue tracker API using FastAPI and SQLite with auth and logging",
          "intent": "Assess practical backend implementation depth.",
          "reference_answer": "A strong answer should explain architecture, endpoints, auth flow, persistence trade-offs, failure handling, and lessons learned.",
          "difficulty": "medium",
          "priority_source": "jd_resume_overlap",
          "rationale": "Direct overlap between JD and resume project."
        },
        {
          "text": "Walk me through the FastAPI service you built for the issue tracker and the trade-offs you handled around auth, logging, and SQLite?",
          "category": "deep_dive",
          "focus_skill": "FastAPI",
          "project_name": "Issue tracker API using FastAPI and SQLite with auth and logging",
          "intent": "Duplicate that should be removed.",
          "reference_answer": "duplicate",
          "difficulty": "medium",
          "priority_source": "jd_resume_overlap",
          "rationale": "duplicate"
        },
        {
          "text": "How did you debug SQL issues in production-like scenarios, and what signals helped you isolate the root cause quickly?",
          "category": "deep_dive",
          "focus_skill": "SQL",
          "project_name": null,
          "intent": "Assess debugging depth.",
          "reference_answer": "A strong answer should cover reproduction, observability, narrowing hypotheses, validating fixes, and preventing recurrence.",
          "difficulty": "medium",
          "priority_source": "jd_resume_overlap",
          "rationale": "Resume explicitly mentions debugging SQL issues."
        },
        {
          "text": "In the issue tracker API project, what did you own personally, how did you validate correctness, and what would you improve if usage grew 10x?",
          "category": "project",
          "focus_skill": null,
          "project_name": "Issue tracker API using FastAPI and SQLite with auth and logging",
          "intent": "Assess ownership and scaling judgment.",
          "reference_answer": "A strong answer should explain ownership boundaries, testing/validation, constraints, and concrete improvements for scale.",
          "difficulty": "medium",
          "priority_source": "recent_project",
          "rationale": "Best resume project for the role."
        },
        {
          "text": "For this backend engineer role, if you had to add Docker-based deployment to a service like yours, how would you approach packaging, configuration, and local verification?",
          "category": "architecture_or_design",
          "focus_skill": "Docker",
          "project_name": null,
          "intent": "Assess approach to a JD skill that is not strongly evidenced in the resume.",
          "reference_answer": "A strong answer should explain containerization steps, environment handling, image/runtime choices, and practical local validation.",
          "difficulty": "medium",
          "priority_source": "jd_gap_probe",
          "rationale": "JD asks for Docker but resume evidence is weak."
        },
        {
          "text": "Tell me about a time you had to adapt when requirements or priorities changed midway while shipping a backend fix or feature?",
          "category": "behavioral",
          "focus_skill": null,
          "project_name": null,
          "intent": "Assess adaptability.",
          "reference_answer": "A strong answer should describe the change, decision process, communication, execution changes, and outcome.",
          "difficulty": "easy",
          "priority_source": "resume_strength",
          "rationale": "Fits junior backend profile with delivery pressure."
        },
        {
          "text": "Python?",
          "category": "deep_dive",
          "focus_skill": "Python",
          "project_name": null,
          "intent": "too weak",
          "reference_answer": "too weak",
          "difficulty": "easy",
          "priority_source": "jd_resume_overlap",
          "rationale": "too short"
        }
      ]
    }
    """
    monkeypatch.setattr("services.llm_question_generator._get_client", lambda: _FakeClient(fake_json))
    monkeypatch.setattr("services.llm_question_generator._llm_model", lambda: "fake-model")

    result = generate_llm_questions(
        jd_text="Backend Engineer role requiring Python, FastAPI, SQL, Docker.",
        resume_text="""
        Junior software engineer with 1+ years of experience building backend APIs and fixing production bugs.
        Skills: Python, FastAPI, SQL, Git.
        Projects: Issue tracker API using FastAPI and SQLite with auth and logging.
        Experience: Built REST APIs in Python, debugged SQL issues, and shipped bug fixes with mentor guidance.
        """,
        question_count=6,
        jd_title="Backend Engineer",
        jd_skill_scores={"Python": 10, "FastAPI": 9, "SQL": 8, "Docker": 6},
    )

    questions = result["questions"]
    assert len(questions) == 6
    assert questions[0]["category"] == "intro"
    assert len({q["text"] for q in questions}) == 6
    assert any(q["category"] == "architecture" for q in questions)
    assert any(q["category"] == "behavioral" for q in questions)
    assert all(len(q["text"]) > 20 for q in questions)
    assert result["system_prompt"] == LLM_QUESTION_SYSTEM_PROMPT


def test_build_question_bundle_falls_back_to_dynamic_planner(monkeypatch):
    def _boom(*args, **kwargs):
        raise RuntimeError("groq temporarily unavailable")

    monkeypatch.setattr("services.llm_question_generator.generate_llm_questions", _boom)

    bundle = build_question_bundle(
        resume_text="""
        Solution architect with 10+ years of experience designing distributed cloud systems.
        Skills: AWS, Kafka, Python, Microservices.
        Projects: Event driven payments platform migration across regions with Kafka and microservices.
        Experience: Led architecture for distributed services and modernization programs.
        """,
        jd_title="Solution Architect",
        jd_skill_scores={"AWS": 10, "Kafka": 9, "Microservices": 10, "System Design": 9},
        question_count=8,
    )

    assert bundle["meta"]["fallback_used"] is True
    assert bundle["meta"]["generation_mode"] == "fallback_dynamic_plan"
    assert len(bundle["questions"]) == 8
    assert bundle["questions"][0]["category"] == "intro"
    assert any(q["category"] == "architecture" for q in bundle["questions"])


def test_structured_input_is_dynamic_and_role_aware():
    structured = build_structured_question_input(
        resume_text="""
        Practice head with 15+ years of experience in delivery leadership, stakeholder management, mentoring leaders, and scaling engineering teams.
        Skills: Delivery Management, Cloud, Strategy.
        Projects: Global platform transformation for multiple enterprise clients.
        Experience: Owned roadmap, stakeholder alignment, team scaling, hiring, governance, and delivery outcomes across accounts.
        Certifications: AWS Certified Solutions Architect.
        """,
        jd_title="Practice Head - Digital Engineering",
        jd_skill_scores={"Delivery Management": 10, "Stakeholder Management": 9, "Cloud": 7, "Pega": 5},
    )

    assert structured.role == "Practice Head - Digital Engineering"
    assert structured.seniority in {"practice_head", "manager", "lead"}
    assert structured.experience_level in {"executive", "staff_plus"}
    assert "Delivery Management" in structured.resume_skills
    assert "Cloud" in structured.overlap_skills
    assert "Pega" in structured.jd_only_skills
    assert structured.resume_projects
