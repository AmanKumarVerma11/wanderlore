import { describe, it, expect } from "vitest";
import { isRestrictedCountry } from "./region";

describe("isRestrictedCountry", () => {
  it("restricts EU, EEA, Swiss and UK visitors", () => {
    for (const c of ["DE", "FR", "IE", "RE", "NO", "IS", "LI", "CH", "GB", "gb"]) {
      expect(isRestrictedCountry(c)).toBe(true);
    }
  });

  it("allows everyone else, and requests with no country header (local dev)", () => {
    for (const c of ["IN", "US", "JP", "TR", "UA", "RS"]) {
      expect(isRestrictedCountry(c)).toBe(false);
    }
    expect(isRestrictedCountry(null)).toBe(false);
  });
});
