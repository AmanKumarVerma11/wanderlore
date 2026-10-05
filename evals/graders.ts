// Code graders for the eval set: pure, binary checks on one recorded run, plus
// the numbers the report aggregates. Written from error analysis of real runs
// (2026-10-03): wrong-continent "verified" pins, places never looked up, and
// plans too big to check in time. No LLM judge here.

import type { EnrichedPlace, Itinerary, OrchestrationMeta, PlanTrace, SpanName } from "../lib/types";
import { MAX_MAPPED_PLACES, placeBudget } from "../lib/prompts";
import { inOwnScript } from "../lib/speech";

export interface EvalCase {
  id: string;
  tags: string[];
  request: {
    destination: string;
    interests: string[];
    days: number;
    pace: "relaxed" | "balanced" | "packed";
    note?: string;
  };
  expect?: "plan" | "reject";
  mustNotContain?: string[];
  // What the note asks for: each entry is a regex the plan's content must match.
  noteMustMention?: string[];
}

export interface CallRecord {
  host: string;
  label: string; // Nominatim query, model name, or URL path
  start: number; // ms since the case started
  ms: number;
  status: number | string;
}

/** Everything one case produced; saved to disk so grading can be replayed. */
export interface CaseRecord {
  case: EvalCase;
  pipeline: string;
  ms: number;
  outcome: "ok" | "error";
  status?: number;
  error?: string;
  itinerary?: Itinerary;
  meta?: OrchestrationMeta;
  trace?: PlanTrace; // from milestone 2 on
  refBox?: [number, number, number, number] | null; // destination box used for grading
  calls: CallRecord[];
}

export interface Grade {
  name: string;
  pass: boolean | null; // null = not applicable to this case
  detail?: string;
}

export const DEADLINE_MS = 55_000;
const MARGIN_KM = 30; // same margin the geocoder allows

function placesOf(it: Itinerary): EnrichedPlace[] {
  return [...it.days.flatMap((d) => d.items), ...it.localSecrets];
}

export function inBox(p: { lat: number; lng: number }, box: [number, number, number, number]): boolean {
  const [s, n, w, e] = box;
  const dLat = MARGIN_KM / 111;
  const dLng = MARGIN_KM / (111 * Math.cos((((s + n) / 2) * Math.PI) / 180));
  return p.lat >= s - dLat && p.lat <= n + dLat && p.lng >= w - dLng && p.lng <= e + dLng;
}

/** A place was never looked up. Older pipelines have no status, so use the call log. */
function isUnchecked(p: EnrichedPlace, rec: CaseRecord): boolean {
  if (p.geoStatus) return p.geoStatus === "unchecked";
  if (p.verified) return false;
  return !rec.calls.some((c) => c.host.includes("nominatim") && c.label === p.geoQuery.trim());
}

export function falseVerified(rec: CaseRecord): EnrichedPlace[] {
  if (!rec.itinerary || !rec.refBox) return [];
  const box = rec.refBox;
  return placesOf(rec.itinerary).filter(
    (p) => p.verified && p.lat !== null && p.lng !== null && !inBox({ lat: p.lat, lng: p.lng }, box)
  );
}

