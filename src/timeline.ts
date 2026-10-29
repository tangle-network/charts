/**
 * Lanes of recorded spans on one time axis, with recorded marks; an open span runs to the supplied `now`. Lanes can
 * form a tree (`parent`), carry attempt ticks coloured by outcome with ok and failed counts, and fold by subtree.
 */
import { type ChartBand, type ChartMark, drawBands, drawGroups, drawMarks, EVENTS_READ, eventsGap, eventsTable, groupRowHeight, markHead, markLabelRows, markName } from "./events.js";
import { duration } from "./format.js";
import { OUTCOME_ORDER, type TickOutcome } from "./outcomes.js";
import { hatch, line, NARROW, rect, svgRoot, text, titled, wideWidth } from "./svg.js";
import { table } from "./table.js";
import { capitalize, esc, plural, textWidth, wrap } from "./text.js";
import type { Figure, Refusal } from "./types.js";

/** Epoch milliseconds. `end: null` is an open span; it needs the figure's `now`. */
export interface TimelineSpan { start: number; end: number | null; state: string; note?: string; endLabel?: string }
export type { TickOutcome } from "./outcomes.js";
/** One recorded attempt on a lane, such as a driver turn, at the time it ended. `note` (an error line) shows on hover. */
export interface TimelineTick { at: number; outcome: TickOutcome; note?: string }
export interface TimelineLane {
  id: string;
  label: string;
  /** Optional recorded total beside the React Gantt label; its unit is named on hover. */
  count?: number;
  countLabel?: string;
  spans: TimelineSpan[];
  /** The lane that started this one. The lane is drawn under its parent with a tree connector. */
  parent?: string;
  /** Tree depth: 0 for a root. Defaults to the parent's depth plus one, or 0 without a parent. */
  depth?: number;
  /** Recorded attempts, drawn as ticks with ok and failed counts at the lane's end. Omit when attempts are not recorded. */
  ticks?: TimelineTick[];
  /** Caller-composed facts, one per hover line on the lane and each of its spans: profile, model, status, attempts, cost, top error. */
  detail?: string[];
}
export interface TimelineOptions {
  measure: string;
  /**
   * The recorded window; defaults to the extent of the data (spans, ticks and `now`). Spans, ticks and `now` must fall
   * inside it. Marks outside it, such as a later deadline, are named at the edge they fall past; bands are clipped.
   */
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
  /**
   * Lane ids whose subtrees are folded: descendants are hidden and the lane's ticks and counts include them. Passing
   * it, even empty, makes each parent lane's label a fold toggle (`data-toggle`), which React `TimelineView` wires up.
   * Ids that name no lane are ignored, so a fold state can outlive the lanes it was made for.
   */
  collapsed?: string[];
  formatTime?: (ms: number) => string;
  /** The wide render's width in pixels, such as the measured container (at least 720, the default). */
  width?: number;
  id?: string;
}

export const TICK_OUTCOMES: readonly TickOutcome[] = OUTCOME_ORDER;

const utcClock = (ms: number) => new Date(ms).toISOString().slice(11, 16);
const MIN = 60_000, DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Axis steps: the smallest whose labels fit without overlap is used. */
const STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440, 2880, 10080].map((m) => m * MIN);

interface Row { lane: TimelineLane; depth: number; children: number; hidden: number; folded: boolean; ticks: TimelineTick[] | undefined }

