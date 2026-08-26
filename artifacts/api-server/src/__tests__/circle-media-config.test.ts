import { describe, expect, it } from "@jest/globals";
import { isValidLiveKitUrl, parsePositiveSafeInteger } from "../lib/circleMediaConfig.js";

describe("Circle media configuration", () => {
  it("accepts websocket LiveKit endpoints only", () => {
    expect(isValidLiveKitUrl("wss://media.example.com")).toBe(true);
    expect(isValidLiveKitUrl("ws://localhost:7880")).toBe(true);
    expect(isValidLiveKitUrl("https://media.example.com")).toBe(false);
    expect(isValidLiveKitUrl("not-a-url")).toBe(false);
  });

  it("parses only positive, exact session identifiers", () => {
    expect(parsePositiveSafeInteger("42")).toBe(42);
    expect(parsePositiveSafeInteger("0")).toBeNull();
    expect(parsePositiveSafeInteger("42abc")).toBeNull();
    expect(parsePositiveSafeInteger("9007199254740992")).toBeNull();
  });
});