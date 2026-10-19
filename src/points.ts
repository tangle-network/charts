/**
 * Recorded marks on a scalar axis that carry more than a value: a verdict (filled, outlined or hatched), how many
 * recorded rows the mark stands for, when they were first and last recorded, whether the value is comparable with
 * the goal, a status glyph and a short direct label. The producer records every field; nothing here is inferred.
 */
import { type MarkVerdict, MARK_VERDICTS } from "./events.js";
import { hatch, MARKER_SHAPES, type MarkerShape, markerPath, rect } from "./svg.js";
import { esc, textWidth } from "./text.js";

/** A status glyph beside a mark: `check` for a solve, `cross` for a failing candidate. */
export type PointGlyph = "check" | "cross";
export const POINT_GLYPHS: readonly PointGlyph[] = ["check", "cross"];

export interface PointFields {
  /**
   * A recorded verdict: `pass` draws a filled mark (solved, contract held), `fail` an outline (not solved, contract
   * failed), `unknown` a dashed outline (undecided). A verdict with a null value is drawn in the strip under the plot.
   */
  verdict?: MarkVerdict;
  /** How many recorded rows this mark stands for. Above 1 it carries a `×n` badge. */
  count?: number;
  /** Epoch milliseconds of the first and last recorded row, shown on hover and in the table. */
  firstAt?: number;
  lastAt?: number;
  /** Whether the value can be compared with the goal: false is an outline with `*`, null (unknown) an outline with `?`. */
  comparable?: boolean | null;
  glyph?: PointGlyph;
  /** This mark's shape, such as a diamond for a gate among circles for checks. Default: the series' shape. */
  marker?: MarkerShape;
  /** A short direct label beside the mark, such as `9/15`. */
  label?: string;
}

/** Why a point's recorded fields cannot be drawn, or null. */
export function pointFieldsGap(p: PointFields): string | null {
  if (p.verdict !== undefined && !MARK_VERDICTS.includes(p.verdict)) return "A verdict is pass, fail or unknown.";
  if (p.count !== undefined && (!Number.isInteger(p.count) || p.count < 1)) return "A count is a whole number of at least 1.";
  for (const at of [p.firstAt, p.lastAt]) if (at !== undefined && !Number.isFinite(at)) return "First and last times must be finite.";
  if (p.firstAt !== undefined && p.lastAt !== undefined && p.firstAt > p.lastAt) return "The first time is after the last.";
  if (p.comparable !== undefined && p.comparable !== null && typeof p.comparable !== "boolean") return "Comparable is true, false or null.";
  if (p.glyph !== undefined && !POINT_GLYPHS.includes(p.glyph)) return "A glyph is check or cross.";
  if (p.marker !== undefined && !MARKER_SHAPES.includes(p.marker)) return "A marker is circle, square, triangle or diamond.";
  if (p.label !== undefined && (typeof p.label !== "string" || !p.label.trim())) return "A point label needs text.";
  return null;
}

/** Whether any point uses the recorded fields, so a figure adds their table columns only when they carry data. */
export function hasPointFields(points: readonly PointFields[]): boolean {
  return points.some((p) => p.verdict !== undefined || p.count !== undefined || p.firstAt !== undefined || p.lastAt !== undefined || p.comparable !== undefined || p.glyph !== undefined || p.label !== undefined);
}

const utc = (ms: number) => `${new Date(ms).toISOString().slice(5, 16).replace("T", " ")}Z`;

export const VERDICT_WORD: Record<MarkVerdict, string> = { pass: "pass", fail: "fail", unknown: "undecided" };

/** The recorded fields as hover lines. */
export function pointFacts(p: PointFields): string[] {
  return [
    ...(p.verdict ? [`Verdict: ${VERDICT_WORD[p.verdict]}`] : []),
    ...(p.count !== undefined && p.count > 1 ? [`${p.count} recorded rows`] : []),
    ...(p.firstAt !== undefined || p.lastAt !== undefined ? [`${p.firstAt !== undefined ? `First ${utc(p.firstAt)}` : ""}${p.firstAt !== undefined && p.lastAt !== undefined ? ", " : ""}${p.lastAt !== undefined ? `last ${utc(p.lastAt)}` : ""}`] : []),
    ...(p.comparable === false ? ["Not comparable with the goal (*)"] : p.comparable === null ? ["Comparability unknown (?)"] : []),
    ...(p.glyph === "check" ? ["✓ solved"] : p.glyph === "cross" ? ["✕ failing"] : []),
  ];
}

