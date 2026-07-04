import { describe, it, expect } from "vitest";
import { validatePlanRequest, INTERESTS } from "./validate";

describe("validatePlanRequest", () => {
  const valid = {
    destination: "Kyoto",
    interests: [INTERESTS[0], INTERESTS[1]],
    days: 3,
    pace: "balanced",
  };

  it("accepts a well-formed request and normalises it", () => {
    const r = validatePlanRequest(valid);
    expect(r.ok).toBe(true);
    expect(r.value).toMatchObject({
      destination: "Kyoto",
      days: 3,
      pace: "balanced",
    });
    expect(r.value?.interests).toHaveLength(2);
  });

  it("trims the destination", () => {
    const r = validatePlanRequest({ ...valid, destination: "  Lisbon  " });
    expect(r.value?.destination).toBe("Lisbon");
  });

  it("rejects an empty destination", () => {
    const r = validatePlanRequest({ ...valid, destination: "" });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/destination/i);
  });

  it("rejects when no interests are provided", () => {
    const r = validatePlanRequest({ ...valid, interests: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/interest/i);
  });

  it("filters out unknown interests", () => {
    const r = validatePlanRequest({
      ...valid,
      interests: [INTERESTS[0], "Skydiving", "Casinos"],
    });
    expect(r.ok).toBe(true);
    expect(r.value?.interests).toEqual([INTERESTS[0]]);
  });

  it("rejects out-of-range trip lengths", () => {
    expect(validatePlanRequest({ ...valid, days: 0 }).ok).toBe(false);
    expect(validatePlanRequest({ ...valid, days: 8 }).ok).toBe(false);
    expect(validatePlanRequest({ ...valid, days: 30 }).ok).toBe(false);
  });

  it("coerces a numeric-string day value", () => {
    const r = validatePlanRequest({ ...valid, days: "4" });
    expect(r.ok).toBe(true);
    expect(r.value?.days).toBe(4);
  });

  it("defaults pace to balanced only when valid values are given", () => {
    expect(validatePlanRequest({ ...valid, pace: "packed" }).value?.pace).toBe(
      "packed"
    );
    expect(validatePlanRequest({ ...valid, pace: "sprint" }).ok).toBe(false);
  });

  it("truncates and keeps an optional note", () => {
    const long = "a".repeat(500);
    const r = validatePlanRequest({ ...valid, note: long });
    expect(r.value?.note?.length).toBe(400);
  });

  it("rejects non-object bodies", () => {
    expect(validatePlanRequest(null).ok).toBe(false);
    expect(validatePlanRequest("nope").ok).toBe(false);
  });
});
