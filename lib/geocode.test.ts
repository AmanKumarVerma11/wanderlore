import { describe, it, expect } from "vitest";
import { queryVariants } from "./geocode";

describe("queryVariants", () => {
  it("keeps the full query first, then falls back to broader shapes", () => {
    const v = queryVariants("Dashashwamedh Ghat, Varanasi, India");
    expect(v[0]).toBe("Dashashwamedh Ghat, Varanasi, India");
    expect(v).toContain("Dashashwamedh Ghat, Varanasi");
    expect(v).toContain("Dashashwamedh Ghat Varanasi");
    expect(v).toContain("Dashashwamedh Ghat");
  });

  it("uses the city (second-to-last segment), skipping a middle locality", () => {
    // "Name, Neighbourhood, City, Country" -> city is Varanasi, not Bhadaini
    const v = queryVariants("Lolark Kund, Bhadaini, Varanasi, India");
    expect(v).toContain("Lolark Kund Varanasi");
    expect(v).toContain("Lolark Kund");
  });

  it("strips parenthetical notes from the name", () => {
    const v = queryVariants("Nishiki Market (food street), Kyoto, Japan");
    expect(v).toContain("Nishiki Market");
  });

  it("dedupes and handles a bare name", () => {
    const v = queryVariants("Louvre");
    expect(v).toEqual(["Louvre"]);
  });

  it("handles a name + city with no country", () => {
    const v = queryVariants("Hawa Mahal, Jaipur");
    expect(v[0]).toBe("Hawa Mahal, Jaipur");
    expect(v).toContain("Hawa Mahal Jaipur");
    expect(v).toContain("Hawa Mahal");
  });
});
