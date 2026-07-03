---
name: Niakofa global ops admin
description: GET /admin/global-ops: GPS health, region buckets, lang distribution, feature checks, config_status.
---

## Endpoint: GET /api/admin/global-ops

Returns comprehensive global state for the admin dashboard. Auto-polled every 60s by GlobalOpsSection in admin.tsx.

### Response Shape (after July 2026 enhancement)
```json
{
  "gps_health": { "helpers_online_with_gps": 0, "helpers_online_no_gps": 0, "total_online_helpers": 0 },
  "regions": [{ "region": "Africa", "helpers_online": 1, "open_requests": 2, "recent_completions": 0 }],
  "language_distribution": [{ "lang": "en", "count": 3 }],
  "feature_checks": {
    "database": "ok",
    "mapbox_token": false,
    "nia_ai": false,
    "internal_secret": false,
    "redis": false,
    "push_vapid": false,
    "stripe": false,
    "background_checks": false,
    "workers_ok": false
  },
  "config_status": {
    "critical_missing": ["MAPBOX_TOKEN / VITE_MAPBOX_TOKEN", "ANTHROPIC_API_KEY", "INTERNAL_SECRET"],
    "optional_missing": ["VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY", "STRIPE_SECRET_KEY", "CHECKR_API_KEY", "REDIS_URL"],
    "fully_configured": false,
    "nia_service_url": "http://localhost:3001 (dev default)",
    "notes": "⚠️ 3 critical secret(s) missing..."
  },
  "summary": { "total_open_requests": 1, "total_online_helpers": 0, "regions_active": 1, "last_updated": "..." }
}
```

### Key implementation details
- `mapbox_token` checks BOTH `process.env.MAPBOX_TOKEN` and `process.env.VITE_MAPBOX_TOKEN`
- `nia_ai` checks `process.env.ANTHROPIC_API_KEY ?? process.env.NIA_API_KEY`
- `getRegion()` evaluation order: Caribbean → Europe → Middle East → Africa → N. America → S. America → Asia → Oceania
  — ORDER CRITICAL: Europe must precede Africa (southern Europe overlaps Africa's lat range)

### Region boundaries verified:
- Lagos NG (6.5N, 3.4E) → Africa ✓
- Nairobi KE (-1.3S, 36.8E) → Africa ✓  
- Athens GR (37.9N, 23.7E) → Europe ✓
- Riyadh SA (24.7N, 46.7E) → Middle East ✓
- Kingston JM (18.0N, -76.8W) → Caribbean ✓

**Why:** Admin needs real-time visibility into global coverage and missing secrets to keep the platform running worldwide.