export function timeline(lanes: TimelineLane[], o: TimelineOptions): Figure | Refusal {
  const id = o.id ?? "timeline";
  if (!lanes.length) return { id, refused: "No lanes recorded." };
  if (!o.measure?.trim()) return { id, refused: "A timeline needs a measure." };
  if (new Set(lanes.map((lane) => lane.id)).size !== lanes.length) return { id, refused: "Duplicate lane ids." };
  if (o.now !== undefined && !Number.isFinite(o.now)) return { id, refused: "now must be a finite time." };
  const byId = new Map(lanes.map((lane) => [lane.id, lane]));
  for (const lane of lanes) {
    const seen = new Set<string>();
    for (let at: TimelineLane = lane; at.parent !== undefined; at = byId.get(at.parent)!) {
      if (!byId.has(at.parent)) return { id, refused: `${at.label}: parent ${at.parent} is not a lane.` };
      if (seen.has(at.id)) return { id, refused: `${lane.label}: its parent chain loops back to ${at.label}.` };
      seen.add(at.id);
    }
    if (lane.depth !== undefined && (!Number.isInteger(lane.depth) || lane.depth < 0)) return { id, refused: `${lane.label}: depth must be a whole number of at least 0.` };
  }
  // A root sits at its stated depth (0 by default); every other lane sits one below its parent.
  const depthOf = new Map<string, number>();
  const depth = (lane: TimelineLane): number => depthOf.get(lane.id) ?? depthOf.set(lane.id, lane.parent === undefined ? (lane.depth ?? 0) : depth(byId.get(lane.parent)!) + 1).get(lane.id)!;
  for (const lane of lanes) {
    const at = depth(lane);
    if (lane.depth !== undefined && lane.depth !== at) return { id, refused: `${lane.label}: depth ${lane.depth} is not one below its parent's ${at - 1}.` };
  }
  const spans = lanes.flatMap((lane) => lane.spans.map((span) => ({ lane, span })));
  for (const { lane, span } of spans) {
    if (typeof span.state !== "string" || !span.state.trim()) return { id, refused: `${lane.label}: every span needs a state.` };
    if (!Number.isFinite(span.start) || (span.end !== null && (!Number.isFinite(span.end) || span.end < span.start))) return { id, refused: `${lane.label}: span times must be finite and end at or after their start.` };
    if (span.end === null && o.now === undefined) return { id, refused: `${lane.label}: an open span needs now.` };
    if (span.end === null && o.now! < span.start) return { id, refused: `${lane.label}: an open span starts after now.` };
  }
  for (const lane of lanes) for (const tick of lane.ticks ?? []) {
    if (!tick || !Number.isFinite(tick.at)) return { id, refused: `${lane.label}: every tick needs a finite time.` };
    if (!TICK_OUTCOMES.includes(tick.outcome)) return { id, refused: `${lane.label}: tick outcome ${String(tick.outcome)} is not one of ${TICK_OUTCOMES.join(", ")}.` };
  }
  const shape = eventsGap(o.marks, o.bands);
  if (shape) return { id, refused: shape };
  const marks = o.marks ?? [], bands = o.bands ?? [];
  const stray = marks.find((mark) => mark.lane !== undefined && !byId.has(mark.lane));
  if (stray) return { id, refused: `${stray.label}: lane ${stray.lane} is not a lane.` };
  const ends = (span: TimelineSpan) => span.end ?? o.now!;
  const ticks = lanes.flatMap((lane) => lane.ticks ?? []);
  const data = [...spans.flatMap(({ span }) => [span.start, ends(span)]), ...ticks.map((tick) => tick.at), ...(o.now === undefined ? [] : [o.now])];
  const times = data.length ? data : [...marks.map((m) => m.at), ...bands.flatMap((b) => [b.from, b.to])];
  if (!times.length) return { id, refused: "No spans, ticks, marks or bands recorded." };
  const t0 = o.start ?? Math.min(...times), t1 = o.end ?? Math.max(...times);
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return { id, refused: "The window needs two finite, increasing times." };
  if (data.some((t) => t < t0 || t > t1)) return { id, refused: "A span, tick or now falls outside the recorded window." };
  const fmt = o.formatTime ?? utcClock;
  const axisLabel = o.formatTime ?? ((ms: number) => ms % DAY === 0 ? `${MONTHS[new Date(ms).getUTCMonth()]} ${new Date(ms).getUTCDate()}` : utcClock(ms));
  const hatched = new Set(o.hatch ?? ["missing", "untraced"]), muted = new Set(o.muted ?? ["idle"]);
  const foldable = o.collapsed !== undefined, folded = new Set(o.collapsed ?? []);

  // Tree order: each lane under its parent, siblings and roots in input order.
  const kids = new Map<string | undefined, TimelineLane[]>();
  for (const lane of lanes) kids.set(lane.parent, [...(kids.get(lane.parent) ?? []), lane]);
  const subtree = (lane: TimelineLane): TimelineLane[] => (kids.get(lane.id) ?? []).flatMap((kid) => [kid, ...subtree(kid)]);
  const rows: Row[] = [];
  const visit = (lane: TimelineLane) => {
    const below = subtree(lane), fold = folded.has(lane.id) && below.length > 0;
    const own = lane.ticks, all = fold && (own || below.some((kid) => kid.ticks)) ? [...(own ?? []), ...below.flatMap((kid) => kid.ticks ?? [])] : own;
    rows.push({ lane, depth: depthOf.get(lane.id)!, children: (kids.get(lane.id) ?? []).length, hidden: fold ? below.length : 0, folded: fold, ticks: all });
    if (!fold) (kids.get(lane.id) ?? []).forEach(visit);
  };
  (kids.get(undefined) ?? []).forEach(visit);
  const rowOf = new Map(rows.map((row, i) => [row.lane.id, i]));
  const shownAt = (laneId: string): number => {
    for (let at: TimelineLane | undefined = byId.get(laneId); at; at = at.parent === undefined ? undefined : byId.get(at.parent)) if (rowOf.has(at.id)) return rowOf.get(at.id)!;
    return 0;
  };

  const inWindow = (mark: ChartMark) => mark.at >= t0 && mark.at <= t1;
  const wide = marks.filter((mark) => mark.lane === undefined && inWindow(mark));
  const onLane = marks.filter((mark) => mark.lane !== undefined && inWindow(mark));
  const before = marks.filter((mark) => mark.at < t0), after = marks.filter((mark) => mark.at > t1);
  const open = spans.filter(({ span }) => span.end === null).length;
  const noData = spans.filter(({ span }) => hatched.has(span.state));
  const noDataMs = noData.reduce((sum, { span }) => sum + ends(span) - span.start, 0);
  const counts = (list: TimelineTick[]) => {
    const by = new Map<TickOutcome, number>();
    for (const tick of list) by.set(tick.outcome, (by.get(tick.outcome) ?? 0) + 1);
    const ok = by.get("ok") ?? 0, failed = list.length - ok;
    const why = [...by].filter(([outcome]) => outcome !== "ok").sort((a, b) => b[1] - a[1]).map(([outcome, n]) => `${n} ${outcome}`).join(", ");
    return { ok, failed, why, text: `${ok}✓ ${failed}✗`, sentence: `${ok} ok, ${failed} failed${why ? ` (${why})` : ""}` };
  };
  const detail = (lane: TimelineLane) => (lane.detail ?? []).filter((fact) => typeof fact === "string" && fact.trim());
  const spanLabel = (lane: TimelineLane, span: TimelineSpan) => [`${lane.label}: ${span.state} ${fmt(span.start)} to ${span.end === null ? `now (${fmt(o.now!)}, open)` : fmt(span.end)}, ${duration(ends(span) - span.start)}${span.note ? ` · ${span.note}` : ""}`, ...detail(lane)].join("\n");
  const hasTicks = rows.some((row) => row.ticks !== undefined);
  const countWidth = hasTicks ? Math.max(...rows.filter((row) => row.ticks).map((row) => textWidth(counts(row.ticks!).text, 12, "mono"))) : 0;

  const draw = (width: number) => {
    const phone = width === NARROW, indent = phone ? 10 : 12;
    const caretX = (depth: number) => 4 + depth * indent;
    const labelX = (depth: number) => caretX(depth) + 11;
    const tail = (row: Row) => row.hidden ? ` +${row.hidden}` : "";
    const left = phone ? 12 : Math.max(120, Math.min(Math.round(width * 0.34), Math.ceil(Math.max(...rows.map((row) => labelX(row.depth) + textWidth(row.lane.label + tail(row), 12))) + 10)));
    const right = phone ? width - 12 : width - 16 - (countWidth ? countWidth + 10 : 0);
    const px = (t: number) => left + (t - t0) / (t1 - t0) * (right - left);
    const labelRows = markLabelRows(wide, px, left, right, { before, after, window: [t0, t1] });
    const top = 8 + (labelRows ? labelRows * 14 + 6 : 0) + groupRowHeight(bands);
    const rowH = phone ? 40 : 24, bottom = top + rows.length * rowH;
    const barTop = (y: number) => y + (phone ? 19 : 5), barH = 14;
    let body = drawBands(bands, px, top, bottom, fmt, [t0, t1]) + drawGroups(bands, (from, to) => [px(from), px(to)], top, bottom, left, right, fmt, [t0, t1]);
    for (const t of axisTicks(t0, t1, px, left, right, axisLabel)) {
      body += line(px(t), top, px(t), bottom, "tgc-gridline") + text(px(t), bottom + 16, axisLabel(t), { size: 12, cls: "tgc-ink-muted tgc-num", anchor: "middle" });
    }
    // Run-wide rules go under the lanes: bars, labels and counts stay readable where many events cross them.
    body += drawMarks(wide, px, top - 8, bottom, left, right, fmt, 4, { before, after, window: [t0, t1] });
    rows.forEach((row, i) => {
      const { lane } = row, y = top + i * rowH, mid = y + (phone ? 9 : 12), baseline = y + (phone ? 13 : 16);
      const parentRow = lane.parent === undefined ? undefined : rowOf.get(lane.parent);
      if (parentRow !== undefined) {
        const x = caretX(row.depth - 1) + 3, from = phone ? y + 2 : top + parentRow * rowH + 19;
        body += `<path class="tgc-tree" d="M${x} ${from}V${mid}H${labelX(row.depth) - (row.children ? 13 : 3)}"/>`;
      }
      const countText = row.ticks ? counts(row.ticks) : undefined;
      const room = (phone ? width - 12 - (countText ? textWidth(countText.text, 12, "mono") + 8 : 0) : left - 8) - labelX(row.depth) - textWidth(tail(row), 12);
      const label = wrap(lane.label, Math.max(24, room), 12, "sans", 1).lines[0]!;
      const name = `<text class="tgc-ink tgc-lane-label" x="${labelX(row.depth)}" y="${baseline}" font-size="12">${esc(label)}${row.hidden ? `<tspan class="tgc-ink-muted">${esc(tail(row))}</tspan>` : ""}</text>`;
      const caret = row.children ? `<path class="tgc-caret" d="${row.folded ? `M${caretX(row.depth)} ${mid - 4}l6 4l-6 4z` : `M${caretX(row.depth) - 1} ${mid - 3}h8l-4 6z`}"/>` : "";
      const facts = [lane.label, ...detail(lane), ...(countText ? [`Attempts: ${countText.sentence}${row.hidden ? `, including ${row.hidden} folded ${plural(row.hidden, "lane")}` : ""}`] : [])].join("\n");
      const toggle = foldable && row.children ? ` data-toggle="${esc(lane.id)}" class="tgc-lane-toggle" role="button" tabindex="0" aria-expanded="${!row.folded}" aria-label="${esc(`${row.folded ? "Unfold" : "Fold"} ${lane.label}`)}"` : "";
      const hit = toggle ? rect(caretX(row.depth) - 3, y + 1, (phone ? width - 12 : left - 4) - caretX(row.depth) + 3, phone ? 16 : rowH - 2, "tgc-lane-hit", 'rx="3"') : "";
      body += `<g data-lane="${esc(lane.id)}" data-depth="${row.depth}"${row.folded ? ` data-folded="${row.hidden}"` : ""}><g${toggle}><title>${esc(facts)}</title>${hit}${caret}${name}</g>`;
      for (const span of lane.spans) {
        const x = px(span.start), w = Math.max(1, px(ends(span)) - x);
        const mark = hatched.has(span.state) ? hatch(x, barTop(y), w, barH, "tgc-span tgc-span-missing") : rect(x, barTop(y), w, barH, `tgc-span${muted.has(span.state) ? " tgc-span-muted" : ""}${span.end === null ? " tgc-span-open" : ""}`, 'rx="2"');
        body += titled(spanLabel(lane, span), `<g data-state="${span.state.replace(/[^a-z0-9-]/gi, "")}"${span.end === null ? ' data-open="true"' : ""}>${mark}</g>`);
      }
      if (row.ticks?.length) body += drawTicks(row.ticks, lane.label, px, barTop(y), barH, fmt);
      if (countText) {
        const x = phone ? width - 12 : width - 16;
        body += titled(`${lane.label}: ${countText.sentence}${row.hidden ? ` across ${row.hidden + 1} lanes` : ""}`, `<text class="tgc-num tgc-count" x="${x}" y="${baseline}" font-size="12" text-anchor="end">${countText.ok}<tspan class="tgc-count-ok">✓</tspan> ${countText.failed}<tspan class="tgc-count-failed">✗</tspan></text>`);
      }
      body += "</g>";
    });
    for (const mark of onLane) {
      const y = top + shownAt(mark.lane!) * rowH, cy = barTop(y) + barH / 2, x = px(mark.at);
      const glyph = markHead(mark.kind, x, cy, phone ? 3 : 3.5) || line(x, barTop(y) - 3, x, barTop(y) + barH + 3, `tgc-mark tgc-mark-${mark.kind}`);
      const verdict = mark.verdict ? ` data-verdict="${mark.verdict}" class="tgc-verdict-${mark.verdict}"` : "";
      body += titled(`${markName(mark)}: ${fmt(mark.at)}${mark.verdict ? ` · ${mark.verdict}` : ""}`, `<g data-mark="${mark.kind}" data-lane-mark="${esc(mark.lane!)}"${verdict}>${glyph}</g>`);
    }
    if (o.now !== undefined) body += line(px(o.now), top, px(o.now), bottom, "tgc-now") + text(px(o.now), bottom + 30, `now ${fmt(o.now)}`, { size: 12, cls: "tgc-ink tgc-num", anchor: px(o.now) > (left + right) / 2 ? "end" : "start" });
    return svgRoot(width, bottom + (o.now === undefined ? 22 : 36), body);
  };

  const all = counts(ticks);
  const tree = lanes.some((lane) => lane.parent !== undefined || lane.depth);
  const folds = foldable && rows.some((row) => row.children);
  const laneTable = tree || ticks.length || lanes.some((lane) => lane.ticks || detail(lane).length)
    ? table(`${capitalize(o.measure)}: lanes`, [{ label: "Lane" }, { label: "Started by" }, { label: "Depth", numeric: true }, { label: "Attempts ok", numeric: true }, { label: "Attempts failed", numeric: true }, { label: "Failed by outcome" }, { label: "Detail" }],
      lanes.map((lane) => {
        const c = lane.ticks ? counts(lane.ticks) : undefined;
        return [lane.label, lane.parent === undefined ? "" : byId.get(lane.parent)!.label, String(depthOf.get(lane.id)), c ? String(c.ok) : "not recorded", c ? String(c.failed) : "not recorded", c?.why ?? "", detail(lane).join(" · ")];
      }))
    : "";
  return {
    id,
    finding: `${capitalize(o.measure)} across ${lanes.length} ${plural(lanes.length, "lane")}, ${fmt(t0)} to ${fmt(t1)}.`,
    lede: `${spans.length} recorded ${plural(spans.length, "span")}; ${open} open${o.now === undefined ? "" : ` at ${fmt(o.now)}`}; ${noData.length} without data (${duration(noDataMs)}).${ticks.length ? ` ${ticks.length} recorded ${plural(ticks.length, "attempt")}: ${all.sentence}.` : ""}`,
    read: [
      `Each lane shows its recorded spans on one time axis. Muted spans are ${[...muted].join(", ") || "none"}; hatched spans have no data; an open span runs to now.`,
      ...(tree ? [`An indented lane was started by the lane its connector leads to${folds ? "; a caret folds a lane's subtree, and a folded lane's ticks and counts include its subtree" : ""}.`] : []),
      ...(hasTicks ? ["Each tick is one recorded attempt: ok ticks rise above the bar and failed ticks drop below it in their outcome's colour; the counts at the right are ok (✓) and failed (✗)."] : []),
      ...(marks.length + bands.length ? [EVENTS_READ] : []),
    ].join(" "),
    svg: { wide: draw(wideWidth(o.width)), narrow: draw(NARROW), ...(folds ? { interactive: true } : {}) },
    table: laneTable + table(`${capitalize(o.measure)} by lane`, [{ label: "Lane" }, { label: "State" }, { label: "Start", numeric: true }, { label: "End", numeric: true }, { label: "Duration", numeric: true }, { label: "Note" }],
      spans.map(({ lane, span }) => [lane.label, span.state, fmt(span.start), span.end === null ? "open" : fmt(span.end), duration(ends(span) - span.start), span.note ?? ""])) + eventsTable(marks, bands, "time", fmt),
    note: {
      method: `Recorded span start and end times as supplied by the producer; open spans are drawn to the supplied now. No span is inferred, merged or reordered.${ticks.length ? " Ticks are recorded attempts at their recorded times; ticks of one outcome within 2 px are drawn as one, with the count in its hover." : ""}`,
      n: `${spans.length} spans${ticks.length ? ` and ${ticks.length} attempts` : ""} in ${lanes.length} lanes.`,
      exclusions: [
        ...noData.map(({ lane, span }) => `${lane.label}: ${span.state} ${fmt(span.start)} to ${span.end === null ? "now" : fmt(span.end)} has no data.`),
        ...[...before, ...after].map((mark) => `${markName(mark)} falls ${mark.at < t0 ? `${duration(t0 - mark.at)} before` : `${duration(mark.at - t1)} after`} the recorded window; it is named at the edge, not drawn.`),
      ],
    },
  };
}

