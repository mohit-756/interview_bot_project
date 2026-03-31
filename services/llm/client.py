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
from dotenv import load_dotenv

load_dotenv(override=True)

OLLAMA_CHAT_URL = "http://localhost:11434/api/chat"
_DEFAULT_OLLAMA_MODEL = "qwen2.5-coder:3b"
_DEFAULT_OLLAMA_TIMEOUT_SECONDS = 90

logger = logging.getLogger(__name__)


def _clean_json(raw: str) -> str:
    return re.sub(r"```(?:json)?", "", raw or "").strip().strip("`")


@lru_cache(maxsize=1)
def _resolve_llm_config() -> dict[str, Any]:
    explicit_provider = (os.getenv("LLM_PROVIDER") or "").strip().lower()
    ollama_model = os.getenv("OLLAMA_MODEL", _DEFAULT_OLLAMA_MODEL).strip() or _DEFAULT_OLLAMA_MODEL

    if explicit_provider:
        provider = explicit_provider
    elif os.getenv("OLLAMA_MODEL"):
        provider = "ollama"
    else:
        provider = "gemini"

    if provider == "ollama":
        standard_model = ollama_model
        premium_model = ollama_model
    else:
        standard_model = os.getenv("LLM_STANDARD_MODEL", "gemini-1.5-flash").strip()
        premium_model = os.getenv("LLM_PREMIUM_MODEL", "gemini-1.5-pro").strip()
    
    # Support multiple API keys for load distribution
    api_keys = [
        os.getenv("GEMINI_API_KEY", "").strip(),
        os.getenv("GEMINI_API_KEY_SECONDARY", "").strip(),
    ]
    api_keys = [k for k in api_keys if k]

    return {
        "provider": provider,
        "api_keys": api_keys,
        "groq_api_key": os.getenv("GROQ_API_KEY", "").strip(),
        "standard_model": standard_model,
        "premium_model": premium_model,
        "ollama_url": OLLAMA_CHAT_URL,
    }


class _GeminiChatCompletionsAdapter:
    def __init__(self, *, standard_model: str, premium_model: str, api_keys: list[str]) -> None:
        self._standard_model = standard_model
        self._premium_model = premium_model
        self._api_keys = api_keys
        self._key_index = 0

    def _get_api_key(self) -> str:
        if not self._api_keys:
            raise RuntimeError("Missing GEMINI_API_KEY. Please add GEMINI_API_KEY to your .env file.")
        # Simple round-robin for load distribution
        key = self._api_keys[self._key_index]
        self._key_index = (self._key_index + 1) % len(self._api_keys)
        return key

    def create(
        self,
        *,
        model: str | None = None,
        messages: list[dict[str, Any]],
        temperature: float = 0.2,
        max_tokens: int = 800,
        **_: Any,
    ) -> Any:
        api_key = self._get_api_key()
        chosen_model = (model or self._standard_model).strip()
        # Strip 'models/' prefix if present to avoid double-prefixing in URL
        if chosen_model.startswith("models/"):
            chosen_model = chosen_model[len("models/"):]
            
        text_prompt = ""
        for m in messages:
            text_prompt += m.get("content", "") + "\n"

        payload = {
            "contents": [{"parts": [{"text": text_prompt.strip()}]}],
            "generationConfig": {
                "temperature": float(temperature),
                "maxOutputTokens": int(max_tokens),
                "responseMimeType": "application/json",
            }
        }

        def _do_request(m_name: str) -> requests.Response:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{m_name}:generateContent?key={api_key}"
            return requests.post(url, json=payload, timeout=120)

        response = _do_request(chosen_model)
        
        if response.status_code == 404 and chosen_model != self._standard_model:
            logger.warning("Gemini Model '%s' not found (404). Falling back to '%s'.", chosen_model, self._standard_model)
            response = _do_request(self._standard_model)

        try:
            response.raise_for_status()
        except Exception as e:
            logger.error("Gemini API Error (%s): %s", response.status_code, response.text)
            raise

        data_dict: Any = response.json()
        if not isinstance(data_dict, dict):
            data_dict = {}
        try:
            candidates = data_dict.get("candidates")
            if isinstance(candidates, list) and candidates:
                content = candidates[0].get("content", {}).get("parts", [])[0].get("text", "")
            else:
                # Handle blocked or empty responses
                content = data_dict.get("feedback", {}).get("reason", "No content generated") if not candidates else str(data_dict)
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


