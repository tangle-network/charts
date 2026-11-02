/** One row per measure: p50 and p95 with their recorded confidence bands, both numbers and n on the row, the rest on hover. */
import { formatSpanDuration } from "./format.js";
import { identityGap, type RateIdentity } from "./identity.js";
import { type Band, drawRows, type PlotRow, type RowLayout } from "./rows.js";
import { NARROW, wideWidth } from "./svg.js";
import { table } from "./table.js";
import { capitalize, plural } from "./text.js";
import type { Figure, Refusal } from "./types.js";

export interface LatencyRangeRow {
  id: string;
  label: string;
  p50Ms: number;
  /** Null draws no p95: too few samples for one. */
  p95Ms: number | null;
  n: number;
  /** The producer's 95% confidence interval on each quantile; drawn as a band. */
  p50Band?: Band;
  p95Band?: Band;
  /** Recorded facts shown on hover, one `key: value` line each. */
  facts?: readonly string[];
}

export interface LatencyRangeOptions {
  measure: string;
  /** A supplied SLO draws a threshold and colours each row by it. */
  sloMs?: number;
  minN: number;
  excluded?: string[];
  id?: string;
  /** `log` (default) spreads values across decades; `linear` starts at zero. */
  scale?: "log" | "linear";
  /** Marks keyed by row id; a row's `model` mark sits before its label. */
  identities?: Readonly<Record<string, RateIdentity>>;
  /** The wide render's width, from the container it fills. */
  width?: number;
}

const fmt = (ms: number) => formatSpanDuration(ms);
const interval = (band: Band | undefined) => (band ? ` (${fmt(band[0])} to ${fmt(band[1])})` : "");
const bandGap = (band: Band | undefined, value: number) => band !== undefined && !(band[0] > 0 && band[0] <= value && value <= band[1]);

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
    if (bandGap(r.p50Band, r.p50Ms) || (r.p95Ms !== null && bandGap(r.p95Band, r.p95Ms))) return { id, refused: `${r.label}: a confidence band must hold its quantile.` };
  }
  const slo = o.sloMs;
  const breached = slo === undefined ? [] : rows.filter(r => (r.p95Ms ?? r.p50Ms) > slo);
  const values = rows.flatMap(r => [r.p50Ms, r.p95Ms ?? r.p50Ms, ...(r.p50Band ?? []), ...(r.p95Band ?? [])]);
  const min = Math.min(slo ?? Infinity, ...values) / 1.5;
  const max = Math.max(slo ?? 0, ...values) * (o.scale === "linear" ? 1 : 1.12);
  const total = rows.length + (o.excluded?.length ?? 0);
  const plotted = rows.map((r): PlotRow => {
    const status = slo === undefined ? undefined : (r.p95Ms ?? r.p50Ms) > slo ? "breach" as const : "pass" as const;
    const facts = [r.label, `p50: ${fmt(r.p50Ms)}${interval(r.p50Band)}`, ...(r.p95Ms === null ? [] : [`p95: ${fmt(r.p95Ms)}${interval(r.p95Band)}`]), `Samples: ${r.n}`, ...(r.facts ?? [])];
    return { id: r.id, label: r.label, value: r.p50Ms, spread: r.p95Ms, n: r.n, facts, ...(r.p50Band ? { valueBand: r.p50Band } : {}), ...(r.p95Band ? { spreadBand: r.p95Band } : {}), ...(status ? { status } : {}) };
  });
  const layout: RowLayout = { measure: o.measure, scale: o.scale ?? "log", min, max, format: fmt, ...(o.identities ? { identities: o.identities } : {}), ...(slo === undefined ? {} : { threshold: slo }) };
  return {
    id,
    finding: slo === undefined ? `${capitalize(o.measure)}: ${rows[0]!.label} is first at ${fmt(rows[0]!.p50Ms)}.` : `${breached.length} of ${rows.length} ${plural(rows.length, "range")} exceed the ${fmt(slo)} p95 SLO.`,
    lede: `${rows.length} of ${total} ${plural(total, "setup")} have at least ${o.minN} ${plural(o.minN, "observation")}.`,
    read: "The dot is p50, the diamond p95, and each band the recorded 95% confidence interval. Input order is preserved.",
    svg: { wide: drawRows(plotted, layout, wideWidth(o.width)), narrow: drawRows(plotted, layout, NARROW), interactive: true },
    table: table(`${capitalize(o.measure)} by setup`, [{ label: "Setup" }, { label: "p50", numeric: true }, { label: "p95", numeric: true }, { label: "n", numeric: true }], rows.map(r => [r.label, `${fmt(r.p50Ms)}${interval(r.p50Band)}`, r.p95Ms === null ? "not recorded" : `${fmt(r.p95Ms)}${interval(r.p95Band)}`, String(r.n)])),
    note: { method: `Recorded p50 and p95 in milliseconds; the producer supplies quantiles.${slo === undefined ? "" : ` The p95 SLO is ${fmt(slo)}.`}`, n: `${rows.reduce((s, r) => s + r.n, 0)} observations.`, exclusions: o.excluded ?? [] },
  };
}
