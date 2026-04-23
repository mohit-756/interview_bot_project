"""
utils/stt_whisper.py

Dynamic transcription - uses whichever API provider is available:
1. Groq (has Whisper API) - preferred
2. OpenAI Whisper
3. Gemini (if GEMINI_API_KEY explicitly set)
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
    Transcribe audio using available API key dynamically.
    Priority: OpenAI > Groq > Gemini
    """
    if not audio_bytes:
        return {
            "text": "",
            "confidence": 0.0,
            "low_confidence": True,
            "language": language or "en",
        }

    openai_key = os.getenv("OPENAI_API_KEY", "") or os.getenv("LLM_API_KEY", "")
    groq_api_key = os.getenv("GROQ_API_KEY", "")
    gemini_api_key = os.getenv("GEMINI_API_KEY", "")
    
    suffix = _resolve_suffix(filename)
    mime_type = _mime(suffix)

    prompt = "Transcribe this audio to text. Return only the transcript."
    if context_hint:
        prompt += f" Context: {context_hint}"

    # Try OpenAI Whisper first
    if openai_key:
        try:
            url = "https://api.openai.com/v1/audio/transcriptions"
            files = {"file": (filename or "audio.webm", audio_bytes, mime_type)}
            data = {"model": "whisper-1", "language": language or "en", "prompt": prompt}
            headers = {"Authorization": f"Bearer {openai_key}"}
            
            response = requests.post(url, files=files, data=data, headers=headers, timeout=60)
            response.raise_for_status()
            result = response.json()
            text = result.get("text", "").strip() if result else ""
            
            logger.info("OpenAI transcription successful")
            return {
                "text": text,
                "confidence": 0.95 if text else 0.0,
                "low_confidence": not bool(text),
                "language": language or "en",
            }
        except Exception as exc:
            logger.warning("OpenAI transcription failed: %s", exc)

    # Try Groq second (they have Whisper API - same as OpenAI)
    if groq_api_key:
        try:
            url = "https://api.groq.com/openai/v1/audio/transcriptions"
            files = {"file": (filename or "audio.webm", audio_bytes, mime_type)}
            data = {"model": "whisper-large-v3", "language": language or "en", "prompt": prompt}
            headers = {"Authorization": f"Bearer {groq_api_key}"}
            
            response = requests.post(url, files=files, data=data, headers=headers, timeout=60)
            response.raise_for_status()
            result = response.json()
            text = result.get("text", "").strip() if result else ""
            
            logger.info("Groq transcription successful")
            return {
                "text": text,
                "confidence": 0.95 if text else 0.0,
                "low_confidence": not bool(text),
                "language": language or "en",
            }
        except Exception as exc:
            logger.warning("Groq transcription failed: %s", exc)

    # Try Gemini last (only if explicitly configured)
    if gemini_api_key:
        try:
            encoded_audio = base64.b64encode(audio_bytes).decode('utf-8')
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key={gemini_api_key}"
            
            payload = {
                "contents": [{
                    "parts": [
                        {"text": prompt},
                        {"inlineData": {"mimeType": mime_type, "data": encoded_audio}}
                    ]
                }],
                "generationConfig": {"temperature": 0.1}
            }
            
            response = requests.post(url, json=payload, timeout=60)
            response.raise_for_status()
            response_data = response.json()
            
            text = ""
            candidates = response_data.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                if parts:
                    text = parts[0].get("text", "").strip()
            
            logger.info("Gemini transcription successful")
            return {
                "text": text,
                "confidence": 0.95 if text else 0.0,
                "low_confidence": not bool(text),
                "language": language or "en",
            }
        except Exception as exc:
            logger.warning("Gemini transcription failed: %s", exc)

    # No transcription service available
    raise RuntimeError(
        "No transcription service available. Set one of: "
        "GROQ_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY in .env"
    )