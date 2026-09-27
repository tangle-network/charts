import type { CostBasis, Estimate, Interval, IntervalMethod, Tier, TierCounts } from "./types.js";

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

/** "$23.76", "$23.76 est.", "unknown", "no solve" */
export function costText(cost: { perSolvedUsd: number | null; basis: CostBasis }, solved: number): string {
  if (cost.perSolvedUsd === null) return solved === 0 ? "no solve" : "unknown";
  return cost.basis === "receipts" ? usd(cost.perSolvedUsd) : `${usd(cost.perSolvedUsd)} est.`;
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
