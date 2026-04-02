"""NLP sentiment and emotion analysis using HuggingFace inference API."""
from __future__ import annotations

import logging
from typing import Any

import requests

logger = logging.getLogger(__name__)

_SENTIMENT_URL = "https://api-inference.huggingface.co/models/distilbert-base-uncased-finetuned-sst-2-english"
_EMOTION_URL = "https://api-inference.huggingface.co/models/j-hartmann/emotion-english-distilroberta-base"
_TIMEOUT = 15


def analyze_sentiment(text: str) -> dict[str, Any]:
    """
    Analyze answer text for sentiment (positive/negative) and emotions.
    Returns {"sentiment": str, "sentiment_score": float, "dominant_emotion": str, "emotion_scores": dict}
    Falls back to heuristic if HF API is unavailable.
    """
    if not text or len(text.strip()) < 10:
        return {
            "sentiment": "neutral",
            "sentiment_score": 0.5,
            "dominant_emotion": "neutral",
            "emotion_scores": {"joy": 0.0, "anger": 0.0, "fear": 0.0, "sadness": 0.0, "surprise": 0.0, "neutral": 1.0},
            "reason": "too_short",
        }

    sentiment = _get_sentiment(text)
    emotion = _get_emotion(text)

    return {
        "sentiment": sentiment["label"],
        "sentiment_score": round(sentiment["score"], 3),
        "dominant_emotion": emotion["dominant"],
        "emotion_scores": emotion["scores"],
        "reason": "hf_model",
    }


def _get_sentiment(text: str) -> dict[str, Any]:
    """Get positive/negative sentiment from SST-2 model."""
    try:
        resp = requests.post(
            _SENTIMENT_URL,
            json={"inputs": text[:1000]},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()

        if isinstance(data, list) and len(data) > 0 and isinstance(data[0], list):
            results = data[0]
            label_map = {r["label"].lower(): r["score"] for r in results if "label" in r and "score" in r}
            pos = label_map.get("positive", label_map.get("pos", 0.0))
            neg = label_map.get("negative", label_map.get("neg", 0.0))
            if pos >= neg:
                return {"label": "positive", "score": pos}
            return {"label": "negative", "score": neg}
    except Exception as exc:
        logger.warning("hf_sentiment_unavailable error=%s", exc)

    return _heuristic_sentiment(text)


def _get_emotion(text: str) -> dict[str, Any]:
    """Get emotion breakdown from emotion model."""
    try:
        resp = requests.post(
            _EMOTION_URL,
            json={"inputs": text[:1000]},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()

        if isinstance(data, list) and len(data) > 0 and isinstance(data[0], list):
            results = data[0]
            scores = {r["label"].lower(): round(r["score"], 3) for r in results if "label" in r and "score" in r}
            dominant = max(scores, key=scores.get) if scores else "neutral"
            return {"dominant": dominant, "scores": scores}
    except Exception as exc:
        logger.warning("hf_emotion_unavailable error=%s", exc)

    return _heuristic_emotion(text)


def _heuristic_sentiment(text: str) -> dict[str, Any]:
    """Simple keyword-based sentiment fallback."""
    positive_words = {"good", "great", "excellent", "happy", "love", "better", "best", "well", "nice", "amazing", "wonderful", "perfect", "helpful", "easy", "clear", "understand", "confident", "enjoy", "benefit", "improve", "success", "positive", "strong", "effective"}
    negative_words = {"bad", "poor", "terrible", "hate", "worst", "difficult", "confusing", "hard", "wrong", "fail", "failed", "problem", "issue", "error", "broken", "worse", "negative", "weak", "lacking", "disappointing", "frustrating"}

    words = set(text.lower().split())
    pos_count = len(words & positive_words)
    neg_count = len(words & negative_words)
    total = pos_count + neg_count

    if total == 0:
        return {"label": "neutral", "score": 0.5}
    score = pos_count / total
    if score >= 0.5:
        return {"label": "positive", "score": round(score, 3)}
    return {"label": "negative", "score": round(1.0 - score, 3)}


def _heuristic_emotion(text: str) -> dict[str, Any]:
    """Simple keyword-based emotion fallback."""
    joy_words = {"happy", "glad", "great", "love", "enjoy", "excited", "wonderful", "amazing", "fantastic", "pleased", "satisfied", "proud"}
    anger_words = {"angry", "furious", "annoyed", "frustrated", "hate", "terrible", "awful", "ridiculous", "unacceptable", "outraged"}
    fear_words = {"scared", "afraid", "worried", "anxious", "nervous", "terrified", "panic", "concerned", "uncertain", "stress"}
    sadness_words = {"sad", "unhappy", "disappointed", "depressed", "regret", "sorry", "miss", "lost", "lonely", "hopeless"}
    surprise_words = {"surprised", "shocked", "amazed", "unexpected", "wow", "incredible", "astonished", "stunned"}

    words = set(text.lower().split())
    scores = {
        "joy": len(words & joy_words),
        "anger": len(words & anger_words),
        "fear": len(words & fear_words),
        "sadness": len(words & sadness_words),
        "surprise": len(words & surprise_words),
    }
    total = sum(scores.values())
    if total == 0:
        return {"dominant": "neutral", "scores": {"joy": 0.0, "anger": 0.0, "fear": 0.0, "sadness": 0.0, "surprise": 0.0, "neutral": 1.0}}
    scores = {k: round(v / total, 3) for k, v in scores.items()}
    scores["neutral"] = round(max(0, 1.0 - sum(scores.values())), 3)
    dominant = max(scores, key=scores.get)
    return {"dominant": dominant, "scores": scores}
