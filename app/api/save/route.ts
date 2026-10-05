import { NextResponse } from "next/server";
import { isSupabaseEnabled, saveItinerary } from "@/lib/supabase";
import { isSavableItinerary } from "@/lib/validate";

export const runtime = "nodejs";

// A real 7-day itinerary is about 27 KB of JSON; anything far larger is not ours.
const MAX_BODY_CHARS = 200_000;

export async function POST(request: Request) {
  if (!isSupabaseEnabled()) {
    return NextResponse.json(
      { error: "Sharing is not configured on this deployment." },
      { status: 503 }
    );
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) {
    return NextResponse.json({ error: "Itinerary is too large to save." }, { status: 413 });
  }

  let itinerary: unknown;
  try {
    itinerary = (JSON.parse(raw) as { itinerary?: unknown })?.itinerary;
  } catch {
    itinerary = null;
  }
  // Checked before any database call: the share page renders these URLs.
  if (!isSavableItinerary(itinerary)) {
    return NextResponse.json({ error: "Invalid itinerary payload." }, { status: 400 });
  }

  const id = await saveItinerary(itinerary);
  if (!id) {
    return NextResponse.json(
      { error: "Could not save the trip. Please try again." },
      { status: 500 }
    );
  }
  return NextResponse.json({ id });
}
