/** One row per entrant: a p50 mark, its p95, the numbers at the row's end and every recorded fact on hover. */
import { formatSpanDuration } from "./format.js";
import { identityGap, type RateIdentity } from "./identity.js";
import { drawRows, type PlotRow, type RowLayout } from "./rows.js";
import { NARROW, wideWidth } from "./svg.js";
import { table } from "./table.js";
import { capitalize, plural } from "./text.js";
import type { Figure, Refusal } from "./types.js";

export interface LatencyRangeRow {
  id: string;
  label: string;
  p50Ms: number;
  /** Null draws no extent: too few samples for a p95. */
  p95Ms: number | null;
  n: number;
  /** The same measure on a second setup, an open dot on this row. Needs `heads.compare`. */
  compareMs?: number;
  /** A printed figure after the times, such as a reached rate. Needs `heads.extra`. */
  extra?: string;
  /** Recorded facts shown on hover, one line each. */
  facts?: readonly string[];
}

export interface LatencyRangeOptions {
  measure: string;
  /** A supplied SLO draws a threshold and colours each row by it. */
  sloMs?: number;
  minN: number;
  excluded?: string[];
  id?: string;
  /** `log` (default) spreads values across decades; `linear` draws bars from zero. */
  scale?: "log" | "linear";
  /** Prints 1..n in input order; the producer owns the order. */
  ranked?: boolean;
  /** Row ids drawn in the accent; every other row is muted. */
  highlight?: readonly string[];
  /** Marks keyed by row id; a row's `model` mark sits before its label. */
  identities?: Readonly<Record<string, RateIdentity>>;
  /** Column heads over the printed numbers. */
  heads?: { value?: string; spread?: string; compare?: string; extra?: string };
  /** The wide render's width, from the container it fills. */
  width?: number;
}

const fmt = (ms: number) => formatSpanDuration(ms);

export function latencyRange(rows: LatencyRangeRow[], o: LatencyRangeOptions): Figure | Refusal {
  const id = o.id ?? "latency-range";
  if (!rows.length) return { id, refused: "No latency ranges recorded." };
  if (!o.measure?.trim() || (o.sloMs !== undefined && (!Number.isFinite(o.sloMs) || o.sloMs <= 0)) || !Number.isInteger(o.minN) || o.minN < 1) return { id, refused: "A latency range needs a measure and a minimum n; an SLO must be positive." };
  if (new Set(rows.map(r => r.id)).size !== rows.length) return { id, refused: "Duplicate latency row ids." };
  const identityProblem = identityGap(rows, o.identities);
  if (identityProblem) return { id, refused: identityProblem };
  for (const r of rows) {
    if (!Number.isInteger(r.n) || r.n < o.minN) return { id, refused: `${r.label}: n=${r.n} is below the stated minimum n=${o.minN}.` };
    if (!Number.isFinite(r.p50Ms) || r.p50Ms <= 0 || (r.p95Ms !== null && (!Number.isFinite(r.p95Ms) || r.p95Ms < r.p50Ms))) return { id, refused: `${r.label}: invalid p50 or p95 for a log axis.` };
    if (r.compareMs !== undefined && (!Number.isFinite(r.compareMs) || r.compareMs <= 0 || !o.heads?.compare)) return { id, refused: `${r.label}: a compared value needs a positive time and a named column.` };
  }
  const slo = o.sloMs;
  const breached = slo === undefined ? [] : rows.filter(r => (r.p95Ms ?? r.p50Ms) > slo);
  const values = rows.flatMap(r => [r.p50Ms, r.p95Ms ?? r.p50Ms, r.compareMs ?? r.p50Ms]);
  const min = Math.min(slo ?? Infinity, ...values) / 1.5;
  const max = Math.max(slo ?? 0, ...values) * (o.scale === "linear" ? 1 : 1.12);
  const total = rows.length + (o.excluded?.length ?? 0);
  const heads = { value: "p50", spread: "p95", ...o.heads };
  const plotted = rows.map((r): PlotRow => {
    const status = slo === undefined ? undefined : (r.p95Ms ?? r.p50Ms) > slo ? "breach" as const : "pass" as const;
    const facts = [r.label, `${heads.value} ${fmt(r.p50Ms)}`, ...(r.p95Ms === null ? [] : [`${heads.spread} ${fmt(r.p95Ms)}`]), ...(r.compareMs === undefined ? [] : [`${heads.compare} ${fmt(r.compareMs)}`]), ...(r.extra === undefined ? [] : [`${heads.extra} ${r.extra}`]), ...(r.facts ?? []), ...(status ? [status] : [])];
    return { id: r.id, label: r.label, value: r.p50Ms, spread: r.p95Ms, facts, ...(r.compareMs === undefined ? {} : { compare: r.compareMs }), ...(r.extra === undefined ? {} : { extra: r.extra }), ...(status ? { status } : {}) };
  });
  const layout: RowLayout = { measure: o.measure, scale: o.scale ?? "log", min, max, format: fmt, heads, ...(o.ranked ? { ranked: true } : {}), ...(o.highlight ? { highlight: o.highlight } : {}), ...(o.identities ? { identities: o.identities } : {}), ...(slo === undefined ? {} : { threshold: slo }) };
  return {
    id,
    finding: slo === undefined ? `${capitalize(o.measure)}: ${rows[0]!.label} is first at ${fmt(rows[0]!.p50Ms)}.` : `${breached.length} of ${rows.length} ${plural(rows.length, "range")} exceed the ${fmt(slo)} p95 SLO.`,
    lede: `${rows.length} of ${total} ${plural(total, "setup")} have at least ${o.minN} ${plural(o.minN, "observation")}.`,
    read: `The ${o.scale === "linear" ? "bar ends at p50" : "dot is p50 and the bar runs to p95 on a logarithmic time axis"}. Input order is preserved.`,
    svg: { wide: drawRows(plotted, layout, wideWidth(o.width)), narrow: drawRows(plotted, layout, NARROW), interactive: true },
    table: table(`${capitalize(o.measure)} by setup`, [{ label: "Setup" }, { label: "p50", numeric: true }, { label: "p95", numeric: true }, { label: "n", numeric: true }, ...(o.heads?.compare ? [{ label: o.heads.compare, numeric: true }] : []), ...(o.heads?.extra ? [{ label: o.heads.extra, numeric: true }] : [])], rows.map(r => [r.label, fmt(r.p50Ms), r.p95Ms === null ? "–" : fmt(r.p95Ms), String(r.n), ...(o.heads?.compare ? [r.compareMs === undefined ? "–" : fmt(r.compareMs)] : []), ...(o.heads?.extra ? [r.extra ?? "–"] : [])])),
    note: { method: `Recorded p50 and p95 in milliseconds; the producer supplies quantiles.${slo === undefined ? "" : ` The p95 SLO is ${fmt(slo)}.`}`, n: `${rows.reduce((s, r) => s + r.n, 0)} observations.`, exclusions: o.excluded ?? [] },
  };
}
