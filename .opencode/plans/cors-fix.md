# CORS/Auth Deployment Fix — Plan

## Problem
Frontend on Vercel (`https://interview-bot-project-1-dac5cbh45-mohit-756s-projects.vercel.app`) cannot reach backend on Render (`https://interview-bot-project-1.onrender.com`) due to missing CORS headers. Additionally, `https_only=True` in SessionMiddleware breaks local dev on `http://localhost`.

## Single File Change: `main.py`

### Change 1 — SessionMiddleware (lines 93-99)
**Before:**
```python
app.add_middleware(
    SessionMiddleware,
    secret_key=_secret_key,
    same_site="none",
    https_only=True,
    session_cookie="interview_bot_sid",
)
```

**After:**
```python
app.add_middleware(
    SessionMiddleware,
    secret_key=_secret_key,
    same_site="none",
    https_only=IS_PROD,
    session_cookie="interview_bot_sid",
    path="/",
)
```

**Why:**
- `https_only=True` was hardcoded, which prevents the session cookie from being set on `http://localhost` during local development. Changed to `https_only=IS_PROD` so it's `False` in dev and `True` in production.
- Added `path="/"` to ensure the session cookie is scoped to the root path, which is production-safe and prevents cookie scoping issues across sub-paths.

### Change 2 — CORS (lines 101-113)
**Before:**
```python
# ── CORS Configuration ───────────────────────────────────────────────────────
# In production, ONLY allow your Vercel URL. In dev, allow localhost.
DEFAULT_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"
raw_origins = os.getenv("CORS_ORIGINS", DEFAULT_ORIGINS)
allow_origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**After:**
```python
# ── CORS Configuration ───────────────────────────────────────────────────────
# Exact origins for dev + Vercel production
DEFAULT_ORIGINS = (
    "http://localhost:5173,"
    "http://127.0.0.1:5173,"
    "https://interview-bot-project-1.vercel.app"
)
raw_origins = os.getenv("CORS_ORIGINS", DEFAULT_ORIGINS)
allow_origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

# Regex for Vercel preview deployments (e.g. ...-dac5cbh45-mohit-756s-projects.vercel.app)
VERCEL_PREVIEW_REGEX = r"https://interview-bot-project-1-.*-mohit-756s-projects\.vercel\.app"

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_origin_regex=VERCEL_PREVIEW_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Why:**
- Added `https://interview-bot-project-1.vercel.app` to `DEFAULT_ORIGINS` so the production Vercel URL works out of the box without requiring a `CORS_ORIGINS` env var.
- Added `allow_origin_regex` to match Vercel preview deployment URLs like `https://interview-bot-project-1-dac5cbh45-mohit-756s-projects.vercel.app`. The regex pattern `https://interview-bot-project-1-.*-mohit-756s-projects\.vercel\.app` matches any preview deployment for this project.
- `CORS_ORIGINS` env var behavior is preserved — if set on Render, it overrides the defaults.
- `allow_credentials=True`, `allow_methods=["*"]`, and `allow_headers=["*"]` are kept as-is since they're already correct for frontend auth requests.

## Env Vars to Verify

### Render (Backend)
| Variable | Value | Notes |
|---|---|---|
| `ENV` | `production` | Controls `https_only` and `SECRET_KEY` enforcement |
| `SECRET_KEY` | Strong random string | Required in production (already enforced) |
| `CORS_ORIGINS` | *(optional)* | If unset, defaults now include Vercel prod URL. Set explicitly if you want tighter control. |
| `DATABASE_URL` | PostgreSQL connection string | Already configured |

### Vercel (Frontend)
| Variable | Value | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | `https://interview-bot-project-1.onrender.com` | Must point to Render backend URL |

## Deployment
- **Backend only** needs redeploying. No frontend changes required.
- After backend deploy, the CORS preflight `OPTIONS` requests will succeed and the browser will allow the actual auth requests through.

## Cookie Settings Summary
The app uses Starlette `SessionMiddleware` (not manual `set_cookie`). The effective cookie settings after this fix:

| Setting | Dev (`ENV != production`) | Prod (`ENV == production`) |
|---|---|---|
| `httponly` | `True` (default in SessionMiddleware) | `True` |
| `secure` | `False` (http://localhost) | `True` (HTTPS only) |
| `samesite` | `"none"` | `"none"` |
| `path` | `"/"` | `"/"` |
