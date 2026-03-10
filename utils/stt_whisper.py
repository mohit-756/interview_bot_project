"""Server-side speech-to-text using faster-whisper."""

from __future__ import annotations

from io import BytesIO
import os
from pathlib import Path
from tempfile import NamedTemporaryFile
from threading import Lock

from faster_whisper import WhisperModel

_MODEL: WhisperModel | None = None
_MODEL_LOCK = Lock()


def _truthy(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _clear_proxy_env_if_requested() -> None:
    if not _truthy(os.getenv("WHISPER_IGNORE_PROXY"), default=False):
        return
    for key in (
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "http_proxy",
        "https_proxy",
        "all_proxy",
    ):
        os.environ.pop(key, None)


def _model_ref() -> str:
    model_path = (os.getenv("WHISPER_MODEL_PATH") or "").strip()
    if model_path:
        return model_path
    return os.getenv("WHISPER_MODEL_SIZE", "small")


def _get_model() -> WhisperModel:
    global _MODEL
    if _MODEL is not None:
        return _MODEL

    with _MODEL_LOCK:
        if _MODEL is None:
            _clear_proxy_env_if_requested()
            model_size = _model_ref()
            model_device = os.getenv("WHISPER_DEVICE", "cpu")
            compute_type = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
            try:
                _MODEL = WhisperModel(model_size, device=model_device, compute_type=compute_type)
            except Exception as exc:
                message = (
                    f"Unable to load Whisper model '{model_size}'. "
                    f"Set WHISPER_MODEL_PATH to a local model directory or verify internet/proxy settings. "
                    f"Original error: {exc}"
                )
                raise RuntimeError(message) from exc
    return _MODEL


def transcribe_audio_bytes(audio_bytes: bytes, language: str | None = None) -> str:
    if not audio_bytes:
        return ""

    beam_size_raw = os.getenv("WHISPER_BEAM_SIZE", "1")
    try:
        beam_size = max(1, int(beam_size_raw))
    except ValueError:
        beam_size = 1
    vad_filter = _truthy(os.getenv("WHISPER_VAD_FILTER"), default=True)
    temp_suffix = os.getenv("WHISPER_INPUT_SUFFIX", ".webm")

    with NamedTemporaryFile(delete=False, suffix=temp_suffix) as temp_file:
        temp_file.write(audio_bytes)
        temp_path = Path(temp_file.name)

    try:
        model = _get_model()
        try:
            segments, _ = model.transcribe(
                BytesIO(audio_bytes),
                language=(language or "").strip() or None,
                beam_size=beam_size,
                vad_filter=vad_filter,
            )
            return " ".join(segment.text.strip() for segment in segments if segment.text.strip()).strip()
        except Exception as memory_error:
            segments, _ = model.transcribe(
                str(temp_path),
                language=(language or "").strip() or None,
                beam_size=beam_size,
                vad_filter=vad_filter,
            )
            return " ".join(segment.text.strip() for segment in segments if segment.text.strip()).strip()
    finally:
        temp_path.unlink(missing_ok=True)
