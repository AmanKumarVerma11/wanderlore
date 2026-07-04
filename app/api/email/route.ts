import { NextResponse } from "next/server";
import { isEmailEnabled, sendItineraryEmail } from "@/lib/email";
import type { Itinerary } from "@/lib/types";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  if (!isEmailEnabled()) {
    return NextResponse.json(
      { error: "Email is not configured on this deployment." },
      { status: 503 }
    );
  }

  let email: string;
  let itinerary: Itinerary;
  try {
    const body = (await request.json()) as {
      email?: string;
      itinerary?: Itinerary;
    };
    email = String(body?.email ?? "").trim();
    if (!EMAIL_RE.test(email) || email.length > 200) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (!body?.itinerary?.destinationFull || !Array.isArray(body.itinerary.days)) {
      throw new Error("bad shape");
    }
    itinerary = body.itinerary;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const result = await sendItineraryEmail(email, itinerary);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "Could not send the email." },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true });
}
