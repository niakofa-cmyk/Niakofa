---
name: Niakofa story-to-action flow
description: Full story-to-action pipeline from Diaspora Globe to request creation: how hub panels and story cards link to request-new.tsx with URL pre-fill.
---

# Niakofa Story-to-Action Flow

## Architecture
Globe → hub panel "Request help" button → `/request/new?title=...&neighborhood=...&diaspora_tag=...` → pre-filled form with story-inspired banner.

## Globe Hub Panel (globe.tsx)
- Hub panel has "Request help from this community ↗" button (primary/10 bg, MapPin icon)
- Button only visible to `currentUser` (authenticated)
- URL params: `title=Inspired by: ${hub.name} community`, `neighborhood=${hub.name}`, `diaspora_tag=${hub.tag}`
- Also: hub grid cards now show `open_requests` count and `story_count`

## Request New Page (request-new.tsx)
- Reads URL params via `new URLSearchParams(window.location.search)` on mount (SSR-safe)
- `prefillTitle`, `prefillNeighborhood` come from params
- `storyInspiredBanner` state = `!!prefillTitle`; drives banner UI
- `defaultValues` of form pre-filled with title and description from params
- Draft restore skips when `prefillTitle` is truthy (URL params take priority over saved draft)
- Shows cyan Globe banner: "Inspired by a Diaspora story — Pre-filled from the Diaspora Globe — edit freely"

## NiaDrawer TTS Gating
- `useNiaTTS({ enabled: open && niaEnabled === true, ... })` — TTS only active when Nia is enabled AND drawer is open
- Prevents TTS from firing if kill-switch is flipped while drawer is mounted

**Why:** TTS `enabled: true` was hardcoded, meaning voice would play even if admin disabled Nia mid-session.
