import { test } from "node:test";
import assert from "node:assert/strict";
import { exchangeAuditTarget } from "./exchange-audit-target.mjs";

const env = {
  EXCHANGE_AUDIT_DATABASE_URL: "postgresql://audit:synthetic@confirmed.invalid:48530/railway",
  EXCHANGE_PRODUCTION_SCHEMA_AUDIT: "1",
  EXCHANGE_AUDIT_EXPECTED_HOST: "confirmed.invalid",
  EXCHANGE_AUDIT_EXPECTED_PORT: "48530",
};
test("production audit accepts only the confirmed host AND port", () => {
  assert.equal(exchangeAuditTarget(env).config.port, 48530);
  for (const replacement of [
    { EXCHANGE_AUDIT_EXPECTED_HOST: "other.invalid" },
    { EXCHANGE_AUDIT_EXPECTED_PORT: "5432" },
    { EXCHANGE_AUDIT_EXPECTED_HOST: "" },
    { EXCHANGE_PRODUCTION_SCHEMA_AUDIT: "" },
  ]) assert.throws(() => exchangeAuditTarget({ ...env, ...replacement }));
});
test("development URL cannot accidentally substitute for production evidence", () => {
  assert.throws(() => exchangeAuditTarget({ ...env, EXCHANGE_AUDIT_DATABASE_URL: "postgres://u:p@localhost/db" }), /UNCONFIRMED_DATABASE_TARGET/);
  assert.equal(exchangeAuditTarget({ DATABASE_URL: "postgres://u:p@localhost/db" }).local, true);
});
test("driver query overrides cannot replace the verified endpoint", () => {
  for (const key of ["host", "hostaddr", "port", "dbname", "options", "connectionString"]) {
    assert.throws(() => exchangeAuditTarget({ ...env,
      EXCHANGE_AUDIT_DATABASE_URL: `${env.EXCHANGE_AUDIT_DATABASE_URL}?${key}=elsewhere`,
    }), /AUDIT_CONNECTION_OVERRIDE_REJECTED/);
  }
});
test("malformed connections fail with a code, not the connection value", () => {
  assert.throws(() => exchangeAuditTarget({ DATABASE_URL: "not-a-uri-sensitive" }), { message: "INVALID_AUDIT_CONNECTION" });
  assert.throws(() => exchangeAuditTarget({}), { message: "AUDIT_CONNECTION_REQUIRED" });
});
