# Niakofa Legacy Demo — deployment verification reference

This reference keeps the uploaded deployment report associated with the
Legacy RPG work. The original report remains in:

`attached_assets/Pasted-Some-checks-were-not-successful-1-failing-and-5-success_1787001971689.txt`

## Reported issue

The report described one failing check:

- `Deploy Verification / Verify Production Deployment`

The App/AI boundary and ESLint checks were successful. The requested public
entry point was the House of Mensah demo at `/legacy/Demo`, including the
mixed-case URL used by older bookmarks.

## Verified baseline

- Canonical source: `artifacts/pay-it-forward/`
- Public route: `/legacy/demo`
- Mixed-case compatibility: `/legacy/Demo` is normalized in the browser
- Railway service: `zesty-ambition-production-f6a1.up.railway.app`
- Health probe: `/api/healthz`
- Asset graph verifier: `pnpm run verify:legacy-demo`

## Deployment-safe behavior

The Legacy route is a public deep link and must not depend on authentication.
Its navigation document must be fetched from the current deployment rather
than restored from a previous service-worker cache. Hashed JavaScript chunks
can be removed during a fresh build, so a cached old HTML document can create
the misleading combination of a blank screen and asset 404s.

The service worker now:

1. bypasses cached HTML for every `/legacy` navigation;
2. reloads the current document from the network;
3. never caches non-OK or non-HTML navigation responses; and
4. rotates its cache namespace so existing clients receive the corrected
   strategy.

The source `index.html` also includes a small dark loading/recovery shell so a
bootstrap delay or unavailable JavaScript bundle is visible instead of an
empty white document.

## Verification commands

```bash
pnpm --filter @workspace/pay-it-forward run test
pnpm --filter @workspace/pay-it-forward run build
pnpm run verify:legacy-demo
```