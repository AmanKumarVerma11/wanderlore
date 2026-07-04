"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type {
  EnrichedPlace,
  Itinerary,
  LocalEvent,
  Experience,
} from "@/lib/types";
import {
  MapPin,
  Clock,
  Link as LinkIcon,
  BookOpen,
  Star,
  Download,
  Mail,
  Check,
  ExternalLink,
  Calendar,
  Sparkles,
  Languages,
  Shield,
} from "./icons";

// Map must not render on the server (Leaflet needs the DOM).
const TripMap = dynamic(() => import("./TripMap"), {
  ssr: false,
  loading: () => (
    <div className="card grid h-[22rem] place-items-center text-sm text-muted">
      Loading map&hellip;
    </div>
  ),
});

interface Props {
  itinerary: Itinerary;
  shareId?: string;
  shareEnabled?: boolean;
  emailEnabled?: boolean;
}

export default function ItineraryView({
  itinerary,
  shareId,
  shareEnabled = true,
  emailEnabled = true,
}: Props) {
  const it = itinerary;
  const mapPlaces: EnrichedPlace[] = [
    ...it.days.flatMap((d) => d.items),
    ...it.localSecrets,
  ];

  return (
    <div className="grid gap-10">
      <Hero itinerary={it} />

      <ActionsBar
        itinerary={it}
        shareId={shareId}
        shareEnabled={shareEnabled}
        emailEnabled={emailEnabled}
      />

      <section aria-label="Map">
        <SectionTitle kicker="On the map" title="Everywhere you'll wander" />
        <div className="mt-4">
          <TripMap places={mapPlaces} center={it.center} />
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-ink" />
              Attractions
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
              Hidden gems
            </span>
            <span className="text-faint">verified against OpenStreetMap</span>
          </p>
        </div>
      </section>

      <section aria-label="Day by day itinerary">
        <SectionTitle kicker="Day by day" title="Your cultural itinerary" />
        <div className="mt-5 grid gap-5">
          {it.days.map((d) => (
            <div key={d.day} className="card p-5 sm:p-6">
              <div className="flex items-baseline gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-ink font-mono text-xs font-semibold text-white">
                  {d.day}
                </span>
                <h3 className="text-lg font-semibold tracking-tight text-ink">
                  {d.theme}
                </h3>
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
          <SectionTitle
            kicker="Local secrets"
            title="Hidden gems most tourists miss"
          />
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {it.localSecrets.map((p, i) => (
              <PlaceCard key={`secret-${i}`} place={p} />
            ))}
          </div>
        </section>
      )}

      {it.events.length > 0 && (
        <section aria-label="Local events and festivals">
          <SectionTitle
            kicker="When to come"
            title="Cultural events & festivals"
            icon={<Calendar size={16} />}
          />
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {it.events.map((e, i) => (
              <EventCard key={i} event={e} />
            ))}
          </div>
        </section>
      )}

      {it.experiences.length > 0 && (
        <section aria-label="Authentic cultural experiences">
          <SectionTitle
            kicker="Go deeper"
            title="Authentic experiences to live"
            icon={<Sparkles size={16} />}
          />
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {it.experiences.map((x, i) => (
              <ExperienceCard key={i} exp={x} />
            ))}
          </div>
        </section>
      )}

      <section
        aria-label="Language and etiquette"
        className="grid gap-6 md:grid-cols-2"
      >
        {it.phrases.length > 0 && (
          <div className="card p-5 sm:p-6">
            <SectionTitle
              kicker="Speak a little"
              title="Handy local phrases"
              small
              icon={<Languages size={15} />}
            />
            <ul className="mt-4 grid gap-2.5">
              {it.phrases.map((p, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-ink">{p.phrase}</span>
                  <span className="text-sm text-muted">&mdash; {p.meaning}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {it.etiquette.length > 0 && (
          <div className="card p-5 sm:p-6">
            <SectionTitle
              kicker="Travel with respect"
              title="Cultural etiquette"
              small
              icon={<Shield size={15} />}
            />
            <ul className="mt-4 grid gap-2 text-sm text-ink-soft">
              {it.etiquette.map((e, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                  {e}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <Sources itinerary={it} />
    </div>
  );
}

function Hero({ itinerary }: { itinerary: Itinerary }) {
  const it = itinerary;
  return (
    <section className="card overflow-hidden">
      {it.hero?.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={it.hero.image}
          alt={it.destinationFull}
          className="h-56 w-full object-cover grayscale-[15%] sm:h-72"
        />
      )}
      <div className="p-6 sm:p-8">
        <p className="label">A cultural portrait of</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tightest text-ink sm:text-4xl">
          {it.destinationFull}
        </h1>
        <div className="mt-5 grid gap-3 leading-relaxed text-ink-soft">
          {it.story.split(/\n\n+/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
        {it.heritageSummary && (
          <div className="mt-6 border-l-2 border-accent bg-accent-soft/40 px-4 py-3">
            <p className="label text-accent-dark">Heritage</p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
              {it.heritageSummary}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function ActionsBar({
  itinerary,
  shareId,
  shareEnabled,
  emailEnabled,
}: {
  itinerary: Itinerary;
  shareId?: string;
  shareEnabled?: boolean;
  emailEnabled?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(
    shareId ? toShareUrl(shareId) : null
  );
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [emailState, setEmailState] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
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

  async function sendEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailState("error");
      setEmailMsg("Enter a valid email address.");
      return;
    }
    setEmailState("sending");
    setEmailMsg(null);
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itinerary, email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEmailState("error");
        setEmailMsg(data.error || "Could not send the email.");
        return;
      }
      setEmailState("sent");
      setEmailMsg(`Sent to ${email}.`);
    } catch {
      setEmailState("error");
      setEmailMsg("Could not send the email.");
    }
  }

  return (
    <div className="no-print -mt-4 grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="btn-ghost text-sm"
        >
          <Download size={16} /> Export PDF
        </button>

        {emailEnabled && (
          <button
            type="button"
            onClick={() => setShowEmail((s) => !s)}
            aria-expanded={showEmail}
            className="btn-ghost text-sm"
          >
            <Mail size={16} /> Email this trip
          </button>
        )}

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
      </div>

      {url && (
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Shareable link"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-muted"
        />
      )}
      {shareMsg && <p className="text-sm text-muted">{shareMsg}</p>}

      {showEmail && emailEnabled && (
        <form
          onSubmit={sendEmail}
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailState("idle");
              setEmailMsg(null);
            }}
            placeholder="you@example.com"
            aria-label="Email address"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={emailState === "sending" || emailState === "sent"}
            className="btn-primary shrink-0 text-sm"
          >
            {emailState === "sending"
              ? "Sending…"
              : emailState === "sent"
              ? "Sent"
              : "Send"}
          </button>
        </form>
      )}
      {emailMsg && (
        <p
          className={`text-sm ${
            emailState === "error" ? "text-accent-dark" : "text-muted"
          }`}
        >
          {emailMsg}
        </p>
      )}
    </div>
  );
}

function PlaceCard({ place }: { place: EnrichedPlace }) {
  const gem = place.type === "gem";
  return (
    <article className="rounded-lg border border-line bg-paper/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <h4 className="font-medium text-ink">{place.name}</h4>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider ${
            gem
              ? "border-accent/40 text-accent-dark"
              : "border-line text-muted"
          }`}
        >
          {gem ? "Hidden gem" : "Attraction"}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{place.blurb}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        <span className="font-medium text-ink-soft">Why it matters: </span>
        {place.significance}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Clock size={13} /> {place.bestTime}
        </span>
        {place.verified && place.osmUrl ? (
          <a
            href={place.osmUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-ink hover:text-accent"
          >
            <MapPin size={13} /> Verified on OpenStreetMap
            <ExternalLink size={11} />
          </a>
        ) : (
          <span className="text-faint">Location unverified</span>
        )}
      </div>
    </article>
  );
}

function EventCard({ event }: { event: LocalEvent }) {
  return (
    <article className="rounded-lg border border-line bg-paper/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <h4 className="font-medium text-ink">{event.name}</h4>
        <span className="shrink-0 rounded-full border border-line px-2.5 py-0.5 font-mono text-[0.65rem] text-muted">
          {event.whenTypical}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        {event.description}
      </p>
      <p className="mt-2 text-sm text-muted">
        <span className="font-medium text-ink-soft">Roots: </span>
        {event.culturalRoot}
      </p>
    </article>
  );
}

function ExperienceCard({ exp }: { exp: Experience }) {
  return (
    <article className="rounded-lg border border-line bg-paper/50 p-4">
      <h4 className="font-medium text-ink">{exp.title}</h4>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        {exp.description}
      </p>
      <p className="mt-2 text-sm text-muted">
        <span className="font-medium text-ink-soft">How to engage: </span>
        {exp.howToEngage}
      </p>
      <p className="mt-3 flex items-start gap-2 rounded-md bg-accent-soft/50 px-3 py-2 text-xs text-accent-dark">
        <Star size={13} className="mt-0.5 shrink-0" />
        {exp.respectfulTip}
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
      <SectionTitle
        kicker="Grounded in real data"
        title="Sources"
        small
        icon={<BookOpen size={15} />}
      />
      <p className="mt-3 text-sm text-muted">
        Places are verified against OpenStreetMap. Heritage context is drawn from
        Wikipedia:
      </p>
      {refs.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {refs.map((r, i) => (
            <li key={i}>
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="chip hover:border-ink hover:text-ink"
              >
                <BookOpen size={13} /> {r.title}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-faint">
          No Wikipedia article matched this destination.
        </p>
      )}
      <p className="mt-5 font-mono text-xs leading-relaxed text-faint">
        Generated by Google Gemini on{" "}
        {new Date(itinerary.generatedAt).toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
        . AI can make mistakes &mdash; verify times and bookings before you go.
      </p>
    </section>
  );
}

function SectionTitle({
  kicker,
  title,
  small,
  icon,
}: {
  kicker: string;
  title: string;
  small?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <p className="label flex items-center gap-1.5">
        {icon && <span className="text-accent">{icon}</span>}
        {kicker}
      </p>
      <h2
        className={`mt-1.5 font-semibold tracking-tight text-ink ${
          small ? "text-lg" : "text-2xl"
        }`}
      >
        {title}
      </h2>
    </div>
  );
}
