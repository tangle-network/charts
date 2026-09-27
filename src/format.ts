import type { CostBasis, Estimate, Interval, IntervalMethod, RateRow, Tier, TierCounts } from "./types.js";

export const TIERS_BEST_FIRST: Tier[] = ["S", "A", "B", "C", "F"];
const LADDER: Tier[] = ["F", "C", "B", "A", "S"];

export function tierAtLeast(tier: Tier, floor: Tier): boolean {
  return LADDER.indexOf(tier) >= LADDER.indexOf(floor);
}

export function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** A difference in points: "+25 pts". */
export function pts(value: number): string {
  const n = Math.round(value * 100);
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)} pts`;
}

export function usd(value: number): string {
  if (value >= 100) return `$${Math.round(value).toLocaleString("en-US")}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(4)}`;
}

/** Axis ticks: "$30", "$2.5", "$0.05". */
export function usdTick(value: number): string {
  return `$${Number(value.toPrecision(2)).toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
}

export function duration(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${Math.round(s)} s`;
  if (s < 3600) return `${(s / 60).toFixed(1)} min`;
  return `${(s / 3600).toFixed(1)} h`;
}

export function kn(k: number, n: number): string {
  return `${k}/${n}`;
}

export const METHOD_NAME: Record<IntervalMethod, string> = {
  "task-cluster-bootstrap": "task-clustered bootstrap",
  "mcnemar-exact": "exact McNemar",
  wilson: "Wilson score",
};

/** "95% Wilson score" */
export function intervalName(interval: Interval): string {
  return `${Math.round((interval.level ?? 0) * 100)}% ${interval.method ? METHOD_NAME[interval.method] : ""}`.trim();
}

/** Why an interval cannot be drawn, or null when it can. */
export function intervalGap(interval: Interval | null): string | null {
  if (!interval) return "no interval";
  const missing = [interval.level === null ? "level" : "", interval.method === null ? "method" : ""].filter(Boolean);
  if (missing.length) return `the interval names no ${missing.join(" or ")}`;
  if (!(interval.lower <= interval.upper)) return "the interval bounds are out of order";
  return null;
}

/** Whether a rate bar may be drawn for this estimate. */
export function drawable(estimate: Estimate): boolean {
  return estimate === "descriptive" || estimate === "bootstrap";
}

export function estimateNote(estimate: Estimate, units: number): string {
  if (estimate === "none") return units === 1 ? "1 unit" : `${units} units`;
  if (estimate === "insufficient") return "too few units";
  return "";
}

/**
 * The cost per pass a figure may print or place, or null. Zero is not a cost:
 * a run that passed spent something, so a zero means the spend was not
 * recorded, and it prints "unknown", never "$0".
 */
export function perPass(cost: { perSolvedUsd: number | null }): number | null {
  return cost.perSolvedUsd !== null && cost.perSolvedUsd > 0 ? cost.perSolvedUsd : null;
}

/** "$23.76", "$23.76 est.", "unknown", "no pass" */
export function costText(cost: { perSolvedUsd: number | null; basis: CostBasis }, solved: number): string {
  const value = perPass(cost);
  if (value === null) return solved === 0 ? "no pass" : "unknown";
  return cost.basis === "receipts" ? usd(value) : `${usd(value)} est.`;
}

/**
 * The order rows are drawn in. Ranked rows keep their rank. Otherwise rows
 * with enough units to draw a rate come first, highest rate first; rows with
 * too few units follow, most units first, so a 1/1 row never heads the list.
 */
export function rateOrder<T extends Pick<RateRow, "rank" | "rate" | "estimate" | "attempts">>(rows: readonly T[]): T[] {
  if (rows.length > 0 && rows.every((row) => row.rank !== null)) return [...rows].sort((a, b) => a.rank! - b.rank!);
  const drawn = rows.filter((row) => drawable(row.estimate)).sort((a, b) => b.rate - a.rate);
  const counted = rows.filter((row) => !drawable(row.estimate)).sort((a, b) => b.attempts - a.attempts);
  return [...drawn, ...counted];
}

/** "2A 1F" */
export function tierSummary(tiers: TierCounts | null, unmeasured = 0, flagged = 0): string {
  const parts = tiers ? TIERS_BEST_FIRST.filter((t) => tiers[t] > 0).map((t) => `${tiers[t]}${t}`) : [];
  if (flagged) parts.push(`${flagged} flagged`);
  if (unmeasured) parts.push(`${unmeasured}U`);
  return parts.join(" ");
}

export function tierTotal(tiers: TierCounts | null): number {
  return tiers ? LADDER.reduce((sum, t) => sum + tiers[t], 0) : 0;
}
