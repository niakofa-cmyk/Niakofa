# Niakofa V17.2.1 integration reference

Baseline: `c0437d43a1c0ba839a78a0592aab5c4ba4fbec34`.

This release is additive. It preserves the unified `/messages` product,
Requests lifecycle, Hub governance, curated Spirals, and Mapbox routing.

## Source changes

- Community Spirals derive Hub context reactively from the current router
  location, preserve `hubId` for neighborhood and full-directory discovery,
  and display a lightweight context indicator.
- Civic Mark Complete retries one transient HTTP 5xx response. The backend is
  replay-safe, so a response lost after commit can return the existing
  completion and invoice. Non-5xx errors retain the server's error text.

## Verification gate

Run the focused contract test, then the complete repository checks:

```bash
node --test tests/v17-2-1-package-contract.test.mjs
git diff --check
```

This reference does not authorize GitHub pushes, Railway deploys, or real-data
completion mutations. Real-device acceptance should cover Globe → Hub →
Community → Messages/Spirals and the civic completion retry path.