/**
 * Inputs and outputs of the figure functions.
 *
 * The library draws and never decides. Ranks, intervals, frontier membership,
 * estimate labels and pass counts arrive from the producer (a board record, a
 * VerticalBench report, an agent-eval lens). A figure function returns a
 * `Refusal` instead of a figure it cannot draw honestly.
 */

/** agent-eval `SearchEstimateMethod`, the same strings: what a unit count supports. */
export type Estimate = "none" | "insufficient" | "descriptive" | "bootstrap";

export type IntervalMethod = "task-cluster-bootstrap" | "mcnemar-exact" | "wilson";

/**
 * A confidence interval as the producer recorded it. `level` and `method` are
 * nullable because real records omit them; a figure refuses to draw an
 * interval that does not name both.
 */
export interface Interval {
  lower: number;
  upper: number;
  level: number | null;
  method: IntervalMethod | null;
}

/** The App Grade ladder, lowest first. U (unable to measure) is not on it. */
export type Tier = "F" | "C" | "B" | "A" | "S";
export type TierCounts = Record<Tier, number>;

/** Where a cost comes from. Only `receipts` is billed spend. */
export type CostBasis = "receipts" | "estimated" | "unknown";

/** A column or row identity: an AgentProfile, a model, a judge, a search node. */
export interface Setup {
  id: string;
  label: string;
  /** Null when the order is a sort, not a ranking backed by comparisons. */
  rank: number | null;
}

/** One setup's rate. Field names follow the board record's `BoardProfile`. */
export interface RateRow extends Setup {
  solved: number;
  attempts: number;
  rate: number;
  /** The producer's label for what `attempts` supports; the library holds no threshold. */
  estimate: Estimate;
  interval: Interval | null;
  tiers: TierCounts | null;
  cost: { perSolvedUsd: number | null; basis: CostBasis; receipts: number | null };
  medianWallMs: number | null;
  /** Null when the producer computed no frontier. */
  onFront: boolean | null;
}

/** One task × setup cell. */
export interface MatrixCell {
  task: string;
  setup: string;
  /** Attempts that count; null when the cell never ran. */
  attempts: number | null;
  /** Attempts that passed; null when no pass rule applies. */
  solved: number | null;
  /** Attempts graded on the App Grade ladder. */
  tiers: TierCounts | null;
  /** Attempts graded U: no floor check failed, but one could not be observed. */
  unmeasured?: number;
  /** Attempts whose grade failed an integrity check and awaits human review. */
  flagged?: number;
  /** A lens cell's mean score; null when the setup never scored the task. */
  mean: number | null;
  costUsd: number | null;
}

export interface ComparisonRow {
  /** Setup ids. */
  favored: string;
  other: string;
  pairs: number | null;
  minimumEffect: number | null;
  /** The clustered interval on the difference, in the measure's units. */
  interval: Interval | null;
  /** The exact interval, drawn under the clustered one when present. */
  exactInterval: Interval | null;
}

export interface BreakdownInput {
  reasons: string[];
  setups: Array<{ id: string; label: string; n: number | null }>;
  counts: Array<{ reason: string; setup: string; count: number | null }>;
  excluded: { count: number; why: string } | null;
  /** True when one attempt can count under several reasons. */
  overlapping?: boolean;
}

/** Attempts left out of a figure, stated in its note. */
export interface Exclusion {
  count: number;
  why: string;
}

export interface Figure {
  id: string;
  /** Generated from the input; no function accepts heading text. */
  finding: string;
  /** One quantified sentence. */
  lede: string;
  /** How to read the marks. */
  read: string;
  /** Wide and phone renders; vertical columns retain a readable minimum width. Null means the phone view uses the table. */
  svg: { wide: string; narrow: string | null; interactive?: boolean };
  /** An HTML table with every number the plot shows. */
  table: string;
  note: { method: string; n: string; exclusions: string[] };
}

export interface Refusal {
  id: string;
  refused: string;
}

export function isRefusal(value: Figure | Refusal): value is Refusal {
  return "refused" in value;
}
