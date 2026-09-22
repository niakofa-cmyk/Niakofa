# V19 Community + Messages hardening reference

This document records the compatible decisions from the attached
`niakofa-v19-community-messages-hardening_1789766152752.zip` package and the
current-state audit dated 2026-09-18. The canonical implementation remains in
`artifacts/`; the stale mirror under `niakofa-repo/` is not a source tree.

## Applied

- Mounted the existing `MetaStyleDirectPane` for `/messages?mode=direct`,
  preserving the existing Direct API, realtime subscription, search, read
  state, blocking, reporting, and mobile navigation.
- Removed disabled attachment and emoji controls from the shared composer.
  Real attachment storage, upload APIs, and an emoji picker are intentionally
  not represented until their contracts exist.
- Reconciled failed request-completion mutations against the authoritative
  request query and translated structured 403/404/409/5xx responses into
  actionable toast text.
- Presented Hub gratitude and open requests as one chronological Hub stream.
  This remains a read model, not a new social-post backend.
- Clarified the selected-Hub Community Spirals wording without using GPS as a
  membership or discovery gate.

## Preserved boundaries

- Direct, request, and Hub conversations remain separate backend models inside
  one Messages product.
- Hub-to-Hub messaging still requires approved membership to represent the
  source Hub; target-Hub membership is not required merely to initiate a
  conversation.
- Hub membership approval, suspension, revocation, and leaving remain server
  lifecycle states. No new leader-management mutation was invented here.
- The canonical Diaspora Globe and existing selected-Hub secondary actions were
  not rewritten.
- The API server's startup `help_requests` check remains a fail-closed schema
  readiness gate. It does not run migrations, so this package does not add a
  duplicate or misleading migration log.

## Intentionally deferred

- Durable direct-message attachments and media storage.
- A full Hub social-feed backend with durable posts, comments, reactions,
  moderation, pagination, notifications, and per-user visibility rules.
- Automatic retries for completion mutations. The server is idempotent, but a
  stable client operation-key retry contract should be designed and tested
  separately.

## Source references

- Attached audit: `attached_assets/Pasted-I-completed-the-current-state-audit-of-the-connected-Gi_1789766145527.txt`
- Attached package: `attached_assets/niakofa-v19-community-messages-hardening_1789766152752.zip`
- Package patch: `niakofa_v19_package/patches/niakofa-v19-community-messages.patch`
- Package architecture note: `niakofa_v19_package/migration-notes/ARCHITECTURE.md`
- Package completion note: `niakofa_v19_package/migration-notes/REQUEST-COMPLETION.md`
