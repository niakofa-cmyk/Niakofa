import { describe, it } from "node:test";
import { expect } from "expect";
import { getRequestNavigationPath } from "../request-navigation";

const base = {
  id: 42,
  status: "en_route",
  requesterId: 7,
  helperId: 9,
};

describe("getRequestNavigationPath", () => {
  it("opens live navigation for the assigned helper", () => {
    expect(getRequestNavigationPath({ ...base, currentUserId: 9 })).toBe("/request/42");
  });

  it("opens live tracking for the requester", () => {
    expect(getRequestNavigationPath({ ...base, currentUserId: 7 })).toBe("/request/42/track");
  });

  it("uses read-only details for a non-participant", () => {
    expect(getRequestNavigationPath({ ...base, currentUserId: 11 })).toBe("/request/42/view");
  });

  it("keeps open requests on the detail screen", () => {
    expect(getRequestNavigationPath({ ...base, status: "open", currentUserId: 7 })).toBe("/request/42/view");
  });

  it("does not send a requester to helper navigation when a job is already active", () => {
    expect(getRequestNavigationPath({ ...base, status: "claimed", currentUserId: 7 })).toBe("/request/42/track");
    expect(getRequestNavigationPath({ ...base, status: "claimed", currentUserId: 9 })).toBe("/request/42");
  });
});