"use client";

import { useRef, useState } from "react";
import PlanForm from "./PlanForm";
import ItineraryView from "./ItineraryView";
import type { Itinerary, PlanRequest } from "@/lib/types";

const LOADING_LINES = [
  "Consulting local guides…",
  "Uncovering hidden gems…",
  "Verifying places on the map…",
  "Reading up on the heritage…",
  "Weaving your story…",
];

export default function TripPlanner() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
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
      setShareEnabled(Boolean(data.shareEnabled));
      setTimeout(
        () => resultRef.current?.scrollIntoView({ behavior: "smooth" }),
        80
      );
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-8">
      <PlanForm onSubmit={handleSubmit} loading={loading} />

      {loading && <LoadingCard />}

      {error && (
        <div
          role="alert"
          className="card border-danger/30 bg-danger/5 p-5 text-danger"
        >
          {error}
        </div>
      )}

      <div ref={resultRef}>
        {itinerary && (
          <ItineraryView itinerary={itinerary} shareEnabled={shareEnabled} />
        )}
      </div>
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="card grid gap-3 p-8" aria-live="polite" aria-busy="true">
      <div className="flex items-center gap-3">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <span className="font-medium text-ink">Weaving your cultural trip…</span>
      </div>
      <ul className="grid gap-1.5 text-sm text-muted">
        {LOADING_LINES.map((l) => (
          <li key={l}>• {l}</li>
        ))}
      </ul>
    </div>
  );
}
