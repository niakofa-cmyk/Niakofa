---
name: Managed artifact preview ports
description: Port behavior for Replit-managed web artifacts and preview verification.
---

Managed artifacts own their workflow configuration and may assign a preview
port such as 18848 even when a legacy `.replit` entry mentions port 5000.

**Why:** Attempting to override a managed artifact workflow is rejected, and
probing the legacy port can report a false connection failure while the app is
healthy on its assigned port.

**How to apply:** Read the active workflow logs for the actual Vite port, use
that port for visual verification, and only change the artifact configuration
through the artifact workflow surface.