export function grade(rec: CaseRecord): Grade[] {
  const expectReject = rec.case.expect === "reject";
  const it = rec.itinerary;
  const na = (name: string): Grade => ({ name, pass: null });

  const completed: Grade = expectReject
    ? { name: "completed", pass: rec.outcome === "error" && rec.status === 422, detail: rec.error }
    : { name: "completed", pass: rec.outcome === "ok", detail: rec.error };
  if (!it) {
    return [completed, ...["schema", "day_count", "place_budget", "no_duplicates", "no_false_verified", "all_checked", "events_no_year", "phrase_script", "note_reflected", "no_forbidden_text", "repair_bounded"].map(na), deadline(rec)];
  }

  const places = placesOf(it);
  const budget = placeBudget(rec.case.request);
  const badDays = it.days.filter(
    (d) => d.items.length < budget.perDay[0] || d.items.length > budget.perDay[1]
  );
  const names = places.map((p) => p.name.trim().toLowerCase());
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  const wrong = falseVerified(rec);
  const unchecked = places.filter((p) => isUnchecked(p, rec));
  const yearEvents = it.events.filter((e) => /\b(19|20)\d\d\b/.test(e.whenTypical));
  // Romanized or in another language's script: the page offers no audio for these.
  const offScript = it.phrases.filter((p) => p.lang && !inOwnScript(p.phrase, p.lang)).map((p) => p.phrase);
  // Model-written content only: `input` echoes the user's own note back.
  const text = JSON.stringify({ ...it, input: undefined }).toLowerCase();
  const forbidden = (rec.case.mustNotContain ?? []).filter((s) => text.includes(s.toLowerCase()));
  // The note must change what the traveller would do: the places, experiences and
  // tips. Day themes, the story and the model's own summary (noteFit) don't count,
  // because the model can name the note there without changing a single stop.
  const actionable = JSON.stringify([places, it.experiences, it.etiquette]);
  const unmet = (rec.case.noteMustMention ?? []).filter((re) => !new RegExp(re, "i").test(actionable));

  return [
    completed,
    {
      name: "schema",
      pass:
        typeof it.story === "string" && it.story.length > 0 &&
        typeof it.heritageSummary === "string" &&
        it.days.every((d) => typeof d.theme === "string" && Array.isArray(d.items)) &&
        [it.events, it.experiences, it.phrases, it.etiquette].every(Array.isArray),
    },
    { name: "day_count", pass: it.days.length === rec.case.request.days, detail: `${it.days.length} days` },
    {
      name: "place_budget",
      pass: places.length <= MAX_MAPPED_PLACES && badDays.length === 0,
      detail: `${places.length} places; per day ${it.days.map((d) => d.items.length).join(",")}`,
    },
    { name: "no_duplicates", pass: dupes.length === 0, detail: dupes.join(", ") || undefined },
    {
      name: "no_false_verified",
      pass: rec.refBox ? wrong.length === 0 : null,
      detail: wrong.map((p) => p.name).join(", ") || undefined,
    },
    { name: "all_checked", pass: unchecked.length === 0, detail: unchecked.length ? `${unchecked.length} unchecked` : undefined },
    { name: "events_no_year", pass: yearEvents.length === 0, detail: yearEvents.map((e) => e.whenTypical).join("; ") || undefined },
    // Plans saved before phrases had a language tag can't be checked.
    {
      name: "phrase_script",
      pass: it.phrases.some((p) => p.lang) ? offScript.length === 0 : null,
      detail: offScript.join("; ") || undefined,
    },
    {
      name: "note_reflected",
      pass: rec.case.noteMustMention ? unmet.length === 0 : null,
      detail: unmet.length ? `missing ${unmet.join("; ")}` : undefined,
    },
    {
      name: "no_forbidden_text",
      pass: rec.case.mustNotContain ? forbidden.length === 0 : null,
      detail: forbidden.join(", ") || undefined,
    },
    // Repair is one round: one request per repair model at most, so two.
    { name: "repair_bounded", pass: rec.trace ? repairCalls(rec.trace) <= 2 : null },
    deadline(rec),
  ];
}

const repairCalls = (trace: PlanTrace) =>
  trace.spans.filter((s) => s.name === "repair" && !s.outcome.startsWith("skipped")).length;

/** First start to last end of the trace's spans with these names (0 if none). */
function extent(trace: PlanTrace, ...names: SpanName[]): number {
  const spans = trace.spans.filter((s) => names.includes(s.name));
  return spans.length ? Math.max(...spans.map((s) => s.start + s.ms)) - Math.min(...spans.map((s) => s.start)) : 0;
}

function deadline(rec: CaseRecord): Grade {
  return { name: "deadline", pass: rec.ms <= DEADLINE_MS, detail: `${(rec.ms / 1000).toFixed(1)}s` };
}

/** Numbers per case for the report (not pass/fail). */
export function metrics(rec: CaseRecord) {
  const places = rec.itinerary ? placesOf(rec.itinerary) : [];
  const verified = places.filter((p) => p.verified);
  const wrong = falseVerified(rec);
  const repaired = places.filter((p) => p.osmName).length;
  const span = (cs: CallRecord[]) =>
    cs.length ? Math.max(...cs.map((c) => c.start + c.ms)) - Math.min(...cs.map((c) => c.start)) : 0;
  const gemini = rec.calls.filter((c) => c.host.includes("googleapis"));
  const geminiEnd = Math.max(0, ...gemini.map((c) => c.start + c.ms));
  // Records without a trace predate repair: place lookups were everything after
  // the (only) model call. The trace times each stage directly.
  const placeLookups = rec.calls.filter((c) => c.host.includes("nominatim") && c.start >= geminiEnd);
  const t = rec.trace;
  return {
    places: places.length,
    verified: verified.length,
    located: verified.length - wrong.length, // verified AND inside the destination
    falseVerified: wrong.length,
    unchecked: places.filter((p) => isUnchecked(p, rec)).length,
    repaired, // found only by repair, under OSM's name
    missedFirst: repaired + places.filter((p) => p.geoStatus === "not_found").length, // what repair was asked about
    totalMs: rec.ms,
    geminiMs: t ? extent(t, "gemini") : span(gemini),
    nominatimMs: t ? extent(t, "lookup") : span(placeLookups),
    repairMs: t ? extent(t, "repair", "repair-lookup") : 0,
    nominatimCalls: rec.calls.filter((c) => c.host.includes("nominatim")).length,
    geminiAttempts: rec.meta?.attempts?.length ?? gemini.length,
    repairCalls: t ? repairCalls(t) : 0,
    model: rec.meta?.model ?? null,
  };
}
