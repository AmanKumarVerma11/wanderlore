"use client";

import { useState } from "react";
import { INTERESTS, PACES } from "@/lib/validate";
import type { PlanRequest, Pace } from "@/lib/types";
import { ArrowRight, Check } from "./icons";

interface Props {
  onSubmit: (req: PlanRequest) => void;
  loading: boolean;
}

const PACE_LABELS: Record<Pace, string> = {
  relaxed: "Relaxed",
  balanced: "Balanced",
  packed: "Packed",
};

const field =
  "w-full rounded-xl border-2 border-line bg-paper px-4 py-3 text-ink outline-none transition placeholder:text-muted focus:border-ink";

export default function PlanForm({ onSubmit, loading }: Props) {
  const [destination, setDestination] = useState("");
  const [interests, setInterests] = useState<string[]>([
    "Heritage & history",
    "Food & markets",
  ]);
  const [days, setDays] = useState(3);
  const [pace, setPace] = useState<Pace>("balanced");
  const [note, setNote] = useState("");
  const [error, setError] = useState<{ field: "destination" | "interests"; text: string } | null>(null);

  function toggleInterest(i: string) {
    setInterests((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (destination.trim().length < 2) {
      setError({ field: "destination", text: "Please enter a destination." });
      return;
    }
    if (interests.length === 0) {
      setError({ field: "interests", text: "Pick at least one interest." });
      return;
    }
    setError(null);
    onSubmit({
      destination: destination.trim(),
      interests,
      days,
      pace,
      note: note.trim() || undefined,
    });
  }

  const dayWord = days > 1 ? "days" : "day";

  return (
    <form onSubmit={handleSubmit} aria-labelledby="planner-title" className="frame p-6 sm:p-10">
      <div className="flex items-baseline justify-between gap-4 border-b-2 border-ink pb-4">
        <h2 id="planner-title" className="display text-4xl sm:text-5xl">
          Plan a trip
        </h2>
        <span className="label">Four questions</span>
      </div>

      <div className="mt-8 grid gap-10">
        <Step n="01">
          <label htmlFor="destination" className="label">
            Where to?
          </label>
          <input
            id="destination"
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="e.g. Kyoto, Oaxaca, Varanasi, Lisbon…"
            maxLength={80}
            autoComplete="off"
            aria-invalid={error?.field === "destination" || undefined}
            aria-describedby={error?.field === "destination" ? "form-error" : undefined}
            className={`${field} mt-2 font-display text-3xl sm:text-4xl`}
          />
        </Step>

        <Step n="02">
          <fieldset aria-describedby={error?.field === "interests" ? "form-error" : undefined}>
            <legend className="label">What draws you there?</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {INTERESTS.map((i) => {
                const on = interests.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleInterest(i)}
                    aria-pressed={on}
                    className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border-2 px-3 text-sm transition sm:px-4 ${
                      on
                        ? "border-ink bg-ink font-medium text-paper"
                        : "border-line bg-surface text-ink-soft hover:border-ink"
                    }`}
                  >
                    {on && <Check size={14} className="text-accent" />}
                    {i}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </Step>

        <Step n="03">
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <div className="flex items-end justify-between gap-3">
                <label htmlFor="days" className="label">
                  Trip length
                </label>
                <span aria-hidden="true" className="font-display text-4xl leading-none text-ink">
                  {days} <span className="text-lg text-muted">{dayWord}</span>
                </span>
              </div>
              <input
                id="days"
                type="range"
                min={1}
                max={7}
                value={days}
                aria-valuetext={`${days} ${dayWord}`}
                onChange={(e) => setDays(Number(e.target.value))}
                className="mt-3 w-full accent-accent-dark"
              />
              {days > 4 && (
                <p className="mt-2 text-xs text-muted">
                  Longer trips list fewer stops per day, so every place can be checked
                  on the map.
                </p>
              )}
            </div>

            <fieldset>
              <legend className="label">Pace</legend>
              <div className="mt-3 grid grid-cols-3 overflow-hidden rounded-xl border-2 border-ink">
                {PACES.map((p) => (
                  <label key={p} className="cursor-pointer border-ink [&:not(:last-child)]:border-r-2">
                    <input
                      type="radio"
                      name="pace"
                      value={p}
                      checked={pace === p}
                      onChange={() => setPace(p)}
                      className="peer sr-only"
                    />
                    <span className="block px-2 py-2.5 text-center text-sm font-medium text-ink-soft transition peer-checked:bg-ink peer-checked:text-paper peer-focus-visible:ring-[3px] peer-focus-visible:ring-inset peer-focus-visible:ring-accent-dark">
                      {PACE_LABELS[p]}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </Step>

        <Step n="04">
          <label htmlFor="note" className="label">
            Anything else? <span className="normal-case tracking-normal">(optional)</span>
          </label>
          <textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Travelling with kids, vegetarian, love live music, mobility needs…"
            maxLength={400}
            rows={2}
            aria-describedby="privacy-note"
            className={`${field} mt-2 resize-none`}
          />
          <p id="privacy-note" className="mt-2 text-xs text-muted">
            Trip details are sent to AI providers (Google Gemini) to write your plan, so
            please don&rsquo;t include personal details.
          </p>
        </Step>

        {error && (
          <p id="form-error" role="alert" className="rounded-xl border-2 border-accent-dark bg-accent-soft px-4 py-3 text-sm font-medium text-accent-dark">
            {error.text}
          </p>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full py-4 text-lg">
          {loading ? "Weaving your trip…" : "Weave my cultural trip"}
          {!loading && <ArrowRight size={20} />}
        </button>
      </div>
    </form>
  );
}

/** A numbered question: the big number is decoration, the label carries the meaning. */
// On phones the number sits above its question, so the controls get the full width.
function Step({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[3.5rem_minmax(0,1fr)] sm:gap-5">
      <span aria-hidden="true" className="font-display text-2xl leading-none text-accent sm:text-5xl">
        {n}
      </span>
      <div>{children}</div>
    </div>
  );
}
