import { describe, expect, it } from "vitest";
import { isAnonymousExploreEnabled, isMemoVisibilityEnabled, resolveDefaultMemoVisibility } from "@/utils/visibility";

describe("anonymous Explore availability", () => {
  it.each([
    { instanceUrl: "", allowedVisibilities: [], expected: false, scenario: "missing instance URL with PUBLIC enabled" },
    {
      instanceUrl: "https://memos.example.com",
      allowedVisibilities: ["PRIVATE"],
      expected: false,
      scenario: "configured instance URL with PUBLIC disabled",
    },
    {
      instanceUrl: "https://memos.example.com",
      allowedVisibilities: [],
      expected: true,
      scenario: "configured instance URL with all visibility levels enabled",
    },
    {
      instanceUrl: "https://memos.example.com",
      allowedVisibilities: ["PRIVATE", "PROTECTED", "PUBLIC"],
      expected: true,
      scenario: "configured instance URL with PUBLIC explicitly enabled",
    },
  ])("returns $expected for $scenario", ({ instanceUrl, allowedVisibilities, expected }) => {
    expect(isAnonymousExploreEnabled(instanceUrl, allowedVisibilities)).toBe(expected);
  });
});

describe("simplified memo visibility policy", () => {
  it("only disables PUBLIC while PRIVATE and PROTECTED remain available", () => {
    const legacyPrivateOnlySetting = ["PRIVATE"];

    expect(isMemoVisibilityEnabled("PRIVATE", legacyPrivateOnlySetting)).toBe(true);
    expect(isMemoVisibilityEnabled("PROTECTED", legacyPrivateOnlySetting)).toBe(true);
    expect(isMemoVisibilityEnabled("PUBLIC", legacyPrivateOnlySetting)).toBe(false);
  });

  it("temporarily falls back to PRIVATE when a saved PUBLIC default is unavailable", () => {
    expect(resolveDefaultMemoVisibility("PUBLIC", ["PRIVATE", "PROTECTED"])).toBe("PRIVATE");
    expect(resolveDefaultMemoVisibility("PROTECTED", ["PRIVATE", "PROTECTED"])).toBe("PROTECTED");
    expect(resolveDefaultMemoVisibility("UNKNOWN", [])).toBe("PRIVATE");
  });
});