/** The table cells for the recorded fields: verdict, count, first, last, comparable. */
export function pointCells(p: PointFields): string[] {
  return [
    p.verdict ? VERDICT_WORD[p.verdict] + (p.glyph === "check" ? " ✓" : p.glyph === "cross" ? " ✕" : "") : "",
    p.count === undefined ? "" : String(p.count),
    p.firstAt === undefined ? "" : utc(p.firstAt),
    p.lastAt === undefined ? "" : utc(p.lastAt),
    p.comparable === undefined ? "" : p.comparable === null ? "unknown" : p.comparable ? "yes" : "no",
  ];
}
export const POINT_COLUMNS = [{ label: "Verdict" }, { label: "Rows", numeric: true }, { label: "First", numeric: true }, { label: "Last", numeric: true }, { label: "Comparable" }];

/**
 * The mark: filled for a pass (or no verdict), outlined for a fail, a not-comparable value or an unknown
 * comparability, dashed for an undecided verdict.
 */
export function pointMark(x: number, y: number, shape: MarkerShape, r: number, p: PointFields): string {
  const outline = p.verdict === "fail" || p.comparable === false || p.comparable === null;
  const cls = p.verdict === "unknown" ? "tgc-series-point tgc-point-undecided" : outline ? "tgc-series-point tgc-point-outline" : "tgc-series-point";
  return `<path class="${cls}" d="${markerPath(shape, x, y, r)}"/>`;
}

/**
 * Text beside a mark: the status glyph, `*` or `?`, the label and `×n`. Drawn to the right, or to the left when it
 * would cross `limit`; returns the markup and its width so a caller can skip it when the column has no room.
 */
export function pointBadge(x: number, y: number, r: number, p: PointFields, limit: number): { svg: string; width: number } {
  const parts: Array<[string, string]> = [];
  if (p.glyph === "check") parts.push(["✓", "tgc-glyph-check"]);
  if (p.glyph === "cross") parts.push(["✕", "tgc-glyph-cross"]);
  if (p.comparable === false) parts.push(["*", "tgc-glyph-note"]);
  if (p.comparable === null) parts.push(["?", "tgc-glyph-note"]);
  if (p.label) parts.push([p.label, "tgc-point-label"]);
  if (p.count !== undefined && p.count > 1) parts.push([`×${p.count}`, "tgc-point-label"]);
  if (!parts.length) return { svg: "", width: 0 };
  // Badges render in the monospace face (figure.css), so they are measured in it.
  const width = textWidth(parts.map(([t]) => t).join(" "), 10, "mono");
  const left = x + r + 3 + width > limit;
  const tx = left ? x - r - 3 : x + r + 3;
  const spans = parts.map(([t, cls], i) => `<tspan class="${cls}">${i ? " " : ""}${esc(t)}</tspan>`).join("");
  return { svg: `<text class="tgc-point-badge" x="${Math.round(tx * 100) / 100}" y="${Math.round((y + 3.5) * 100) / 100}" font-size="10"${left ? ' text-anchor="end"' : ""}>${spans}</text>`, width };
}

/** A verdict recorded without a value: a square in the strip under the plot, hatched when undecided. */
export function stripMark(x: number, y: number, size: number, p: PointFields): string {
  const h = size / 2;
  if (p.verdict === "unknown") return `<g class="tgc-strip-mark tgc-point-undecided">${hatch(x - h, y - h, size, size, "tgc-strip-hatch")}${rect(x - h, y - h, size, size, "tgc-strip-edge")}</g>`;
  return rect(x - h, y - h, size, size, p.verdict === "fail" ? "tgc-series-point tgc-point-outline" : "tgc-series-point");
}
