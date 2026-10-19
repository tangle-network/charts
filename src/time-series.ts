/** Recorded trajectories. Explicit null observations break lines without interpolation. */
import { type ChartBand, type ChartMark, drawBands, drawMarks, EVENTS_READ, eventsGap, eventsTable, markLabelRows } from "./events.js";
import { domainGap, observationLabel, type Observations, scalarGap, scalarIntervalLabel, scalarLabel } from "./scalar.js";
import { circle, line, MARKER_SHAPES, markerPath, NARROW, polyline, rect, text, WIDE } from "./svg.js";
import { table } from "./table.js";
import { capitalize, esc, textBlock, textWidth, wrap } from "./text.js";
import type { Figure, Interval, Refusal } from "./types.js";

export interface TimePoint {
  x: number;
  y: number | null;
  observations?: Observations;
  interval?: Interval | null;
  /** A recorded fact independent of the scalar, such as all checks passed. */
  annotation?: string;
}

export interface TimeSeriesRow {
  id: string;
  label: string;
  points: TimePoint[];
}

export interface TimeSeriesOptions {
  x: { label: string; domain: [number, number] };
  y: { label: string; unit: string; domain: [number, number] };
  formatX?: (value: number) => string;
  formatY?: (value: number) => string;
  /** Recorded vertical events on the x axis, such as the first pass, a deadline or a death. Listed in the table. */
  marks?: ChartMark[];
  /** Recorded shaded spans on the x axis, such as time after the first pass or idle time; `missing` is hatched. */
  bands?: ChartBand[];
  id?: string;
}

export function timeSeries(rows: TimeSeriesRow[], o: TimeSeriesOptions): Figure | Refusal {
  const id = o.id ?? "time-series";
  const gap = domainGap(o.x.domain) ?? domainGap(o.y.domain);
  if (gap) return { id, refused: gap };
  const events = eventsGap(o.marks, o.bands, o.x.domain);
  if (events) return { id, refused: events };
  if (!rows.length || rows.every((row) => !row.points.length)) return { id, refused: "No trajectory observations recorded." };
  if (new Set(rows.map((row) => row.id)).size !== rows.length) return { id, refused: "Duplicate trajectory ids." };
  for (const row of rows) {
    let previous = -Infinity;
    for (const point of row.points) {
      if (!Number.isFinite(point.x) || point.x <= previous || point.x < o.x.domain[0] || point.x > o.x.domain[1]) return { id, refused: `${row.label}: x values must be finite, strictly increasing and inside the axis domain.` };
      previous = point.x;
      const problem = scalarGap(point.y, point.interval, point.observations, o.y.domain);
      if (problem) return { id, refused: `${row.label} at ${point.x}: ${problem}` };
    }
  }
  const xLabel = (x: number) => o.formatX ? o.formatX(x) : String(x);
  const yLabel = (y: number) => scalarLabel(y, o.y.unit, o.formatY);
  const ticks = Array.from({ length: 5 }, (_, i) => o.y.domain[0] + i / 4 * (o.y.domain[1] - o.y.domain[0]));
  // Keep 32px for the legend stroke/offset and at least 32px for its text.
  if (axisGutter(ticks, yLabel) >= NARROW - 24 - 64) return { id, refused: "Formatted y-axis labels leave no room for the phone chart. Use a shorter formatter or unit." };
  const flat = rows.flatMap((row) => row.points.map((point) => ({ row, point })));
  const measured = flat.filter(({ point }) => point.y !== null);
  const marks = o.marks ?? [], bands = o.bands ?? [];
  const hasEvents = marks.length + bands.length > 0;
  const facts = (row: TimeSeriesRow, point: TimePoint) => [row.label, `${o.x.label}: ${xLabel(point.x)}`, `${o.y.label}: ${point.y === null ? "not measured" : yLabel(point.y)}`, observationLabel(point.observations), ...(point.interval ? [`Interval: ${scalarIntervalLabel(point.interval, o.y.unit, o.formatY)}`] : []), ...(point.annotation ? [point.annotation] : [])];
  return {
    id,
    finding: `${capitalize(o.y.label)} by ${o.x.label}.`,
    lede: `${measured.length} of ${flat.length} positions have a recorded value.`,
    read: `Points show recorded values. Lines connect adjacent measured positions; missing positions break the line. Whiskers show recorded intervals.${hasEvents ? ` ${EVENTS_READ}` : ""}`,
    svg: { wide: plot(rows, o, WIDE, xLabel, yLabel, facts), narrow: plot(rows, o, NARROW, xLabel, yLabel, facts), interactive: true },
    table: table(`${capitalize(o.y.label)} by ${o.x.label}`, [{ label: "Setup" }, { label: o.x.label, numeric: true }, { label: o.y.label, numeric: true }, { label: "Observations" }, { label: "Recorded interval" }, { label: "Recorded annotation" }], flat.map(({ row, point }) => [row.label, xLabel(point.x), point.y === null ? "not measured" : yLabel(point.y), observationLabel(point.observations), scalarIntervalLabel(point.interval, o.y.unit, o.formatY), point.annotation ?? ""])).replace('class="tgc-table"', 'class="tgc-table tgc-scalar-table"') + eventsTable(marks, bands, o.x.label, xLabel),
    note: { method: "Recorded scalar observations. Missing positions are not interpolated; no uncertainty or statistical comparison is inferred.", n: "Observation counts are recorded separately at each position.", exclusions: [...flat.filter(({ point }) => point.y === null).map(({ row, point }) => `${row.label}, ${o.x.label} ${xLabel(point.x)}: not measured.`), ...bands.filter((band) => band.kind === "missing").map((band) => `${band.label}: no data from ${o.x.label} ${xLabel(band.from)} to ${xLabel(band.to)}.`)] },
  };
}

