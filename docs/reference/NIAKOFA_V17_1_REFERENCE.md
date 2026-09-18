# Niakofa V17.1 Reference

This directory records the reviewed V16/V17.1 hardening package and the
production-facing decisions carried into the canonical `artifacts/` source.
The uploaded archives were treated as reference material, not as repository
overlays.

## Source references

| Reference | SHA-256 |
| --- | --- |
| Niakofa Community + Diaspora V16 Hardening | `f5ecf96a3a05cbbc61396209b13fe87f7eb99d33020c54c9a269d9f562437ad2` |
| Niakofa V16 Verified Evaluation | `f4ff35f8a063ae7da6444b1ff7719bc8a44b52213f3b46487ac49ea461d2a69b` |
| Niakofa V17.1 Messages + Hub Feed + Spirals Hardening | `a9309011c6cb30697fb221f6826d490569b58e50567b48c0f0a2f50a916c193c` |

## Implemented integration

- `/api/community/hubs/:hubId/feed` is an authenticated, canonical-root Hub
  read model. It keeps membership, location, representation, and leadership
  separate.
- `/community?hubId=...` now shows the full Hub context panel, including
  membership, open-request, and gratitude counts plus scoped previews.
- Direct Messages uses one responsive inbox/thread surface while retaining the
  existing REST, WebSocket, read, block, and report behavior.
- Globe-selected Spirals use the shared `/audio-spirals?hubId=...` helper;
  `hubId` is context only and never grants membership or requires GPS.
- The real-device release checklist is preserved in `DEVICE_QA.md`.

## Baseline visual evidence

`visual-baseline-before.jpg` records the authenticated-gate state observed at
the start of this integration. It is reference evidence, not application
runtime content.

## Release boundary

The source changes must pass the package contract, frontend and backend
typechecks, the full API test command, the web build, and the device QA
sequence before being treated as production-ready. A successful source or CI
check is not a substitute for authenticated production mutation tests.