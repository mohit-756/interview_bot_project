"""
utils/stt_whisper.py

Replaces Groq Whisper API with Gemini 2.5 Flash Audio Transcription.
Drop-in replacement — same function signature as before.
"""
from __future__ import annotations

import base64
import logging
import os
from pathlib import Path

import requests

logger = logging.getLogger(__name__)


def _resolve_suffix(filename: str | None) -> str:
    if filename:
        s = Path(filename).suffix.strip().lower()
        if s in {".webm", ".wav", ".mp3", ".m4a", ".mp4", ".ogg", ".oga"}:
            return s
    return ".webm"


def _mime(suffix: str) -> str:
    return {
        ".webm": "audio/webm",
        ".wav":  "audio/wav",
        ".mp3":  "audio/mpeg",
        ".m4a":  "audio/mp4",
        ".mp4":  "audio/mp4",
        ".ogg":  "audio/ogg",
        ".oga":  "audio/ogg",
    }.get(suffix, "audio/webm")


def transcribe_audio_bytes(
    audio_bytes: bytes,
    language: str | None = None,
    *,
    filename: str | None = None,
    context_hint: str | None = None,
) -> dict[str, object]:
    """
    Transcribe audio bytes using Gemini 2.5 Flash Audio Transcription.
    """
    if not audio_bytes:
        return {
            "text": "",
            "confidence": 0.0,
            "low_confidence": True,
            "language": language or "en",
        }

    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set in .env")

    suffix = _resolve_suffix(filename)
    mime_type = _mime(suffix)

    prompt = "Please transcribe the following audio directly to text. Return ONLY the exact transcript text. Do not add any conversational filler, introductory remarks, or formatting."
    if context_hint:
        prompt += f"\nContext hint to help with correct domain terminology: {context_hint}"

    encoded_audio = base64.b64encode(audio_bytes).decode('utf-8')

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inlineData": {
                            "mimeType": mime_type,
                            "data": encoded_audio
                        }
                    }
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.1
        }
    }

    try:
        response = requests.post(url, json=payload, timeout=60)
        
        try:
            response.raise_for_status()
        except Exception:
            logger.error("Gemini Transcription API Error: %s", response.text)
            raise

        response_data = response.json()
        
        text = ""
        candidates = response_data.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            if parts:
                text = parts[0].get("text", "").strip()

        confidence = 0.95 if text else 0.0

        return {
            "text": text,
            "confidence": confidence,
            "low_confidence": not bool(text),
            "language": language or "en",
        }

    except Exception as exc:
        logger.error("Gemini audio transcription failed: %s", exc)
        raise RuntimeError(f"Transcription failed: {exc}") from exc
