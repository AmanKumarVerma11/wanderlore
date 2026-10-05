"use client";

import { useState } from "react";
import type { Itinerary } from "@/lib/types";
import { googleCalendarUrl, tripToIcs } from "@/lib/calendar";
import { Calendar, Download, ExternalLink } from "./icons";

// The plan has no dates, so the traveller picks the first day; everything is
// built here in the browser.

/** A week from today, as the date input's "YYYY-MM-DD" in local time. */
function nextWeek(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function AddToCalendar({ itinerary }: { itinerary: Itinerary }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("");
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(start);
  const city = itinerary.destinationFull.split(",")[0].trim();

  function toggle() {
    if (!open && !start) setStart(nextWeek()); // computed on open, so the server render has no date
    setOpen(!open);
  }

  function download() {
    const blob = new Blob([tripToIcs(itinerary, start)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${city.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-")}-trip.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // A fragment: the button sits in the actions row with its neighbours, and the
  // panel opens on its own full-width line below them (order-last, basis-full).
  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="calendar-panel"
        className="btn-ghost text-sm"
      >
        <Calendar size={16} /> Add to calendar
      </button>

      {open && (
        <div id="calendar-panel" className="frame order-last mb-2 mt-2 grid basis-full gap-4 p-5 sm:p-6">
          <div className="grid gap-2 sm:max-w-xs">
            <label htmlFor="trip-start" className="label">
              First day of the trip
            </label>
            <input
              id="trip-start"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="rounded-xl border-2 border-ink bg-paper px-3 py-2 font-mono text-ink"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={download} disabled={!valid} className="btn-primary text-sm">
              <Download size={16} /> Download .ics
            </button>
            {valid && (
              <a
                href={googleCalendarUrl(itinerary, start)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost text-sm"
              >
                Add to Google Calendar <ExternalLink size={14} />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            )}
          </div>
          <p className="text-xs leading-relaxed text-muted">
            The file has one all-day event per day, with its places. Apple Calendar and
            Outlook open it directly, and Google Calendar can import it; the Google link
            fills in the whole trip as one event. Festival dates change from year to year, so
            they aren&rsquo;t added.
          </p>
        </div>
      )}
    </>
  );
}
