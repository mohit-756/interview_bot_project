"""LLM client helpers used by interview generation and evaluation."""
from __future__ import annotations

import json
import logging
import os
import re
from functools import lru_cache
from types import SimpleNamespace
from typing import Any

import requests

OLLAMA_CHAT_URL = "http://localhost:11434/api/chat"
_DEFAULT_OLLAMA_MODEL = "qwen2.5-coder:3b"
_DEFAULT_OLLAMA_TIMEOUT_SECONDS = 90

logger = logging.getLogger(__name__)


def _clean_json(raw: str) -> str:
    return re.sub(r"```(?:json)?", "", raw or "").strip().strip("`")


@lru_cache(maxsize=1)
def _resolve_llm_config() -> dict[str, str]:
    provider = (os.getenv("LLM_PROVIDER") or "gemini").strip().lower()

    if provider == "gemini":
        model = os.getenv("LLM_MODEL", "gemini-2.5-flash").strip()
        api_key = os.getenv("GEMINI_API_KEY", "").strip()
    else:
        model = _DEFAULT_OLLAMA_MODEL
        api_key = ""

    return {
        "provider": provider,
        "api_key": api_key,
        "model": model,
        "ollama_url": OLLAMA_CHAT_URL,
    }


class _GeminiChatCompletionsAdapter:
    def __init__(self, *, model: str, api_key: str) -> None:
        self._model = model
        self._api_key = api_key

    def create(
        self,
        *,
        model: str | None = None,
        messages: list[dict[str, Any]],
        temperature: float = 0.2,
        max_tokens: int = 800,
        **_: Any,
    ) -> Any:
        chosen_model = (model or self._model).strip() or "gemini-2.5-flash"
        if not self._api_key:
            raise RuntimeError("Missing GEMINI_API_KEY. Please add GEMINI_API_KEY to your .env file.")

        text_prompt = ""
        for m in messages:
            text_prompt += m.get("content", "") + "\n"

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{chosen_model}:generateContent?key={self._api_key}"
        payload = {
            "contents": [{"parts": [{"text": text_prompt.strip()}]}],
            "generationConfig": {
                "temperature": float(temperature),
                "maxOutputTokens": int(max_tokens),
            }
        }
        
        response = requests.post(url, json=payload, timeout=90)
        try:
            response.raise_for_status()
        except Exception as e:
            logger.error("Gemini API Error: %s", response.text)
            raise

        data_dict: Any = response.json()
        if not isinstance(data_dict, dict):
            data_dict = {}
        try:
            candidates = data_dict.get("candidates")
            if isinstance(candidates, list) and candidates:
                content = candidates[0].get("content", {}).get("parts", [])[0].get("text", "")
            else:
                content = str(data_dict)
        except Exception:
            content = str(data_dict)

        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
        )


class _ChatCompletionsAdapter:
    def __init__(self, *, provider: str, model: str, api_key: str, ollama_url: str) -> None:
        self._provider = provider
        self._model = model
        self._api_key = api_key
        self._ollama_url = ollama_url

    def create(
        self,
        *,
        model: str | None = None,
        messages: list[dict[str, Any]],
        temperature: float = 0.2,
        max_tokens: int = 800,
        **_: Any,
    ) -> Any:
        chosen_model = (model or self._model).strip() or self._model

        if self._provider != "ollama":
            raise RuntimeError(
                f"Unsupported LLM_PROVIDER='{self._provider}'. Supported providers: gemini, ollama."
            )

        payload = {
            "model": chosen_model,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": float(temperature),
                "num_predict": int(max_tokens),
            },
        }
        response = requests.post(
            self._ollama_url,
            json=payload,
            timeout=_DEFAULT_OLLAMA_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        data = response.json() or {}
        content = str(((data.get("message") or {}).get("content") or "")).strip()

        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
        )


class _ChatAdapter:
    def __init__(self, completions: Any) -> None:
        self.completions = completions


class _LLMClientAdapter:
    def __init__(self, *, provider: str, model: str, api_key: str, ollama_url: str) -> None:
        if provider == "gemini":
            adapter = _GeminiChatCompletionsAdapter(model=model, api_key=api_key)
        else:
            adapter = _ChatCompletionsAdapter(
                provider=provider,
                model=model,
                api_key=api_key,
                ollama_url=ollama_url,
            )
        self.chat = _ChatAdapter(adapter)


@lru_cache(maxsize=1)
def _get_client() -> _LLMClientAdapter:
    config = _resolve_llm_config()
    provider = config["provider"]
    api_key = config["api_key"]

    if provider == "ollama" and not config["model"]:
        raise RuntimeError("Missing Ollama model. Set OLLAMA_MODEL (for example: qwen2.5-coder:3b).")

    logger.info("llm_client_init provider=%s model=%s", provider, config["model"])
    return _LLMClientAdapter(
        provider=provider,
        model=config["model"],
        api_key=api_key,
        ollama_url=config["ollama_url"],
    )


