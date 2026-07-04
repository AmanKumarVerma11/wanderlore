"use client";

import { useState } from "react";
import { INTERESTS, PACES } from "@/lib/validate";
import type { PlanRequest, Pace } from "@/lib/types";

interface Props {
  onSubmit: (req: PlanRequest) => void;
  loading: boolean;
}

const PACE_LABELS: Record<Pace, string> = {
  relaxed: "Relaxed",
  balanced: "Balanced",
  packed: "Packed",
};

export default function PlanForm({ onSubmit, loading }: Props) {
  const [destination, setDestination] = useState("");
  const [interests, setInterests] = useState<string[]>([
    "Heritage & history",
    "Food & markets",
  ]);
  const [days, setDays] = useState(3);
  const [pace, setPace] = useState<Pace>("balanced");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function toggleInterest(i: string) {
    setInterests((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (destination.trim().length < 2) {
      setError("Please enter a destination.");
      return;
    }
    if (interests.length === 0) {
      setError("Pick at least one interest.");
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

  return (
    <form onSubmit={handleSubmit} className="card p-6 sm:p-8">
      <div className="grid gap-6">
        <div>
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
            className="mt-1.5 w-full rounded-xl border border-line bg-paper px-4 py-3 text-lg outline-none transition placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
        </div>

        <fieldset>
          <legend className="label">What draws you there?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {INTERESTS.map((i) => {
              const on = interests.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleInterest(i)}
                  aria-pressed={on}
                  className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
                    on
                      ? "border-accent bg-accent-soft font-medium text-accent-dark"
                      : "border-line bg-surface text-muted hover:border-accent/50"
                  }`}
                >
                  {i}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="days" className="label">
              Trip length — <span className="text-ink">{days} day{days > 1 ? "s" : ""}</span>
            </label>
            <input
              id="days"
              type="range"
              min={1}
              max={7}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="mt-3 w-full accent-accent"
            />
          </div>

          <div>
            <span className="label">Pace</span>
            <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface p-1">
              {PACES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPace(p)}
                  aria-pressed={pace === p}
                  className={`rounded-md px-2 py-2 text-sm transition-colors ${
                    pace === p
                      ? "bg-ink font-medium text-white"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {PACE_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="note" className="label">
            Anything else? <span className="normal-case text-muted/70">(optional)</span>
          </label>
          <textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Travelling with kids, vegetarian, love live music, mobility needs…"
            maxLength={400}
            rows={2}
            className="mt-1.5 w-full resize-none rounded-xl border border-line bg-paper px-4 py-3 outline-none transition placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-accent-dark">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full text-base">
          {loading ? "Weaving your trip…" : "Weave my cultural trip"}
        </button>
      </div>
    </form>
  );
}
