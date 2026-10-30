/**
 * Recorded events and spans drawn over a continuous x axis: vertical marks
 * (first pass, deadline, death, release, steer, ruling, wake) and shaded bands
 * (time after the first pass, idle time, no data, a system-wide wall). The
 * producer records every position; the library never places an event.
 */
import { duration } from "./format.js";
import { hatch, line, markerPath, type MarkerShape, rect, text, titled, svgPart, type SvgPart } from "./svg.js";
import { table } from "./table.js";
import { esc, textWidth, wrap } from "./text.js";

/**
 * `pass` is solid, `deadline` dashed, `died` ends in a cross and `event` is dotted. `release`, `steer`, `ruling` and
 * `wake` carry a head shape (diamond, triangle, square, circle), so every kind reads without colour.
 */
export type MarkKind = "pass" | "deadline" | "died" | "event" | "release" | "steer" | "ruling" | "wake";
/** A recorded verdict, such as a release tag's check: pass and fail take the status tones, unknown the muted tone. */
export type MarkVerdict = "pass" | "fail" | "unknown";
export interface ChartMark {
  at: number;
  label: string;
  kind: MarkKind;
  verdict?: MarkVerdict;
  /** Who made the event, such as the operator or the keeper for a steer. Shown with the label and in the table. */
  source?: string;
  /** `timeline` only: the lane the event belongs to. It is drawn on that lane instead of across every lane. */
  lane?: string;
}

/**
 * `missing` is hatched: a span with no data is never drawn as zero. `blocked` is a system-wide wall, such as a quota
 * window. `group` labels a run of positions in a header row above the data, such as one run's release tags, with a
 * rule at each edge; a group may cover a single position (`from` equal to `to`).
 */
export type BandKind = "after-pass" | "idle" | "missing" | "blocked" | "group";
export interface ChartBand { from: number; to: number; label: string; kind: BandKind }

export const MARK_KINDS: readonly MarkKind[] = ["pass", "deadline", "died", "event", "release", "steer", "ruling", "wake"];
export const MARK_VERDICTS: readonly MarkVerdict[] = ["pass", "fail", "unknown"];
export const BAND_KINDS: readonly BandKind[] = ["after-pass", "idle", "missing", "blocked", "group"];
/** The head shape of each kind that has one, shared with the React marks. */
export const MARK_HEADS: Partial<Record<MarkKind, MarkerShape>> = { release: "diamond", steer: "triangle", ruling: "square", wake: "circle" };

/** Why the marks or bands cannot be drawn on `domain` (null when they can). Omit `domain` to check shape only. */
export function eventsGap(marks: readonly ChartMark[] = [], bands: readonly ChartBand[] = [], domain?: readonly [number, number]): string | null {
  const inside = (value: number) => !domain || (value >= domain[0] && value <= domain[1]);
  for (const mark of marks) {
    if (!mark || typeof mark.label !== "string" || !mark.label.trim()) return "Every mark needs a label.";
    if (!MARK_KINDS.includes(mark.kind)) return `${mark.label}: unknown mark kind.`;
    if (mark.verdict !== undefined && !MARK_VERDICTS.includes(mark.verdict)) return `${mark.label}: a verdict is pass, fail or unknown.`;
    if (mark.source !== undefined && (typeof mark.source !== "string" || !mark.source.trim())) return `${mark.label}: a source needs a name.`;
    if (!Number.isFinite(mark.at) || !inside(mark.at)) return `${mark.label}: mark position must be finite and inside the axis domain.`;
  }
  for (const band of bands) {
    if (!band || typeof band.label !== "string" || !band.label.trim()) return "Every band needs a label.";
    if (!BAND_KINDS.includes(band.kind)) return `${band.label}: unknown band kind.`;
    if (!Number.isFinite(band.from) || !Number.isFinite(band.to) || (band.kind === "group" ? band.from > band.to : band.from >= band.to) || !inside(band.from) || !inside(band.to)) {
      return `${band.label}: a band needs finite, increasing bounds inside the axis domain.`;
    }
  }
  return null;
}

/** An `event` whose source is `gap`: a break in time between positions of an ordinal axis. It never crosses the data. */
function isGap(mark: ChartMark): boolean {
  return mark.kind === "event" && mark.source === "gap";
}

/** A mark's label with its source, as drawn and listed. */
export function markName(mark: ChartMark): string {
  return mark.source ? `${mark.label} · ${mark.source}` : mark.label;
}

/** The kind cell of the events table: the kind, then the verdict and the lane when recorded. */
function markKindLabel(mark: ChartMark): string {
  return [mark.kind, mark.verdict, mark.lane && `lane ${mark.lane}`].filter(Boolean).join(" · ");
}

