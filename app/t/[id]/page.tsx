import Link from "next/link";
import type { Metadata } from "next";
import { getItinerary } from "@/lib/supabase";
import ItineraryView from "@/components/ItineraryView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const it = await getItinerary(params.id);
  if (!it) return { title: "Trip not found — Wanderlore" };
  return {
    title: `${it.destinationFull} — a cultural trip · Wanderlore`,
    description: it.heritageSummary?.slice(0, 160),
  };
}

export default async function SharedTripPage({
  params,
}: {
  params: { id: string };
}) {
  const itinerary = await getItinerary(params.id);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <div className="mb-8 flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-1.5 text-sm text-muted shadow-soft hover:text-accent-dark"
        >
          <span aria-hidden>🧭</span> Wanderlore
        </Link>
        <Link href="/" className="btn-ghost !py-2 text-sm">
          Plan your own →
        </Link>
      </div>

      {itinerary ? (
        <ItineraryView itinerary={itinerary} shareId={params.id} />
      ) : (
        <div className="card p-10 text-center">
          <h1 className="font-serif text-2xl text-ink">Trip not found</h1>
          <p className="mt-2 text-muted">
            This shared trip link is invalid or has expired.
          </p>
          <Link href="/" className="btn-primary mt-6">
            Weave a new trip
          </Link>
        </div>
      )}
    </main>
  );
}
