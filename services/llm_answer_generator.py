"""LLM answer generation grounded in resume and JD context."""
from __future__ import annotations

from services.llm.client import _get_client, _llm_model


ANSWER_SYSTEM_PROMPT = """You are helping generate a candidate-style interview answer.

Use this prompt intent exactly:
- Write a realistic first-person answer grounded in the candidate's resume and the JD.
- Mention concrete projects, technologies, constraints, and outcomes when supported by the resume.
- Structure the answer around problem, approach, decision, and outcome.
- Sound like a strong but believable candidate, not a textbook or recruiter.
- Do not invent wild achievements that are not reasonably supported by the resume/JD context.
- Keep the answer concise but substantive, typically 120-220 words unless the question demands shorter.
Return plain text only.
"""


def generate_answer(question: str, resume_text: str, jd_text: str) -> str:
    question = str(question or "").strip()
    if not question:
        return ""

    prompt = f"""Generate a candidate-style interview answer.

Question:
{question}

Resume:
{(resume_text or '').strip()[:7000]}

Job Description:
{(jd_text or '').strip()[:5000]}

Requirements:
- Answer in first person.
- Ground the answer in resume projects/experience/skills and the JD role.
- Mention concrete projects/tech where relevant.
- Include the problem, what I did, why I chose that approach, and the outcome/learning.
- If the question is about debugging, failure, trade-offs, architecture, scaling, or integration, answer that directly with concrete details.
- Do not output bullets, JSON, markdown headings, or meta commentary.
- Return only the final answer text.
"""
    response = _get_client().chat.completions.create(
        model=_llm_model(),
        messages=[
            {"role": "system", "content": ANSWER_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        temperature=0.35,
        max_tokens=500,
    )
    return str(response.choices[0].message.content or "").strip()
