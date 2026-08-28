# Niakofa Circles — ops fix pack

Use with public repo: https://github.com/niakofa-cmyk/Niakofa

| Doc | Purpose |
|-----|---------|
| `CURRENT_STATE_AND_VISION.md` | How Circles looks now vs vision |
| `FIX_LIVEKIT_NOT_CONFIGURED.md` | Fix 503 LiveKit not configured |
| `FIX_CAMERA_AND_CONNECTIVITY_ERRORS.md` | Permission vs connectivity vs device |
| `FIX_RATE_LIMIT_429.md` | 429 / scale model |
| `env.railway.livekit.snippet.md` | Variables to add |
| `../scripts/verify-livekit-env.sh` | Shell check for env presence |

Code for continuity, readiness, and rate limits already lives **in the main repo**. This pack is the **deployment and diagnosis** layer for the errors you are hitting in production.
