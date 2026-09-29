import { promises as fs } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const authPath = new URL("../middlewares/auth.ts", import.meta.url);
const usersPath = new URL("../routes/users.ts", import.meta.url);
const wsHubPath = new URL("../lib/ws-hub.ts", import.meta.url);
const poolPath = new URL("../routes/pool.ts", import.meta.url);
const driftPath = new URL("../lib/ledger-stripe-drift.ts", import.meta.url);

describe("session revocation and spendable pool reconciliation contracts", () => {
  it("enforces token_version on every requireAuth route, not only approved routes", async () => {
    const auth = await fs.readFile(authPath, "utf8");
    const requireAuth = auth.slice(auth.indexOf("export async function requireAuth"), auth.indexOf("/**", auth.indexOf("export async function requireAuth") + 10));

    expect(requireAuth).toMatch(/usersTable\.token_version/);
    expect(requireAuth).toMatch(/req\.authenticatedTokenVersion !== user\.token_version/);
    expect(requireAuth).toMatch(/error_code: "TOKEN_REVOKED"/);
  });

  it("keeps logout as a server-side token-version revocation", async () => {
    const [auth, users, wsHub] = await Promise.all([
      fs.readFile(authPath, "utf8"),
      fs.readFile(usersPath, "utf8"),
      fs.readFile(wsHubPath, "utf8"),
    ]);

    expect(auth).toMatch(/export async function requireAuth/);
    expect(users).toMatch(/POST \/users\/:id\/logout — revoke every token/);
    expect(users).toMatch(/set\(\{ token_version: sql`\$\{usersTable\.token_version\} \+ 1` \}\)/);
    expect(wsHub).toMatch(/usersTable\.token_version/);
    expect(wsHub).toMatch(/tokenVersion !== undefined && tokenVersion === currentUser\.token_version/);
  });

  it("compares the admin balance endpoint with Stripe available funds", async () => {
    const [pool, drift] = await Promise.all([
      fs.readFile(poolPath, "utf8"),
      fs.readFile(driftPath, "utf8"),
    ]);

    const endpoint = pool.slice(pool.indexOf('router.get("/admin/pool/stripe-balance"'));
    expect(endpoint).toMatch(/const drift = Math\.abs\(available - ledgerBalance\)/);
    expect(endpoint).toMatch(/stripe_total: available \+ pending/);
    expect(drift).toMatch(/stripeAvailableCents/);
    expect(drift).toMatch(/Pending Stripe funds are separate/);
  });
});