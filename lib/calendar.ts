// The plan as calendar entries, built in the browser (no server, no third-party
// call): an .ics file (RFC 5545) with one all-day event per day, which Apple
// Calendar and Outlook add directly and Google Calendar imports; and a Google
// Calendar link that adds the whole trip as one event. Festivals stay out: the
// plan gives their usual season, not a date.

import type { Itinerary } from "./types";

/** `start` ("2026-10-03") plus `n` days, as an iCalendar date: "20261005". */
export function dayStamp(start: string, n: number): string {
  const [y, m, d] = start.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10).replace(/-/g, "");
}

/** RFC 5545 3.3.11: escape backslashes, semicolons, commas and line breaks. */
export function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

const utf8Length = (cp: number) => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4);

/**
 * RFC 5545 3.1: lines over 75 octets continue on the next line after CRLF and a
 * space, and a multi-byte character is never split.
 */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let part = "";
  let octets = 0;
  for (const ch of line) {
    const n = utf8Length(ch.codePointAt(0) ?? 0);
    const limit = parts.length ? 74 : 75; // continuation lines start with a space
    if (octets + n > limit) {
      parts.push(part);
      part = "";
      octets = 0;
    }
    part += ch;
    octets += n;
  }
  parts.push(part);
  return parts.join("\r\n ");
}

const cityOf = (it: Itinerary) => it.destinationFull.split(",")[0].trim();

function dayLines(day: Itinerary["days"][number]): string[] {
  return day.items.map((p) => {
    const link = p.verified && p.osmUrl ? ` ${p.osmUrl}` : "";
    return `${p.name} (${p.bestTime})${link}`;
  });
}

/** One all-day event per day, starting on `start` ("YYYY-MM-DD"). */
export function tripToIcs(it: Itinerary, start: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const id = `${dayStamp(start, 0)}-${cityOf(it).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-")}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Wanderlore//Trip plan//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  it.days.forEach((day, i) => {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${id}-day${i + 1}@wanderlore.amankrverma.in`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dayStamp(start, i)}`,
      `DTEND;VALUE=DATE:${dayStamp(start, i + 1)}`,
      `SUMMARY:${escapeText(`Day ${i + 1} in ${cityOf(it)}: ${day.theme}`)}`,
      `LOCATION:${escapeText(it.destinationFull)}`,
      `DESCRIPTION:${escapeText(dayLines(day).join("\n"))}`,
      "END:VEVENT"
    );
  });
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

const MAX_DETAILS = 1500; // keeps the link well under URL length limits

/** A link that opens Google Calendar with the whole trip as one all-day event. */
export function googleCalendarUrl(it: Itinerary, start: string): string {
  let details = it.days
    .map((day, i) => `Day ${i + 1}: ${day.theme}\n${day.items.map((p) => `- ${p.name}`).join("\n")}`)
    .join("\n\n");
  if (details.length > MAX_DETAILS) details = `${details.slice(0, MAX_DETAILS - 3)}...`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Trip to ${cityOf(it)}`,
    dates: `${dayStamp(start, 0)}/${dayStamp(start, it.days.length)}`, // all-day; the end is exclusive
    details: `${details}\n\nPlanned with Wanderlore`,
    location: it.destinationFull,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
