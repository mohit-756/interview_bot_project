"""
utils/stt_whisper.py

Dynamic transcription - uses whichever API provider is available:
1. OpenAI Whisper - preferred
2. Groq (has Whisper API)
3. Gemini (if GEMINI_API_KEY set)
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
    file_to_send = filename or f"audio{suffix}"

    # Use a prompt that helps Whisper understand the context and reduces hallucinations
    prompt = "This is a recording of a professional interview candidate answering a question. Please transcribe it accurately."
    if context_hint:
        prompt += f" Context: {context_hint}"

    # Try OpenAI Whisper first
    if openai_key:
        try:
            logger.info("OpenAI Whisper: audio_size=%d, mime_type=%s, language=%s", len(audio_bytes), mime_type, language or "en")
            url = "https://api.openai.com/v1/audio/transcriptions"
            files = {"file": (file_to_send, audio_bytes, mime_type)}
            data = {"model": "whisper-1", "language": language or "en", "prompt": prompt}
            headers = {"Authorization": f"Bearer {openai_key}"}
            
            response = requests.post(url, files=files, data=data, headers=headers, timeout=60)
            if response.status_code != 200:
                logger.warning("OpenAI Whisper error response: %s", response.text)
                response.raise_for_status()
                
            result = response.json()
            text = result.get("text", "").strip() if result else ""
            
            # Post-process: check for common Whisper hallucinations
            if text:
                lower_text = text.lower().strip()
                word_count = len(lower_text.split())
                
                # Common hallucinations patterns
                hallucinations = [
                    "thank you for watching", "thanks for watching", "please subscribe",
                    "subtitles by", "amara.org", "subtitle by", "watching!", 
                    "you for watching", "translated by", "by amara.org"
                ]
                
                is_hallucination = any(h in lower_text for h in hallucinations)
                
                # Check for URL patterns
                url_patterns = ["www.", ".com", ".gov", ".org", ".net", "https://", "http://"]
                url_count = sum(1 for p in url_patterns if p in lower_text)
                
                # Block if mostly URL or known hallucination
                if (word_count < 3 and url_count > 0) or is_hallucination:
                    logger.warning("Whisper potential hallucination blocked: '%s'", text)
                    text = ""
                elif word_count == 1 and len(lower_text) > 30:
                    logger.warning("Whisper suspicious single long word blocked: '%s'", text)
                    text = ""

            return {
                "text": text,
                "confidence": 0.95 if text else 0.0,
                "low_confidence": not bool(text),
                "language": language or "en",
            }
        except Exception as exc:
            logger.warning("OpenAI transcription failed: %s", exc)

    # Try Groq second
    if groq_api_key:
        try:
            url = "https://api.groq.com/openai/v1/audio/transcriptions"
            files = {"file": (file_to_send, audio_bytes, mime_type)}
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

    # Try Gemini last
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

    raise RuntimeError("No transcription service available. Set one of: GROQ_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY")