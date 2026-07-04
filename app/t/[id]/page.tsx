import Link from "next/link";
import type { Metadata } from "next";
import { getItinerary } from "@/lib/supabase";
import { isEmailEnabled } from "@/lib/email";
import ItineraryView from "@/components/ItineraryView";
import { Compass, ArrowRight } from "@/components/icons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const it = await getItinerary(params.id);
  if (!it) return { title: "Trip not found — Wanderlore" };
  const title = `${it.destinationFull} — a cultural trip`;
  const description = it.heritageSummary?.slice(0, 200) || undefined;
  return {
    title,
    description,
    alternates: { canonical: `/t/${params.id}` },
    openGraph: {
      type: "article",
      title: `${title} · Wanderlore`,
      description,
      url: `/t/${params.id}`,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharedTripPage({
  params,
}: {
  params: { id: string };
}) {
  const itinerary = await getItinerary(params.id);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
      <div className="mb-10 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-ink">
          <Compass size={18} className="text-accent" />
          <span className="font-mono text-sm font-medium uppercase tracking-[0.2em]">
            Wanderlore
          </span>
        </Link>
        <Link href="/" className="btn-ghost !py-2 text-sm">
          Plan your own <ArrowRight size={15} />
        </Link>
      </div>

      {itinerary ? (
        <ItineraryView
          itinerary={itinerary}
          shareId={params.id}
          emailEnabled={isEmailEnabled()}
        />
      ) : (
        <div className="card p-10 text-center">
          <h1 className="text-2xl font-semibold tracking-tightest text-ink">
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
