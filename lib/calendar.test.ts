import { describe, it, expect } from "vitest";
import { dayStamp, escapeText, foldLine, googleCalendarUrl, tripToIcs } from "./calendar";
import type { EnrichedPlace, Itinerary } from "./types";

const place = (name: string, verified = true): EnrichedPlace => ({
  name,
  type: "attraction",
  blurb: "b",
  significance: "s",
  bestTime: "Morning",
  geoQuery: name,
  lat: verified ? 35 : null,
  lng: verified ? 135 : null,
  verified,
  geoStatus: verified ? "verified" : "not_found",
  osmUrl: verified ? "https://www.openstreetmap.org/node/1" : null,
});

const TRIP = {
  destinationFull: "Kyoto, Japan",
  days: [
    { day: 1, theme: "Temples, gardens; tea", items: [place("Kinkaku-ji"), place("Aburahaya", false)] },
    { day: 2, theme: "Markets", items: [place("Nishiki Market")] },
  ],
} as unknown as Itinerary;

const octets = (s: string) => new TextEncoder().encode(s).length;

describe("dayStamp", () => {
  it("adds days across month and year ends", () => {
    expect(dayStamp("2026-10-03", 0)).toBe("20261003");
    expect(dayStamp("2026-01-31", 1)).toBe("20260201");
    expect(dayStamp("2026-12-31", 1)).toBe("20270101");
    expect(dayStamp("2028-02-28", 1)).toBe("20280229"); // a leap year
  });
});

describe("escapeText", () => {
  it("escapes the characters RFC 5545 reserves", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });
});

describe("foldLine", () => {
  it("leaves short lines alone", () => {
    expect(foldLine("SUMMARY:Day 1")).toBe("SUMMARY:Day 1");
  });

  it("folds at 75 octets without splitting a character", () => {
    const line = `DESCRIPTION:${"京都の寺".repeat(20)}`; // 3 octets per character
    const parts = foldLine(line).split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => octets(p) <= 75)).toBe(true);
    expect(parts.slice(1).every((p) => p.startsWith(" "))).toBe(true);
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(line); // nothing lost
  });
});

describe("tripToIcs", () => {
  const ics = tripToIcs(TRIP, "2026-12-31", new Date("2026-10-03T12:00:00Z"));

  it("writes one all-day event per day, from the start date", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101");
    expect(ics).toContain("DTSTART;VALUE=DATE:20270101\r\nDTEND;VALUE=DATE:20270102");
    expect(ics).toContain("DTSTAMP:20261003T120000Z");
  });

  it("escapes the text and links only places found on the map", () => {
    const unfolded = ics.replace(/\r\n /g, ""); // how a calendar app reads it
    expect(unfolded).toContain("SUMMARY:Day 1 in Kyoto: Temples\\, gardens\\; tea");
    expect(unfolded).toContain("Kinkaku-ji (Morning) https://www.openstreetmap.org/node/1\\nAburahaya (Morning)");
    expect(ics.split("\r\n").every((l) => octets(l) <= 75)).toBe(true);
  });
});

describe("googleCalendarUrl", () => {
  it("adds the whole trip as one all-day event", () => {
    const url = new URL(googleCalendarUrl(TRIP, "2026-10-03"));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("Trip to Kyoto");
    expect(url.searchParams.get("dates")).toBe("20261003/20261005");
    expect(url.searchParams.get("details")).toContain("Day 1: Temples, gardens; tea\n- Kinkaku-ji");
    expect(url.searchParams.get("location")).toBe("Kyoto, Japan");
  });
});
