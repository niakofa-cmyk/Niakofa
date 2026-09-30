---
name: Media output atomicity
description: Durable cleanup and reconciliation rules for externally stored generated media.
---

For each generated media attempt, commit a unique output key to a durable cleanup ledger **before** writing to the external provider. Fence the attempt before promotion. If a database operation reports failure after a provider write, check persisted job and asset state before deleting the object; an acknowledgment can be lost even when the ready-state commit succeeded.

**Why:** Provider writes do not roll back with PostgreSQL. A crash after a write can leave an untracked object, while deleting on an ambiguous commit failure can remove the live video from a successfully committed ready asset.

**How to apply:** Use this rule for any new media variant, composition, or retry worker. Retain discoverable keys until strict deletion or normal tombstone cleanup, and test both genuine rollback and commit-success/acknowledgment-loss cases.