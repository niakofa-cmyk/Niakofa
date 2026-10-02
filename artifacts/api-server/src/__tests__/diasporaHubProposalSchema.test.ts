import { describe, expect, it } from "@jest/globals";
import { ProposeHubSchema } from "../lib/diasporaHubProposalSchema";

const countryProposal = {
  name: "Niakofa Media Certification Test Hub 2026-10-02",
  display_name: "Niakofa Media Certification Test Hub 2026-10-02",
  region_label: "Offshore test marker — no real community",
  lat: 0.5,
  lng: -30,
  tag: "test",
  hub_scope: "country",
  country_code: "AQ",
  subdivision_code: null,
  anchor_city: "Offshore test marker",
  note: "Synthetic Hub used only for approved media privacy certification.",
};

describe("ProposeHubSchema geography", () => {
  it("accepts a non-US canonical country and normalizes its code", () => {
    const result = ProposeHubSchema.safeParse({
      ...countryProposal,
      country_code: " aq ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.country_code).toBe("AQ");
      expect(result.data.display_name).toBe(countryProposal.display_name);
    }
  });

  it("rejects incomplete or contradictory country and state geography", () => {
    const invalidProposals = [
      { ...countryProposal, country_code: "US" },
      { ...countryProposal, subdivision_code: "TX" },
      { ...countryProposal, hub_scope: "us_state", country_code: "CA", subdivision_code: "ON" },
      { ...countryProposal, hub_scope: "us_state", country_code: "US", subdivision_code: null },
      { ...countryProposal, country_code: "ZZZ" },
    ];

    for (const proposal of invalidProposals) {
      expect(ProposeHubSchema.safeParse(proposal).success).toBe(false);
    }
  });

  it("accepts a complete US state identity", () => {
    const result = ProposeHubSchema.safeParse({
      ...countryProposal,
      name: "Texas Test Hub",
      hub_scope: "us_state",
      country_code: "us",
      subdivision_code: "tx",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.country_code).toBe("US");
      expect(result.data.subdivision_code).toBe("TX");
    }
  });
});