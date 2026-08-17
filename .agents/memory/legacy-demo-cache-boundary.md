---
name: Legacy Demo Cache Boundary
description: Durable deployment rule for the public Legacy RPG deep link.
---

Public `/legacy` navigation must fetch the current HTML document from the
network instead of restoring a service-worker-cached SPA document.

**Why:** Deployments replace content-hashed lazy chunks. A cached document from
an earlier build can reference deleted files and present as a blank screen or
asset 404 even while the current server route and asset graph are healthy.

**How to apply:** Keep Legacy navigations network-only, cache only successful
HTML responses for unrelated navigations, and rotate the service-worker cache
namespace when changing this policy. Keep deployment commit convergence
windows long enough for a normal Railway build-and-rollout cycle.