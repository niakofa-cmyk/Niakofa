# Niakofa Diaspora V11 reference

This reference records the uploaded `Niakofa_Diaspora_V11_Hub_Governance_Hardening` package and its source review. The original upload remains available under `attached_assets/`; this file keeps the durable implementation contract with the repository.

## Source package

- Baseline: `main` at `58903997904da25bb51c92fbf3d16afc50d7f635`
- Uploaded archive: `Niakofa_Diaspora_V11_Hub_Governance_Hardening_1789671175993.zip`
- SHA-256: `cb4353cdaf2d51b305e4811a75060533864a2f518855791cda34c5cc99183692`
- Applied on: 2026-09-17

## Governance contract

- Location is presence, not membership.
- An approved account assigned to an approved canonical Home Hub automatically receives ordinary approved `member` membership.
- Additional Hub membership remains an explicit request and governance decision.
- A Hub leader may approve, suspend, revoke, or restore ordinary member participation.
- Only a platform admin may change membership roles.
- A Hub leader may not manage another leader.
- A Hub leader may not modify their own membership through the manager endpoint.
- Hub-to-Hub messaging requires an approved account, approved source Hub, and approved source membership at discovery and send time.
- Target-Hub membership is not required.
- Suspended, revoked, or left source membership must stop future messaging.

## Implemented V11 changes

- Added server-side leader/self/role authorization guards to the membership manager.
- Preserved the existing Hub Leader UI for approve, suspend, and revoke actions.
- Added `hub` as a compatibility alias for `sourceHub` on the Messages route.
- Added `tests/diaspora-hub-governance-v11.contract.test.mjs`.

No migration is required: the baseline already contains the membership lifecycle and automatic Home Hub membership migrations.