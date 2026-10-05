# Wanderlore: an AI cultural trip planner

Tell Wanderlore where you're going and what moves you, and it writes a day-by-day
cultural journey: famous sites, hidden gems, heritage, recurring festivals,
hands-on experiences, local phrases and etiquette. It then looks up every place it
names on OpenStreetMap, inside your destination, and says honestly which ones it
found.

Live: [wanderlore.amankrverma.in](https://wanderlore.amankrverma.in) (no login).

## What a plan contains

| Part | What you get |
| --- | --- |
| Day by day | Attractions and hidden gems for each day, sized to your pace |
| Local secrets | Extra hidden gems a typical visitor misses |
| Cultural portrait | A short story of the place and a heritage summary |
| When to come | Recurring festivals with their usual season or fixed annual date |
| Go deeper | Participatory experiences, how to take part, and a respectful tip |
| Speak a little | Local phrases in their own script, with a pronunciation guide you can listen to, and etiquette |

## Using a plan

- **Say what matters to you.** Whatever you write under *Anything else?* (off-beat
  treks, a toddler, vegetarian food, step-free access) shapes which places,
  experiences and tips the plan picks, not just its headings. The plan opens with
  a short note on how it used your words. Your note is treated as preferences
  about the trip, never as instructions to the model.
- **Hear the phrases.** Each phrase has a pronunciation guide with the stressed
  syllable in capitals (*soo-mee-MAH-sen*). *Listen* and *Slowly* read it aloud
  with a voice from your own browser or device (the Web Speech API), preferring
  one for the exact region and one that works offline. A voice reads what is
  written, so *Listen* appears only when the phrase is in its language's own
  script, not romanized. If there is no voice for the language, the page says
  so; either way the guide is still there. Nothing goes through Wanderlore's
  server.
- **Add it to your calendar.** Pick the first day of the trip, then download a
  standard iCalendar (RFC 5545) file with one all-day event per day and its
  places, which Apple Calendar, Outlook and Google Calendar can import. Or open
  Google Calendar with the whole trip filled in as one event. Festivals aren't
  added, because their dates move from year to year. The file is made in the
  browser.
- **Keep it.** Create a share link (when Supabase is configured) or export a PDF
  through the print dialog.

## How it stays grounded

A language model will happily invent a museum or put a real one in the wrong
city, so the model only curates and writes, and code checks the facts:

1. **Destination first.** The destination is looked up on OpenStreetMap
   (Nominatim) before any model call. If OSM doesn't know it, the request stops
   with a clear message and no model call is made.
2. **Generate.** Google Gemini writes the plan as strict JSON, planning for the
   place OSM resolved. A plan maps at most 20 places so all of them can be checked
   in time; longer trips get fewer stops per day.
3. **Check every place inside the destination.** Each place is searched only
   inside the destination's bounding box (plus 30 km for day trips) and country.
   Each one is shown as *Verified on OpenStreetMap* (with a pin and a link),
   *Not found on OpenStreetMap*, or *Not checked on the map* if time ran out.
   Nothing is silently dropped or faked.
4. **Repair what the map couldn't find.** Most misses are English names for
   places OpenStreetMap lists in the local language ("Chora Mosque" is "Kariye
   Camii" there). If time allows, the model is asked once more for those names,
   and only the new names are searched. A hit counts only if one of OSM's names
   for it (including alternative and translated names) contains every word of
   the proposed name, because Nominatim otherwise returns loose matches. A place
   found this way shows OSM's name, for example *Verified on OpenStreetMap as
   本能寺*. The model may not swap in a different place.
5. **Heritage sources.** Wikipedia summaries for the destination and its top
   sites are linked as sources. The hero photo comes from Wikimedia Commons and is
   only shown with its author and licence.

Under each plan, *How this plan was made* shows every step of the request on a
timeline: the destination lookup, each model call, each map search (and which
came from the cache), repair, and Wikipedia.

## Accessibility

The target is WCAG 2.2 AA.

- **Contrast.** Text colours were checked against the page background using the
  theme's own values: body text 17.3:1, muted text 5.1:1 and the darker red
  6.1:1. The brighter red is just under 4.5:1, so it only appears in large
  headlines and graphics, where 3:1 is enough. White numbers on the map pins
  are 6.4:1 on red and 18:1 on black.
- **Keyboard.** A skip link comes first, focus shows as a thick red ring, and the
  form uses native controls: toggle buttons for interests, a slider that
  announces "3 days", and radio buttons for pace.
- **Screen readers.** Errors are announced as alerts and progress as status
  updates. Each phrase carries its language tag, so a screen reader can switch
  voice. Decorative numerals and the moving band of interests are hidden from
  screen readers.
- **Motion.** With reduced motion turned on, the band stops and the page jumps
  instead of scrolling smoothly.
- **Checked.** axe-core 4.13.0 found no violations on a page showing a full plan.
  The two things it couldn't decide (map pin contrast and target size) were
  measured by hand and pass. Nothing scrolls sideways at 375px wide.

## Architecture

```
POST /api/plan                                        app/api/plan/route.ts (maxDuration 60s)
  decline EEA, Swiss and UK visitors (free-tier terms) lib/region.ts
  validate input                                       lib/validate.ts
  rate limit (production): 5 plans/IP/hour, daily cap lib/ratelimit.ts
  planTrip, all stages share one 55s deadline          lib/plan.ts
    1. geocode the destination (cached)                lib/geocode.ts
    2. generate: primary Gemini model, then a fallback lib/gemini.ts
       model on overload, quota or server errors       lib/orchestrator.ts
    3. in parallel:                                    lib/enrich.ts
       bounded place lookups, breadth-first, cached    lib/geocode.ts
         then one repair round for places not found    lib/repair.ts
       Wikipedia summaries + photo credit, cached      lib/wiki.ts
  -> itinerary + metadata + a trace of every step      lib/trace.ts

POST /api/save -> Supabase -> /t/[id] share link       app/api/save/route.ts
```

- **Stack.** Next.js 16 (App Router) and React 19, TypeScript, Tailwind CSS and
  Leaflet, on Vercel. Headlines use Instrument Serif, which `next/font`
  downloads at build time and serves from the site itself.
- **Models.** `gemini-3.5-flash-lite`, falling back to `gemini-3.1-flash-lite`;
  each has its own free-tier quota. Repair asks `gemini-3.1-flash-lite` first, so
  it usually draws on the fallback's quota rather than the primary's, and
  switches to `gemini-3.5-flash-lite` if the first is slow or down. They were
  chosen by measurement (see
  `docs/upgrade-plan.md`). An optional NVIDIA draft panel still exists in
  `lib/orchestrator.ts`, but the default panel models' free endpoints were
  retired in 2026, so today the app always takes the single-Gemini path.
- **Deadline.** Every stage shares one 55s budget, and the time each stage keeps
  back comes from measured percentiles: grounding gets its p95 (23s), and a
  primary model that hangs is cut off early enough for the fallback to answer.
- **Caching.** Nominatim's usage policy requires caching results. Lookups are
  kept in an in-process cache and, when configured, in Upstash Redis, which also
  holds the shared one-request-per-second Nominatim slot and the rate-limit
  counters (`lib/cache.ts`, `lib/kv.ts`).
- **Security.** API keys are server-only. A strict Content-Security-Policy allows
  scripts and styles from the site itself and images only from OpenStreetMap
  tiles and Wikimedia. Every third-party call happens on the server; speech and
  calendar files are made in the browser, and the Google Calendar button is an
  ordinary link the visitor follows. Shared trips
  only keep https links to the hosts the server itself produces (`lib/safe-url.ts`).

## Evals

`npm run eval` runs the 26 trip requests in `evals/cases.json` through the real
pipeline. It grades each one with binary code checks (`evals/graders.ts`):

- the plan completed, or a gibberish destination was rejected;
- schema, day count and the place budget;
- no duplicate places;
- no "verified" place outside the destination;
- every place looked up;
- no years in festival dates;
- phrases in the script their language is usually written in;
- the traveller's note reflected in the places, experiences or tips, not only in
  the headings;
- injected text not echoed back;
- repair stays one round: at most two requests, the second only if the first model fails;
- finished within the 55s deadline.

Each run writes `evals/runs/<name>/report.md` with grounding and latency figures.
`npm run eval -- --replay evals/runs/<name>` re-grades a saved run without any
network. Reports worth keeping live in `docs/evals/`.

Live runs use real Gemini quota and Nominatim's public server (1 request/second),
so run them by hand, never on a schedule. Options: `--only id1,id2`, `--tag core`,
`--name <run>`, and `--lib <dir>` to run an older copy of `lib/`.

## Testing

```bash
npm test
```

Vitest covers input and save validation, URL safety, bounded geocoding with a
mocked network, the cache, rate limits, the Gemini fallback chain, repair,
tracing, the pipeline, the API routes, the eval graders, the calendar file and
voice choice. Fault-injection tests
(`lib/faults.test.ts`) run the whole request against a fake network where any
service can hang, slow down or fail, and check that the 55s budget holds and that
place statuses stay honest. CI runs lint, type checks, the tests and a production
build.

## Run it locally

Needs Node.js 20.9 or newer.

```bash
npm install
cp .env.example .env.local     # then fill in GEMINI_API_KEY
npm run dev                    # http://localhost:3000
```

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | yes | Server-only Google Gemini key |
| `GEMINI_MODEL` | no | Primary model, default `gemini-3.5-flash-lite` |
| `GEMINI_FALLBACK_MODEL` | no | Fallback model, default `gemini-3.1-flash-lite` |
| `GEMINI_REPAIR_MODEL` | no | Model asked first in repair, default `gemini-3.1-flash-lite` (then `gemini-3.5-flash-lite`) |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | no | Shared cache, Nominatim slot and rate limits (Upstash free tier). `KV_REST_API_URL` and `KV_REST_API_TOKEN` also work |
| `PLAN_RATE_PER_HOUR` | no | Plans per visitor IP per hour, default 5 |
| `PLAN_DAILY_CAP` | no | Plans per day across all visitors, default 350 (about 70% of the primary model's free daily quota) |
| `NOMINATIM_URL` | no | Nominatim search endpoint, default the public OSM server |
| `NVIDIA_API_KEY` | no | Enables the experimental NVIDIA draft panel. NVIDIA's trial terms allow testing and evaluation only, not production |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | no | Saving and shareable trip links |

Without Supabase the app still plans trips; only "Create share link" is hidden.
Without Upstash it still caches within each server instance.

### Optional: shareable links (Supabase)

Create the table once in the Supabase SQL editor:

```sql
create table if not exists public.itineraries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  destination text,
  data jsonb not null
);
-- Access is server-side only via the service-role key, so RLS can stay on with no policies.
alter table public.itineraries enable row level security;
```

## Assumptions and limits

- **Festivals are recurring.** The model gives the usual season or fixed annual
  date (for example 15 May for Kyoto's Aoi Matsuri), not a one-off date.
- **Some genuine gems aren't on OpenStreetMap.** They are shown as *Not found on
  OpenStreetMap* rather than dropped.
- **English Wikipedia** is used for heritage sources.
- **Free tier only.** Gemini's Search grounding isn't available on the free tier
  for Gemini 3 models, so OpenStreetMap and Wikipedia do the grounding. Gemini's
  terms don't allow the free tier for users in the EEA, Switzerland or the UK, so
  planning is declined there. Free-tier prompts may be used to improve Google's
  products, so the form asks people not to include personal details.

## Attribution

Map data and tiles © [OpenStreetMap](https://www.openstreetmap.org/copyright)
contributors, geocoding by Nominatim. Summaries and photos from Wikipedia and
Wikimedia Commons, credited under their licences.

AI can make mistakes: verify opening times and bookings before you travel.
