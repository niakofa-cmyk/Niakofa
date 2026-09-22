---
name: Niakofa county/community geo-match must not fall back silently
description: request-new.tsx GPS→county matching bug pattern — no match must mean no match, never an arbitrary default.
---
- `request-new.tsx` reverse-geocodes the request pin and matches it against the loaded `communities` list. It used to fall back to `communities[0]` whenever nothing matched, which silently enrolled requesters in unrelated/arbitrary counties whenever their real location wasn't covered yet (e.g. a pin in Recife, Brazil — no US county matches, so it got the first county in the list by default).
- Fixed: `communities[0]` is only a legitimate default *before* a pin exists (nothing to match against yet). Once `pinLocation` is set, a null match must stay null — the UI shows an explicit "your area doesn't have an active pool yet" state instead of a wrong county's health/name.
- **Why:** this class of bug is invisible in normal testing because in-coverage users never hit the fallback branch; it only surfaces for genuinely out-of-area users, who then silently get the wrong pool credited.
- **How to apply:** any `X.find(...) ?? X[0]` (or similar) pattern on a geo/coverage match is suspect — check whether "no match" is a real, valid state that needs its own UI before defaulting to the first item in a list.