function plot(rows: TimeSeriesRow[], o: TimeSeriesOptions, width: number, xLabel: (x: number) => string, yLabel: (y: number) => string, facts: (row: TimeSeriesRow, point: TimePoint) => string[]): string {
  const ticks = Array.from({ length: 5 }, (_, i) => o.y.domain[0] + i / 4 * (o.y.domain[1] - o.y.domain[0]));
  // Unit-bearing labels need their measured width, including monospace fallback.
  const left = axisGutter(ticks, yLabel);
  const right = width - 24;
  const px = (x: number) => left + (x - o.x.domain[0]) / (o.x.domain[1] - o.x.domain[0]) * (right - left);
  // Mark labels take rows above the plot, so they never sit on the data.
  const labelRows = markLabelRows(o.marks ?? [], px, left, right);
  const top = 36 + (labelRows ? labelRows * 14 + 2 : 0), bottom = top + 224;
  const py = (y: number) => bottom - (y - o.y.domain[0]) / (o.y.domain[1] - o.y.domain[0]) * (bottom - top);
  let marks = text(left, 18, o.y.label, { cls: "tgc-ink-muted" });
  for (const [i, y] of ticks.entries()) {
    marks += line(left, py(y), right, py(y), i === 0 ? "tgc-axis" : "tgc-gridline") + text(left - 8, py(y) + 4, yLabel(y), { anchor: "end", cls: "tgc-ink-muted tgc-num", size: 12 });
  }
  const xs = [...new Set(rows.flatMap((row) => row.points.map((point) => point.x)))].sort((a, b) => a - b);
  for (const x of xTicks(xs, px, left, right, width, xLabel)) marks += text(px(x), bottom + 20, xLabel(x), { anchor: "middle", cls: "tgc-ink-muted tgc-num" });
  marks += text((left + right) / 2, bottom + 43, o.x.label, { anchor: "middle", cls: "tgc-ink-muted" });
  marks += drawBands(o.bands ?? [], px, top, bottom, xLabel);
  let legendY = bottom + 72;
  let points = "", tips = "", rules = "";
  let pointId = 0;
  for (const [seriesIndex, row] of rows.entries()) {
    const dash = seriesIndex === 0 ? "" : `${2 + seriesIndex * 2} 3`;
    let segment: Array<[number, number]> = [];
    const flush = () => { if (segment.length > 1) marks += `<g data-series="${esc(row.id)}" style="stroke-dasharray:${dash}">${polyline(segment, "tgc-series-line")}</g>`; segment = []; };
    for (const point of row.points) {
      if (point.y === null) { flush(); continue; }
      const x = px(point.x), y = py(point.y);
      segment.push([x, y]);
      const pointFacts = facts(row, point);
      const key = pointId++;
      // The first series keeps a circle; later series add a shape as well as a dash, so identity survives without colour.
      let dot = circle(x, y, 10, "tgc-series-hit") + (seriesIndex === 0 ? circle(x, y, 3.5, "tgc-series-point") : `<path class="tgc-series-point" d="${markerPath(MARKER_SHAPES[seriesIndex % MARKER_SHAPES.length]!, x, y, 3.5)}"/>`);
      if (point.interval) dot += line(x, py(point.interval.lower), x, py(point.interval.upper), "tgc-whisker") + line(x - 4, py(point.interval.lower), x + 4, py(point.interval.lower), "tgc-whisker") + line(x - 4, py(point.interval.upper), x + 4, py(point.interval.upper), "tgc-whisker");
      points += `<g class="tgc-series-observation" data-point="${key}" tabindex="0" role="img" aria-label="${esc(pointFacts.join(" · "))}"><title>${esc(pointFacts.join(" · "))}</title>${dot}</g>`;
      const tipWidth = Math.min(280, width - 24), tipX = Math.max(12, Math.min(width - tipWidth - 12, x - tipWidth / 2));
      const lines = pointFacts.flatMap((fact) => wrap(fact, tipWidth - 24, 12, "sans", 8).lines);
      tips += `<g class="tgc-series-tip" data-series-tip="${key}" aria-hidden="true">${rect(tipX, top, tipWidth, lines.length * 17 + 24, "tgc-tip-bg", 'rx="7"')}${textBlock(lines, tipX + 12, top + 20, 17, 'class="tgc-tip-ink" font-size="12"')}</g>`;
      rules += `.tgc-trajectories:has([data-point="${key}"]:hover) [data-series-tip="${key}"],.tgc-trajectories:not(:has(.tgc-series-observation:hover)):has([data-point="${key}"]:focus-visible) [data-series-tip="${key}"]{opacity:1}`;
    }
    flush();
    const label = wrap(row.label, right - left - 32, 12, "sans", 8);
    marks += `<g style="stroke-dasharray:${dash}">${line(left, legendY - 4, left + 24, legendY - 4, "tgc-series-line")}</g>` + (rows.length > 1 ? `<path class="tgc-series-key" d="${markerPath(MARKER_SHAPES[seriesIndex % MARKER_SHAPES.length]!, left + 12, legendY - 4, 3.5)}"/>` : "") + textBlock(label.lines, left + 32, legendY, 16, 'class="tgc-ink" font-size="12"');
    legendY += label.lines.length * 16 + 8;
  }
  const events = drawMarks(o.marks ?? [], px, top, bottom, left, right, xLabel, 22);
  return `<svg class="tgc-svg tgc-trajectories" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${legendY + 12}" viewBox="0 0 ${width} ${legendY + 12}" role="group" aria-label="${esc(o.y.label)} by ${esc(o.x.label)}"><style>${rules}</style>${marks}${events}${points}${tips}</svg>`;
}


/**
 * X labels at recorded positions, spread evenly across the plot and measured so none overlap: at most as many as fit,
 * each snapped to the nearest recorded x, always keeping the first and the last that fit.
 */
function xTicks(xs: number[], px: (x: number) => number, left: number, right: number, width: number, label: (x: number) => string): number[] {
  if (!xs.length) return [];
  const span = (x: number) => { const w = textWidth(label(x), 12, "mono"); return [px(x) - w / 2, px(x) + w / 2] as const; };
  const widest = Math.max(...xs.map((x) => textWidth(label(x), 12, "mono")));
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

function axisGutter(ticks: number[], label: (value: number) => string): number {
  return Math.max(64, ...ticks.map((value) => Math.ceil(textWidth(label(value), 12, "mono")) + 20));
}
