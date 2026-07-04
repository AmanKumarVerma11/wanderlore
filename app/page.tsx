import TripPlanner from "@/components/TripPlanner";
import { Compass } from "@/components/icons";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12 sm:py-20">
      <header className="mb-12">
        <div className="flex items-center gap-2 text-ink">
          <Compass size={18} className="text-accent" />
          <span className="font-mono text-sm font-medium uppercase tracking-[0.2em]">
            Wanderlore
          </span>
        </div>
        <h1 className="mt-8 text-4xl font-semibold leading-[1.05] tracking-tightest text-ink sm:text-6xl">
          Discover a place&rsquo;s{" "}
          <span className="text-accent">soul</span>,
          <br className="hidden sm:block" /> not just its sights.
        </h1>
        <p className="mt-6 max-w-prose text-lg leading-relaxed text-muted">
          Tell us where you&rsquo;re headed and what moves you. An AI cultural
          guide weaves a day-by-day trip of attractions, hidden gems, heritage,
          festivals and authentic experiences &mdash; every place verified on a
          real map.
        </p>
      </header>

      <TripPlanner />

      <footer className="mt-20 border-t border-line pt-6">
        <p className="font-mono text-xs leading-relaxed text-faint">
          Real AI (Google Gemini) &middot; places grounded in OpenStreetMap
          &middot; heritage from Wikipedia. Built for H2S PromptWars.
        </p>
      </footer>
    </main>
  );
}
