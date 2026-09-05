---
name: App-to-Nia HTTP boundary
description: Provider access and feature-service calls are isolated behind Nia's internal authenticated HTTP boundary.
---

The API server must not import an AI provider SDK or make feature-level direct calls to Nia. Provider access belongs in `nia-service`; API routes and workers use the centralized authenticated Nia client, which adds the internal secret, bounds request time, rejects unsafe paths, and normalizes network failures.

**Why:** Keeping one choke point prevents accidental unauthenticated calls, keeps the Nia kill-switch and service separation enforceable, and avoids exposing provider credentials in the app runtime.

**How to apply:** New AI-backed API functionality goes in a Nia-service endpoint with internal-secret validation; API source and generated bundles must pass the App/AI boundary checker. Health probes and the existing streaming proxy are infrastructure exceptions, not feature call sites.