import { formatCost, formatCount, formatSpanDuration } from "../flow-waterfall-model";
import { reportedCount } from "../../flow-trace.js";

/** Canonical duration text; invalid or absent measurements have no chip. */
export function fmtDuration(ms: number | undefined): string | undefined {
  return ms === undefined || !Number.isFinite(ms) || ms < 0 ? undefined : formatSpanDuration(ms);
}

/** Canonical USD text; invalid or absent measurements have no chip. */
export function fmtCost(usd: number | undefined): string | undefined {
  return usd === undefined || !Number.isFinite(usd) || usd < 0 ? undefined : formatCost(usd);
}

/** Bound host preview text before rendering, preserving complete surrogate pairs at the cut. */
export function clampPreview(text: string, max = 200): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/[\uD800-\uDBFF]$/u, "")}…`;
}

/** Human-readable token usage: `1200/340 tok`. Undefined when neither side is a
 *  finite, non-negative count, so the caller renders no chip; an invalid side
 *  (negative / NaN / absent) shows as 0 rather than leaking `-5/NaN tok`. */
export function fmtTokens(
  input: number | undefined,
  output: number | undefined,
): string | undefined {
  const i = reportedCount(input), o = reportedCount(output);
  if (i === undefined && o === undefined) return undefined;
  return `${i ?? 0}/${o ?? 0} tok`;
}

/** Canonical compact token count; invalid or absent measurements have no chip. */
export function fmtTokenTotal(tokens: number | null | undefined): string | undefined {
  return reportedCount(tokens) === undefined ? undefined : `${formatCount(tokens!)} tok`;
}

export function fmtEventTime(at: number | undefined, now: number, frozen = false) {
  if (at == null || !Number.isFinite(at)) return "—";
  if (frozen) return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  return seconds < 5 ? "now" : seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m` : `${Math.floor(seconds / 3600)}h`;
}
