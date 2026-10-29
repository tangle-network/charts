import { formatSpanDuration } from "../flow-waterfall-model";

/** Canonical duration text; invalid or absent measurements have no chip. */
export function fmtDuration(ms: number | undefined): string | undefined {
  return ms === undefined || !Number.isFinite(ms) || ms < 0 ? undefined : formatSpanDuration(ms);
}

/** Human-readable USD cost: `$0`, `$0.0032` (sub-cent, 4dp), `$1.20`. Undefined
 *  for an absent, non-finite, or negative input — a cost is a billing amount, so
 *  a negative value is bad data, not a refund to render. */
export function fmtCost(usd: number | undefined): string | undefined {
  if (usd === undefined || !Number.isFinite(usd) || usd < 0) return undefined;
  if (usd === 0) return "$0";
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}

/** Bound host-supplied preview/error text to a fixed length (with an ellipsis)
 *  before it reaches the DOM, so an oversized payload can't bloat the node tree —
 *  the card only ever shows a short preview, and CSS clamping is visual only.
 *  Truncation is code-point aware: it never slices through a surrogate pair (which
 *  would leave a lone surrogate that renders as the replacement character). */
export function clampPreview(text: string, max = 200): string {
  if (text.length <= max) return text;
  // If the cut lands between a surrogate pair's two halves, drop the dangling
  // high surrogate so the appended ellipsis isn't preceded by a broken glyph.
  const lastCode = text.charCodeAt(max - 1);
  const end = lastCode >= 0xd800 && lastCode <= 0xdbff ? max - 1 : max;
  return `${text.slice(0, end)}…`;
}

/** Human-readable token usage: `1200/340 tok`. Undefined when neither side is a
 *  finite, non-negative count, so the caller renders no chip; an invalid side
 *  (negative / NaN / absent) shows as 0 rather than leaking `-5/NaN tok`. */
export function fmtTokens(
  input: number | undefined,
  output: number | undefined,
): string | undefined {
  const valid = (n: number | undefined): number | undefined =>
    n !== undefined && Number.isFinite(n) && n >= 0 ? n : undefined;
  const i = valid(input);
  const o = valid(output);
  if (i === undefined && o === undefined) return undefined;
  return `${i ?? 0}/${o ?? 0} tok`;
}

/** A token total in a few characters: `840 tok`, `12.4k tok`, `1.2M tok`.
 *  Undefined for an absent, non-finite or negative count. */
export function fmtTokenTotal(tokens: number | null | undefined): string | undefined {
  if (tokens == null || !Number.isFinite(tokens) || tokens < 0) return undefined;
  if (tokens < 1000) return `${Math.round(tokens)} tok`;
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(tokens < 10_000 ? 1 : 0)}k tok`;
  return `${(tokens / 1_000_000).toFixed(1)}M tok`;
}

export function fmtEventTime(at: number | undefined, now: number, frozen = false) {
  if (at == null || !Number.isFinite(at)) return "—";
  if (frozen) return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  return seconds < 5 ? "now" : seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m` : `${Math.floor(seconds / 3600)}h`;
}
