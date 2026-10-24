/**
 * Recorded marks on a scalar axis that carry more than a value: a verdict (filled, outlined or hatched), how many
 * recorded rows the mark stands for, when they were first and last recorded, whether the value is comparable with
 * the goal, a status glyph and a short direct label. The producer records every field; nothing here is inferred.
 */
import { type MarkVerdict, MARK_VERDICTS } from "./events.js";
import { hatch, MARKER_SHAPES, type MarkerShape, markerPath, rect, text } from "./svg.js";
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
export function pointBadge(x: number, y: number, r: number, p: PointFields, limit: number, above = false): { svg: string; width: number } {
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
  const spans = parts.map(([t, cls], i) => `<tspan class="${cls}">${i ? " " : ""}${esc(t)}</tspan>`).join("");
  if (above) return { svg: `<text class="tgc-point-badge" x="${Math.round(x * 100) / 100}" y="${Math.round((y - r - 5) * 100) / 100}" font-size="10" text-anchor="middle">${spans}</text>`, width };
  const left = x + r + 3 + width > limit;
  const tx = left ? x - r - 3 : x + r + 3;
  return { svg: `<text class="tgc-point-badge" x="${Math.round(tx * 100) / 100}" y="${Math.round((y + 3.5) * 100) / 100}" font-size="10"${left ? ' text-anchor="end"' : ""}>${spans}</text>`, width };
}

/** A verdict recorded without a value: a square in the strip under the plot, hatched when undecided. */
export function stripMark(x: number, y: number, size: number, p: PointFields): string {
  const h = size / 2;
  if (p.verdict === "unknown") return `<g class="tgc-strip-mark tgc-point-undecided">${hatch(x - h, y - h, size, size, "tgc-strip-hatch")}${rect(x - h, y - h, size, size, "tgc-strip-edge")}</g>`;
  return rect(x - h, y - h, size, size, p.verdict === "fail" ? "tgc-series-point tgc-point-outline tgc-strip-fail" : "tgc-series-point");
}

type Box = [number, number, number, number];

/**
 * Places each mark's badge to its right, or to its left at the plot's edge, skipping any that would cover a mark or
 * an earlier badge: a skipped badge stays in the mark's hover and the table. Solves and failing candidates go first.
 */
export function placeBadges(pending: ReadonlyArray<{ x: number; y: number; r: number; point: PointFields }>, marks: Box[], left: number, right: number): string {
  const placed = [...marks];
  const free = (box: Box) => box[0] >= left && box[1] <= right && placed.every((b) => box[1] < b[0] || box[0] > b[1] || box[3] < b[2] || box[2] > b[3]);
  const rank = (p: PointFields) => p.glyph ? 0 : p.comparable !== undefined && p.comparable !== true ? 1 : p.label ? 2 : 3;
  let out = "";
  for (const { x, y, r, point } of [...pending].sort((a, b) => rank(a.point) - rank(b.point))) {
    const badge = pointBadge(x, y, r, point, right);
    if (!badge.svg) continue;
    const box: Box = badge.svg.includes('text-anchor="end"') ? [x - r - 3 - badge.width, x - r - 3, y - 6, y + 6] : [x + r + 3, x + r + 3 + badge.width, y - 6, y + 6];
    // A point whose neighbours take both sides (a dense run of releases) is labelled above it before it goes unlabelled.
    const over: Box = [x - badge.width / 2, x + badge.width / 2, y - r - 15, y - r - 3];
    const at = free(box) ? { box, svg: badge.svg } : free(over) ? { box: over, svg: pointBadge(x, y, r, point, right, true).svg } : null;
    if (!at) continue;
    placed.push(at.box);
    out += at.svg;
  }
  return out;
}

/**
 * A key row for the recorded fields the points use: shapes the caller named, filled and outlined verdicts, the
 * strip, the status glyphs, `*`, `?` and `×n`. Only what the data contains is listed; items wrap to `width`.
 */
export function verdictKey(points: readonly (PointFields & { y: number | null })[], markers: Partial<Record<MarkerShape, string>> | undefined, x: number, y: number, width: number): { svg: string; height: number } {
  if (!hasPointFields(points)) return { svg: "", height: 0 };
  const has = (test: (p: PointFields & { y: number | null }) => boolean) => points.some(test);
  type Item = { glyph: (gx: number, gy: number) => string; label: string };
  const shape = (s: MarkerShape, cls: string) => (gx: number, gy: number) => `<path class="tgc-key-mark ${cls}" d="${markerPath(s, gx + 5, gy - 4, 4)}"/>`;
  const sign = (t: string, cls: string) => (gx: number, gy: number) => text(gx + 1, gy, t, { size: 11, cls });
  const items: Item[] = [
    ...MARKER_SHAPES.filter((s) => markers?.[s] && has((p) => p.marker === s)).map((s) => ({ glyph: shape(s, "tgc-key-filled"), label: markers![s]! })),
    ...(has((p) => p.y !== null && p.verdict === "pass") ? [{ glyph: shape("circle", "tgc-key-filled"), label: "filled: pass" }] : []),
    ...(has((p) => p.y !== null && (p.verdict === "fail" || (p.comparable !== undefined && p.comparable !== true))) ? [{ glyph: shape("circle", "tgc-key-outline"), label: "outline: fail or not comparable" }] : []),
    ...(has((p) => p.y !== null && p.verdict === "unknown") ? [{ glyph: shape("circle", "tgc-key-dashed"), label: "dashed: undecided" }] : []),
    ...(has((p) => p.y === null && p.verdict !== undefined) ? [{ glyph: (gx: number, gy: number) => `<g class="tgc-key-strip">${hatch(gx + 1, gy - 8, 8, 8, "tgc-strip-hatch")}${rect(gx + 1, gy - 8, 8, 8, "tgc-strip-edge")}</g>`, label: "square: verdict without a value" }] : []),
    ...(has((p) => p.glyph === "check") ? [{ glyph: sign("✓", "tgc-glyph-check"), label: "solved" }] : []),
    ...(has((p) => p.glyph === "cross") ? [{ glyph: sign("✕", "tgc-glyph-cross"), label: "failing candidate" }] : []),
    ...(has((p) => p.comparable === false) ? [{ glyph: sign("*", "tgc-glyph-note"), label: "not comparable" }] : []),
    ...(has((p) => p.comparable === null) ? [{ glyph: sign("?", "tgc-glyph-note"), label: "comparability unknown" }] : []),
    ...(has((p) => (p.count ?? 1) > 1) ? [{ glyph: sign("×n", "tgc-point-label"), label: "recorded rows" }] : []),
  ];
  let svg = "", at = x, line = 0;
  for (const item of items) {
    // A text sign (×n) is wider than a mark; its label starts after it. Widths leave room for a wider fallback face.
    const lead = item.label === "recorded rows" ? 24 : 16;
    const w = lead + textWidth(item.label, 11) * 1.1 + 16;
    if (at > x && at + w - x > width) { at = x; line++; }
    const gy = y + 12 + line * 16;
    svg += item.glyph(at, gy) + text(at + lead, gy, item.label, { size: 11, cls: "tgc-ink-muted" });
    at += w;
  }
  return { svg: items.length ? `<g class="tgc-verdict-key">${svg}</g>` : "", height: items.length ? (line + 1) * 16 + 8 : 0 };
}
