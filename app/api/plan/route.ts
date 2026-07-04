import { NextResponse } from "next/server";
import { validatePlanRequest } from "@/lib/validate";
import { generateItinerary, GeminiError } from "@/lib/gemini";
import { enrichItinerary } from "@/lib/enrich";
import { isSupabaseEnabled } from "@/lib/supabase";

// Real model call + live OSM/Wikipedia enrichment can take a while; give the
// serverless function room so it doesn't time out mid-generation.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
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

  try {
    const model = await generateItinerary(validated.value);
    const itinerary = await enrichItinerary(validated.value, model);
    return NextResponse.json({
      itinerary,
      shareEnabled: isSupabaseEnabled(),
    });
  } catch (err) {
    if (err instanceof GeminiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Unexpected /api/plan error:", err);
    return NextResponse.json(
      { error: "Something went wrong while planning your trip." },
      { status: 500 }
    );
  }
}
