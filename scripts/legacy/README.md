# Archived one-off scripts and patches

These scripts and patches were moved from the repository root to make it clear
that they are historical, not application entry points or supported workflows.
They are retained for auditability and have not been rewritten.

Do not execute or apply an archived item without first reviewing its complete
contents and confirming that its assumptions still match the current source.
Some scripts assume a repository-root working directory or perform broad
in-place edits. In particular, the location timestamp patch is historical and
must not be applied to current code without a fresh review.

Current application code remains under `artifacts/` and `lib/`; current
production and development commands are defined by the workspace workflows and
package scripts.
