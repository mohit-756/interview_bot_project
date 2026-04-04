"""LLM client helpers used strictly by .env configuration."""
from __future__ import annotations

import json
import logging
import os
import re
from functools import lru_cache
from types import SimpleNamespace
from typing import Any

import time
import requests
from pathlib import Path
from utils.token_utils import log_token_usage
from dotenv import load_dotenv

load_dotenv()

CACHE_DIR = Path(".cache")
CACHE_DIR.mkdir(exist_ok=True)
CACHE_FILE = CACHE_DIR / "llm_cache.json"

def _load_cache():
    if not CACHE_FILE.exists(): return {}
    try: return json.loads(CACHE_FILE.read_text()) or {}
    except: return {}

def _save_cache(data: dict):
    try: CACHE_FILE.write_text(json.dumps(data, indent=2))
    except: pass

_llm_cache: dict[str, str] = _load_cache()

logger = logging.getLogger(__name__)

def _clean_json(raw: str) -> str:
    raw = str(raw or "").strip()
    # Try to find JSON within markdown block
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
    if match:
        raw = match.group(1).strip()
    
    # Try to find JSON object or array as fallback
    if not raw.startswith("{") and not raw.startswith("["):
        obj_match = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", raw)
        if obj_match:
            raw = obj_match.group(1).strip()
    
    return raw

@lru_cache(maxsize=1)
def _resolve_llm_config() -> dict[str, Any]:
    """Single source of truth for LLM configuration from .env only."""
    provider = os.getenv("LLM_PROVIDER", "cerebras").strip().lower()
    
    # Standardized environment variables
    api_key = os.getenv("LLM_API_KEY", "").strip()
    base_url = os.getenv("LLM_BASE_URL", "").strip()
    primary_model = os.getenv("LLM_MODEL_PRIMARY", "").strip()
    fallback_model = os.getenv("LLM_MODEL_FALLBACK", "").strip()
    
    # Provider-specific defaults if not provided in .env
    if not primary_model:
        if provider == "cerebras": primary_model = "qwen-3-235b-a22b-instruct-2507"
        elif provider == "groq": primary_model = "llama-3.1-8b-instant"
        elif provider == "ollama": primary_model = "qwen2.5-coder:3b"
        elif provider == "openai": primary_model = "gpt-4o"
        elif provider == "gemini": primary_model = "gemini-1.5-flash"
        else: primary_model = "llama3.1-8b"

    if not fallback_model:
        fallback_model = primary_model

    if not base_url:
        if provider == "cerebras": base_url = "https://api.cerebras.ai/v1"
        elif provider == "groq": base_url = "https://api.groq.com/openai/v1"
        elif provider == "ollama": base_url = "http://localhost:11434/v1"
        elif provider == "openai": base_url = "https://api.openai.com/v1"
        # Gemini usually requires its own adapter or a proxy

    return {
        "provider": provider,
        "api_key": api_key,
        "base_url": base_url,
        "primary_model": primary_model,
        "fallback_model": fallback_model,
    }

class OpenAIAdapter:
    """Generic adapter for any OpenAI-compatible API (Cerebras, Groq, Ollama, OpenAI)."""
    def __init__(self, base_url: str, api_key: str, model: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model

    def create(self, messages: list[dict[str, Any]], temperature: float, max_tokens: int, **kwargs):
        model = kwargs.get("model") or self.model
        
        # Caching logic
        cache_key = f"{model}_{temperature}_{json.dumps(messages)}"
        if cache_key in _llm_cache:
            logger.info(f"CACHE_HIT: model={model}")
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=_llm_cache[cache_key]))])

        url = f"{self.base_url}/chat/completions"
        payload = {
            "model": model,
            "messages": messages,
            "temperature": float(temperature),
            "max_tokens": int(max_tokens)
        }
        if kwargs.get("response_format"):
            payload["response_format"] = kwargs["response_format"]

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        prompt_text = "\n".join([m.get("content", "") for m in messages])
        
        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=120)
            if resp.status_code != 200:
                logger.error(f"LLM API Error ({resp.status_code}): {resp.text}")
                resp.raise_for_status()

            data = resp.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")

            # Extract actual token counts from API response
            usage = data.get("usage") or {}
            prompt_tokens = usage.get("prompt_tokens")
            completion_tokens = usage.get("completion_tokens")

            # Extract rate-limit headers from Cerebras/Groq
            rate_headers = {k: v for k, v in resp.headers.items() if k.startswith("x-ratelimit")}

            # Log token usage (actual if available, else estimate)
            log_token_usage(
                prompt=prompt_text,
                response=content,
                model=model,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                rate_headers=rate_headers if rate_headers else None,
            )

            # Save to cache
            _llm_cache[cache_key] = content
            _save_cache(_llm_cache)

            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])
        except Exception as e:
            logger.error(f"LLM request failed: {e}")
            raise

