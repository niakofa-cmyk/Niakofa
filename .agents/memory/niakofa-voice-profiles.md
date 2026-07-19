---
name: Niakofa voice profiles system
description: ElevenLabs/OpenAI TTS routing + regional voice profiles for Nia AI
---

## Rule
Voice profile system is now live. Priority: ElevenLabs (if licensed) → OpenAI nova → browser Web Speech API.

**Files:**
- `artifacts/api-server/src/lib/voiceProfiles.ts` — profile registry (8 profiles: aave_warm, nigerian_en, ghanaian_en, kenyan_en, south_african_en, jamaican_en, haitian_en, default_en)
- `artifacts/api-server/src/routes/nia-voice.ts` — STT (Whisper), TTS (/speak + ElevenLabs routing), profiles list (/profiles)
- `artifacts/pay-it-forward/src/hooks/useNiaTTS.ts` — calls /api/nia/voice/speak first, browser speechSynthesis fallback
- Router mounted via `artifacts/api-server/src/routes/index.ts` line 48

**Env vars needed to unlock community voices:**
- `ELEVENLABS_API_KEY` — enables ElevenLabs routing
- `ELEVENLABS_VOICE_AAVE_WARM`, `ELEVENLABS_VOICE_NIGERIAN_EN`, etc. — per-profile voice IDs

**Why:** Authentic community voices (AAVE, Nigerian English, etc.) require real licensed voices — not pitch/rate shifting which is a caricature. Profile `available: false` means pending license, not broken.

**How to apply:** When adding new voice profiles, add to VOICE_PROFILES map + VOICE_PROFILE_LIST in voiceProfiles.ts only. Route logic in nia-voice.ts auto-picks ElevenLabs or falls back to OpenAI.
