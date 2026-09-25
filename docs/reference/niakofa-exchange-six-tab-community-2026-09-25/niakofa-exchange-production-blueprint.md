# Niakofa Exchange production blueprint

This is a sanitized implementation reference derived from the Exchange
blueprint supplied on 2026-09-25. It keeps the product requirements and
security decisions while intentionally excluding credentials, copied third-party
media, and standalone backend snippets that do not match Niakofa's architecture.

## Experience requirements

- Start with an optional location choice: browser location, ZIP code, city, or
  neighborhood. The Exchange must remain usable when permission is denied.
- Keep the local feed focused on Offers, Needs, Goods, and Services.
- Support listing details and a three-step post flow: intent/resource type,
  content details, and a coarse handoff area.
- Keep coordination inside Niakofa with public-area pickup proposals and
  listing status changes. Do not add checkout, payment, or retail language.
- Treat the Exchange as one destination inside Niakofa's six-tab Community
  shell, not as a replacement for Requests, Services, Messages, or Profiles.

## Safety requirements

- Never expose exact home or pickup coordinates in public listings, APIs, or
  notification payloads.
- Store and query only the coarse area needed for the current Exchange
  experience. Any future geospatial matching must run server-side and return
  distance bands or neighborhood labels, not raw coordinates.
- Reject private contact details, exact addresses, links, and payment handles
  from public listing and pickup fields.
- Require approved authenticated members, rate-limit writes, moderate listing
  text, and provide abuse reporting.
- Keep pickup state transitions transactional and idempotent. A canceled or
  declined request must remain in history without blocking a later request.

## Current implementation boundary

The current Exchange implementation includes location onboarding, local feed
filters, search, listing details, the three-step posting flow, moderation
review, coarse-area privacy, pickup coordination, completion confirmation,
reporting, and approved-member authorization. It intentionally does not claim
to provide payments, checkout, shipping, seller commerce, or a separate chat
system.