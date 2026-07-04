// Optional persistence for shareable trip links. All access is server-side with
// the service-role key. If the env vars are absent (e.g. local dev without
// Supabase), every function degrades gracefully and the app still generates trips.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Itinerary } from "./types";

const TABLE = "itineraries";

function getUrl(): string | undefined {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
}
function getKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function isSupabaseEnabled(): boolean {
  return Boolean(getUrl() && getKey());
}

let client: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
  if (!isSupabaseEnabled()) return null;
  if (!client) {
    client = createClient(getUrl() as string, getKey() as string, {
      auth: { persistSession: false },
    });
  }
  return client;
}

/** Persist an itinerary; returns its id, or null if persistence is unavailable. */
export async function saveItinerary(itinerary: Itinerary): Promise<string | null> {
  const db = getClient();
  if (!db) return null;
  const { data, error } = await db
    .from(TABLE)
    .insert({
      destination: itinerary.destinationFull.slice(0, 120),
      data: itinerary,
    })
    .select("id")
    .single();
  if (error || !data) return null;
  return data.id as string;
}

/** Load a saved itinerary by id, or null if missing / persistence unavailable. */
export async function getItinerary(id: string): Promise<Itinerary | null> {
  const db = getClient();
  if (!db) return null;
  const { data, error } = await db
    .from(TABLE)
    .select("data")
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return data.data as Itinerary;
}
