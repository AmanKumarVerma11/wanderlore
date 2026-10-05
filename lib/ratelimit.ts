// Rate limits for /api/plan, so one visitor can't use up the free Gemini quota
// and take the demo down for everyone. Fixed windows counted in the shared KV
// store; per-instance memory when the store isn't configured.

import { kvPipeline } from "./kv";

const PER_IP_PER_HOUR = Number(process.env.PLAN_RATE_PER_HOUR) || 5;
// About 70% of the daily request quota of the model chain (see lib/gemini.ts).
const DAILY_CAP = Number(process.env.PLAN_DAILY_CAP) || 350;

export interface LimitResult {
  ok: boolean;
  reason?: "ip" | "daily";
  retryAfterSec?: number;
}

const memory = new Map<string, { count: number; expires: number }>();

/**
 * Increment a counter that expires ttlSec after it was first created. `now` is the
 * caller's clock, the same one the window keys come from.
 */
async function bump(key: string, ttlSec: number, now: number): Promise<number> {
  const res = await kvPipeline([
    ["SET", key, 0, "EX", ttlSec, "NX"],
    ["INCR", key],
  ]);
  if (res && typeof res[1] === "number") return res[1];
  // One entry per IP per hour: drop expired ones so a long-lived instance can't grow forever.
  if (memory.size > 1000) {
    memory.forEach((v, k) => {
      if (v.expires <= now) memory.delete(k);
    });
  }
  const entry = memory.get(key);
  const next = entry && entry.expires > now ? entry.count + 1 : 1;
  memory.set(key, { count: next, expires: entry && entry.expires > now ? entry.expires : now + ttlSec * 1000 });
  return next;
}

// Gemini's daily quotas reset at midnight Pacific time, so the daily window does too.
function pacificClock(now: Date): { date: string; secondsIntoDay: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    secondsIntoDay: Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second),
  };
}

export async function checkPlanLimits(ip: string, now = new Date()): Promise<LimitResult> {
  const epochSec = Math.floor(now.getTime() / 1000);
  const hour = Math.floor(epochSec / 3600);
  if ((await bump(`rl:ip:${ip}:${hour}`, 3600, now.getTime())) > PER_IP_PER_HOUR) {
    return { ok: false, reason: "ip", retryAfterSec: 3600 - (epochSec % 3600) };
  }
  const { date, secondsIntoDay } = pacificClock(now);
  if ((await bump(`rl:day:${date}`, 2 * 86400, now.getTime())) > DAILY_CAP) {
    return { ok: false, reason: "daily", retryAfterSec: Math.max(60, 86400 - secondsIntoDay) };
  }
  return { ok: true };
}

/** Test helpers: forget, or count, in-memory counters. */
export function resetMemoryLimits() {
  memory.clear();
}
export function memoryLimitEntries(): number {
  return memory.size;
}