class _GroqChatCompletionsAdapter:
    def __init__(self, *, model: str, api_key: str) -> None:
        self._model = model
        self._api_key = api_key
        self._url = "https://api.groq.com/openai/v1/chat/completions"

    def create(
        self,
        *,
        model: str | None = None,
        messages: list[dict[str, Any]],
        temperature: float = 0.2,
        max_tokens: int = 800,
        **_: Any,
    ) -> Any:
        chosen_model = (model or self._model).strip()
        payload = {
            "model": chosen_model,
            "messages": messages,
            "temperature": float(temperature),
            "max_tokens": int(max_tokens),
            "response_format": {"type": "json_object"},
        }
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        response = requests.post(self._url, json=payload, headers=headers, timeout=60)
        try:
            response.raise_for_status()
        except Exception as e:
            logger.error("Groq API Error (%s): %s", response.status_code, response.text)
            raise

        data = response.json() or {}
        choices = data.get("choices") or []
        content = ""
        if choices:
            content = choices[0].get("message", {}).get("content", "")

        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
        )


class _LLMClientAdapter:
    def __init__(self, *, config: dict[str, Any]) -> None:
        self._config = config
        self._adapters: dict[str, Any] = {}
        
        # Initialize Gemini if keys exist
        if config["api_keys"]:
            self._adapters["gemini"] = _GeminiChatCompletionsAdapter(
                standard_model=config["standard_model"],
                premium_model=config["premium_model"],
                api_keys=config["api_keys"]
            )
            
        # Initialize Groq if key exists
        if config["groq_api_key"]:
            self._adapters["groq"] = _GroqChatCompletionsAdapter(
                model=config["standard_model"],
                api_key=config["groq_api_key"]
            )
            
        # Initialize Ollama as fallback or explicit choice
        self._adapters["ollama"] = _ChatCompletionsAdapter(
            provider="ollama",
            model=config["standard_model"],
            api_key="",
            ollama_url=config["ollama_url"]
        )

    def create(
        self,
        *,
        model: str | None = None,
        messages: list[dict[str, Any]],
        temperature: float = 0.2,
        max_tokens: int = 800,
        provider_override: str | None = None,
        **_: Any,
    ) -> Any:
        provider = provider_override or self._config["provider"]
        
        # Smart Failover: If chosen provider isn't available, try others
        if provider not in self._adapters:
            logger.warning(f"Provider {provider} not available. Trying fallbacks.")
            for p in ["gemini", "groq", "ollama"]:
                if p in self._adapters:
                    provider = p
                    break
        
        adapter = self._adapters.get(provider)
        if not adapter:
            raise RuntimeError("No LLM providers configured correctly.")
            
        return adapter.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens
        )


@lru_cache(maxsize=1)
def _get_client() -> _LLMClientAdapter:
    config = _resolve_llm_config()
    logger.info("llm_client_init with multi-provider support")
    return _LLMClientAdapter(config=config)


def _llm_provider() -> str:
    return _resolve_llm_config()["provider"]


def _llm_model() -> str:
    return _resolve_llm_config()["standard_model"]


def _llm_premium_model() -> str:
    return _resolve_llm_config()["premium_model"]


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
            max_tokens=350,
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
\"\"\"
    # USE STANDARD MODEL (8B) for evaluation to avoid 429 Rate Limits
    response = _get_client().chat.completions.create(
        model=_llm_model(),
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=500,
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