/** Ticks of one outcome within 2 px merge into one stroke whose hover gives the count and time range. */
function drawTicks(ticks: TimelineTick[], label: string, px: (t: number) => number, barTop: number, barH: number, fmt: (ms: number) => string): string {
  const buckets = new Map<string, TimelineTick[]>();
  for (const tick of [...ticks].sort((a, b) => a.at - b.at)) {
    const key = `${tick.outcome}|${Math.round(px(tick.at) / 2)}`;
    buckets.set(key, [...(buckets.get(key) ?? []), tick]);
  }
  // Failed ticks first, so ok ticks stay visible where a lane both failed and succeeded.
  const order = [...buckets.values()].sort((a, b) => Number(a[0]!.outcome === "ok") - Number(b[0]!.outcome === "ok"));
  return `<g class="tgc-ticks">${order.map((bucket) => {
    const first = bucket[0]!, last = bucket.at(-1)!, ok = first.outcome === "ok";
    const x = px(bucket.reduce((sum, tick) => sum + tick.at, 0) / bucket.length);
    const notes = new Map<string, number>();
    for (const tick of bucket) if (tick.note) notes.set(tick.note, (notes.get(tick.note) ?? 0) + 1);
    const note = [...notes].sort((a, b) => b[1] - a[1])[0]?.[0];
    const title = `${label}: ${bucket.length > 1 ? `${bucket.length} × ` : ""}${first.outcome} ${fmt(first.at)}${bucket.length > 1 ? ` to ${fmt(last.at)}` : ""}${note ? ` · ${note.length > 160 ? `${note.slice(0, 159)}…` : note}` : ""}`;
    return titled(title, line(x, ok ? barTop - 4 : barTop + barH / 2, x, ok ? barTop + barH / 2 : barTop + barH + 4, `tgc-tick tgc-tick-${first.outcome}`));
  }).join("")}</g>`;
}

/** Clock-aligned ticks at the smallest step whose labels fit between `left` and `right` without overlapping. */
function axisTicks(t0: number, t1: number, px: (t: number) => number, left: number, right: number, label: (ms: number) => string): number[] {
  const fit = (list: number[]) => {
    let end = -Infinity;
    for (const t of list) {
      const w = textWidth(label(t), 12, "mono"), a = px(t) - w / 2, b = px(t) + w / 2;
      if (a < left - 14 || b > right + 14 || a < end + 10) return false;
      end = b;
    }
    return true;
  };
  for (const step of STEPS) {
    const list: number[] = [];
    for (let t = Math.ceil(t0 / step) * step; t <= t1 && list.length <= 12; t += step) list.push(t);
    if (list.length >= 2 && list.length <= 12 && fit(list)) return list;
  }
  return fit([t0, t1]) ? [t0, t1] : [t0];
}
