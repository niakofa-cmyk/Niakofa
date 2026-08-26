# Niakofa Circles LiveKit upload

This folder preserves the exact source materials supplied for the Circles
production hardening pass on August 25, 2026:

- `niakofa-circles-livekit-sfu.tar.gz` — the original LiveKit client/server
  integration package, including its tests and self-hosting examples.
- `inventory-report.txt` — the accompanying inventory and implementation
  report.

The production implementation lives in the canonical `artifacts/` workspaces.
The preserved archive is reference-only; do not build a second runtime from
these copies. Real LiveKit credentials must remain in deployment secrets, never
in this folder or the repository.