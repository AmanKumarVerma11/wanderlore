import { NextResponse } from "next/server";
import { isSupabaseEnabled, saveItinerary } from "@/lib/supabase";
import type { Itinerary } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSupabaseEnabled()) {
    return NextResponse.json(
      { error: "Sharing is not configured on this deployment." },
      { status: 503 }
    );
  }

  let itinerary: Itinerary;
  try {
    const body = (await request.json()) as { itinerary?: Itinerary };
    if (!body?.itinerary?.destinationFull || !Array.isArray(body.itinerary.days)) {
      throw new Error("bad shape");
    }
    itinerary = body.itinerary;
  } catch {
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
