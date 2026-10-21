---
name: Railway product project mapping
description: Keep War for Mars deployments separate from the Niakofa app's Railway production.
---

## Rule

- The War for Mars game runs from `niakofa-cmyk/WFM` in Railway project `hopeful-radiance`.
- The Niakofa app runs from `niakofa-cmyk/Niakofa` in Railway project `precious-abundance`.
- Treat their services, builds, deployment status, and production checks as separate. A failure or healthy status in one project is not evidence about the other.

**Why:** the user asked.

**How to apply:** Identify the product and repository first, then inspect or change only its Railway project. Niakofa app work targets `precious-abundance`; War for Mars game work targets `hopeful-radiance`.
