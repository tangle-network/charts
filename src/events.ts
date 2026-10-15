/**
 * Recorded events and spans drawn over a continuous x axis: vertical marks
 * (first pass, deadline, death) and shaded bands (time after the first pass,
 * idle time, no data). The producer records every position; the library never
 * places an event.
 */
import { hatch, line, rect, text, titled } from "./svg.js";
import { table } from "./table.js";

/** `pass` is solid, `deadline` dashed, `died` ends in a cross and `event` is dotted, so kinds read without colour. */
export type MarkKind = "pass" | "deadline" | "died" | "event";
export interface ChartMark { at: number; label: string; kind: MarkKind }

/** `missing` is hatched: a span with no data is never drawn as zero. */
export type BandKind = "after-pass" | "idle" | "missing";
export interface ChartBand { from: number; to: number; label: string; kind: BandKind }

export const MARK_KINDS: readonly MarkKind[] = ["pass", "deadline", "died", "event"];
export const BAND_KINDS: readonly BandKind[] = ["after-pass", "idle", "missing"];

/** Why the marks or bands cannot be drawn on `domain` (null when they can). Omit `domain` to check shape only. */
export function eventsGap(marks: readonly ChartMark[] = [], bands: readonly ChartBand[] = [], domain?: readonly [number, number]): string | null {
  const inside = (value: number) => !domain || (value >= domain[0] && value <= domain[1]);
  for (const mark of marks) {
    if (!mark || typeof mark.label !== "string" || !mark.label.trim()) return "Every mark needs a label.";
    if (!MARK_KINDS.includes(mark.kind)) return `${mark.label}: unknown mark kind.`;
    if (!Number.isFinite(mark.at) || !inside(mark.at)) return `${mark.label}: mark position must be finite and inside the axis domain.`;
  }
  for (const band of bands) {
    if (!band || typeof band.label !== "string" || !band.label.trim()) return "Every band needs a label.";
    if (!BAND_KINDS.includes(band.kind)) return `${band.label}: unknown band kind.`;
    if (!Number.isFinite(band.from) || !Number.isFinite(band.to) || band.from >= band.to || !inside(band.from) || !inside(band.to)) {
      return `${band.label}: a band needs finite, increasing bounds inside the axis domain.`;
    }
  }
  return null;
}

/** Bands sit under the data; a missing band is hatched over a neutral wash. */
export function drawBands(bands: readonly ChartBand[], px: (x: number) => number, top: number, bottom: number, format: (x: number) => string): string {
  return bands.map((band) => {
    const x = px(band.from), w = px(band.to) - x, cls = `tgc-band tgc-band-${band.kind}`;
    const mark = band.kind === "missing" ? hatch(x, top, w, bottom - top, cls) : rect(x, top, w, bottom - top, cls);
    return titled(`${band.label}: ${format(band.from)} to ${format(band.to)}`, `<g data-band="${band.kind}">${mark}</g>`);
  }).join("");
}

/** Marks sit over the data; labels stagger in three rows so adjacent events stay readable. */
export function drawMarks(marks: readonly ChartMark[], px: (x: number) => number, top: number, bottom: number, left: number, right: number, format: (x: number) => string): string {
  return [...marks].sort((a, b) => a.at - b.at).map((mark, i) => {
    const x = px(mark.at), y = top + 12 + (i % 3) * 14;
    const flip = x > left + (right - left) * 0.62;
    let glyph = line(x, top, x, bottom, `tgc-mark tgc-mark-${mark.kind}`);
    if (mark.kind === "died") glyph += line(x - 4, bottom - 8, x + 4, bottom, "tgc-mark tgc-mark-died") + line(x - 4, bottom, x + 4, bottom - 8, "tgc-mark tgc-mark-died");
    glyph += text(flip ? x - 4 : x + 4, y, mark.label, { size: 11, anchor: flip ? "end" : "start", cls: "tgc-mark-label" });
    return titled(`${mark.label}: ${format(mark.at)}`, `<g data-mark="${mark.kind}">${glyph}</g>`);
  }).join("");
}

/** The table form of marks and bands, in axis order. Empty when there are none. */
export function eventsTable(marks: readonly ChartMark[], bands: readonly ChartBand[], axisLabel: string, format: (x: number) => string): string {
  if (!marks.length && !bands.length) return "";
  const rows = [
    ...marks.map((mark) => ({ at: mark.at, cells: [mark.label, mark.kind, format(mark.at), ""] })),
    ...bands.map((band) => ({ at: band.from, cells: [band.label, band.kind === "missing" ? "no data" : band.kind, format(band.from), format(band.to)] })),
  ].sort((a, b) => a.at - b.at);
  return table(`Recorded events by ${axisLabel}`, [{ label: "Event" }, { label: "Kind" }, { label: `${axisLabel} from`, numeric: true }, { label: `${axisLabel} to`, numeric: true }], rows.map((row) => row.cells));
}

export const EVENTS_READ = "Vertical rules mark recorded events (solid: pass, dashed: deadline, cross: died, dotted: other); tinted spans are recorded periods and hatched spans have no data.";
