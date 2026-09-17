# Niakofa Diaspora V9 Globe Consolidation Reference

Source materials reviewed on 2026-09-17:

- `attached_assets/Pasted-I-checked-the-updated-GitHub-repo-and-Railway-productio_1789651421202.txt`
- `attached_assets/Niakofa_Diaspora_V9_Globe_Consolidation_Patch_1789651429525.zip`
- Pre-change application capture: `screenshots/pre-v9-audit-2026-09-17.jpg`

## Product contract

Niakofa's Diaspora surface is Globe-first:

`Diaspora → Globe → Hub → Action`

The following concepts remain separate:

1. **Location** — where a person is physically located.
2. **Presence** — a live operational signal.
3. **Membership** — an explicit relationship with a Hub.
4. **Representation** — permission to speak as that Hub.

GPS or presence never creates membership. Hub-to-Hub messaging requires approved
membership in the source Hub; membership in the target Hub is not required.

## Geography contract

- Non-U.S. canonical Hubs are country-level.
- U.S. canonical Hubs are state-level.
- Legacy local/city rows remain available for history and aggregation but belong
  under a canonical Hub through `primary_hub_id`.
- The Globe must not present legacy local rows as competing country/state markers.

## Globe contract

Initial `/diaspora` state:

- Globe as the primary viewport.
- Compact search for country, state, and local context.
- No duplicate dashboard/stat-card wall.
- Optional entry into Messages.

After selection, the Hub context exposes:

- Community
- Message Hub
- Spirals

Stories, Family, Pool, and local communities remain secondary actions behind the
selected Hub. Visual branches are contextual cues only and do not imply factual
migration or family movement without authoritative data.

## Route and mobile contract

- `/diaspora` is canonical.
- `/diaspora?hub=<id-or-name>` selects a Hub.
- `/diaspora/messages?sourceHub=<id-or-name>&targetHub=<id-or-name>` preserves
  messaging context.
- `/globe` and `/diaspora/heritage/globe` remain compatibility routes and
  preserve Hub query context when normalizing to `/diaspora`.
- Marker selection, search selection, and deep-link selection must converge on
  the same selected-Hub state.
- The mobile Hub sheet stays above bottom navigation and the safe-area inset.
- Critical actions must not depend on hover.

## Production notes

The reviewed Railway deployment reported successful `/api/healthz` and
`/api/readiness` checks. `/api/health` returned 503 in that review and remains a
separate operational contract to investigate if it is intended to be public.

## V9 acceptance checklist

- [x] Globe → Message Hub uses `/diaspora/messages` with source Hub context.
- [x] Messages page accepts numeric or name-based source/target Hub deep links.
- [x] Country and U.S. state Hub semantics are shared by Globe and Messages.
- [x] Legacy Globe paths preserve their Hub query during normalization.
- [x] Regression tests cover Hub labels, route context, and Hub references.
- [ ] Authenticated production browser acceptance remains a release gate.
- [ ] Railway health/readiness smoke must be rerun against the deployed commit.