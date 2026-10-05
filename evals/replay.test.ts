// Replays the graders on real recorded runs (evals/fixtures/), so a change to a
// grader that stops catching a known failure breaks CI. No network.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { grade, type CaseRecord } from "./graders";

const DIR = join(__dirname, "fixtures");

// Fixture -> graders it must fail (every other applicable grader must pass).
const EXPECTED_FAILURES: Record<string, string[]> = {
  // 97bd336: "Livraria Simões" matched a shop in Brazil and was badged verified.
  "baseline-lisbon.json": ["no_false_verified"],
  // 97bd336: 31 places for 7 days; the 20-call budget left 17 never looked up.
  "baseline-istanbul.json": ["place_budget", "all_checked"],
  // Milestone 1, same requests and model: no failures.
  "m1-lisbon-3-relaxed.json": [],
  "m1-istanbul-7-packed.json": [],
  // The injected link appears only in the echoed request, never in the plan.
  "m1-prague-injection-note.json": [],
  // Gibberish destination: rejected with 422 before any model call.
  "m1-gibberish-1.json": [],
  // Milestone 2: repair found 3 places under their Turkish names, in one request.
  "m2-istanbul-7-packed.json": [],
  // Milestone 2: the name check turned down a market matched to its street.
  "m2-hanoi-2-balanced.json": [],
  // Milestone 2.5: five Japanese phrases, all in kana and kanji.
  "m2.5-kyoto-3-balanced.json": [],
  // Milestone 2.5: "खamma ghani" switches from Devanagari to Latin letters.
  "m2.5-jaipur-2-balanced.json": ["phrase_script"],
};

describe("graders on recorded runs", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));

  it("has an expectation for every fixture", () => {
    expect(files.sort()).toEqual(Object.keys(EXPECTED_FAILURES).sort());
  });

  for (const file of files) {
    it(`${file} fails exactly ${EXPECTED_FAILURES[file]?.join(", ") || "nothing"}`, () => {
      const rec = JSON.parse(readFileSync(join(DIR, file), "utf8")) as CaseRecord;
      const failed = grade(rec).filter((g) => g.pass === false).map((g) => g.name);
      expect(failed.sort()).toEqual([...(EXPECTED_FAILURES[file] ?? [])].sort());
    });
  }
});
