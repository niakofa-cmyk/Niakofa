# Messages V25 QA and device-certification record

Date prepared: 2026-09-19  
Scope: Niakofa Messages V25 interaction polish and certification support  
Status: **local preview verified; physical-device certification pending**

## What changed

- Added an explicit in-conversation search control in the Direct thread header.
- Added match highlighting, match count, and previous/next navigation.
- Added sender avatars to incoming Direct message rows while preserving the existing conversation/header avatars.
- Kept authenticated attachment fetching, durable read-state APIs, shared websocket events, and LiveKit Direct calling unchanged.
- Added mobile composer semantics: safe-area padding, `aria-busy`, assertive attachment errors, send-key hinting, and a screen-reader keyboard hint.
- Updated the Tailwind v4 PostCSS boundary so the production web build completes.

## Local evidence

| Check | Result | Evidence |
|---|---|---|
| Messages V22–V24 focused contracts | PASS | `tests/messages-v22-enhancement.contract.test.ts`, `tests/v19-community-messages-contract.test.mjs` |
| Messages V25 contract | PASS | `tests/messages-v22-enhancement.contract.test.ts` |
| Pay-it-forward typecheck | PASS | `corepack pnpm --filter @workspace/pay-it-forward run typecheck` |
| Pay-it-forward production build | PASS | `corepack pnpm --filter @workspace/pay-it-forward run build` |
| Changed Messages ESLint scope | PASS | `corepack pnpm exec eslint ...messages...` |
| Replit web workflow | PASS | Vite served successfully on the managed workflow port |
| Preview screenshot | CAPTURED | `screenshots/messages-v25-preview.jpg` (unauthenticated landing route) |

## Not certified in this environment

No physical iPhone Safari or Android Chrome execution was available in this session. The following claims are therefore intentionally **not** marked complete:

- iPhone Safari viewport, keyboard, safe-area, autoplay, microphone, camera, and LiveKit call behavior.
- Android Chrome viewport, keyboard, safe-area, autoplay, microphone, camera, and LiveKit call behavior.
- End-to-end authenticated Globe → Hub → Community → Messages → Spirals navigation on a physical device.
- Production deployment SHA and production websocket/API parity.

The unauthenticated preview screenshot verifies the web artifact boots, but it is not evidence of an authenticated Messages thread or device certification.

## Required physical-device evidence before release certification

For each device/browser pair, attach screenshots and record:

1. Deployed URL and exact deployed commit SHA.
2. Globe → Hub → Community → Messages → Spirals route checkpoints.
3. Direct, Request, and Hub conversation entry points.
4. In-thread search: open, match count, highlight, next/previous, and close.
5. Incoming sender avatar rendering and unread state after refresh.
6. Composer keyboard behavior, attachment/location/link controls, and safe-area spacing.
7. Shared Media authenticated loading.
8. Direct LiveKit voice/video: invite, accept, decline, end, microphone, camera, autoplay recovery.
9. Browser console errors and network failures, with no secrets in screenshots or logs.

Until those artifacts exist, this document should remain marked **pending**, not “device certified.”