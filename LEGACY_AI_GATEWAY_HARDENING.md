# Legacy AI Gateway hardening

Controls added:
- allowlisted model validation
- abortable request timeout (default 15 seconds, maximum 60 seconds)
- bounded retries only for timeouts and transient 408/409/429/5xx failures
- circuit breaker after five consecutive terminal failures with a 30-second cooldown
- privacy-safe aggregate metrics only; prompts and generated content are never logged
- dedicated model validation and metrics tests

Environment: LEGACY_AI_MODEL, LEGACY_AI_TIMEOUT_MS, LEGACY_AI_MAX_RETRIES.
