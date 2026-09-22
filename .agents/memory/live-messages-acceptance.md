---
name: Live Messages acceptance boundary
description: What evidence is required before calling Niakofa Messages calling and media production-ready.
---

Local Messages contract tests, media-policy tests, protected-route probes, and a clean web preview are not production acceptance.

**Why:** A production call/media release also depends on the actual published URL, the served application commit, an approved disposable account pair, provider readiness, and authenticated browser/API evidence. Without those, a successful local run cannot prove live RTC, attachment, or realtime behavior.

**How to apply:** Check deployment metadata before claiming live acceptance. If no production URL exists, run only non-mutating local gates and report the release as locally verified but production acceptance blocked. When production is available, use pre-provisioned approved states, explicit Bearer headers for API calls, protected media object URLs, and clean up all temporary state outside the repository.