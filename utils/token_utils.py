import time
import logging

logger = logging.getLogger(__name__)

# Very simple global state for RPM tracking in memory (non-persistent across restarts)
_request_timestamps = []

def track_request():
    """Track a request and return the current RPM."""
    now = time.time()
    _request_timestamps.append(now)
    # Remove timestamps older than 60 seconds
    while _request_timestamps and _request_timestamps[0] < now - 60:
        _request_timestamps.pop(0)
    return len(_request_timestamps)

def estimate_tokens(text: str) -> int:
    """Rough estimate of tokens (4 chars per token on average)."""
    if not text:
        return 0
    return max(1, len(text) // 4)

def log_token_usage(prompt: str, response: str, model: str):
    """Log the estimated token usage and current RPM."""
    rpm = track_request()
    prompt_tokens = estimate_tokens(prompt)
    response_tokens = estimate_tokens(response)
    total = prompt_tokens + response_tokens
    
    logger.info(
        f"LLM_TOKEN_LOG: model={model} | "
        f"prompt_tokens={prompt_tokens} | "
        f"response_tokens={response_tokens} | "
        f"total={total} | "
        f"current_rpm={rpm}"
    )
    return total
