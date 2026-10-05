// Eval runner for Wanderlore.
//
// Live:   npm run eval -- [--only id1,id2] [--tag core] [--lib <dir>] [--name <run>]
// Replay: npm run eval -- --replay evals/runs/<run>
//
// Live runs push each case through the real pipeline (lib/plan.ts, or an older
// copy of lib/ via --lib) and save one JSON record per case, with every outbound
// call timed, plus report.md. Replay re-grades saved records with no network.
// Live runs call Gemini and Nominatim (1 request/second): run them by hand, never
// on a schedule (Nominatim allows scheduled scripts 4 requests/minute).

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { grade, metrics, type CallRecord, type CaseRecord, type EvalCase } from "../evals/graders";

const ROOT = resolve(__dirname, "..");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// Same files Next.js reads; existing environment variables win. Nothing is printed.
function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

// Every outbound call made while a case runs, for per-stage timing.
let calls: CallRecord[] = [];
let caseStart = 0;
function recordFetches() {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const rec: CallRecord = { host: url.host, label: url.pathname, start: Date.now() - caseStart, ms: 0, status: "error" };
    if (url.host.includes("nominatim")) rec.label = url.searchParams.get("q") ?? "";
    if (url.host.includes("googleapis")) rec.label = url.pathname.split("/").pop() ?? "";
    if (url.host.includes("nvidia") && init?.body) rec.label = JSON.parse(String(init.body)).model;
    calls.push(rec);
    try {
      const res = await realFetch(input, init);
      rec.status = res.status;
      return res;
    } catch (e) {
      rec.status = e instanceof Error ? e.name : "error";
      throw e;
    } finally {
      rec.ms = Date.now() - caseStart - rec.start;
    }
  }) as typeof fetch;
}

type Runner = (req: EvalCase["request"]) => Promise<Pick<CaseRecord, "itinerary" | "meta">>;

async function pipeline(libDir: string): Promise<{ name: string; run: Runner }> {
  if (existsSync(join(libDir, "plan.ts"))) {
    const { planTrip } = await import(join(libDir, "plan.ts"));
    return { name: `plan.ts (${libDir})`, run: async (req) => planTrip(req) };
  }
  // Pipelines from before lib/plan.ts existed (the 97bd336 baseline).
  const { generateItineraryEnsemble } = await import(join(libDir, "orchestrator.ts"));
  const { enrichItinerary } = await import(join(libDir, "enrich.ts"));
  return {
    name: `legacy orchestrator + enrich (${libDir})`,
    run: async (req) => {
      const { model, meta } = await generateItineraryEnsemble(req);
      return { itinerary: await enrichItinerary(req, model), meta };
    },
  };
}

async function live(runDir: string) {
  loadEnv();
  recordFetches();
  const libDir = resolve(arg("lib") ?? join(ROOT, "lib"));
  const { name, run } = await pipeline(libDir);
  // Grading always uses the current geocoder's destination box, for every pipeline.
  const { geocodeDestination } = await import("../lib/geocode");
  const { validatePlanRequest } = await import("../lib/validate");

  const all: EvalCase[] = JSON.parse(readFileSync(join(ROOT, "evals/cases.json"), "utf8"));
  const only = arg("only")?.split(",");
  const tag = arg("tag");
  const cases = all.filter((c) => (!only || only.includes(c.id)) && (!tag || c.tags.includes(tag)));

  mkdirSync(runDir, { recursive: true });
  for (const c of cases) {
    const req = validatePlanRequest(c.request).value!;
    calls = [];
    caseStart = Date.now();
    const rec: CaseRecord = { case: c, pipeline: name, ms: 0, outcome: "ok", calls };
    try {
      Object.assign(rec, await run(req));
    } catch (e) {
      rec.outcome = "error";
      rec.error = e instanceof Error ? e.message : String(e);
      rec.status = (e as { status?: number }).status;
    }
    rec.ms = Date.now() - caseStart;
    calls = [];
    // An older --lib pipeline has its own throttle, so keep Nominatim at 1 request/second.
    await new Promise((r) => setTimeout(r, 1100));
    const box = await geocodeDestination(req.destination);
    rec.refBox = box ? box.bbox : null;
    writeFileSync(join(runDir, `${c.id}.json`), JSON.stringify(rec, null, 2));
    const failed = grade(rec).filter((g) => g.pass === false).map((g) => g.name);
    console.log(`${c.id}: ${rec.outcome} in ${(rec.ms / 1000).toFixed(1)}s${failed.length ? `, failed ${failed.join(", ")}` : ""}`);
  }
}

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "n/a");
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : 0;
};
const secs = (ms: number) => (ms / 1000).toFixed(1);

