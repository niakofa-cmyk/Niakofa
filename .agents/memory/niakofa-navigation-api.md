---
name: Niakofa Navigation API — Mapbox params and traffic logic
description: Key decisions for the navigation.ts Mapbox Directions v5 proxy — URL params, caching, traffic computation, and voice instruction handling.
---

## Mapbox Directions URL params

**Driving profile:**
```
steps=true&geometries=geojson&overview=full
&depart_at=<ISO>&annotations=congestion,maxspeed&voice_instructions=true&voice_units=imperial
&language=en
```

**Walking/Cycling:**
```
steps=true&geometries=geojson&overview=full
&voice_instructions=true&voice_units=imperial
&language=en
```

**Timeout:** 12 s (was 8 s — mobile networks need the extra margin).

## Route cache TTL
- Driving: 2 min (traffic changes fast)
- Walking/Cycling: 10 min

**Why:** 3 min was too stale for city driving; 2 min is aggressive but safe given the in-process Map cache.

## Voice instructions
- Mapbox returns `step.voice_instructions[]` — each entry has `announcement` and `distanceAlongGeometry`
- Take the LAST entry (smallest distance, closest approach) as the canonical `voice_announcement`
- Falls back to `step.maneuver.instruction` if no voice instructions
- Client uses `step.voice_announcement ?? step.instruction` for TTS

## computeTrafficLevel — critical rule
**Always use `congestion.length` as the denominator** (all segments, including unknown/null/other), NOT the count of recognized levels.

```typescript
const total = congestion.length;           // ALL segments
const knownTotal = sum of recognized counts;
if (knownTotal === 0) return "unknown";    // no recognized data at all
// threshold check uses /total, not /knownTotal
if (counts[level] / total > 0.2) return level;
```

**Why:** Using only recognized-level count inflates severity — e.g., if 90% of segments are "unknown" and 11% are "heavy", the recognized-only denominator makes heavy appear as 100%, triggering a false alarm.

## Response fields added
- `traffic_level`: "low"|"moderate"|"heavy"|"severe"|"unknown"
- `congestion_segments`: total input annotation segments
- `eta_text` now appends `" (moderate traffic)"` etc. for non-low driving routes
- Steps now include `voice_announcement` field
