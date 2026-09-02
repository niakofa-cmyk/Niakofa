# CI enforcement hardening — second forensic pass

Changes:
- ESLint is now a blocking gate; failures can no longer be masked with `|| echo`.
- Workflow permissions are explicitly read-only.
- Concurrency cancellation prevents obsolete CI runs from consuming capacity.
- Test and release jobs have bounded execution time.
- Release validation remains dependent on all quality gates.

Operational note: branch protection rules (required status checks, review count,
and direct-push restrictions) are repository settings and cannot be guaranteed
solely by this workflow file. Configure them separately for main.
