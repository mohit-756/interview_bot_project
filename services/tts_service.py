import hashlib
import logging
import os
from pathlib import Path
from typing import Any

from core.config import config
from database import SessionLocal

logger = logging.getLogger(__name__)

# ElevenLabs is disabled - using browser TTS fallback
# VALID_VOICES and TTS functionality kept for future re-enablement
VALID_VOICES = {
    "indian_female": "oO7sLA3dWfQXsKeSAjpA",
    "indian_male": "x3gYeuNB0kLLYxOZsaSh",
}

ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech"

TTS_UPLOAD_DIR = config.UPLOAD_DIR / "tts"
TTS_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _normalize_question(question: str) -> str:
    return question.strip().lower()


def _generate_cache_key(question: str, voice_type: str) -> str:
    normalized = _normalize_question(question)
    key_string = f"{normalized}:{voice_type}"
    return hashlib.md5(key_string.encode()).hexdigest()


def _get_audio_path(cache_key: str) -> Path:
    return TTS_UPLOAD_DIR / f"{cache_key}.mp3"


def _call_elevenlabs_api(question: str, voice_id: str) -> bytes:
    api_key = config.ELEVENLABS_API_KEY
    if not api_key:
        raise ValueError("ELEVENLABS_API_KEY not configured")

    url = f"{ELEVENLABS_API_URL}/{voice_id}"
    
    headers = {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": api_key,
    }

    payload = {
        "text": question,
        "model_id": "eleven_turbo_v2_5",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.8,
        },
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        response.raise_for_status()
        logger.info("elevenlabs_api_success voice_id=%s", voice_id)
        return response.content
    except requests.exceptions.RequestException as e:
        logger.error("elevenlabs_api_failed voice_id=%s error=%s", voice_id, e)
        raise


def _get_voice_id(voice_type: str) -> str:
    voice_id = VALID_VOICES.get(voice_type)
    if not voice_id:
        raise ValueError(f"Invalid voice type: {voice_type}. Valid types: {list(VALID_VOICES.keys())}")
    return voice_id


def get_tts_audio(question: str, voice_type: str) -> dict[str, Any]:
    raise ValueError("ElevenLabs TTS is disabled. Use browser TTS on frontend.")