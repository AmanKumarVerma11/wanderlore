"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type {
  EnrichedPlace,
  Itinerary,
  LocalEvent,
  Experience,
} from "@/lib/types";

// Map must not render on the server (Leaflet needs the DOM).
const TripMap = dynamic(() => import("./TripMap"), {
  ssr: false,
  loading: () => (
    <div className="card grid h-[22rem] place-items-center text-sm text-muted">
      Loading map…
    </div>
  ),
});

interface Props {
  itinerary: Itinerary;
  shareId?: string;
  /** Whether "create share link" should be offered (Supabase configured). */
  shareEnabled?: boolean;
}

export default function ItineraryView({
  itinerary,
  shareId,
  shareEnabled = true,
}: Props) {
  const it = itinerary;
  const mapPlaces: EnrichedPlace[] = [
    ...it.days.flatMap((d) => d.items),
    ...it.localSecrets,
  ];

  return (
    <div className="grid gap-8">
      <Hero itinerary={it} shareId={shareId} shareEnabled={shareEnabled} />

      <section aria-label="Map">
        <SectionTitle kicker="On the map" title="Everywhere you'll wander" />
        <div className="mt-3">
          <TripMap places={mapPlaces} center={it.center} />
          <p className="mt-2 text-xs text-muted">
            <span className="inline-block h-2.5 w-2.5 -translate-y-px rounded-full bg-accent align-middle" />{" "}
            Attractions{"   "}
            <span className="ml-3 inline-block h-2.5 w-2.5 -translate-y-px rounded-full bg-teal align-middle" />{" "}
            Hidden gems · pins verified against OpenStreetMap
          </p>
        </div>
      </section>

      <section aria-label="Day by day itinerary">
        <SectionTitle kicker="Day by day" title="Your cultural itinerary" />
        <div className="mt-4 grid gap-5">
          {it.days.map((d) => (
            <div key={d.day} className="card p-5 sm:p-6">
              <div className="flex items-baseline gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-white">
                  {d.day}
                </span>
                <h3 className="font-serif text-xl text-ink">{d.theme}</h3>
              </div>
              <div className="mt-4 grid gap-4">
                {d.items.map((p, i) => (
                  <PlaceCard key={`${d.day}-${i}`} place={p} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {it.localSecrets.length > 0 && (
        <section aria-label="Hidden gems">
          <SectionTitle kicker="Local secrets" title="Hidden gems most tourists miss" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {it.localSecrets.map((p, i) => (
              <PlaceCard key={`secret-${i}`} place={p} />
            ))}
          </div>
        </section>
      )}

      {it.events.length > 0 && (
        <section aria-label="Local events and festivals">
          <SectionTitle kicker="When to come" title="Cultural events & festivals" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {it.events.map((e, i) => (
              <EventCard key={i} event={e} />
            ))}
          </div>
        </section>
      )}

      {it.experiences.length > 0 && (
        <section aria-label="Authentic cultural experiences">
          <SectionTitle kicker="Go deeper" title="Authentic experiences to live" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {it.experiences.map((x, i) => (
              <ExperienceCard key={i} exp={x} />
            ))}
          </div>
        </section>
      )}

      <section aria-label="Language and etiquette" className="grid gap-6 md:grid-cols-2">
        {it.phrases.length > 0 && (
          <div className="card p-5 sm:p-6">
            <SectionTitle kicker="Speak a little" title="Handy local phrases" small />
            <ul className="mt-3 grid gap-2">
              {it.phrases.map((p, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-ink">{p.phrase}</span>
                  <span className="text-sm text-muted">— {p.meaning}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {it.etiquette.length > 0 && (
          <div className="card p-5 sm:p-6">
            <SectionTitle kicker="Travel with respect" title="Cultural etiquette" small />
            <ul className="mt-3 grid list-disc gap-1.5 pl-5 text-sm text-ink/90">
              {it.etiquette.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <Sources itinerary={it} />
    </div>
  );
}

function Hero({
  itinerary,
  shareId,
  shareEnabled,
}: {
  itinerary: Itinerary;
  shareId?: string;
  shareEnabled?: boolean;
}) {
  const it = itinerary;
  return (
    <section className="card overflow-hidden">
      {it.hero?.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={it.hero.image}
          alt={`${it.destinationFull}`}
          className="h-56 w-full object-cover sm:h-72"
        />
      )}
      <div className="p-6 sm:p-8">
        <p className="label">A cultural portrait of</p>
        <h1 className="mt-1 font-serif text-3xl text-ink sm:text-4xl">
          {it.destinationFull}
        </h1>
        <div className="mt-4 grid gap-3 text-ink/90">
          {it.story.split(/\n\n+/).map((para, i) => (
            <p key={i} className="leading-relaxed">
              {para}
            </p>
          ))}
        </div>
        {it.heritageSummary && (
          <div className="mt-5 rounded-xl border border-teal/30 bg-teal-soft/50 p-4">
            <p className="label text-teal">Heritage</p>
            <p className="mt-1 text-sm leading-relaxed text-ink/90">
              {it.heritageSummary}
            </p>
          </div>
        )}
        <ShareBar itinerary={it} shareId={shareId} shareEnabled={shareEnabled} />
      </div>
    </section>
  );
}

function ShareBar({
  itinerary,
  shareId,
  shareEnabled,
}: {
  itinerary: Itinerary;
  shareId?: string;
  shareEnabled?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(
    shareId ? buildUrl(shareId) : null
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function buildUrl(id: string): string {
    if (typeof window !== "undefined") return `${window.location.origin}/t/${id}`;
    return `/t/${id}`;
  }

  async function createLink() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itinerary }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "Could not create a share link.");
        return;
      }
      setUrl(buildUrl(data.id));
    } catch {
      setMsg("Could not create a share link.");
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard may be blocked; the input still shows the URL */
    }
  }

  // Nothing to offer: no existing link and sharing isn't configured.
  if (!url && !shareEnabled) return null;

  return (
    <div className="mt-6 border-t border-line pt-5">
      {url ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Shareable link"
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-muted"
          />
          <button type="button" onClick={copy} className="btn-ghost shrink-0">
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={createLink}
          disabled={saving}
          className="btn-ghost"
        >
          {saving ? "Creating link…" : "🔗 Create shareable link"}
        </button>
      )}
      {msg && <p className="mt-2 text-sm text-muted">{msg}</p>}
    </div>
  );
}

function PlaceCard({ place }: { place: EnrichedPlace }) {
  const gem = place.type === "gem";
  return (
    <article className="rounded-xl border border-line bg-paper/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <h4 className="font-medium text-ink">{place.name}</h4>
        <span
          className={`chip shrink-0 !py-0.5 text-xs ${
            gem
              ? "border-teal/40 !text-teal"
              : "border-accent/40 !text-accent-dark"
          }`}
        >
          {gem ? "Hidden gem" : "Attraction"}
        </span>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-ink/90">{place.blurb}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        <span className="font-medium text-ink/80">Why it matters: </span>
        {place.significance}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span>🕑 {place.bestTime}</span>
        {place.verified && place.osmUrl ? (
          <a
            href={place.osmUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal hover:underline"
          >
            📍 Verified on OpenStreetMap
          </a>
        ) : (
          <span className="text-muted/70">Location unverified</span>
        )}
      </div>
    </article>
  );
}

function EventCard({ event }: { event: LocalEvent }) {
  return (
    <article className="rounded-xl border border-line bg-paper/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <h4 className="font-medium text-ink">{event.name}</h4>
        <span className="chip shrink-0 !py-0.5 text-xs">{event.whenTypical}</span>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-ink/90">
        {event.description}
      </p>
      <p className="mt-2 text-sm text-muted">
        <span className="font-medium text-ink/80">Roots: </span>
        {event.culturalRoot}
      </p>
    </article>
  );
}

function ExperienceCard({ exp }: { exp: Experience }) {
  return (
    <article className="rounded-xl border border-line bg-paper/60 p-4">
      <h4 className="font-medium text-ink">{exp.title}</h4>
      <p className="mt-1.5 text-sm leading-relaxed text-ink/90">
        {exp.description}
      </p>
      <p className="mt-2 text-sm text-muted">
        <span className="font-medium text-ink/80">How to engage: </span>
        {exp.howToEngage}
      </p>
      <p className="mt-2 rounded-lg bg-accent-soft/50 px-3 py-2 text-xs text-accent-dark">
        ✦ {exp.respectfulTip}
      </p>
    </article>
  );
}

function Sources({ itinerary }: { itinerary: Itinerary }) {
  const refs = [
    ...(itinerary.hero ? [itinerary.hero] : []),
    ...itinerary.sources,
  ];
  return (
    <section aria-label="Sources" className="card p-5 sm:p-6">
      <SectionTitle kicker="Grounded in real data" title="Sources" small />
      <p className="mt-2 text-sm text-muted">
        Places are verified against OpenStreetMap. Heritage context is drawn from
        Wikipedia:
      </p>
      {refs.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {refs.map((r, i) => (
            <li key={i}>
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="chip hover:border-accent hover:text-accent-dark"
              >
                📖 {r.title}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted/70">
          No Wikipedia article matched this destination.
        </p>
      )}
      <p className="mt-4 text-xs text-muted/70">
        Generated by Google Gemini on{" "}
        {new Date(itinerary.generatedAt).toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
        . AI can make mistakes — verify times and bookings before you go.
      </p>
    </section>
  );
}

function SectionTitle({
  kicker,
  title,
  small,
}: {
  kicker: string;
  title: string;
  small?: boolean;
}) {
  return (
    <div>
      <p className="label">{kicker}</p>
      <h2
        className={`mt-0.5 font-serif text-ink ${
          small ? "text-lg" : "text-2xl"
        }`}
      >
        {title}
      </h2>
    </div>
  );
}
