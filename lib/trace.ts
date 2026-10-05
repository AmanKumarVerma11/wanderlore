// Request-scoped trace: every timed step of one /api/plan request (map lookups,
// model calls, Wikipedia reads), returned with the plan for "How this plan was
// made" and saved by the eval runner. AsyncLocalStorage carries the current trace
// across awaits, so helpers deep in the pipeline record into the right request
// without a trace parameter on every call (OpenTelemetry propagates context the
// same way). Server-only: client code imports the types from ./types instead.

import { AsyncLocalStorage } from "node:async_hooks";
import type { PlanTrace, SpanName, TraceSpan } from "./types";

interface TraceContext {
  t0: number;
  spans: TraceSpan[];
}

const current = new AsyncLocalStorage<TraceContext>();

/** Run `fn` with a fresh trace and return its result together with the trace. */
export async function withTrace<T>(fn: () => Promise<T>): Promise<{ value: T; trace: PlanTrace }> {
  const ctx: TraceContext = { t0: Date.now(), spans: [] };
  const value = await current.run(ctx, fn);
  const spans = [...ctx.spans].sort((a, b) => a.start - b.start);
  return { value, trace: { totalMs: Date.now() - ctx.t0, spans } };
}

export type EndSpan = (outcome: string, extra?: Pick<TraceSpan, "cached">) => void;

/**
 * Start a span and get back the function that ends it with an outcome ("found",
 * "503", "timeout"...). Outside a traced request it does nothing.
 */
export function startSpan(name: SpanName, detail?: string): EndSpan {
  const ctx = current.getStore();
  if (!ctx) return () => {};
  const start = Date.now() - ctx.t0;
  return (outcome, extra) => {
    ctx.spans.push({
      name,
      start,
      ms: Date.now() - ctx.t0 - start,
      outcome,
      ...(detail ? { detail } : {}),
      ...(extra?.cached ? { cached: true } : {}),
    });
  };
}
