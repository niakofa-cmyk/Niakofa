# Niakofa Community Pool financial integrity reference

This reference records the production-hardening handoff for the Community Pool
on September 2, 2026.

## Source material

- Uploaded refactor source: `attached_assets/patch_claim_scope_refactor_1788334498140.py`
- Root launcher: `patch_claim_scope_refactor.py`
- Lifecycle and deployment procedure: `COMMUNITY_POOL_STATE_MACHINE.md` and
  `APPLY.md`
- Read-only database preflight:
  `scripts/verify-community-pool-financial-integrity.sql`

The uploaded asset directory is intentionally ignored by Git as user-provided
material. The tracked documents above preserve the decisions and operating
procedure without copying potentially sensitive uploaded content into the
public repository.

## Product boundary preserved

Niakofa remains the map-first community mutual-aid platform. The Community Pool
continues to fund scoped helper payouts, while financial events remain the
authoritative settlement record and personal History remains a linked
projection. No Legacy RPG runtime is introduced into the platform.