/**
 * Bands sit under the data; a missing band is hatched over a neutral wash. A band is clipped to `clip` when given.
 * `extent` maps a band's bounds to pixels when a bound covers more than a point, such as a column of an ordinal axis.
 * Group bands are drawn by `drawGroups`, not here.
 */
export function drawBands(bands: readonly ChartBand[], px: (x: number) => number, top: number, bottom: number, format: (x: number) => string, clip?: readonly [number, number], extent?: (from: number, to: number) => [number, number]): string {
  return bands.map((band) => {
    if (band.kind === "group") return "";
    const from = clip ? Math.max(band.from, clip[0]) : band.from, to = clip ? Math.min(band.to, clip[1]) : band.to;
    if (to <= from) return "";
    const [x0, x1] = extent ? extent(from, to) : [px(from), px(to)];
    const x = x0, w = x1 - x0, cls = `tgc-band tgc-band-${band.kind}`;
    const mark = band.kind === "missing" ? hatch(x, top, w, bottom - top, cls) : rect(x, top, w, bottom - top, cls) + (band.kind === "blocked" ? line(x, top, x + w, top, "tgc-band-wall") : "");
    return titled(`${band.label}: ${format(band.from)} to ${format(band.to)}`, `<g data-band="${band.kind}">${mark}</g>`);
  }).join("");
}

/** The header row height `drawGroups` needs, or 0 without group bands. */
export function groupRowHeight(bands: readonly ChartBand[] = []): number {
  return bands.some((band) => band.kind === "group") ? 18 : 0;
}

/**
 * Group bands as labelled brackets in the header row that ends at `top`, with a rule at each inner edge through the
 * data. A label that does not fit its bracket is cut with an ellipsis; the full label is the bracket's hover.
 */
export function drawGroups(bands: readonly ChartBand[], extent: (from: number, to: number) => [number, number], top: number, bottom: number, left: number, right: number, format: (x: number) => string, clip?: readonly [number, number]): string {
  return bands.filter((band) => band.kind === "group").map((band) => {
    const from = clip ? Math.max(band.from, clip[0]) : band.from, to = clip ? Math.min(band.to, clip[1]) : band.to;
    if (to < from) return "";
    const [x0, x1] = extent(from, to), w = x1 - x0;
    const label = w >= 24 ? wrap(band.label, w - 10, 12, "sans", 1).lines[0]! : "";
    const edges = [x0, x1].filter((x) => x > left + 0.5 && x < right - 0.5).map((x) => line(x, top - 16, x, bottom, "tgc-group-edge")).join("");
    const bracket = line(x0 + 2, top - 3, x1 - 2, top - 3, "tgc-group-rule") + (label ? text(x0 + 3, top - 7, label, { size: 12, cls: "tgc-group-label" }) : "");
    return titled(`${band.label}: ${format(band.from)} to ${format(band.to)}`, `<g data-band="group">${edges}${bracket}</g>`);
  }).join("");
}

/** Marks drawn at one x and of one kind and verdict share a rule and a label. */
interface MarkGroup { x: number; marks: ChartMark[] }
/** A label placed in a row above the data; `edge` labels name events outside the window and draw no rule. */
interface Placed { row: number; x: number; anchor: "start" | "end"; text: string }
export interface MarkLabelOptions {
  /** Label rows above the data. Default 3. */
  rows?: number;
  /** Events outside the drawn `window`, labelled at the edge they fall past with their distance from it. */
  before?: readonly ChartMark[];
  after?: readonly ChartMark[];
  window?: readonly [number, number];
  /** A producer-selected release gets first choice of a readable label. */
  priority?: string;
  live?: boolean;
}

/**
 * Marks of one kind and verdict merge when under 3 px apart, or under 12 px apart with the same label (a re-checked
 * tag). A ruling never merges: each ruling made or kept a check, so each keeps its own rule and label.
 */
function groupMarks(marks: readonly ChartMark[], px: (x: number) => number): MarkGroup[] {
  const groups: MarkGroup[] = [];
  for (const mark of [...marks].sort((a, b) => a.at - b.at)) {
    const x = px(mark.at), last = groups.at(-1), lead = last?.marks[0];
    const near = last && px(last.marks.at(-1)!.at);
    if (last && mark.kind !== "ruling" && lead!.kind === mark.kind && lead!.verdict === mark.verdict && (x - near! < 3 || (x - near! < 12 && markName(lead!) === markName(mark)))) last.marks.push(mark);
    else groups.push({ x, marks: [mark] });
  }
  return groups;
}

