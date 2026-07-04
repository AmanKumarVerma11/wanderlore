import TripPlanner from "@/components/TripPlanner";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <header className="mb-10 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-1.5 text-sm text-muted shadow-soft">
          <span aria-hidden>🧭</span> Wanderlore
        </div>
        <h1 className="mt-5 font-serif text-4xl leading-tight text-ink sm:text-5xl">
          Discover a place&rsquo;s{" "}
          <span className="text-accent-dark">soul</span>, not just its sights
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted">
          Tell us where you&rsquo;re headed and what moves you. Our AI cultural guide
          weaves a day-by-day trip of attractions, hidden gems, heritage, local
          festivals and authentic experiences — every place verified on a real map.
        </p>
      </header>

      <TripPlanner />

      <footer className="mt-16 border-t border-line pt-6 text-center text-sm text-muted">
        <p>
          Real AI (Google Gemini) · places grounded in OpenStreetMap · heritage
          from Wikipedia. Built for H2S PromptWars.
        </p>
      </footer>
    </main>
  );
}
