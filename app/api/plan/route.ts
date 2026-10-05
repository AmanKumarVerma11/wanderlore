import { NextResponse } from "next/server";
import { validatePlanRequest } from "@/lib/validate";
import { GeminiError } from "@/lib/gemini";
import { PlanError, planTrip } from "@/lib/plan";
import { isSupabaseEnabled } from "@/lib/supabase";
import { isRestrictedCountry, REGION_MESSAGE } from "@/lib/region";
import { checkPlanLimits } from "@/lib/ratelimit";

// Real model call + live OSM/Wikipedia enrichment can take a while; give the
// serverless function room so it doesn't time out mid-generation.
export const runtime = "nodejs";
export const maxDuration = 60;

const LIMIT_MESSAGES = {
  ip: "You've planned the maximum number of trips for this hour. Please try again later.",
  daily: "Today's free planning capacity is used up. Please try again tomorrow.",
};

export async function POST(request: Request) {
  if (isRestrictedCountry(request.headers.get("x-vercel-ip-country"))) {
    return NextResponse.json({ error: REGION_MESSAGE }, { status: 451 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const validated = validatePlanRequest(json);
  if (!validated.ok || !validated.value) {
    return NextResponse.json(
      { error: validated.errors.join(" ") },
      { status: 400 }
    );
  }

  // Off in local dev, where every request shares one "unknown" IP.
  if (process.env.NODE_ENV === "production") {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const limit = await checkPlanLimits(ip);
    if (!limit.ok && limit.reason) {
      return NextResponse.json(
        { error: LIMIT_MESSAGES[limit.reason] },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSec ?? 3600) } }
      );
    }
  }

  try {
    // Destination check, generation (Gemini, plus the NVIDIA panel when
    // configured), then OSM/Wikipedia grounding: see lib/plan.ts.
    const { itinerary, meta, trace } = await planTrip(validated.value);
    return NextResponse.json({
      itinerary,
      orchestration: meta,
      trace, // for "How this plan was made"; not saved with share links
      shareEnabled: isSupabaseEnabled(),
    });
  } catch (err) {
    if (err instanceof PlanError || err instanceof GeminiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Unexpected /api/plan error:", err);
    return NextResponse.json(
      { error: "Something went wrong while planning your trip." },
      { status: 500 }
    );
  }
}
