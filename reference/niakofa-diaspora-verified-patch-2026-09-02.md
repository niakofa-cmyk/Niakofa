# Niakofa Diaspora verified patch reference — September 2, 2026

This reference records the Diaspora materials reviewed during the production
readiness pass. The uploaded archive was extracted into an isolated temporary
directory and compared with the current `origin/main`; it was not applied
blindly or extracted over the application.

## Source materials reviewed

- `attached_assets/Pasted-I-ll-first-inventory-the-current-app-read-the-project-m_1788386586240.txt`
- `attached_assets/niakofa-diaspora-verified-patch_1788386629381.zip`
- Existing product guidance in `docs/DIASPORA_EXPERIENCE_AUDIT_2026-09-02.md`

The archive contains the Oral History deep-link helper, trust-first DNA
presentation helper, Heritage contribution schema and migration, proposed
Heritage route additions, and a dashboard refresh. The current main branch
already includes the substantive Diaspora changes and the Heritage persistence
boundary. The archive's route sketch was therefore used as review material,
not copied over the live route.

## Verified application boundary

- Oral History dashboard navigation resolves to a recording-oriented family
  route or an explicit `intent=oral-history` family-list route.
- DNA remains fail-closed until a supported dataset is securely parsed; the
  app does not fabricate match counts or ethnicity results.
- Heritage collection items are read from moderated persisted contributions.
- New contributions are validated, stored as pending, and kept private until
  moderation publishes them.
- The current production database and migration numbering remain authoritative.

## Verification evidence

- `pnpm run typecheck`
- `pnpm run build`
- `npx eslint . --max-warnings 0`
- `node scripts/src/release-validate.js`
- `node scripts/src/audit-routes.mjs`
- API, Nia, endpoint, and repayment test suites
- App/AI boundary check
- Live landing preview: `screenshots/niakofa-ci-fix-preview-2026-09-02.jpg`

The only blocking defect found in the current checkout was a missing
`sonner` toast import in the Heritage Collections page. That import is the
only application-code change in this pass; the rest of the Diaspora behavior
was verified against the existing implementation.

The original upload files remain in `attached_assets/` for session-level
traceability, while this file and the preview capture provide repository-level
continuity.