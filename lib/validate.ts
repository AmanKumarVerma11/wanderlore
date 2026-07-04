import type { PlanRequest, Pace } from "./types";

// The interests a traveller can pick. Kept as a closed set so the prompt and UI
// stay in sync and the model can't be steered by arbitrary free text here.
export const INTERESTS = [
  "Heritage & history",
  "Food & markets",
  "Art & crafts",
  "Architecture",
  "Nature & landscapes",
  "Spirituality",
  "Festivals & music",
  "Local everyday life",
] as const;

export const PACES: Pace[] = ["relaxed", "balanced", "packed"];

const MAX_DAYS = 7;
const MIN_DAYS = 1;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  value?: PlanRequest;
}

/**
 * Validate and normalise an incoming plan request. Pure and side-effect free so
 * it can be unit-tested and reused by the API route.
 */
export function validatePlanRequest(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof input !== "object" || input === null) {
    return { ok: false, errors: ["Request body must be a JSON object."] };
  }
  const body = input as Record<string, unknown>;

  const destination =
    typeof body.destination === "string" ? body.destination.trim() : "";
  if (destination.length < 2) {
    errors.push("Please enter a destination (a city, region, or country).");
  }
  if (destination.length > 80) {
    errors.push("Destination is too long (max 80 characters).");
  }

  const rawInterests = Array.isArray(body.interests) ? body.interests : [];
  const interests = rawInterests
    .filter((i): i is string => typeof i === "string")
    .map((i) => i.trim())
    .filter((i) => (INTERESTS as readonly string[]).includes(i));
  if (interests.length === 0) {
    errors.push("Pick at least one interest so we can tailor your trip.");
  }

  const daysNum =
    typeof body.days === "number"
      ? body.days
      : Number.parseInt(String(body.days ?? ""), 10);
  const days = Number.isFinite(daysNum) ? Math.trunc(daysNum) : NaN;
  if (!Number.isFinite(days) || days < MIN_DAYS || days > MAX_DAYS) {
    errors.push(`Trip length must be between ${MIN_DAYS} and ${MAX_DAYS} days.`);
  }

  const pace = (typeof body.pace === "string" ? body.pace : "balanced") as Pace;
  if (!PACES.includes(pace)) {
    errors.push("Pace must be relaxed, balanced, or packed.");
  }

  const note =
    typeof body.note === "string" ? body.note.trim().slice(0, 400) : undefined;

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    value: {
      destination,
      interests,
      days: days as number,
      pace,
      note: note && note.length > 0 ? note : undefined,
    },
  };
}