function report(runDir: string) {
  const recs: CaseRecord[] = readdirSync(runDir)
    .filter((f) => f.endsWith(".json") && f !== "summary.json")
    .map((f) => JSON.parse(readFileSync(join(runDir, f), "utf8")));
  const graded = recs.map((r) => ({ r, g: grade(r), m: metrics(r) }));
  const names = graded[0]?.g.map((g) => g.name) ?? [];
  const planned = graded.filter((x) => x.r.itinerary);
  const sum = (k: keyof ReturnType<typeof metrics>) => planned.reduce((s, x) => s + Number(x.m[k] ?? 0), 0);
  const models = Array.from(new Set(planned.map((x) => x.m.model).filter(Boolean)));
  const repairRuns = planned.filter((x) => x.m.repairMs > 0);

  const lines = [
    `# Eval run: ${runDir.split("/").pop()}`,
    "",
    `- Pipeline: ${recs[0]?.pipeline ?? "?"}`,
    `- Models that wrote plans: ${models.join(", ") || "unknown (pipeline did not report it)"}`,
    `- Cases: ${recs.length} (${planned.length} produced a plan)`,
    "",
    "## Graders (binary, per case)",
    "",
    "| Grader | Pass | Fail | Not applicable |",
    "|---|---|---|---|",
    ...names.map((n) => {
      const gs = graded.map((x) => x.g.find((g) => g.name === n)!);
      return `| ${n} | ${gs.filter((g) => g.pass === true).length} | ${gs.filter((g) => g.pass === false).length} | ${gs.filter((g) => g.pass === null).length} |`;
    }),
    "",
    "## Grounding and latency (cases that produced a plan)",
    "",
    "| Metric | Value |",
    "|---|---|",
    `| Places | ${sum("places")} |`,
    `| Verified | ${sum("verified")} (${pct(sum("verified"), sum("places"))}) |`,
    `| Located inside the destination | ${sum("located")} (${pct(sum("located"), sum("places"))}) |`,
    `| Verified but outside the destination | ${sum("falseVerified")} |`,
    `| Never looked up | ${sum("unchecked")} |`,
    `| Not found on the first pass | ${sum("missedFirst")} |`,
    `| Found by repair | ${sum("repaired")} (${pct(sum("repaired"), sum("missedFirst"))} of first-pass misses) |`,
    `| Total time, median / max | ${secs(median(planned.map((x) => x.m.totalMs)))}s / ${secs(Math.max(0, ...planned.map((x) => x.m.totalMs)))}s |`,
    `| Gemini time, median / max | ${secs(median(planned.map((x) => x.m.geminiMs)))}s / ${secs(Math.max(0, ...planned.map((x) => x.m.geminiMs)))}s |`,
    `| Nominatim time, median / max | ${secs(median(planned.map((x) => x.m.nominatimMs)))}s / ${secs(Math.max(0, ...planned.map((x) => x.m.nominatimMs)))}s |`,
    `| Repair time (request and lookups), median / max | ${repairRuns.length ? `${secs(median(repairRuns.map((x) => x.m.repairMs)))}s / ${secs(Math.max(...repairRuns.map((x) => x.m.repairMs)))}s, in ${repairRuns.length} plans` : "n/a"} |`,
    `| Model requests per plan, max | ${Math.max(0, ...planned.map((x) => x.m.geminiAttempts + x.m.repairCalls))} |`,
    "",
    "## Cases",
    "",
    "| Case | Outcome | Failed graders | Places | Located | Outside | Unchecked | Repaired | Time |",
    "|---|---|---|---|---|---|---|---|---|",
    ...graded.map(({ r, g, m }) => {
      const failed = g.filter((x) => x.pass === false).map((x) => (x.detail ? `${x.name} (${x.detail})` : x.name));
      const outcome = r.outcome === "ok" ? "plan" : `error ${r.status ?? ""}`.trim();
      return `| ${r.case.id} | ${outcome} | ${failed.join("; ") || "none"} | ${m.places} | ${m.located} | ${m.falseVerified} | ${m.unchecked} | ${m.repaired} of ${m.missedFirst} | ${secs(m.totalMs)}s |`;
    }),
    "",
  ];
  writeFileSync(join(runDir, "report.md"), lines.join("\n"));
  writeFileSync(join(runDir, "summary.json"), JSON.stringify(graded.map(({ r, g, m }) => ({ id: r.case.id, grades: g, metrics: m })), null, 2));
  console.log(`\nReport: ${join(runDir, "report.md")}`);
}

async function main() {
  const replay = arg("replay");
  if (replay) {
    report(resolve(replay));
    return;
  }
  const runDir = join(ROOT, "evals/runs", arg("name") ?? new Date().toISOString().replace(/[:.]/g, "-"));
  await live(runDir);
  report(runDir);
}

// Exit explicitly: open HTTP keep-alive sockets otherwise keep vite-node running.
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
