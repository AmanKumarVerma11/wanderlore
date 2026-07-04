# 🧭 Wanderlore — an AI cultural trip weaver

**H2S PromptWars · Main Challenge: _Destination Discovery & Cultural Experiences_**

Wanderlore is a GenAI platform that helps travellers discover a destination's
**culture**, not just its checklist of sights. Tell it where you're going and what
moves you, and it weaves a day-by-day cultural journey — famous attractions, hidden
gems, immersive storytelling, living heritage, real festivals, and authentic
experiences — with **every place verified on a real map**.

> Live demo: _see the deployed Vercel URL_ · No login required.

---

## The challenge, and how Wanderlore answers all of it

The brief asks for GenAI that can _recommend attractions, uncover hidden gems,
generate immersive storytelling, promote heritage, suggest local events, and connect
visitors with authentic cultural experiences._ Rather than six disconnected features,
Wanderlore does all six in **one coherent flow**:

| Brief requirement | Where it lives in Wanderlore |
| --- | --- |
| Recommend attractions | Day-by-day itinerary of must-see sites |
| Uncover hidden gems | Places tagged **“hidden gem”** + a dedicated _Local secrets_ section |
| Immersive storytelling | A narrated **“cultural portrait”** of the place |
| Promote heritage | A heritage summary + a _why it matters_ note on every place, cited to Wikipedia |
| Suggest local events | Recurring **cultural events & festivals** with their seasonal timing and roots |
| Authentic cultural experiences | Participatory experiences with _how to engage_ + a respectful-travel tip, plus local phrases and etiquette |

## Approach & logic (why it's trustworthy, not just plausible)

A raw LLM will happily invent a museum or a festival date — the exact "hallucinated
output" failure the evaluation penalises. Wanderlore is built so the AI does the
**creative synthesis** while **real open data grounds the facts**:

1. **Generate (Google Gemini).** One real `generateContent` call with a strict JSON
   schema returns the story, itinerary, gems, events, experiences, phrases and
   etiquette. No mock data, no canned responses, no fallback fixtures.
2. **Verify places (OpenStreetMap / Nominatim).** Every place the model names is
   geocoded against OSM. Only places OSM confirms get a map pin and a _“Verified on
   OpenStreetMap”_ badge with a link to the real node. Places OSM can't confirm are
   shown but honestly labelled **“Location unverified”** — never faked, never silently
   dropped.
3. **Ground heritage (Wikipedia).** The destination and its top sites are enriched
   with real Wikipedia summaries, a hero image, and citeable source links.

The result: the map, the images, and the sources are all real; only the _curation and
narrative_ are AI-generated — and clearly attributed as such.

## How it works (architecture)

```
User form ──▶ POST /api/plan
                 │
                 ├─ validate input            (lib/validate.ts — pure, unit-tested)
                 ├─ Gemini generateContent     (lib/gemini.ts — real call, JSON schema)
                 ├─ geocode every place (OSM)   (lib/geocode.ts — sequential, rate-limited)
                 └─ enrich w/ Wikipedia         (lib/wiki.ts + lib/enrich.ts)
                 ▼
           Itinerary JSON ──▶ rendered UI (story · Leaflet/OSM map · days · gems ·
                                            events · experiences · phrases · sources)
                                 │
                                 └─ optional: POST /api/save ──▶ Supabase ──▶ /t/[id] share link
```

- **Stack:** Next.js 14 (App Router) · TypeScript · Tailwind · Leaflet + OpenStreetMap ·
  Supabase (optional persistence) · deployed on Vercel.
- **Security:** API key is server-only; strict Content-Security-Policy (scripts/styles
  `self`, images limited to OSM tiles + Wikimedia); security headers on every response;
  all third-party fetches happen server-side.
- **Map pins** use CSS `divIcon`s so no external icon assets are needed (keeps the CSP tight).

## Testing

Pure logic (input validation + place-enrichment transforms) is unit-tested with Vitest:

```bash
npm run test      # 15 tests
```

The whole app was also walked end-to-end (generate → verify pins → view → share) before
submission, per the challenge's hands-on evaluation.

## Run it locally

```bash
npm install
cp .env.example .env.local     # then fill in GEMINI_API_KEY
npm run dev                     # http://localhost:3000
```

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | ✅ | Server-only Google Gemini key |
| `GEMINI_MODEL` | — | Defaults to `gemini-flash-latest` |
| `SUPABASE_URL` | — | Enables saving + shareable trip links |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Server-side writes/reads |
| `NEXT_PUBLIC_SITE_URL` | — | Base URL for building share links |

If Supabase isn't configured the app still generates trips fully — only the
“create shareable link” option is hidden. No feature is ever shown in a broken state.

### Optional: enable shareable links (Supabase)

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

## Assumptions

- **Events are seasonal, not dated.** The model returns _recurring_ festivals with
  their usual season (e.g. “Mid-July, annually”) instead of inventing exact dates,
  which keeps them factual across years.
- **Some genuine gems aren't in OpenStreetMap.** A great hole-in-the-wall may have no
  OSM node; we surface it but label it unverified rather than drop authentic
  recommendations.
- **English Wikipedia** is used for heritage grounding for broad coverage.
- **Free tier only.** Gemini's paid Search-grounding tool is deliberately avoided;
  OSM + Wikipedia provide grounding at no cost.

---

Built for H2S PromptWars. AI can make mistakes — verify opening times and bookings
before you travel.
