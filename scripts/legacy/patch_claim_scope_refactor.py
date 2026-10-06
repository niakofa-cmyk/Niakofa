#!/usr/bin/env python3
"""Run the uploaded claim-scope refactor against this repository.

The uploaded source lives under attached_assets/, so its own path-based root
would otherwise resolve to that directory instead of the repository root.
"""

from pathlib import Path


SOURCE = Path("attached_assets/patch_claim_scope_refactor_1788334498140.py")
source = SOURCE.read_text()
source = source.replace(
    "REPO_ROOT = pathlib.Path(__file__).resolve().parent",
    "REPO_ROOT = pathlib.Path.cwd()",
    1,
)
exec(compile(source, str(SOURCE), "exec"), {"__name__": "__main__"})