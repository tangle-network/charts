/**
 * Shared x and y axes for the recorded-scalar figures: an ordinal x of weighted categories (release tags grouped by
 * run) or a continuous one, and a linear or log y with caller-named gridlines and target bands. Validation lives
 * here so `timeSeries` and `smallMultiples` refuse the same inputs with the same sentences.
 */
import { logTicks } from "./scale.js";
import { line, rect, text, titled } from "./svg.js";
import { table } from "./table.js";
import { textWidth } from "./text.js";

/** One column of an ordinal x axis. Points sit at a category's `at`; `weight` scales its width (default 1). */
export interface XCategory { at: number; label: string; weight?: number }
/** A recorded goal on the y axis, such as a paper's bar: a band from `from` to `to`, or a line when they are equal. */
export interface YTarget { from: number; to: number; label: string; kind: "target" | "stretch" }
/** A caller-named gridline, such as a check stage. */
export interface YTick { at: number; label: string }
export type YScale = "linear" | "log";

export const TARGET_KINDS: readonly YTarget["kind"][] = ["target", "stretch"];

/** Why categories cannot be drawn on `domain`, or null. */
export function categoriesGap(categories: readonly XCategory[] | undefined, domain: readonly [number, number]): string | null {
  if (categories === undefined) return null;
  if (!Array.isArray(categories) || !categories.length) return "An ordinal axis needs at least one category.";
  let previous = -Infinity;
  for (const category of categories) {
    if (!category || typeof category.label !== "string") return "Every category needs a label.";
    if (!Number.isFinite(category.at) || category.at <= previous || category.at < domain[0] || category.at > domain[1]) return `${category.label}: category positions must be finite, strictly increasing and inside the axis domain.`;
    if (category.weight !== undefined && (!Number.isFinite(category.weight) || category.weight <= 0)) return `${category.label}: a category weight must be a positive number.`;
    previous = category.at;
  }
  return null;
}

/** Why a y axis (scale, gridlines and targets) cannot be drawn on `domain`, or null. */
export function yAxisGap(y: { domain: [number, number]; scale?: YScale; ticks?: readonly YTick[]; targets?: readonly YTarget[] }, label = "The y axis"): string | null {
  if (y.scale !== undefined && y.scale !== "linear" && y.scale !== "log") return `${label}: the scale is linear or log.`;
  if (y.scale === "log" && !(y.domain[0] > 0)) return `${label}: a log axis needs a positive domain.`;
  const inside = (v: number) => Number.isFinite(v) && v >= y.domain[0] && v <= y.domain[1];
  for (const tick of y.ticks ?? []) {
    if (!tick || typeof tick.label !== "string" || !tick.label.trim()) return `${label}: every gridline needs a label.`;
    if (!inside(tick.at)) return `${label}: gridline ${tick.label} is outside the axis domain.`;
  }
  for (const target of y.targets ?? []) {
    if (!target || typeof target.label !== "string" || !target.label.trim()) return `${label}: every target needs a label.`;
    if (!TARGET_KINDS.includes(target.kind)) return `${target.label}: a target kind is target or stretch.`;
    if (!inside(target.from) || !inside(target.to) || target.from > target.to) return `${target.label}: a target needs finite, ordered bounds inside the axis domain.`;
  }
  return null;
}

/** Why a value cannot sit on this y scale, beyond the domain check. */
export function logValueGap(value: number | null, scale: YScale | undefined): string | null {
  return scale === "log" && value !== null && !(value > 0) ? "A log axis cannot place zero or a negative value." : null;
}

export interface XAxis {
  px(value: number): number;
  /** Pixel extent of a band: a bound that names a category covers that whole column. */
  extent(from: number, to: number): [number, number];
  /** The pixel width of the column at `at`, or null on a continuous axis or between categories. */
  column(at: number): number | null;
  category(at: number): XCategory | undefined;
  /** Positions to label, in order: every category, or null on a continuous axis. */
  ats: number[] | null;
}

/** A continuous x, or an ordinal x whose columns divide [left, right] by weight; values between categories interpolate. */
export function xAxis(domain: readonly [number, number], categories: readonly XCategory[] | undefined, left: number, right: number): XAxis {
  if (!categories?.length) {
    const px = (x: number) => left + (x - domain[0]) / (domain[1] - domain[0]) * (right - left);
    return { px, extent: (from, to) => [px(from), px(to)], column: () => null, category: () => undefined, ats: null };
  }
  const total = categories.reduce((sum, c) => sum + (c.weight ?? 1), 0);
  const edges = [left];
  for (const c of categories) edges.push(edges.at(-1)! + (c.weight ?? 1) / total * (right - left));
  const centres = categories.map((_, i) => (edges[i]! + edges[i + 1]!) / 2);
  const index = new Map(categories.map((c, i) => [c.at, i]));
  const px = (x: number) => {
    const exact = index.get(x);
    if (exact !== undefined) return centres[exact]!;
    const first = categories[0]!, last = categories.at(-1)!;
    if (x < first.at) return first.at === domain[0] ? centres[0]! : left + (x - domain[0]) / (first.at - domain[0]) * (centres[0]! - left);
    if (x > last.at) return last.at === domain[1] ? centres.at(-1)! : centres.at(-1)! + (x - last.at) / (domain[1] - last.at) * (right - centres.at(-1)!);
    let i = 0;
    while (categories[i + 1]!.at < x) i++;
    return centres[i]! + (x - categories[i]!.at) / (categories[i + 1]!.at - categories[i]!.at) * (centres[i + 1]! - centres[i]!);
  };
  return {
    px,
    extent: (from, to) => [index.has(from) ? edges[index.get(from)!]! : px(from), index.has(to) ? edges[index.get(to)! + 1]! : px(to)],
    column: (at) => index.has(at) ? edges[index.get(at)! + 1]! - edges[index.get(at)!]! : null,
    category: (at) => index.has(at) ? categories[index.get(at)!] : undefined,
    ats: categories.map((c) => c.at),
  };
}