/**
 * Places labels in up to `rows` rows without overlap, measured from their text. Edge labels go first so an event
 * past the window is always named; a mark label that fits no row is left to its rule's hover and the table.
 */
function layoutLabels(groups: MarkGroup[], left: number, right: number, o: MarkLabelOptions): { placed: Map<MarkGroup, Placed>; edges: Placed[]; rows: number } {
  groups = [...groups].sort((a, b) => Number(b.marks.some(mark => mark.label === o.priority)) - Number(a.marks.some(mark => mark.label === o.priority)));
  const rows = o.rows ?? 3, maxW = Math.max(48, Math.min(200, (right - left) * 0.42)), gap = 6;
  const taken: Array<Array<[number, number]>> = Array.from({ length: rows }, () => []);
  const fits = (row: number, a: number, b: number) => taken[row]!.every(([p, q]) => b + gap <= p || a >= q + gap);
  // A label starts at `start` or ends at `end`; a flexible label tries its preferred side, then the other.
  const place = (value: string, start: number, end: number, prefer: "start" | "end", flexible: boolean): Placed | null => {
    const label = wrap(value, maxW, 12, "sans", 1).lines[0]!, w = textWidth(label, 12);
    for (const anchor of flexible ? [prefer, prefer === "start" ? "end" : "start"] as const : [prefer]) {
      const [a, b] = anchor === "start" ? [start, start + w] : [end - w, end];
      if (a < left - 4 || b > right + 4) continue;
      for (let row = 0; row < rows; row++) if (fits(row, a, b)) { taken[row]!.push([a, b]); return { row, x: anchor === "start" ? start : end, anchor, text: label }; }
    }
    return null;
  };
  const [w0, w1] = o.window ?? [-Infinity, Infinity];
  const edges = [
    ...(o.after ?? []).map((mark) => place(`${markName(mark)} +${duration(mark.at - w1)} →`, right, right, "end", false)),
    ...(o.before ?? []).map((mark) => place(`← ${markName(mark)} −${duration(w0 - mark.at)}`, left, left, "start", false)),
  ].filter((p): p is Placed => p !== null);
  const placed = new Map<MarkGroup, Placed>();
  // A gap between positions is context: every other mark claims a label row first.
  for (const group of [...groups.filter((g) => !isGap(g.marks[0]!)), ...groups.filter((g) => isGap(g.marks[0]!))]) {
    const flip = group.x > left + (right - left) * 0.62;
    const name = markName(group.marks.find(mark => mark.label === o.priority) ?? group.marks[0]!) + (group.marks.length > 1 ? ` (+${group.marks.length - 1})` : "");
    const spot = place(name, group.x + 4, group.x - 4, flip ? "end" : "start", true);
    if (spot) placed.set(group, spot);
  }
  const used = Math.max(0, ...[...placed.values(), ...edges].map((p) => p.row + 1));
  return { placed, edges, rows: used };
}

/** How many label rows `drawMarks` uses for these marks, so a figure can reserve them above its data. */
export function markLabelRows(marks: readonly ChartMark[], px: (x: number) => number, left: number, right: number, o: MarkLabelOptions = {}): number {
  return layoutLabels(groupMarks(marks, px), left, right, o).rows;
}

/** The head shape of a release, steer, ruling or wake, centred on (x, y). Empty for the plain rule kinds. */
export function markHead(kind: MarkKind, x: number, y: number, r = 3.5, classes = "tgc-mark-head"): string {
  const shape = MARK_HEADS[kind];
  return shape ? `<path class="${classes}" d="${markerPath(shape, x, y, r)}"/>` : "";
}

/**
 * Marks and their labels. Labels go in rows from `labelTop`, placed by measured width so none overlap, and are drawn
 * over every rule; marks of one kind and verdict at one place share a rule and a label. Rules run from `labelTop` to
 * `bottom`, except that release, steer and wake stems stop at their head, just below `top`.
 */