class GeminiAdapter:
    """Specialized adapter for Google Gemini API."""
    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model

    def create(self, messages: list[dict[str, Any]], temperature: float, max_tokens: int, **kwargs):
        model = kwargs.get("model") or self.model
        if model.startswith("models/"): model = model[len("models/"):]
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={self.api_key}"
        
        # Simple prompt concatenation for now, as per original code
        prompt = "\n".join([m['content'] for m in messages])
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens}
        }
        
        resp = requests.post(url, json=payload, timeout=120)
        resp.raise_for_status()
        data = resp.json()
        content = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])

class LLMClient:
    def __init__(self):
        config = _resolve_llm_config()
        self.provider = config["provider"]
        self.primary_model = config["primary_model"]
        
        if self.provider == "gemini":
            self.adapter = GeminiAdapter(config["api_key"], self.primary_model)
        else:
            self.adapter = OpenAIAdapter(config["base_url"], config["api_key"], self.primary_model)

        # Compatibility layer for old OpenAI-style calls (.chat.completions.create)
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    def create(self, **kwargs):
        return self.adapter.create(
            messages=kwargs.get("messages", []),
            temperature=kwargs.get("temperature", 0.2),
            max_tokens=kwargs.get("max_tokens", 800),
            model=kwargs.get("model"),
            response_format=kwargs.get("response_format")
        )

@lru_cache(maxsize=1)
def _get_client() -> LLMClient:
    return LLMClient()

def _llm_provider() -> str: return _resolve_llm_config()["provider"]
def _llm_model() -> str: return _resolve_llm_config()["primary_model"]
def _llm_premium_model() -> str: return _resolve_llm_config()["primary_model"] # Default to primary

def extract_skills(jd_text: str) -> dict[str, int]:
    prompt = (
        "Extract ONLY core technical skills (programming languages, frameworks, libraries, "
        "databases, cloud platforms, DevOps tools, infrastructure technologies) from the job "
        "description below. Return a JSON dictionary in the exact format {\"skill\": weight} "
        "where weight is an integer from 1-10 based on how prominently the skill appears.\n\n"
        "STRICT RULES:\n"
        "- Include ONLY hard technical skills.\n"
        "- Completely ignore soft skills (e.g. Communication, Teamwork, Leadership, Problem Solving).\n"
        "- Completely ignore methodologies (e.g. Agile, Scrum, Kanban, TDD, CI/CD as a concept).\n"
        "- Completely ignore company descriptions, benefits, or cultural statements.\n"
        "- Do NOT include generic terms like 'Computer Science', 'Engineering', 'Technology'.\n"
        "- Return ONLY the JSON dictionary, no explanation.\n\n"
        f"Job Description:\n{jd_text[:4000]}"
    )
    try:
        resp = _get_client().create(messages=[{"role": "user", "content": prompt}], temperature=0.1, max_tokens=300)
        return json.loads(_clean_json(resp.choices[0].message.content))
    except Exception as e:
        logger.error(f"extract_skills failed: {e}")
        return {}

def evaluate_answer_detailed(**kwargs) -> dict[str, Any]:
    prompt = f"Evaluate answer for question: {kwargs.get('question')}\nAnswer: {kwargs.get('answer')}\nReturn JSON with score (0-100) and feedback."
    try:
        resp = _get_client().create(messages=[{"role": "user", "content": prompt}], temperature=0.2, max_tokens=500)
        return json.loads(_clean_json(resp.choices[0].message.content))
    except Exception as e:
        logger.error(f"evaluation failed: {e}")
        return {"score": 50, "feedback": "Evaluation failed."}

def score_answer(question: str, answer: str) -> dict[str, Any]:
    eval_res = evaluate_answer_detailed(question=question, answer=answer)
    return {"score": eval_res.get("score", 0), "feedback": eval_res.get("feedback", "")}
