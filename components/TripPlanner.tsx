"use client";

import { useRef, useState } from "react";
import PlanForm from "./PlanForm";
import ItineraryView from "./ItineraryView";
import type { Itinerary, PlanRequest, PlanTrace } from "@/lib/types";

// What the server actually does, in order (see lib/plan.ts).
const LOADING_LINES = [
  "Finding the destination on the map",
  "Writing the plan",
  "Checking every place on OpenStreetMap",
  "Asking for local names of any misses",
  "Reading up on the heritage",
];

export default function TripPlanner() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [trace, setTrace] = useState<PlanTrace | undefined>(undefined);
  const [shareEnabled, setShareEnabled] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  async function handleSubmit(req: PlanRequest) {
    setLoading(true);
    setError(null);
    setItinerary(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }
      setItinerary(data.itinerary as Itinerary);
      setTrace(data.trace as PlanTrace | undefined);
      setShareEnabled(Boolean(data.shareEnabled));
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setTimeout(
        () => resultRef.current?.scrollIntoView({ behavior: still ? "auto" : "smooth" }),
        80
      );
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-10">
      <PlanForm onSubmit={handleSubmit} loading={loading} />

      {loading && <LoadingCard />}

      {error && (
        <div
          role="alert"
          className="rounded-2xl border-2 border-accent-dark bg-accent-soft p-5 font-medium text-accent-dark"
        >
          {error}
        </div>
      )}

      <div ref={resultRef} className="scroll-mt-6">
        {itinerary && (
          <ItineraryView
            itinerary={itinerary}
            shareEnabled={shareEnabled}
            trace={trace}
          />
        )}
      </div>
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="frame p-8 sm:p-10" role="status" aria-live="polite">
      <p className="label">Working on it</p>
      <p className="display mt-3 text-4xl sm:text-6xl">
        Weaving your trip<span className="animate-pulse text-accent">&hellip;</span>
      </p>
      <ol className="mt-8 grid gap-2.5">
        {LOADING_LINES.map((l, i) => (
          <li key={l} className="flex items-center gap-4 font-mono text-sm text-ink-soft">
            <span className="text-accent-dark">0{i + 1}</span>
            {l}
          </li>
        ))}
      </ol>
      <p className="mt-8 border-t-2 border-ink pt-4 text-sm text-muted">
        This usually takes 20 to 40 seconds: the map is asked about one place a second.
      </p>
    </div>
  );
}
