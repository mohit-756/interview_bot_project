import time
import logging
from dataclasses import dataclass, field
from threading import Lock

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Cerebras Free-Tier limits (llama3.1-8b)
# ---------------------------------------------------------------------------
CEREBRAS_LIMITS = {
    "rpm": 30,           # requests per minute
    "tpm": 60_000,       # tokens per minute
    "daily_tokens": 1_000_000,
}


# ---------------------------------------------------------------------------
# Sliding-window tracker
# ---------------------------------------------------------------------------
@dataclass
class _WindowEntry:
    ts: float
    prompt_tokens: int
    completion_tokens: int


_lock = Lock()
_entries: list[_WindowEntry] = []
_daily_total: int = 0
_day_start: float = time.time()


def _prune(now: float) -> None:
    """Drop entries older than 60 s and reset daily counter after 24 h."""
    global _daily_total, _day_start
    cutoff = now - 60
    while _entries and _entries[0].ts < cutoff:
        _entries.pop(0)
    if now - _day_start > 86_400:
        _daily_total = 0
        _day_start = now


def track_request(prompt_tokens: int = 0, completion_tokens: int = 0) -> dict:
    """Record one completed LLM call and return current usage snapshot."""
    global _daily_total
    now = time.time()
    with _lock:
        _entries.append(_WindowEntry(now, prompt_tokens, completion_tokens))
        _daily_total += prompt_tokens + completion_tokens
        _prune(now)
        rpm = len(_entries)
        tpm = sum(e.prompt_tokens + e.completion_tokens for e in _entries)
        return {
            "rpm": rpm,
            "tpm": tpm,
            "daily_tokens": _daily_total,
            "rpm_limit": CEREBRAS_LIMITS["rpm"],
            "tpm_limit": CEREBRAS_LIMITS["tpm"],
            "daily_limit": CEREBRAS_LIMITS["daily_tokens"],
            "rpm_pct": round(rpm / CEREBRAS_LIMITS["rpm"] * 100, 1),
            "tpm_pct": round(tpm / CEREBRAS_LIMITS["tpm"] * 100, 1),
            "daily_pct": round(_daily_total / CEREBRAS_LIMITS["daily_tokens"] * 100, 1),
        }


def parse_rate_limit_headers(headers: dict) -> dict:
    """Extract Cerebras rate-limit headers into a readable dict."""
    return {
        "remaining_requests_day": headers.get("x-ratelimit-remaining-requests-day"),
        "remaining_tokens_minute": headers.get("x-ratelimit-remaining-tokens-minute"),
        "reset_requests_day_s": headers.get("x-ratelimit-reset-requests-day"),
        "reset_tokens_minute_s": headers.get("x-ratelimit-reset-tokens-minute"),
    }


def get_snapshot() -> dict:
    """Return current usage without adding a new entry."""
    now = time.time()
    with _lock:
        _prune(now)
        rpm = len(_entries)
        tpm = sum(e.prompt_tokens + e.completion_tokens for e in _entries)
        return {
            "rpm": rpm,
            "tpm": tpm,
            "daily_tokens": _daily_total,
            "rpm_limit": CEREBRAS_LIMITS["rpm"],
            "tpm_limit": CEREBRAS_LIMITS["tpm"],
            "daily_limit": CEREBRAS_LIMITS["daily_tokens"],
            "rpm_pct": round(rpm / CEREBRAS_LIMITS["rpm"] * 100, 1),
            "tpm_pct": round(tpm / CEREBRAS_LIMITS["tpm"] * 100, 1),
            "daily_pct": round(_daily_total / CEREBRAS_LIMITS["daily_tokens"] * 100, 1),
        }


def estimate_tokens(text: str) -> int:
    """Rough estimate: 4 chars ≈ 1 token (fallback only)."""
    if not text:
        return 0
    return max(1, len(text) // 4)


def log_token_usage(
    prompt: str = "",
    response: str = "",
    model: str = "",
    prompt_tokens: int | None = None,
    completion_tokens: int | None = None,
    rate_headers: dict | None = None,
) -> int:
    """Log actual token usage and current RPM/TPM.

    If prompt_tokens / completion_tokens are supplied (from the API response
    ``usage`` field), they are used directly.  Otherwise falls back to
    estimate_tokens().
    """
    pt = prompt_tokens if prompt_tokens is not None else estimate_tokens(prompt)
    ct = completion_tokens if completion_tokens is not None else estimate_tokens(response)
    total = pt + ct

    usage = track_request(pt, ct)

    header_info = ""
    if rate_headers:
        rh = parse_rate_limit_headers(rate_headers)
        header_info = (
            f" | remaining_req_day={rh['remaining_requests_day']}"
            f" | remaining_tok_min={rh['remaining_tokens_minute']}"
        )

    logger.info(
        f"LLM_TOKEN_LOG: model={model} "
        f"| prompt_tokens={pt} | completion_tokens={ct} | total={total}"
        f" | rpm={usage['rpm']}/{usage['rpm_limit']} ({usage['rpm_pct']}%)"
        f" | tpm={usage['tpm']}/{usage['tpm_limit']} ({usage['tpm_pct']}%)"
        f" | daily={usage['daily_tokens']}/{usage['daily_limit']} ({usage['daily_pct']}%)"
        f"{header_info}"
    )

    # Warn if approaching limits
    if usage["rpm_pct"] >= 80:
        logger.warning("LLM_RATE_WARN: RPM at %s%% of limit!", usage["rpm_pct"])
    if usage["tpm_pct"] >= 80:
        logger.warning("LLM_RATE_WARN: TPM at %s%% of limit!", usage["tpm_pct"])
    if usage["daily_pct"] >= 80:
        logger.warning("LLM_RATE_WARN: Daily token usage at %s%% of limit!", usage["daily_pct"])

    return total
