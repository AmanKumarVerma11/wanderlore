"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { safeHttpsUrl } from "@/lib/safe-url";
import { inOwnScript } from "@/lib/speech";
import type {
  EnrichedPlace,
  ImageCredit,
  Itinerary,
  LocalEvent,
  Experience,
  PlanTrace,
} from "@/lib/types";
import TraceView from "./TraceView";
import PhraseAudio from "./PhraseAudio";
import AddToCalendar from "./AddToCalendar";
import {
  MapPin,
  Clock,
  Link as LinkIcon,
  BookOpen,
  Star,
  Download,
  Check,
  ExternalLink,
} from "./icons";

// Map must not render on the server (Leaflet needs the DOM).
const TripMap = dynamic(() => import("./TripMap"), {
  ssr: false,
  loading: () => (
    <div className="grid h-[22rem] place-items-center rounded-xl bg-line-soft text-sm text-muted">
      Loading map&hellip;
    </div>
  ),
});

interface Props {
  itinerary: Itinerary;
  shareId?: string;
  shareEnabled?: boolean;
  trace?: PlanTrace; // only right after planning; share links don't keep it
}

const pad = (n: number) => String(n).padStart(2, "0");

export default function ItineraryView({
  itinerary,
  shareId,
  shareEnabled = true,
  trace,
}: Props) {
  const it = itinerary;
  const mapPlaces: EnrichedPlace[] = [
    ...it.days.flatMap((d) => d.items),
    ...it.localSecrets,
  ];
  // Sections are numbered in the order they appear; some may be missing.
  let count = 0;
  const next = () => pad(++count);

  return (
    <div className="grid gap-20">
      <Hero itinerary={it} />

      <ActionsBar itinerary={it} shareId={shareId} shareEnabled={shareEnabled} />

      <Section n={next()} id="trip-map" kicker="On the map" title="Everywhere you'll wander">
        <div className="overflow-hidden rounded-2xl border-2 border-ink shadow-offset">
          <TripMap places={mapPlaces} center={it.center} />
        </div>
        <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-xs text-ink-soft">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full border-2 border-white bg-ink ring-1 ring-ink" />
            Attractions
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full border-2 border-white bg-accent-dark ring-1 ring-accent-dark" />
            Hidden gems
          </span>
          <span className="text-muted">Only places found on OpenStreetMap get a pin.</span>
        </p>
      </Section>

      <Section n={next()} id="trip-days" kicker="Day by day" title="Your cultural itinerary">
        <div className="grid gap-14">
          {it.days.map((d) => (
            <div key={d.day} className="grid gap-4 lg:grid-cols-[8rem_minmax(0,1fr)] lg:gap-8">
              <span aria-hidden="true" className="numeral text-[5.5rem] lg:text-[8rem]">
                {pad(d.day)}
              </span>
              <div>
                <p className="label">Day {d.day}</p>
                <h3 className="display mt-1 text-3xl sm:text-4xl">{d.theme}</h3>
                <ol className="mt-6 grid gap-5 border-l-2 border-ink pl-6">
                  {d.items.map((p, i) => (
                    <li
                      key={`${d.day}-${i}`}
                      className="relative before:absolute before:-left-[2.05rem] before:top-6 before:h-3.5 before:w-3.5 before:rounded-full before:border-2 before:border-ink before:bg-accent"
                    >
                      <PlaceCard place={p} />
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {it.localSecrets.length > 0 && (
        <Section n={next()} id="trip-secrets" kicker="Local secrets" title="Hidden gems most tourists miss">
          <div className="hatch grid gap-5 rounded-3xl border-2 border-ink p-4 sm:grid-cols-2 sm:p-6">
            {it.localSecrets.map((p, i) => (
              <PlaceCard key={`secret-${i}`} place={p} />
            ))}
          </div>
        </Section>
      )}

      {it.events.length > 0 && (
        <Section n={next()} id="trip-events" kicker="When to come" title="Cultural events & festivals">
          <div className="grid gap-5 sm:grid-cols-2">
            {it.events.map((e, i) => (
              <EventCard key={i} event={e} />
            ))}
          </div>
        </Section>
      )}

      {it.experiences.length > 0 && (
        <Section n={next()} id="trip-experiences" kicker="Go deeper" title="Authentic experiences to live">
          <div className="grid gap-5 sm:grid-cols-2">
            {it.experiences.map((x, i) => (
              <ExperienceCard key={i} exp={x} n={i + 1} />
            ))}
          </div>
        </Section>
      )}

      {it.phrases.length > 0 && (
        <section aria-labelledby="trip-phrases" className="rounded-[2rem] bg-ink p-6 text-paper sm:p-10">
          <header className="flex items-end gap-4 border-b-2 border-paper/30 pb-4">
            <span aria-hidden="true" className="numeral numeral-light text-6xl sm:text-7xl">
              {next()}
            </span>
            <div>
              <p className="label text-paper/80">Speak a little</p>
              <h2 id="trip-phrases" className="display mt-1 text-4xl sm:text-5xl">
                Say it like a local
              </h2>
            </div>
          </header>
          <ul className="mt-8 grid gap-5 sm:grid-cols-2">
            {it.phrases.map((p, i) => (
              <li key={i} className="rounded-2xl border-2 border-paper/25 p-5 sm:p-6">
                <p lang={p.lang} className="display text-3xl sm:text-4xl">
                  {p.phrase}
                </p>
                {p.pronunciation && (
                  <p className="mt-2 font-mono text-sm tracking-wide text-paper/80">
                    <span className="sr-only">Say it: </span>
                    {p.pronunciation}
                  </p>
                )}
                <p className="mt-2 text-paper/90">{p.meaning}</p>
                {/* A voice reads what is written: no audio for a romanized phrase. */}
                {p.lang && inOwnScript(p.phrase, p.lang) && <PhraseAudio text={p.phrase} lang={p.lang} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      {it.etiquette.length > 0 && (
        <Section n={next()} id="trip-etiquette" kicker="Travel with respect" title="Cultural etiquette">
          <ol className="grid gap-4 sm:grid-cols-2">
            {it.etiquette.map((e, i) => (
              <li key={i} className="flex gap-4 rounded-2xl border-2 border-ink bg-surface p-5">
                <span aria-hidden="true" className="font-display text-4xl leading-none text-accent-dark">
                  {i + 1}
                </span>
                <span className="text-ink-soft">{e}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      <Sources itinerary={it} />

      {trace && <TraceView trace={trace} itinerary={it} />}
    </div>
  );
}

function Section({
  n,
  id,
  kicker,
  title,
  children,
}: {
  n: string;
  id: string;
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <header className="flex items-end gap-4 border-b-2 border-ink pb-4">
        <span aria-hidden="true" className="numeral text-6xl sm:text-7xl">
          {n}
        </span>
        <div>
          <p className="label">{kicker}</p>
          <h2 id={id} className="display mt-1 text-4xl sm:text-5xl">
            {title}
          </h2>
        </div>
      </header>
      <div className="mt-8">{children}</div>
    </section>
  );
}

function Hero({ itinerary }: { itinerary: Itinerary }) {
  const it = itinerary;
  // A photo is only shown with its author and licence (older saved trips have none).
  const credit = it.hero?.imageCredit;
  const heroImage = credit ? safeHttpsUrl(it.hero?.image) : null;
  return (
    <section className="frame overflow-hidden">
      {heroImage && credit && (
        <figure className="border-b-2 border-ink">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={heroImage}
            alt={it.destinationFull}
            className="h-64 w-full object-cover grayscale-[15%] sm:h-96"
          />
          <PhotoCredit credit={credit} />
        </figure>
      )}
      <div className="p-6 sm:p-10">
        <p className="label">A cultural portrait of</p>
        <h1 className="display mt-3 text-balance text-[clamp(2.75rem,9vw,6.5rem)]">{it.destinationFull}</h1>
        {it.noteFit && (
          <div className="mt-8 max-w-3xl rounded-2xl border-2 border-accent-dark bg-accent-soft p-5 sm:p-6">
            <p className="label text-accent-dark">Shaped by your note</p>
            <p className="mt-2 text-lg leading-relaxed text-ink">{it.noteFit}</p>
          </div>
        )}
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="grid gap-4 text-lg leading-relaxed text-ink-soft">
            {it.story.split(/\n\n+/).map((para, i) => (
              <p
                key={i}
                className={
                  i === 0
                    ? "first-letter:float-left first-letter:mr-3 first-letter:font-display first-letter:text-7xl first-letter:leading-[0.8] first-letter:text-accent"
                    : undefined
                }
              >
                {para}
              </p>
            ))}
          </div>
          {it.heritageSummary && (
            <aside className="self-start rounded-2xl bg-ink p-6 text-paper">
              <p className="label text-paper/80">Heritage</p>
              <p className="mt-3 font-display text-xl leading-snug">{it.heritageSummary}</p>
            </aside>
          )}
        </div>
      </div>
    </section>
  );
}

function PhotoCredit({ credit }: { credit: ImageCredit }) {
  const fileUrl = safeHttpsUrl(credit.fileUrl);
  const licenseUrl = safeHttpsUrl(credit.licenseUrl);
  return (
    <figcaption className="bg-paper px-6 py-2 font-mono text-[0.7rem] text-muted sm:px-10">
      Photo:{" "}
      {fileUrl ? (
        <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="link-underline">
          {credit.artist}
        </a>
      ) : (
        credit.artist
      )}
      ,{" "}
      {licenseUrl ? (
        <a href={licenseUrl} target="_blank" rel="noopener noreferrer" className="link-underline">
          {credit.license}
        </a>
      ) : (
        credit.license
      )}
      , via Wikimedia Commons
    </figcaption>
  );
}

function ActionsBar({
  itinerary,
  shareId,
  shareEnabled,
}: {
  itinerary: Itinerary;
  shareId?: string;
  shareEnabled?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(
    shareId ? toShareUrl(shareId) : null
  );
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  function toShareUrl(id: string): string {
    if (typeof window !== "undefined") return `${window.location.origin}/t/${id}`;
    return `/t/${id}`;
  }

  async function createLink() {
    setSaving(true);
    setShareMsg(null);
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itinerary }),
      });
      const data = await res.json();
      if (!res.ok) {
        setShareMsg(data.error || "Could not create a share link.");
        return;
      }
      setUrl(toShareUrl(data.id));
    } catch {
      setShareMsg("Could not create a share link.");
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
      /* clipboard blocked; input still shows the URL */
    }
  }

  return (
    <div className="no-print -mt-10 grid gap-3">
      <div className="flex flex-wrap items-start gap-2">
        <AddToCalendar itinerary={itinerary} />

        {url ? (
          <button type="button" onClick={copy} className="btn-ghost text-sm">
            {copied ? <Check size={16} /> : <LinkIcon size={16} />}
            {copied ? "Copied!" : "Copy link"}
          </button>
        ) : (
          shareEnabled && (
            <button
              type="button"
              onClick={createLink}
              disabled={saving}
              className="btn-ghost text-sm"
            >
              <LinkIcon size={16} />
              {saving ? "Creating link…" : "Create share link"}
            </button>
          )
        )}

        <button type="button" onClick={() => window.print()} className="btn-ghost text-sm">
          <Download size={16} /> Export PDF
        </button>
      </div>

      {url && (
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Shareable link"
          className="w-full rounded-xl border-2 border-ink bg-surface px-3 py-2 font-mono text-xs text-ink-soft"
        />
      )}
      <p aria-live="polite" className="text-sm text-muted">
        {shareMsg}
      </p>
    </div>
  );
}

function PlaceCard({ place }: { place: EnrichedPlace }) {
  const gem = place.type === "gem";
  const osmUrl = place.verified ? safeHttpsUrl(place.osmUrl) : null;
  return (
    <article className="rounded-2xl border-2 border-ink bg-surface p-5 shadow-offset-sm">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-lg font-semibold leading-snug text-ink">{place.name}</h4>
        <span
          className={`stamp shrink-0 ${
            gem ? "border-accent-dark text-accent-dark" : "border-ink text-ink"
          }`}
        >
          {gem ? "Hidden gem" : "Attraction"}
        </span>
      </div>
      <p className="mt-2 leading-relaxed text-ink-soft">{place.blurb}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        <span className="font-semibold text-ink-soft">Why it matters: </span>
        {place.significance}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t-2 border-line pt-3 text-xs">
        <span className="inline-flex items-center gap-1.5 font-mono uppercase tracking-wider text-muted">
          <Clock size={13} /> {place.bestTime}
        </span>
        {osmUrl ? (
          <a
            href={osmUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-ink hover:text-accent-dark"
          >
            <MapPin size={13} /> Verified on OpenStreetMap
            {place.osmName && place.osmName !== place.name && <> as {place.osmName}</>}
            <ExternalLink size={11} />
          </a>
        ) : (
          <span className="text-muted">{unverifiedLabel(place)}</span>
        )}
      </div>
    </article>
  );
}

/** "Not found" and "not checked" are different claims, so they read differently. */
function unverifiedLabel(place: EnrichedPlace): string {
  if (place.geoStatus === "not_found") return "Not found on OpenStreetMap";
  if (place.geoStatus === "unchecked") return "Not checked on the map";
  return "Location unverified"; // trips saved before statuses existed
}

function EventCard({ event }: { event: LocalEvent }) {
  return (
    <article className="flex flex-col rounded-2xl border-2 border-ink bg-surface p-6 shadow-offset-sm">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-accent-dark">
        {event.whenTypical}
      </p>
      <h3 className="display mt-2 text-3xl">{event.name}</h3>
      <p className="mt-3 leading-relaxed text-ink-soft">{event.description}</p>
      <p className="mt-auto pt-4 text-sm text-muted">
        <span className="font-semibold text-ink-soft">Roots: </span>
        {event.culturalRoot}
      </p>
    </article>
  );
}

function ExperienceCard({ exp, n }: { exp: Experience; n: number }) {
  return (
    <article className="flex flex-col rounded-2xl border-2 border-ink bg-surface p-6">
      <span aria-hidden="true" className="numeral text-5xl">
        {pad(n)}
      </span>
      <h3 className="mt-3 text-lg font-semibold text-ink">{exp.title}</h3>
      <p className="mt-2 leading-relaxed text-ink-soft">{exp.description}</p>
      <p className="mt-2 text-sm text-muted">
        <span className="font-semibold text-ink-soft">How to engage: </span>
        {exp.howToEngage}
      </p>
      <p className="mt-4 flex items-start gap-2 rounded-xl border-2 border-accent-dark bg-accent-soft px-3 py-2 text-sm text-accent-dark">
        <Star size={14} className="mt-0.5 shrink-0" />
        {exp.respectfulTip}
      </p>
    </article>
  );
}

function Sources({ itinerary }: { itinerary: Itinerary }) {
  const refs = [
    ...(itinerary.hero ? [itinerary.hero] : []),
    ...itinerary.sources,
  ].flatMap((r) => {
    const url = safeHttpsUrl(r.url);
    return url ? [{ title: r.title, url }] : [];
  });
  return (
    <section aria-labelledby="trip-sources" className="rounded-2xl border-2 border-ink bg-surface p-6 sm:p-8">
      <p className="label flex items-center gap-1.5">
        <BookOpen size={14} className="text-accent-dark" /> Grounded in real data
      </p>
      <h2 id="trip-sources" className="display mt-1 text-3xl">
        Sources
      </h2>
      <p className="mt-3 text-sm text-muted">
        Each place is looked up on OpenStreetMap inside the destination; only places found
        there get a pin. Heritage context is drawn from Wikipedia:
      </p>
      {refs.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {refs.map((r, i) => (
            <li key={i}>
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="chip border-2 hover:border-ink hover:text-ink"
              >
                <BookOpen size={13} /> {r.title}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">No Wikipedia article matched this destination.</p>
      )}
      <p className="mt-6 border-t-2 border-line pt-4 font-mono text-xs leading-relaxed text-muted">
        Generated by Google Gemini on{" "}
        {new Date(itinerary.generatedAt).toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
        . AI can make mistakes, so check opening times and bookings before you go.
      </p>
    </section>
  );
}