/** A linear or log10 y between `bottom` (domain start) and `top`. */
export function yScale(domain: readonly [number, number], scale: YScale | undefined, top: number, bottom: number): (y: number) => number {
  if (scale === "log") {
    const [a, b] = [Math.log10(domain[0]), Math.log10(domain[1])];
    return (y) => bottom - (Math.log10(y) - a) / (b - a) * (bottom - top);
  }
  return (y) => bottom - (y - domain[0]) / (domain[1] - domain[0]) * (bottom - top);
}

/** The y gridlines: the caller's, else log ticks (1, 2, 5 × 10^k) or `count` even steps. */
export function yGridlines(y: { domain: [number, number]; scale?: YScale; ticks?: readonly YTick[] }, label: (v: number) => string, count = 5): YTick[] {
  if (y.ticks?.length) return [...y.ticks];
  if (y.scale === "log") {
    const ticks = logTicks(y.domain[0], y.domain[1]);
    return (ticks.length ? ticks : [y.domain[0], y.domain[1]]).map((at) => ({ at, label: label(at) }));
  }
  return Array.from({ length: count }, (_, i) => y.domain[0] + i / (count - 1) * (y.domain[1] - y.domain[0])).map((at) => ({ at, label: label(at) }));
}

/** Target bands under the data, labelled above their upper edge: a target at the right end, a stretch at the left. */
export function drawTargets(targets: readonly YTarget[], py: (y: number) => number, left: number, right: number, yLabel: (y: number) => string, labels = true): string {
  const marks = targets.map((target) => {
    const y0 = py(target.to), y1 = py(target.from);
    const cls = `tgc-target tgc-target-${target.kind}`;
    const mark = y1 - y0 < 1.5 ? line(left, y0, right, y0, `${cls} tgc-target-line`) : rect(left, y0, right - left, y1 - y0, cls) + line(left, y0, right, y0, `${cls}-edge`) + line(left, y1, right, y1, `${cls}-edge`);
    return titled(`${target.label}: ${target.from === target.to ? yLabel(target.from) : `${yLabel(target.from)} to ${yLabel(target.to)}`}`, `<g data-target="${target.kind}">${mark}</g>`);
  }).join("");
  // Labels go over every band, so a later band never strikes through an earlier label.
  return marks + (labels ? targets.map((target) => text(target.kind === "stretch" ? left + 4 : right - 4, py(target.to) - 4, target.label, { size: 11, anchor: target.kind === "stretch" ? "start" : "end", cls: "tgc-target-label" })).join("") : "");
}

/** A key row naming each target by its line style, for a panel too small to label bands in place. Returns its width. */
export function targetKey(targets: readonly YTarget[], x: number, y: number, maxWidth: number): string {
  let out = "", at = x;
  for (const target of targets) {
    const w = textWidth(target.label, 10) + 26;
    if (at + w - x > maxWidth) break;
    out += line(at, y - 3.5, at + 14, y - 3.5, `tgc-target-${target.kind}-edge`) + text(at + 18, y, target.label, { size: 10, cls: "tgc-target-label" });
    at += w;
  }
  return out;
}

/** The table form of target bands. Empty when there are none. */
export function targetsTable(targets: readonly YTarget[], yLabel: (y: number) => string): string {
  if (!targets.length) return "";
  return table("Recorded targets", [{ label: "Target" }, { label: "Kind" }, { label: "From", numeric: true }, { label: "To", numeric: true }], targets.map((t) => [t.label, t.kind, yLabel(t.from), yLabel(t.to)]));
}

/**
 * X labels at recorded positions, spread evenly across the plot and measured so none overlap: at most as many as fit,
 * each snapped to the nearest recorded x, always keeping the first and the last that fit.
 */
export function xTicks(xs: number[], px: (x: number) => number, left: number, right: number, width: number, label: (x: number) => string, size = 12): number[] {
  if (!xs.length) return [];
  const span = (x: number) => { const w = textWidth(label(x), size, "mono"); return [px(x) - w / 2, px(x) + w / 2] as const; };
  const widest = Math.max(...xs.map((x) => textWidth(label(x), size, "mono")));
  const slots = Math.max(1, Math.min(xs.length, Math.floor((right - left) / (widest + 12)) + 1));
  const anchors = slots === 1 ? [xs[0]!] : Array.from({ length: slots }, (_, i) => left + (right - left) * i / (slots - 1))
    .map((target) => xs.reduce((best, x) => Math.abs(px(x) - target) < Math.abs(px(best) - target) ? x : best, xs[0]!));
  const kept: number[] = [];
  for (const x of [...new Set(anchors)]) {
    const [a, b] = span(x);
    if (a < 2 || b > width - 2) continue;
    const previous = kept.at(-1);
    if (previous !== undefined && a < span(previous)[1] + 10) {
      // The last recorded position wins over the label before it.
      if (x !== xs.at(-1) || kept.length === 1) continue;
      kept.pop();
    }
    kept.push(x);
  }
  return kept;
}
