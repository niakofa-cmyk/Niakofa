# Niakofa uploaded reference materials

These archives are preserved here as traceable inputs for the September 18,
2026 improvement pass. They are reference material, not an additional runtime
or a replacement for the canonical `artifacts/` source tree.

## Files

| Archive | SHA-256 | Inventory |
| --- | --- | --- |
| `generator_1786493339238.zip` | `b98843ce0ca4687b44ef4679b7137b11a9e14af88c6e901666194f442da2d64f` | 8,494 entries: 4,226 source PNGs plus 4,226 macOS metadata PNG entries |
| `niakofa-engine-patch_1786505302048.zip` | `ed20b0024e6b75522a5658ab2da39aa7bd87a32e0f3b2298878317529121923c` | 46 non-directory entries: engine patch, original-art catalog, and tests |

## Review decision

The engine patch was read and checked against the current GitHub `main`
checkout before editing. Its target Legacy Mode engine file and associated
runtime are not present in the current canonical app, so the patch does not
apply cleanly as a targeted change. Importing it would add an unreferenced
historical runtime and risk reintroducing stale snapshot behavior. The
archives remain available here for a future, explicitly scoped Legacy Mode
integration.

The current pass uses the verified parts of the broader reference material:

- requester/helper navigation role routing;
- the API’s `PUT /api/users/:id/availability` contract;
- ETA formats returned by the navigation service;
- valid zero-valued latitude/longitude handling;
- multi-city helper-to-requester navigation coverage.

No archive credentials or secrets were imported. The generator archive remains
compressed so its original metadata and asset grouping stay intact.