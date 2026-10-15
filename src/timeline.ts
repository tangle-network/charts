/** Lanes of recorded spans on one time axis, with recorded marks; an open span runs to the supplied `now`. */
import { type ChartBand, type ChartMark, drawBands, drawMarks, EVENTS_READ, eventsGap, eventsTable } from "./events.js";
import { duration } from "./format.js";
import { hatch, line, NARROW, rect, svgRoot, text, titled, WIDE } from "./svg.js";
import { table } from "./table.js";
import { capitalize, plural, wrap } from "./text.js";
import type { Figure, Refusal } from "./types.js";

/** Epoch milliseconds. `end: null` is an open span; it needs the figure's `now`. */
export interface TimelineSpan { start: number; end: number | null; state: string; note?: string }
export interface TimelineLane { id: string; label: string; spans: TimelineSpan[] }
export interface TimelineOptions {
  measure: string;
  /** The recorded window; defaults to the extent of spans, marks, bands and `now`. Everything must fall inside it. */
  start?: number;
  end?: number;
  /** The time an open span is drawn to. Required when any span is open. */
  now?: number;
  marks?: ChartMark[];
  bands?: ChartBand[];
  /** States drawn hatched because their time has no data. Default: missing, untraced. */
  hatch?: string[];
  /** States drawn in the muted tone, such as idle. Default: idle. */
  muted?: string[];
  formatTime?: (ms: number) => string;
  id?: string;
}

const utcClock = (ms: number) => new Date(ms).toISOString().slice(11, 16);

