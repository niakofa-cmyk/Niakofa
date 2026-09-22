---
name: Civic Census coverage
description: Boundary between official Census enrichment and verified offline civic coverage.
---

The civic coverage seed must treat non-JSON Census responses, including the provider's missing-key HTML response, as an unavailable enrichment source rather than as valid geography data. It should retain the verified offline Texas county baseline, skip unverified place rows, and accept an optional Census API key for full county/place refreshes.

**Why:** An upstream Census response can be HTTP-successful but still be an HTML error page. Silently parsing or substituting unverified places would weaken jurisdiction accuracy and reintroduce cross-area resource leakage.

**How to apply:** Keep fallback rows provenance-labeled and independently verified; only populate Census place registries from a structurally valid Census response. Configure the optional key through Replit Secrets when national place coverage is required.