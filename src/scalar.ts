/** Validation and display of recorded scalar observations; no statistics are computed here. */
import { intervalGap, METHOD_NAME } from "./format.js";
import type { Interval } from "./types.js";

export interface Observations {
  count: number | null;
  /** Explicit plural noun, such as tasks, traces or findings. */
  label: string;
}

export function domainGap(domain: [number, number]): string | null {
  return domain.length !== 2 || !domain.every(Number.isFinite) || domain[0] >= domain[1] || !Number.isFinite(domain[1] - domain[0])
    ? "The axis needs two finite, increasing bounds."
    : null;
}

export function scalarGap(value: number | null, interval: Interval | null | undefined, observations: Observations | undefined, domain: [number, number]): string | null {
  if (value !== null && (!Number.isFinite(value) || value < domain[0] || value > domain[1])) return "The value is outside the recorded axis domain.";
  if (observations) {
    if (!observations.label.trim()) return "An observation count needs its unit.";
    if (observations.count !== null && (!Number.isInteger(observations.count) || observations.count < 0)) return "Observation counts must be nonnegative whole numbers or null.";
    if (observations.count === 0 && value !== null) return "A measured value cannot have zero observations.";
  }
  if (interval) {
    if (value === null) return "An unmeasured value cannot have an interval.";
    if (interval.method !== null && !Object.hasOwn(METHOD_NAME, interval.method)) return "The interval method is unknown.";
    const gap = intervalGap(interval);
    if (gap) return gap;
    if (interval.lower < domain[0] || interval.upper > domain[1]) return "The interval is outside the axis domain.";
  }
  return null;
}

export function scalarLabel(value: number, unit: string, format?: (value: number) => string): string {
  const number = format ? format(value) : String(value);
  return `${number}${unit ? ` ${unit}` : ""}`;
}

export function observationLabel(observations?: Observations): string {
  return observations ? `${observations.count ?? "unknown"} ${observations.label}` : "observation count unknown";
}

/** Shift the recorded decimal level, without rounding it to a different confidence. */
function confidencePercent(level: number): string {
  const [coefficient, exponent] = String(level).split("e-")
  const decimal = exponent ? `0.${"0".repeat(Number(exponent) - 1)}${coefficient!.replace(".", "")}` : coefficient!
  const digits = decimal.slice(2).padEnd(2, "0")
  const fraction = digits.slice(2).replace(/0+$/, "")
  return `${Number(digits.slice(0, 2))}${fraction ? `.${fraction}` : ""}%`
}

export function scalarIntervalLabel(interval: Interval | null | undefined, unit: string, format?: (value: number) => string): string {
  return interval ? `${scalarLabel(interval.lower, unit, format)}–${scalarLabel(interval.upper, unit, format)} (${confidencePercent(interval.level!)} ${METHOD_NAME[interval.method!]})` : "not recorded";
}
