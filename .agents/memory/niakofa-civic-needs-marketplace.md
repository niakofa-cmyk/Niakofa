---
name: Civic needs marketplace frontend
description: Where the two-way civic needs marketplace UI lives and how it's wired in
---

The civic needs marketplace (sponsors post needs, helpers/businesses claim,
NET30 invoicing) has a dedicated frontend page separate from the older
one-way `civic-portal.tsx` sponsor request board. Do not conflate the two.

- Page: `src/pages/civic-needs.tsx`, route `/civic-needs`, lazy-loaded in `App.tsx`.
- Three tabs: Browse (open needs + your claimed needs with "mark complete"),
  My Needs (sponsor's posted needs, cancel + view invoice), Post (sponsor-only form).
- Sponsor eligibility is checked client-side via `GET /gov-sponsors/mine`,
  filtering for `approval_status === "approved"`. Non-sponsors can browse/claim
  but not post.
- Entry points: linked from `community.tsx` county tab, and from the Globe
  hub detail panel (`globe.tsx`) as a general "Civic needs marketplace" CTA.
- BottomNav has no free slot (5 fixed tabs) — new marketplace features should
  link in from existing pages rather than trying to add a 6th nav slot.