export function prepareMarks(marks: readonly ChartMark[], px: (x: number) => number, top: number, bottom: number, left: number, right: number, format: (x: number) => string, labelTop = top, o: MarkLabelOptions = {}): { body: string; labels: SvgPart[] } {
  const labels: SvgPart[] = [];
  const groups = groupMarks(marks, px), cls = (value: string) => o.live ? `${value} ${value.replaceAll("tgc-", "ov-")}` : value;
  const { placed, edges } = layoutLabels(groups, left, right, o);
  const rowY = (row: number) => labelTop + 12 + row * 14;
  let out = groups.map((group) => {
    const { x, marks: members } = group, mark = members[0]!;
    // Kinds with a head (release, steer, ruling, wake) are frequent: only a ruling crosses the data; the rest stop at its edge.
    const stem = !o.live && ((MARK_HEADS[mark.kind] !== undefined && mark.kind !== "ruling") || isGap(mark));
    let glyph = line(x, Math.min(top, labelTop), x, stem ? top + 4 : bottom, cls(`tgc-mark tgc-mark-${mark.kind}`));
    if (mark.kind === "died") glyph += line(x - 4, bottom - 8, x + 4, bottom, cls("tgc-mark tgc-mark-died")) + line(x - 4, bottom, x + 4, bottom - 8, cls("tgc-mark tgc-mark-died"));
    glyph += markHead(mark.kind, x, top + 4, 3.5, cls("tgc-mark-head"));
    const verdict = mark.verdict ? ` data-verdict="${mark.verdict}" class="${cls(`tgc-verdict-${mark.verdict}`)}"` : "";
    return titled(members.map((m) => `${markName(m)}: ${format(m.at)}${m.verdict ? ` · ${m.verdict}` : ""}`).join("\n"), `<g data-mark="${mark.kind}"${members.length > 1 ? ` data-merged="${members.length}"` : ""}${verdict}>${glyph}</g>`);
  }).join("");
  // Labels go over every rule, so a later rule never strikes through an earlier label.
  for (const [index, group] of groups.entries()) {
    const spot = placed.get(group);
    const lead = group.marks.find(mark => mark.label === o.priority) ?? group.marks[0]!;
    if (o.live && o.rows !== 0) {
      const label = spot?.text ?? wrap(markName(lead), Math.max(48, Math.min(200, right - left)), 12, 'sans', 1).lines[0]!;
      const x = spot?.x ?? Math.max(left, Math.min(group.x + 4, right - textWidth(label, 12)));
      const radius = Math.max(.5, Math.min(5, (group.x - (groups[index - 1]?.x ?? -Infinity)) / 2, ((groups[index + 1]?.x ?? Infinity) - group.x) / 2));
      const caption = text(x, rowY(spot?.row ?? 0), label, { size: 12, anchor: spot?.anchor ?? 'start', cls: cls("tgc-mark-label") });
      const key = JSON.stringify([group.marks[0]!.at, group.marks[0]!.kind, group.marks[0]!.label, group.marks[0]!.verdict ?? null, group.marks[0]!.source ?? null]);
      labels.push({ key, attributes: { 'data-mark-id': key, 'data-labelled': Boolean(spot), tabIndex: 0, role: 'img', 'aria-label': markName(lead) }, body: `<title>${esc(markName(lead))}</title>` + rect(group.x - radius, Math.min(top, labelTop), radius * 2, Math.max(12, bottom - Math.min(top, labelTop)), "tgc-lane-hit") + caption });
    } else if (spot) out += text(spot.x, rowY(spot.row), spot.text, { size: 12, anchor: spot.anchor, cls: "tgc-mark-label" });
  }
  for (const edge of edges) out += `<g data-edge="${edge.anchor === "end" ? "after" : "before"}">${text(edge.x, rowY(edge.row), edge.text, { size: 12, anchor: edge.anchor, cls: "tgc-mark-label tgc-mark-edge" })}</g>`;
  return { body: out, labels };
}

export function drawMarks(...args: Parameters<typeof prepareMarks>): string {
  const marks = prepareMarks(...args);
  return marks.body + marks.labels.map(svgPart).join("");
}

/** The table form of marks and bands, in axis order. Empty when there are none. */
export function eventsTable(marks: readonly ChartMark[], bands: readonly ChartBand[], axisLabel: string, format: (x: number) => string): string {
  if (!marks.length && !bands.length) return "";
  const rows = [
    ...marks.map((mark) => ({ at: mark.at, cells: [markName(mark), markKindLabel(mark), format(mark.at), ""] })),
    ...bands.map((band) => ({ at: band.from, cells: [band.label, band.kind === "missing" ? "no data" : band.kind, format(band.from), format(band.to)] })),
  ].sort((a, b) => a.at - b.at);
  return table(`Recorded events by ${axisLabel}`, [{ label: "Event" }, { label: "Kind" }, { label: `${axisLabel} from`, numeric: true }, { label: `${axisLabel} to`, numeric: true }], rows.map((row) => row.cells));
}

export const EVENTS_READ = "Vertical rules mark recorded events (solid: pass, dashed: deadline, cross: died, dotted: other; a diamond is a release, a triangle a steer, a square a ruling and a circle a wake, coloured by verdict when one is recorded); tinted spans are recorded periods, a wall-topped span is a system-wide block, and hatched spans have no data.";
