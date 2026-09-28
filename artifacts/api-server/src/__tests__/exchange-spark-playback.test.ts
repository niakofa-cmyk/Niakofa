import { describe, expect, it, jest } from "@jest/globals";
import {
  issueExchangeSparkPlaybackGrant,
  verifyExchangeSparkPlaybackGrant,
} from "../lib/exchange-spark-playback";

const secret = "test-session-secret-with-at-least-32-characters";

describe("secure Exchange Spark playback grants", () => {
  it("is short-lived, private, same-origin scoped, and bound to one asset", () => {
    const clock = jest.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    try {
      const grant = issueExchangeSparkPlaybackGrant(51, 9, 4, secret, true);
      const header = grant.cookie.split(";")[0];
      expect(grant.expiresAt).toBe(1_800_000_120_000);
      expect(grant.cookie).toContain("Path=/api/media-assets/51/play; HttpOnly; SameSite=Strict; Max-Age=120; Secure");
      expect(grant.cookie).not.toMatch(/;\s*Domain=/i);
      expect(verifyExchangeSparkPlaybackGrant(header, 51, secret)).toMatchObject({
        assetId: 51, userId: 9, tokenVersion: 4,
      });
      expect(verifyExchangeSparkPlaybackGrant(header, 52, secret)).toBeNull();
      clock.mockReturnValue(grant.expiresAt);
      expect(verifyExchangeSparkPlaybackGrant(header, 51, secret)).toBeNull();
    } finally {
      clock.mockRestore();
    }
  });

  it("rejects tampering and ambiguous or malformed cookies", () => {
    const grant = issueExchangeSparkPlaybackGrant(51, 9, 4, secret, false);
    const header = grant.cookie.split(";")[0];
    expect(grant.cookie).not.toContain("; Secure");
    expect(verifyExchangeSparkPlaybackGrant(`${header}; ${header}`, 51, secret)).toBeNull();
    expect(verifyExchangeSparkPlaybackGrant(header.replace(".9.", ".10."), 51, secret)).toBeNull();
    expect(verifyExchangeSparkPlaybackGrant(`niakofa_exchange_spark_playback=\"${header.split("=")[1]}\"`, 51, secret)).toBeNull();
    expect(verifyExchangeSparkPlaybackGrant(header, 51, "wrong-secret-with-at-least-32-characters")).toBeNull();
  });
});