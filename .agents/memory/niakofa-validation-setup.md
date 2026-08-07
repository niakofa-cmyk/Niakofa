---
name: Niakofa Repository Validation Setup
description: Durable constraints for repository-wide lint and validation in the Niakofa monorepo.
---

# Rule

The repository-wide lint command must use a single active flat ESLint configuration. Historical nested checkouts, archived source trees, generated output, dependencies, and uploaded assets are not active production source and must be excluded from that configuration.

**Why:** A duplicate flat config caused ESLint to select stale rules and scan a nested historical checkout, obscuring the real state of the production workspace and producing misleading failures.

**How to apply:** When changing ESLint setup, verify `npx eslint .` resolves one config, ignores `niakofa-repo/**` and other non-production trees, and still reports active-source findings. Treat remaining active-source findings as a separate cleanup effort rather than weakening release validation.