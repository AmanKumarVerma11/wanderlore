"use client";

import type { Itinerary, PlanTrace, SpanName, TraceSpan } from "@/lib/types";

// "How this plan was made": the request's trace as a timeline, one row per step.
// Each span is drawn at its real start and length, so the 1 request/second pace
// of the map lookups is visible. Only shown right after planning; share links
// don't keep traces.

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const ok = (s: TraceSpan) => s.outcome === "found" || s.outcome === "200" || s.outcome === "ok";

interface Row {
  label: string;
  note: string;
  spans: TraceSpan[];
  accent?: boolean;
}

export default function TraceView({ trace, itinerary }: { trace: PlanTrace; itinerary: Itinerary }) {
  const total = Math.max(1, trace.totalMs); // bar positions are fractions of it
  const of = (...names: SpanName[]) => trace.spans.filter((s) => names.includes(s.name));
  const places = [...itinerary.days.flatMap((d) => d.items), ...itinerary.localSecrets];
  const found = places.filter((p) => p.verified).length;
  const renamed = places.filter((p) => p.osmName).length;
  const stillMissing = places.filter((p) => p.geoStatus === "not_found").length;

  const panel = of("panel");
  const lookups = of("lookup");
  const repair = of("repair");
  const reads = of("wikipedia", "photo-credit");
  const rows: Row[] = [
    { label: "Find the destination", note: describeLookups(of("destination")), spans: of("destination") },
    ...(panel.length ? [{ label: "Ask the draft panel", note: describeCalls(panel, ", "), spans: panel }] : []),
    { label: "Write the plan", note: describeCalls(of("gemini"), ", then "), spans: of("gemini") },
    { label: "Check each place on the map", note: describeLookups(lookups), spans: lookups },
    ...(repair.length
      ? [
          {
            label: "Ask for local names",
            note: describeRepair(repair, renamed, renamed + stillMissing),
            spans: [...repair, ...of("repair-lookup")],
            accent: true,
          },
        ]
      : []),
    {
      label: "Read Wikipedia",
      note: `${of("wikipedia").length} summaries${of("photo-credit").length ? ", photo credit" : ""}`,
      spans: reads,
    },
  ];

  return (
    <section aria-label="How this plan was made" className="no-print rounded-2xl border-2 border-ink bg-surface p-6 sm:p-8">
      <p className="label">Under the hood</p>
      <h2 className="display mt-1 text-3xl">How this plan was made</h2>
      <p className="mt-3 text-sm text-muted">
        Planned in {secs(trace.totalMs)}. {found} of {places.length} places found on OpenStreetMap
        {renamed > 0 && `, ${renamed} of them under their local name`}.
      </p>

      {/* The step name stays short on the left; the note, which can name two models,
          goes under the bar where it has the full width. */}
      <div className="mt-5 grid gap-4">
        {rows.map((r) => (
          <div key={r.label} className="grid gap-1 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-x-4">
            <span className="text-sm font-medium text-ink">{r.label}</span>
            <div>
              <div className="relative h-3 rounded-full bg-line-soft sm:mt-1" aria-hidden="true">
                {r.spans.map((s, i) => (
                  <span
                    key={i}
                    className={`absolute top-0 h-3 rounded-full ${
                      !ok(s) ? "bg-faint" : r.accent ? "bg-accent" : "bg-ink"
                    }`}
                    style={{
                      left: `${(100 * s.start) / total}%`,
                      width: `max(3px, ${(100 * s.ms) / total}%)`,
                    }}
                  />
                ))}
              </div>
              <span className="mt-1.5 block font-mono text-xs text-muted">{r.note}</span>
            </div>
          </div>
        ))}
      </div>

      <details className="mt-5">
        <summary className="cursor-pointer text-sm text-muted hover:text-ink">
          Every step ({trace.spans.length})
        </summary>
        <ol className="mt-3 grid max-h-72 grid-cols-[minmax(0,1fr)] gap-1 overflow-auto font-mono text-xs text-ink-soft">
          {trace.spans.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-12 shrink-0 text-right text-muted">+{secs(s.start)}</span>
              <span className="w-24 shrink-0 text-muted">{s.name}</span>
              <span className="min-w-0 flex-1 truncate">{s.detail}</span>
              <span className="shrink-0">
                {s.outcome}
                {s.cached ? " (cache)" : ` ${secs(s.ms)}`}
              </span>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

function describeLookups(spans: TraceSpan[]): string {
  if (spans.length === 0) return "none";
  const cached = spans.filter((s) => s.cached).length;
  const hits = spans.filter(ok).length;
  const searches = `${spans.length} ${spans.length === 1 ? "search" : "searches"}`;
  return `${searches}, ${hits} found${cached ? `, ${cached} from cache` : ""}`;
}

/** Model calls: in parallel (the panel) or one after another (the fallback chain). */
function describeCalls(spans: TraceSpan[], joiner: string): string {
  if (spans.length === 0) return "none";
  return spans
    .map((s) => `${s.detail ?? "model"} ${ok(s) ? "answered" : s.outcome === "503" || s.outcome === "429" ? "busy" : s.outcome}`)
    .join(joiner);
}

function describeRepair(repair: TraceSpan[], renamed: number, asked: number): string {
  if (repair[0].outcome.startsWith("skipped")) return "skipped: not enough time left";
  const last = repair[repair.length - 1];
  if (!ok(last)) return `${describeCalls(repair, ", then ")}; first results kept`;
  const handover = repair.length > 1 ? ` (${describeCalls(repair, ", then ")})` : "";
  return `asked about ${asked}, found ${renamed}${handover}`;
}
