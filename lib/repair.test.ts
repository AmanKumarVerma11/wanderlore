import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Place } from "./types";
import type { Destination, PlaceLookup } from "./geocode";

vi.mock("./gemini", () => ({ geminiJson: vi.fn() }));
vi.mock("./geocode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./geocode")>()),
  geocodePlaces: vi.fn(),
}));

import { buildRepairPrompt, parseRepair, repairNotFound, REPAIR_MODELS } from "./repair";
import { geminiJson } from "./gemini";
import { geocodePlaces } from "./geocode";
import { withTrace } from "./trace";

const OAXACA: Destination = {
  lat: 17.06,
  lng: -96.72,
  bbox: [17.0, 17.1, -96.8, -96.6],
  countryCode: "mx",
  displayName: "Oaxaca de Juárez, Oaxaca, México",
};
const place = (name: string, geoQuery = `${name}, Oaxaca, Mexico`): Place => ({
  name,
  type: "attraction",
  blurb: `About ${name}.`,
  significance: "s",
  bestTime: "t",
  geoQuery,
});
const PLACES = [
  place("Templo de Santo Domingo"),
  place("Textile Museum of Oaxaca"),
  place("Mercado de Abastos"),
  place("Plazuela de San Cosme"),
];
const FIRST: PlaceLookup[] = [
  { status: "verified", geo: { lat: 17.06, lng: -96.72, osmUrl: "https://www.openstreetmap.org/way/1" } },
  { status: "not_found", geo: null },
  { status: "not_found", geo: null },
  { status: "unchecked", geo: null },
];
const reply = (places: unknown[]) => ({ value: { places }, model: REPAIR_MODELS[0], attempts: [] });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildRepairPrompt", () => {
  it("names the destination and each missing place, and asks for OSM's name or null", () => {
    const prompt = buildRepairPrompt(OAXACA, [place("Chora Mosque", "Chora Church, Istanbul, Turkey")]);
    expect(prompt).toContain("Oaxaca de Juárez, Oaxaca, México");
    expect(prompt).toContain('1. Chora Mosque (also searched as "Chora Church"): About Chora Mosque.');
    expect(prompt).toMatch(/local-language name/);
    expect(prompt).toMatch(/give null/);
    expect(prompt).toMatch(/Never suggest a different place/);
  });
});

describe("parseRepair", () => {
  it("maps answers to places by id and drops anything malformed", () => {
    const answers = {
      places: [
        { id: 2, osmName: "Mercado de Abastos" },
        { id: 1, osmName: "  Museo Textil de Oaxaca " },
        { id: 3, osmName: 'osmName": "MACO"' }, // a JSON fragment, as Gemma 4 once returned
        { id: 9, osmName: "Out of range" },
        { id: 4, osmName: null },
      ],
    };
    expect(parseRepair(answers, 4)).toEqual(["Museo Textil de Oaxaca", "Mercado de Abastos", null, null]);
    expect(parseRepair("nonsense", 2)).toEqual([null, null]);
  });
});

describe("repairNotFound", () => {
  const deadline = () => Date.now() + 30_000;

  it("does nothing when every place was found or left unchecked", async () => {
    const lookups = [FIRST[0], FIRST[3]];
    expect(await repairNotFound([PLACES[0], PLACES[3]], lookups, OAXACA, deadline())).toBe(lookups);
    expect(geminiJson).not.toHaveBeenCalled();
  });

  it("asks once about the places not found, and searches only new names", async () => {
    vi.mocked(geminiJson).mockResolvedValue(
      reply([
        { id: 1, osmName: "Museo Textil" },
        { id: 2, osmName: "Mercado de Abastos" }, // the name already searched
      ])
    );
    vi.mocked(geocodePlaces).mockResolvedValue([
      {
        status: "verified",
        geo: { lat: 17.061, lng: -96.724, osmUrl: "https://www.openstreetmap.org/node/2", name: "Museo Textil de Oaxaca" },
      },
    ]);
    const out = await repairNotFound(PLACES, FIRST, OAXACA, deadline());

    expect(geminiJson).toHaveBeenCalledTimes(1);
    const call = vi.mocked(geminiJson).mock.calls[0][0];
    expect(call.models).toEqual(["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"]); // its own model, then the primary
    expect(call.prompt).toContain("1. Textile Museum of Oaxaca");
    expect(call.prompt).toContain("2. Mercado de Abastos");
    expect(call.prompt).not.toContain("Plazuela de San Cosme"); // unchecked, not missing
    expect(vi.mocked(geocodePlaces).mock.calls[0][0]).toEqual([{ name: "Museo Textil", geoQuery: "Museo Textil" }]);
    expect(vi.mocked(geocodePlaces).mock.calls[0][3]).toEqual({ repair: true });
    expect(out.map((l) => l.status)).toEqual(["verified", "verified", "not_found", "unchecked"]);
    expect(out[1].matchedName).toBe("Museo Textil de Oaxaca"); // OSM's name, not the model's
  });

  it("keeps the first pass when the repair request fails", async () => {
    vi.mocked(geminiJson).mockRejectedValue(new Error("busy"));
    expect(await repairNotFound(PLACES, FIRST, OAXACA, deadline())).toBe(FIRST);
    expect(geocodePlaces).not.toHaveBeenCalled();
  });

  it("skips, and says so in the trace, when there's no time left", async () => {
    const { value, trace } = await withTrace(() =>
      repairNotFound(PLACES, FIRST, OAXACA, Date.now() + 6_000)
    );
    expect(value).toBe(FIRST);
    expect(geminiJson).not.toHaveBeenCalled();
    expect(trace.spans.map((s) => [s.name, s.outcome])).toEqual([["repair", "skipped: no time"]]);
  });
});