export function timeline(lanes: TimelineLane[], o: TimelineOptions): Figure | Refusal {
  const id = o.id ?? "timeline";
  if (!lanes.length) return { id, refused: "No lanes recorded." };
  if (!o.measure?.trim()) return { id, refused: "A timeline needs a measure." };
  if (new Set(lanes.map((lane) => lane.id)).size !== lanes.length) return { id, refused: "Duplicate lane ids." };
  if (o.now !== undefined && !Number.isFinite(o.now)) return { id, refused: "now must be a finite time." };
  const spans = lanes.flatMap((lane) => lane.spans.map((span) => ({ lane, span })));
  for (const { lane, span } of spans) {
    if (typeof span.state !== "string" || !span.state.trim()) return { id, refused: `${lane.label}: every span needs a state.` };
    if (!Number.isFinite(span.start) || (span.end !== null && (!Number.isFinite(span.end) || span.end < span.start))) return { id, refused: `${lane.label}: span times must be finite and end at or after their start.` };
    if (span.end === null && o.now === undefined) return { id, refused: `${lane.label}: an open span needs now.` };
    if (span.end === null && o.now! < span.start) return { id, refused: `${lane.label}: an open span starts after now.` };
  }
  const shape = eventsGap(o.marks, o.bands);
  if (shape) return { id, refused: shape };
  const marks = o.marks ?? [], bands = o.bands ?? [];
  const ends = (span: TimelineSpan) => span.end ?? o.now!;
  const times = [...spans.flatMap(({ span }) => [span.start, ends(span)]), ...marks.map((m) => m.at), ...bands.flatMap((b) => [b.from, b.to]), ...(o.now === undefined ? [] : [o.now])];
  if (!times.length) return { id, refused: "No spans, marks or bands recorded." };
  const t0 = o.start ?? Math.min(...times), t1 = o.end ?? Math.max(...times);
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return { id, refused: "The window needs two finite, increasing times." };
  if (times.some((t) => t < t0 || t > t1)) return { id, refused: "A span, mark, band or now falls outside the recorded window." };
  const fmt = o.formatTime ?? utcClock;
  const hatched = new Set(o.hatch ?? ["missing", "untraced"]), muted = new Set(o.muted ?? ["idle"]);
  const open = spans.filter(({ span }) => span.end === null).length;
  const noData = spans.filter(({ span }) => hatched.has(span.state));
  const noDataMs = noData.reduce((sum, { span }) => sum + ends(span) - span.start, 0);
  const spanLabel = (lane: TimelineLane, span: TimelineSpan) => `${lane.label}: ${span.state} ${fmt(span.start)} to ${span.end === null ? `now (${fmt(o.now!)}, open)` : fmt(span.end)}, ${duration(ends(span) - span.start)}${span.note ? ` · ${span.note}` : ""}`;
  const draw = (width: number) => {
    const phone = width === NARROW, left = phone ? 12 : 150, right = width - 16;
    const top = marks.length ? 8 + Math.min(3, marks.length) * 14 + 4 : 8;
    const rowH = phone ? 38 : 24, bottom = top + lanes.length * rowH;
    const px = (t: number) => left + (t - t0) / (t1 - t0) * (right - left);
    let body = drawBands(bands, px, top, bottom, fmt);
    for (let i = 0; i <= 4; i++) {
      const x = left + (right - left) * i / 4;
      body += line(x, top, x, bottom, "tgc-gridline") + text(x, bottom + 16, fmt(t0 + (t1 - t0) * i / 4), { size: 11, cls: "tgc-ink-muted tgc-num", anchor: i === 0 ? "start" : i === 4 ? "end" : "middle" });
    }
    lanes.forEach((lane, i) => {
      const y = top + i * rowH;
      const label = wrap(lane.label, phone ? width - 24 : left - 10, phone ? 11 : 12, "sans", 1);
      body += titled(lane.label, text(phone ? 12 : 2, y + (phone ? 12 : 16), label.lines[0]!, { size: phone ? 11 : 12 }));
      const barY = y + (phone ? 18 : 5), barH = phone ? 14 : 14;
      for (const span of lane.spans) {
        const x = px(span.start), w = Math.max(1, px(ends(span)) - x);
        const mark = hatched.has(span.state) ? hatch(x, barY, w, barH, "tgc-span tgc-span-missing") : rect(x, barY, w, barH, `tgc-span${muted.has(span.state) ? " tgc-span-muted" : ""}${span.end === null ? " tgc-span-open" : ""}`, 'rx="2"');
        body += titled(spanLabel(lane, span), `<g data-state="${span.state.replace(/[^a-z0-9-]/gi, "")}"${span.end === null ? ' data-open="true"' : ""}>${mark}</g>`);
      }
    });
    if (o.now !== undefined) body += line(px(o.now), top, px(o.now), bottom, "tgc-now") + text(px(o.now), bottom + 30, `now ${fmt(o.now)}`, { size: 11, cls: "tgc-ink tgc-num", anchor: px(o.now) > (left + right) / 2 ? "end" : "start" });
    body += drawMarks(marks, px, 4, bottom, left, right, fmt);
    return svgRoot(width, bottom + (o.now === undefined ? 22 : 36), body);
  };
  return {
    id,
    finding: `${capitalize(o.measure)} across ${lanes.length} ${plural(lanes.length, "lane")}, ${fmt(t0)} to ${fmt(t1)}.`,
    lede: `${spans.length} recorded ${plural(spans.length, "span")}; ${open} open${o.now === undefined ? "" : ` at ${fmt(o.now)}`}; ${noData.length} without data (${duration(noDataMs)}).`,
    read: `Each lane shows its recorded spans on one time axis. Muted spans are ${[...muted].join(", ") || "none"}; hatched spans have no data; an open span runs to now.${marks.length + bands.length ? ` ${EVENTS_READ}` : ""}`,
    svg: { wide: draw(WIDE), narrow: draw(NARROW) },
    table: table(`${capitalize(o.measure)} by lane`, [{ label: "Lane" }, { label: "State" }, { label: "Start", numeric: true }, { label: "End", numeric: true }, { label: "Duration", numeric: true }, { label: "Note" }],
      spans.map(({ lane, span }) => [lane.label, span.state, fmt(span.start), span.end === null ? "open" : fmt(span.end), duration(ends(span) - span.start), span.note ?? ""])) + eventsTable(marks, bands, "time", fmt),
    note: { method: "Recorded span start and end times as supplied by the producer; open spans are drawn to the supplied now. No span is inferred, merged or reordered.", n: `${spans.length} spans in ${lanes.length} lanes.`, exclusions: noData.map(({ lane, span }) => `${lane.label}: ${span.state} ${fmt(span.start)} to ${span.end === null ? "now" : fmt(span.end)} has no data.`) },
  };
}
