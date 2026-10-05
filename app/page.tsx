import TripPlanner from "@/components/TripPlanner";
import { Compass } from "@/components/icons";
import { INTERESTS } from "@/lib/validate";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Wanderlore",
  url: "https://wanderlore.amankrverma.in",
  applicationCategory: "TravelApplication",
  operatingSystem: "Web",
  description:
    "An AI cultural trip planner that weaves day-by-day journeys of attractions, hidden gems, heritage, local festivals and authentic experiences, with every place checked against OpenStreetMap.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  creator: { "@type": "Person", name: "Aman Kumar Verma", url: "https://amankrverma.in" },
};

const STEPS = ["The AI writes the plan", "Every place is checked on the map", "You see how it was made"];

export default function Home() {
  return (
    <main id="main" className="mx-auto max-w-5xl px-5 pb-16 pt-8 sm:pt-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-2 text-ink">
            <Compass size={18} className="text-accent-dark" />
            <span className="font-mono text-sm font-semibold uppercase tracking-[0.2em]">
              Wanderlore
            </span>
          </span>
          <span className="stamp hidden whitespace-nowrap border-accent-dark text-accent-dark sm:inline-flex">
            Checked on a real map
          </span>
        </div>

        <div className="relative mt-12 sm:mt-16">
          <div
            aria-hidden="true"
            className="dot-grid absolute -top-8 right-0 h-40 w-40 rounded-full sm:h-72 sm:w-72"
          />
          {/* 8rem keeps "Discover a place's soul," on one line in the 64rem column, and
              phones balance their own lines, so no word is left alone. */}
          <h1 className="display relative text-balance text-[clamp(3.25rem,11vw,8rem)] text-ink">
            Discover a place&rsquo;s <span className="italic text-accent">soul</span>,
            <br className="hidden sm:inline" /> not just its sights.
          </h1>
        </div>

        <div className="mt-10 grid gap-8 sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-end">
          <p className="max-w-prose text-lg leading-relaxed text-ink-soft">
            Tell us where you&rsquo;re headed and what moves you. An AI cultural guide
            weaves a day-by-day trip of attractions, hidden gems, heritage, festivals and
            authentic experiences, then checks every place against a real map.
          </p>
          <ol className="grid gap-2 border-l-2 border-ink pl-4">
            {STEPS.map((s, i) => (
              <li key={s} className="flex gap-3 font-mono text-xs uppercase tracking-[0.12em] text-ink-soft">
                <span className="text-accent-dark">0{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        </div>
      </header>

      <Ticker words={INTERESTS} />

      <TripPlanner />

      <footer className="mt-24 flex flex-wrap items-center justify-between gap-4 border-t-2 border-ink pt-6">
        <span className="font-display text-2xl text-ink">Wanderlore</span>
        <p className="font-mono text-xs leading-relaxed text-muted">
          Real AI (Google Gemini) &middot; places grounded in OpenStreetMap &middot;
          heritage from Wikipedia.
        </p>
      </footer>
    </main>
  );
}

/** A slow band of interests. Decorative: hidden from screen readers. */
function Ticker({ words }: { words: readonly string[] }) {
  const row = (copy: number) =>
    words.map((w) => (
      <span key={`${copy}-${w}`} className="flex items-center gap-6 pr-6">
        {w}
        <span className="text-accent">&#10022;</span>
      </span>
    ));
  return (
    <div
      aria-hidden="true"
      className="-mx-5 my-14 overflow-hidden border-y-2 border-ink bg-ink py-3 font-mono text-sm uppercase tracking-[0.2em] text-paper sm:mx-0 sm:rounded-xl sm:border-2"
    >
      <div className="ticker-track">
        {row(0)}
        {row(1)}
      </div>
    </div>
  );
}