def _llm_provider() -> str:
    return _resolve_llm_config()["provider"]


def _llm_model() -> str:
    return _resolve_llm_config()["model"]


def extract_skills(jd_text: str) -> dict[str, int]:
    if not jd_text or not jd_text.strip():
        return {}
    prompt = (
        "You are a technical recruiter. Read the job description below and extract all required technical skills.\n\n"
        "Return ONLY a valid JSON object where keys are lowercase skill names and values are integer importance weights from 1 to 10.\n\n"
        f"Job Description:\n{jd_text[:4000]}"
    )  # type: ignore
    try:
        response = _get_client().chat.completions.create(
            model=_llm_model(),
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=600,
        )
        data = json.loads(_clean_json(response.choices[0].message.content or ""))
        return {str(k).strip().lower(): max(1, min(10, int(v))) for k, v in data.items() if str(k).strip()}
    except Exception as exc:
        logger.error("extract_skills_failed provider=%s model=%s error=%s", _llm_provider(), _llm_model(), exc)
        return {}


def evaluate_answer_detailed(*, question: str, answer: str, section: str = "project", reference_answer: str | None = None, intent: str | None = None, focus_skill: str | None = None, project_name: str | None = None) -> dict[str, object]:
    if not answer or not answer.strip():
        return {
            "question": question,
            "candidate_answer": answer,
            "generated_reference_answer": reference_answer or "A strong answer should directly answer the question with practical detail.",
            "score": 0,
            "feedback": "No answer was provided.",
            "strengths": [],
            "weaknesses": ["No answer was provided."],
            "section": section,
            "dimension_breakdown": {"relevance": 0, "correctness": 0, "completeness": 0, "clarity": 0, "confidence": 0},
        }

    prompt = f"""You are a practical interviewer evaluating a fresher/junior candidate.
Question: {question}
Candidate answer: {answer}
Section: {section}
Intent: {intent or 'Assess practical understanding and communication.'}
Focus skill: {focus_skill or 'general'}
Project name: {project_name or 'N/A'}
Reference answer guideline: {reference_answer or 'A strong answer should directly answer the question, use practical examples, and explain reasoning clearly.'}

Return ONLY valid JSON with keys:
question, candidate_answer, generated_reference_answer, score, feedback, strengths, weaknesses, section, dimension_breakdown

Rules:
- score 0-100
- do not require exact wording match
- be practical and human-like, not harsh
- strengths and weaknesses must each be arrays of short strings
- dimension_breakdown must contain integers 0-100 for relevance, correctness, completeness, clarity, confidence
"""
    response = _get_client().chat.completions.create(
        model=_llm_model(),
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=900,
    )
    raw = _clean_json(response.choices[0].message.content or "")
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if match:
        raw = match.group(0)
    data_dict = json.loads(raw)
    if not isinstance(data_dict, dict):
        data_dict = {}

    dims = data_dict.get("dimension_breakdown")
    if not isinstance(dims, dict):
        dims = {}

    clean_dims = {k: max(0, min(100, int(dims.get(k, 0)))) for k in ["relevance", "correctness", "completeness", "clarity", "confidence"]}
    
    score_raw = data_dict.get("score", 50)
    try:
        score_val = float(score_raw)
    except (ValueError, TypeError):
        score_val = 50.0

    raw_strengths = data_dict.get("strengths")
    strengths_list = list(raw_strengths) if isinstance(raw_strengths, list) else []
    
    raw_weaknesses = data_dict.get("weaknesses")
    weaknesses_list = list(raw_weaknesses) if isinstance(raw_weaknesses, list) else []

    return {
        "question": question,
        "candidate_answer": answer,
        "generated_reference_answer": str(data_dict.get("generated_reference_answer") or reference_answer or "A strong answer should directly answer the question with practical detail."),
        "score": float(max(0.0, min(100.0, score_val))),
        "feedback": str(data_dict.get("feedback") or "Evaluation completed."),
        "strengths": [str(x) for x in strengths_list[:3]],  # type: ignore
        "weaknesses": [str(x) for x in weaknesses_list[:3]],  # type: ignore
        "section": str(data_dict.get("section") or section),
        "dimension_breakdown": clean_dims,
    }


def score_answer(question: str, answer: str) -> dict[str, object]:
    detailed = evaluate_answer_detailed(question=question, answer=answer)
    score_val = detailed.get("score", 0)
    try:
        final_score = int(float(score_val))  # type: ignore
    except (ValueError, TypeError):
        final_score = 0
    return {"score": final_score, "feedback": str(detailed.get("feedback", ""))}
