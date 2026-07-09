---
name: CSP surface (app.ts)
description: What is and isn't allowed in the Content-Security-Policy for Niakofa
---

## Rule
Niakofa uses **Mapbox** for maps, not Google Maps. Google Maps CDN domains must not be in the CSP:
- ❌ `maps.googleapis.com` in `scriptSrc` — Google Maps JS, not loaded
- ❌ `maps.gstatic.com` in `imgSrc` — Google Maps static assets
- ❌ `*.googlevideo.com` in `imgSrc` — Google video CDN, unused

Google Sign-In IS used and requires:
- ✅ `accounts.google.com` in `scriptSrc` and `frameSrc` — GSI button
- ✅ `oauth2.googleapis.com` in `connectSrc` — token verification
- ✅ `lh3.googleusercontent.com` in `imgSrc` — Google profile photos

Mapbox requires:
- ✅ `*.mapbox.com` in `imgSrc`, `connectSrc`, `workerSrc`

**Why:** Overly broad CSP allowlists (especially scriptSrc) meaningfully widen the XSS attack surface. Leftover Google Maps entries were from an earlier draft before the Mapbox migration.
