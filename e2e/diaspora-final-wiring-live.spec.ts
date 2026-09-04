/**
 * Opt-in live integration coverage for the final Diaspora wiring gaps.
 *
 * This suite intentionally performs real authenticated API writes against the
 * configured deployment. Run only with a disposable/approved Family Space:
 *   BASE_URL=https://... USER_A_STATE=... ALLOW_MUTATING_E2E=1 \
 *   npx playwright test e2e/diaspora-final-wiring-live.spec.ts
 *
 * It leaves Research evidence behind (there is currently no evidence-delete
 * endpoint), while DNA consent ends revoked and Preserve repeat-scan leaves a
 * single pending idempotent scan row by design.
 */
import { expect, test, type Page } from "@playwright/test";

const base = process.env.BASE_URL || "http://127.0.0.1:5000";
const state = process.env.USER_A_STATE;
const mutate = process.env.ALLOW_MUTATING_E2E === "1";

async function authHeaders(page: Page): Promise<Record<string, string>> {
  // Read the fixture directly from the browser context. Calling page.evaluate
  // before navigation runs in about:blank, where localStorage access is
  // forbidden even when the context has a valid storageState.
  const storageState = await page.context().storageState();
  const token = storageState.origins
    .flatMap((origin) => origin.localStorage)
    .find((entry) => entry.name === "niakofa_token")?.value;
  expect(token).toBeTruthy();
  return { Authorization: `Bearer ${token}` };
}

test.describe("Diaspora final wiring — live authenticated integration", () => {
  test.skip(!state || !mutate, "Set USER_A_STATE and ALLOW_MUTATING_E2E=1 for real DB writes.");
  test.use({ storageState: state });

  test("Research evidence creation persists the selected type", async ({ page }) => {
    const headers = await authHeaders(page);
    const families = await page.request.get(new URL("/api/family/mine", base).toString(), { headers });
    expect(families.ok()).toBeTruthy();
    const familyData = await families.json();
    const family = (familyData.families ?? []).find((item: { status?: string }) => item.status === "active") ?? familyData.families?.[0];
    expect(family?.id).toBeTruthy();

    const casesRes = await page.request.get(new URL(`/api/diaspora/research/cases?family_id=${family.id}`, base).toString(), { headers });
    expect(casesRes.ok()).toBeTruthy();
    const casesData = await casesRes.json();
    const researchCase = casesData.cases?.[0];
    test.skip(!researchCase, "No existing Research case is available for a non-destructive evidence write.");

    const title = `E2E evidence ${Date.now()}`;
    const evidenceRes = await page.request.post(new URL(`/api/diaspora/research/cases/${researchCase.id}/evidence`, base).toString(), {
      headers,
      data: {
        title,
        evidence_type: "oral_history",
        confidence: "possible",
        notes: "Live authenticated E2E verification of the six-type evidence selector payload.",
      },
    });
    expect(evidenceRes.status()).toBe(201);
    const evidence = await evidenceRes.json();
    expect(evidence.evidence.title).toBe(title);
    expect(evidence.evidence.evidence_type).toBe("oral_history");

    await page.goto(new URL("/diaspora/research", base).toString(), { waitUntil: "networkidle" });
    await expect(page.getByText(/Evidence ledger|Add evidence|Research/i).first()).toBeVisible();
  });

  test("Preserve repeat scans are idempotent and return the same scan id", async ({ page }) => {
    const headers = await authHeaders(page);
    const families = await page.request.get(new URL("/api/family/mine", base).toString(), { headers });
    expect(families.ok()).toBeTruthy();
    const familyData = await families.json();
    const family = (familyData.families ?? []).find((item: { status?: string }) => item.status === "active") ?? familyData.families?.[0];
    expect(family?.id).toBeTruthy();

    const qr = `NIakofa-E2E-Preserve-${Date.now()}`;
    const first = await page.request.post(new URL("/api/diaspora/preserve/scan", base).toString(), { headers, data: { qr_code: qr, family_id: family.id } });
    const firstData = await first.json();
    expect(first.status()).toBe(200);
    expect(firstData.scan_id).toBeTruthy();

    const second = await page.request.post(new URL("/api/diaspora/preserve/scan", base).toString(), { headers, data: { qr_code: qr, family_id: family.id } });
    const secondData = await second.json();
    expect(second.status()).toBe(200);
    expect(secondData.scan_id).toBe(firstData.scan_id);
    expect(secondData.idempotent).toBe(true);

    await page.goto(new URL("/diaspora/preserve", base).toString(), { waitUntil: "networkidle" });
    await expect(page.getByText(/Preserve the Culture|Conversation cards/i).first()).toBeVisible();
  });

  test("DNA opt-in then revoke persists the final revoked state", async ({ page }) => {
    const headers = await authHeaders(page);
    const families = await page.request.get(new URL("/api/family/mine", base).toString(), { headers });
    expect(families.ok()).toBeTruthy();
    const familyData = await families.json();
    const family = (familyData.families ?? []).find((item: { status?: string }) => item.status === "active") ?? familyData.families?.[0];
    expect(family?.id).toBeTruthy();

    const optIn = await page.request.post(new URL("/api/diaspora/dna/matching/consent", base).toString(), { headers, data: { family_id: family.id, opted_in: true } });
    expect(optIn.ok()).toBeTruthy();
    expect((await optIn.json()).consent.opted_in).toBe(true);

    const revoke = await page.request.post(new URL("/api/diaspora/dna/matching/consent", base).toString(), { headers, data: { family_id: family.id, opted_in: false } });
    expect(revoke.ok()).toBeTruthy();
    expect((await revoke.json()).consent.opted_in).toBe(false);

    const status = await page.request.get(new URL(`/api/diaspora/dna/matching/status?family_id=${family.id}`, base).toString(), { headers });
    expect(status.ok()).toBeTruthy();
    const statusData = await status.json();
    expect(statusData.consent.opted_in).toBe(false);
    await page.goto(new URL("/diaspora/dna", base).toString(), { waitUntil: "networkidle" });
    await expect(page.getByText(/DNA Connections|Privacy|consent/i).first()).toBeVisible();
  });
});
