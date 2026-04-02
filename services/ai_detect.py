"""AI-generated text detection using HuggingFace zero-shot classification."""
from __future__ import annotations

import logging
from typing import Any

import requests

logger = logging.getLogger(__name__)

_HF_API_URL = "https://api-inference.huggingface.co/models/facebook/bart-large-mnli"
_TIMEOUT = 15

# Labels for zero-shot classification.
# "AI-generated" catches ChatGPT/Copilot-style answers.
# "Human-written" catches authentic candidate answers.
_LABELS = ["AI-generated text", "Human-written text"]


def detect_ai_generated(text: str) -> dict[str, Any]:
    """
    Classify answer text as AI-generated vs human-written.
    Returns {"ai_probability": 0.0-1.0, "human_probability": 0.0-1.0, "flagged": bool}
    Falls back to heuristic if HuggingFace API is unavailable.
    """
    if not text or len(text.strip()) < 20:
        return {"ai_probability": 0.0, "human_probability": 0.0, "flagged": False, "reason": "too_short"}

    try:
        resp = requests.post(
            _HF_API_URL,
            json={"inputs": text[:2000], "parameters": {"candidate_labels": _LABELS}},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()

        if "error" in data:
            logger.warning("hf_ai_detect_error error=%s", data["error"])
            return _heuristic_fallback(text)

        labels = data.get("labels", [])
        scores = data.get("scores", [])
        label_map = dict(zip(labels, scores))

        ai_prob = round(label_map.get("AI-generated text", 0.0), 3)
        human_prob = round(label_map.get("Human-written text", 0.0), 3)

        return {
            "ai_probability": ai_prob,
            "human_probability": human_prob,
            "flagged": ai_prob > 0.6,
            "reason": "hf_model",
        }
    except Exception as exc:
        logger.warning("hf_ai_detect_unavailable falling_back error=%s", exc)
        return _heuristic_fallback(text)


def _heuristic_fallback(text: str) -> dict[str, Any]:
    """
    Lightweight heuristic fallback when HF API is down.
    Checks for patterns common in AI-generated text.
    """
    ai_markers = [
        "as an ai", "as a language model", "i cannot", "i don't have access",
        "it's important to note", "in conclusion", "delve", "moreover",
        "furthermore", "it is worth noting", "comprehensive", "leveraging",
    ]
    text_lower = text.lower()
    marker_count = sum(1 for m in ai_markers if m in text_lower)

    # AI text tends to be unusually long and perfectly structured
    word_count = len(text.split())
    avg_word_len = sum(len(w) for w in text.split()) / max(word_count, 1)

    ai_score = 0.0
    ai_score += min(marker_count * 0.15, 0.6)
    if word_count > 200:
        ai_score += 0.1
    if avg_word_len > 5.5:
        ai_score += 0.1

    ai_prob = round(min(ai_score, 0.95), 3)
    return {
        "ai_probability": ai_prob,
        "human_probability": round(1.0 - ai_prob, 3),
        "flagged": ai_prob > 0.6,
        "reason": "heuristic_fallback",
    }
