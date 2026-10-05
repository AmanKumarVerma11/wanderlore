import Link from "next/link";
import type { Metadata } from "next";
import { getItinerary } from "@/lib/supabase";
import ItineraryView from "@/components/ItineraryView";
import { Compass, ArrowRight } from "@/components/icons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const it = await getItinerary(id);
  if (!it) return { title: "Trip not found — Wanderlore" };
  const title = `${it.destinationFull} — a cultural trip`;
  const description = it.heritageSummary?.slice(0, 200) || undefined;
  return {
    title,
    description,
    alternates: { canonical: `/t/${id}` },
    openGraph: {
      type: "article",
      title: `${title} · Wanderlore`,
      description,
      url: `/t/${id}`,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharedTripPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const itinerary = await getItinerary(id);

  return (
    <main id="main" className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
      <div className="mb-12 flex items-center justify-between gap-4 border-b-2 border-ink pb-4">
        <Link href="/" className="flex items-center gap-2 text-ink">
          <Compass size={18} className="text-accent-dark" />
          <span className="font-mono text-sm font-semibold uppercase tracking-[0.2em]">
            Wanderlore
          </span>
        </Link>
        <Link href="/" className="btn-ghost text-sm">
          Plan your own <ArrowRight size={15} />
        </Link>
      </div>

      {itinerary ? (
        <ItineraryView itinerary={itinerary} shareId={id} />
      ) : (
        <div className="frame p-10 text-center">
          <h1 className="display text-5xl text-ink">
            Trip not found
          </h1>
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
