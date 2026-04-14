"""TTS routes for interview voice generation."""

import logging

from fastapi import APIRouter, HTTPException

from routes.schemas import TTSSchema

from services.tts_service import VALID_VOICES

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/interview/tts")
def tts_generate(payload: TTSSchema):
    """Generate TTS audio for a question.
    
    ElevenLabs is disabled. Use browser TTS on frontend.
    """
    raise HTTPException(status_code=503, detail="ElevenLabs TTS is disabled. Use browser TTS on frontend.")