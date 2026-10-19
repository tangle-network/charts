/** Recorded trajectories. Explicit null observations break lines without interpolation. */
import { categoriesGap, columnLabelFit, columnLabels, drawTargets, logValueGap, targetsTable, type XCategory, xAxis, xTicks, type YScale, yAxisGap, yGridlines, type YTarget, type YTick, yScale } from "./axis.js";
import { type ChartBand, type ChartMark, drawBands, drawGroups, drawMarks, EVENTS_READ, eventsGap, eventsTable, groupRowHeight, markLabelRows } from "./events.js";
import { checkerClass } from "./outcomes.js";
import { hasPointFields, placeBadges, POINT_COLUMNS, pointCells, pointFacts, type PointFields, pointFieldsGap, pointMark, stripMark, VERDICT_WORD, verdictKey } from "./points.js";
import { domainGap, observationLabel, type Observations, scalarGap, scalarIntervalLabel, scalarLabel } from "./scalar.js";
import { circle, line, MARKER_SHAPES, type MarkerShape, markerPath, NARROW, polyline, rect, text, titled, wideWidth } from "./svg.js";
import { table } from "./table.js";
import { capitalize, esc, plural, textBlock, textWidth, wrap } from "./text.js";
import type { Figure, Interval, Refusal } from "./types.js";

export interface TimePoint extends PointFields {
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
  /** Draw this series in checker `colorIndex`'s hue (0 is the current checker); past the fourth hue it is muted. */
  colorIndex?: number;
}

export interface TimeSeriesOptions {
  x: {
    label: string;
    domain: [number, number];
    /**
     * An ordinal axis: one column per category, its width proportional to `weight`. Every point sits at a category's
     * `at`; several points may share a column and are spread across it. Marks and bands between categories are placed
     * between their columns, and a band bound that names a category covers that column.
     */
    categories?: XCategory[];
  };
  y: {
    label: string;
    unit: string;
    domain: [number, number];
    /** `log` places values on a log10 scale and needs a positive domain. Default: linear. */
    scale?: YScale;
    /** Caller-named gridlines, such as check stages, in place of evenly spaced values. */
    ticks?: YTick[];
    /** Recorded goals drawn under the data: a shaded band (target) or a dashed one (stretch), a line when from equals to. */
    targets?: YTarget[];
    /** The label of the strip under the plot that holds verdicts recorded without a value. Default: no value. */
    strip?: string;
  };
  formatX?: (value: number) => string;
  formatY?: (value: number) => string;
  /** Recorded vertical events on the x axis, such as the first pass, a deadline or a death. Listed in the table. */
  marks?: ChartMark[];
  /** Recorded shaded spans on the x axis, such as time after the first pass or idle time; `missing` is hatched. */
  bands?: ChartBand[];
  /** What each point `marker` stands for, such as `{ circle: "check", diamond: "gate" }`, named in the figure's key. */
  markers?: Partial<Record<MarkerShape, string>>;
  /** The wide render's width in pixels, such as the measured container (at least 720, the default). */
  width?: number;
  /** false leaves out the series legend under the plot, for a caller that names its series itself. The verdict key stays. */
  legend?: boolean;
  id?: string;
}

export function timeSeries(rows: TimeSeriesRow[], o: TimeSeriesOptions): Figure | Refusal {
  const id = o.id ?? "time-series";
  const gap = domainGap(o.x.domain) ?? domainGap(o.y.domain) ?? categoriesGap(o.x.categories, o.x.domain) ?? yAxisGap(o.y);
  if (gap) return { id, refused: gap };
  const events = eventsGap(o.marks, o.bands, o.x.domain);
  if (events) return { id, refused: events };
  if (!rows.length || rows.every((row) => !row.points.length)) return { id, refused: "No trajectory observations recorded." };
  if (new Set(rows.map((row) => row.id)).size !== rows.length) return { id, refused: "Duplicate trajectory ids." };
  const columns = o.x.categories?.length ? new Set(o.x.categories.map((c) => c.at)) : null;
  for (const row of rows) {
    if (row.colorIndex !== undefined && (!Number.isInteger(row.colorIndex) || row.colorIndex < 0)) return { id, refused: `${row.label}: a colour index is a whole number of at least 0.` };
    let previous = -Infinity;
    for (const point of row.points) {
      const ordered = columns ? point.x >= previous && columns.has(point.x) : point.x > previous;
      if (!Number.isFinite(point.x) || !ordered || point.x < o.x.domain[0] || point.x > o.x.domain[1]) return { id, refused: columns ? `${row.label}: x values must be categories, in order.` : `${row.label}: x values must be finite, strictly increasing and inside the axis domain.` };
      previous = point.x;
      const problem = scalarGap(point.y, point.interval, point.observations, o.y.domain) ?? logValueGap(point.y, o.y.scale) ?? logValueGap(point.interval?.lower ?? null, o.y.scale) ?? pointFieldsGap(point);
      if (problem) return { id, refused: `${row.label} at ${point.x}: ${problem}` };
    }
  }
  const category = new Map((o.x.categories ?? []).map((c) => [c.at, c.label]));
  const xLabel = (x: number) => o.formatX ? o.formatX(x) : category.get(x) ?? String(x);
  const yLabel = (y: number) => scalarLabel(y, o.y.unit, o.formatY);
  const grid = yGridlines(o.y, yLabel);
  const flat = rows.flatMap((row) => row.points.map((point) => ({ row, point })));
  const measured = flat.filter(({ point }) => point.y !== null);
  const stripped = flat.filter(({ point }) => point.y === null && point.verdict !== undefined);
  const recorded = hasPointFields(flat.map(({ point }) => point));
  const marks = o.marks ?? [], bands = o.bands ?? [];
  const hasEvents = marks.length + bands.length > 0;
  const groups = bands.some((band) => band.kind === "group");
  const stripName = o.y.strip?.trim() || "no value";
  // Keep 32px for the legend stroke/offset and at least 32px for its text.
  if (axisGutter(grid) >= NARROW - 24 - 64) return { id, refused: "Formatted y-axis labels leave no room for the phone chart. Use a shorter formatter or unit." };
  if (stripped.length && axisGutter(grid, stripName) >= NARROW - 24 - 64) return { id, refused: "The strip name leaves no room for the phone chart. Use a shorter y.strip." };
  const valueText = (point: TimePoint) => point.y !== null ? yLabel(point.y) : point.verdict !== undefined ? `${stripName} (${VERDICT_WORD[point.verdict]})` : "not measured";
  const facts = (row: TimeSeriesRow, point: TimePoint) => [
    row.label, `${o.x.label}: ${xLabel(point.x)}`, `${o.y.label}: ${valueText(point)}`,
    ...(point.label ? [point.label] : []),
    ...pointFacts(point),
    ...(point.observations || !hasPointFields([point]) ? [observationLabel(point.observations)] : []),
    ...(point.interval ? [`Interval: ${scalarIntervalLabel(point.interval, o.y.unit, o.formatY)}`] : []),
    ...(point.annotation ? [point.annotation] : []),
  ];
  const head = [{ label: "Setup" }, { label: o.x.label, numeric: true }, { label: o.y.label, numeric: true }, { label: "Observations" }, { label: "Recorded interval" }, { label: "Recorded annotation" }, ...(recorded ? [{ label: "Label" }, ...POINT_COLUMNS] : [])];
  const cells = (row: TimeSeriesRow, point: TimePoint) => [row.label, xLabel(point.x), point.y === null ? (point.verdict !== undefined ? `${stripName} (${VERDICT_WORD[point.verdict]})` : "not measured") : yLabel(point.y), observationLabel(point.observations), scalarIntervalLabel(point.interval, o.y.unit, o.formatY), point.annotation ?? "", ...(recorded ? [point.label ?? "", ...pointCells(point)] : [])];
  return {
    id,
    finding: `${capitalize(o.y.label)} by ${o.x.label}.`,
    lede: `${measured.length} of ${flat.length} positions have a recorded value.${stripped.length ? ` ${stripped.length} recorded ${plural(stripped.length, "verdict")} without a value ${stripped.length === 1 ? "sits" : "sit"} in the strip under the plot.` : ""}`,
    read: `Points show recorded values. Lines connect adjacent measured positions; missing positions break the line. Whiskers show recorded intervals.${recorded ? " A filled mark is a pass, an outline a fail, a dashed outline undecided; * is not comparable with the goal and ? of unknown comparability; ×n counts the recorded rows a mark stands for." : ""}${stripped.length ? ` Hatched squares under the plot are verdicts recorded without a value (${stripName}).` : ""}${o.y.targets?.length ? " Shaded bands are recorded targets; dashed bands are stretch targets." : ""}${groups ? " Brackets above the plot group positions, such as one run's releases." : ""}${hasEvents ? ` ${EVENTS_READ}` : ""}`,
    svg: { wide: plot(rows, o, wideWidth(o.width), xLabel, yLabel, grid, facts, stripName), narrow: plot(rows, o, NARROW, xLabel, yLabel, grid, facts, stripName), interactive: true },
    table: table(`${capitalize(o.y.label)} by ${o.x.label}`, head, flat.map(({ row, point }) => cells(row, point))).replace('class="tgc-table"', 'class="tgc-table tgc-scalar-table"') + targetsTable(o.y.targets ?? [], yLabel) + eventsTable(marks, bands, o.x.label, xLabel),
    note: { method: "Recorded scalar observations. Missing positions are not interpolated; no uncertainty or statistical comparison is inferred.", n: "Observation counts are recorded separately at each position.", exclusions: [
      ...flat.filter(({ point }) => point.y === null).map(({ row, point }) => `${row.label}, ${o.x.label} ${xLabel(point.x)}: ${point.verdict !== undefined ? `${VERDICT_WORD[point.verdict]}${point.count && point.count > 1 ? ` ×${point.count}` : ""}, no value` : "not measured"}.`),
      ...bands.filter((band) => band.kind === "missing").map((band) => `${band.label}: no data from ${o.x.label} ${xLabel(band.from)} to ${xLabel(band.to)}.`),
    ] },
  };
}

function plot(rows: TimeSeriesRow[], o: TimeSeriesOptions, width: number, xLabel: (x: number) => string, yLabel: (y: number) => string, grid: YTick[], facts: (row: TimeSeriesRow, point: TimePoint) => string[], stripName: string): string {
  const strip = rows.some((row) => row.points.some((point) => point.y === null && point.verdict !== undefined)) ? 24 : 0;
  // Unit-bearing labels need their measured width, including monospace fallback; the strip's name sits in the same gutter.
  const left = axisGutter(grid, strip ? stripName : undefined);
  const right = width - 24;
  const axis = xAxis(o.x.domain, o.x.categories, left, right);
  const px = axis.px;
  // Mark labels take rows above the plot, so they never sit on the data.
  const labelRows = markLabelRows(o.marks ?? [], px, left, right);
  const top = 36 + (labelRows ? labelRows * 14 + 2 : 0) + groupRowHeight(o.bands), bottom = top + 224;
  const py = yScale(o.y.domain, o.y.scale, top, bottom);
  let marks = text(left, 18, o.y.label, { cls: "tgc-ink-muted" });
  for (const [i, tick] of grid.entries()) {
    marks += line(left, py(tick.at), right, py(tick.at), i === 0 && !o.y.ticks?.length ? "tgc-axis" : "tgc-gridline") + text(left - 8, py(tick.at) + 4, tick.label, { anchor: "end", cls: "tgc-ink-muted tgc-num", size: 12 });
  }
  if (o.y.ticks?.length) marks += line(left, bottom, right, bottom, "tgc-axis");
  marks += drawTargets(o.y.targets ?? [], py, left, right, yLabel);
  const recordedXs = [...new Set(rows.flatMap((row) => row.points.map((point) => point.x)))].sort((a, b) => a - b);
  // On an ordinal axis only full-width columns are labelled; a compressed run is named by its group bracket.
  const full = (o.x.categories ?? []).filter((c) => (c.weight ?? 1) >= 1).map((c) => c.at);
  const xs = (axis.ats ? (full.length ? full : axis.ats) : recordedXs).filter((x) => xLabel(x) !== "");
  let turn = 0;
  if (axis.ats) {
    const fit = columnLabelFit(xs.map(xLabel), Math.min(...xs.map((x) => axis.column(x)!)), 12);
    turn = fit.extra;
    marks += columnLabels(xs, px, fit.fit, left, right, width, xLabel, 12, bottom + strip + 20);
  } else for (const x of xTicks(xs, px, left, right, width, xLabel)) marks += text(px(x), bottom + strip + 20, xLabel(x), { anchor: "middle", cls: "tgc-ink-muted tgc-num" });
  marks += text((left + right) / 2, bottom + strip + turn + 43, o.x.label, { anchor: "middle", cls: "tgc-ink-muted" });
  marks += drawBands(o.bands ?? [], px, top, bottom, xLabel, undefined, axis.extent);
  marks += drawGroups(o.bands ?? [], axis.extent, top, bottom, left, right, xLabel);
  if (strip) marks += text(left - 8, bottom + 16, stripName, { anchor: "end", cls: "tgc-ink-muted", size: 11 }) + line(left, bottom + strip, right, bottom + strip, "tgc-gridline");
  // Several points in one column (a check and a gate, two checkers) are spread across it in input order.
  const spread = (inStrip: boolean) => {
    const byX = new Map<number, Array<TimePoint>>();
    for (const row of rows) for (const point of row.points) if ((point.y === null) === inStrip && (!inStrip || point.verdict !== undefined)) byX.set(point.x, [...(byX.get(point.x) ?? []), point]);
    const at = new Map<TimePoint, number>();
    for (const [x, list] of byX) {
      const room = axis.column(x);
      const step = room === null ? 0 : Math.min(10, room / (list.length + 1));
      list.forEach((point, k) => at.set(point, px(x) + (k - (list.length - 1) / 2) * step));
    }
    return at;
  };
  const plotX = spread(false), stripX = spread(true);
  let legendY = bottom + strip + turn + 72;
  let points = "", tips = "", rules = "";
  // Badges are placed after every mark, so a badge never covers a mark drawn later.
  const placed: Array<[number, number, number, number]> = [];
  const pending: Array<{ x: number; y: number; r: number; point: TimePoint }> = [];
  let pointId = 0;
  const legend = new Set<string>();
  for (const [seriesIndex, row] of rows.entries()) {
    const ord = row.colorIndex ?? seriesIndex;
    const dash = ord === 0 ? "" : `${2 + ord * 2} 3`;
    const group = checkerClass(row.colorIndex);
    const wrapSeries = (inner: string) => group ? `<g class="${group}">${inner}</g>` : inner;
    let segment: Array<[number, number]> = [];
    let lines = "";
    const flush = () => { if (segment.length > 1) lines += `<g data-series="${esc(row.id)}" style="stroke-dasharray:${dash}">${polyline(segment, "tgc-series-line")}</g>`; segment = []; };
    let own = "";
    for (const point of row.points) {
      if (point.y === null) {
        flush();
        if (point.verdict === undefined) continue;
        // A square fits its column, so a compressed run of many tags stays a readable strip.
        const x = stripX.get(point)!, y = bottom + 12, size = Math.min(9, Math.max(3, (axis.column(point.x) ?? 11) - 2));
        const title = facts(row, point).join(" · ");
        own += titled(title, `<g class="tgc-strip-observation" data-strip="${esc(row.id)}" tabindex="0" role="img" aria-label="${esc(title)}">${rect(x - 8, y - 8, 16, 16, "tgc-series-hit")}${stripMark(x, y, size, point)}</g>`);
        placed.push([x - size / 2, x + size / 2, y - size / 2, y + size / 2]);
        pending.push({ x, y, r: size / 2, point });
        continue;
      }
      const x = plotX.get(point)!, y = py(point.y);
      segment.push([x, y]);
      const pointFacts = facts(row, point);
      const key = pointId++;
      const recorded = hasPointFields([point]) || point.marker !== undefined;
      const r = recorded ? 4.5 : 3.5;
      const shape = point.marker ?? (ord === 0 ? "circle" : MARKER_SHAPES[ord % MARKER_SHAPES.length]!);
      // The first series keeps a circle; later series add a shape as well as a dash, so identity survives without colour.
      let dot = circle(x, y, 10, "tgc-series-hit") + (recorded ? pointMark(x, y, shape, r, point) : seriesIndex === 0 && ord === 0 ? circle(x, y, 3.5, "tgc-series-point") : `<path class="tgc-series-point" d="${markerPath(shape, x, y, 3.5)}"/>`);
      if (point.interval) dot += line(x, py(point.interval.lower), x, py(point.interval.upper), "tgc-whisker") + line(x - 4, py(point.interval.lower), x + 4, py(point.interval.lower), "tgc-whisker") + line(x - 4, py(point.interval.upper), x + 4, py(point.interval.upper), "tgc-whisker");
      own += `<g class="tgc-series-observation" data-point="${key}" tabindex="0" role="img" aria-label="${esc(pointFacts.join(" · "))}"><title>${esc(pointFacts.join(" · "))}</title>${dot}</g>`;
      placed.push([x - r, x + r, y - r, y + r]);
      if (recorded) pending.push({ x, y, r, point });
      const tipWidth = Math.min(280, width - 24), tipX = Math.max(12, Math.min(width - tipWidth - 12, x - tipWidth / 2));
      const tipLines = pointFacts.flatMap((fact) => wrap(fact, tipWidth - 24, 12, "sans", 8).lines);
      tips += `<g class="tgc-series-tip" data-series-tip="${key}" aria-hidden="true">${rect(tipX, top, tipWidth, tipLines.length * 17 + 24, "tgc-tip-bg", 'rx="7"')}${textBlock(tipLines, tipX + 12, top + 20, 17, 'class="tgc-tip-ink" font-size="12"')}</g>`;
      rules += `.tgc-trajectories:has([data-point="${key}"]:hover) [data-series-tip="${key}"],.tgc-trajectories:not(:has(.tgc-series-observation:hover)):has([data-point="${key}"]:focus-visible) [data-series-tip="${key}"]{opacity:1}`;
    }
    flush();
    marks += wrapSeries(lines);
    points += wrapSeries(own);
    const legendKey = `${row.label}\u0000${row.colorIndex ?? `s${seriesIndex}`}`;
    if (o.legend === false || legend.has(legendKey)) continue;
    legend.add(legendKey);
    const label = wrap(row.label, right - left - 32, 12, "sans", 8);
    marks += wrapSeries(`<g style="stroke-dasharray:${dash}">${line(left, legendY - 4, left + 24, legendY - 4, "tgc-series-line")}</g>` + (rows.length > 1 ? `<path class="tgc-series-key" d="${markerPath(row.colorIndex !== undefined ? "circle" : MARKER_SHAPES[ord % MARKER_SHAPES.length]!, left + 12, legendY - 4, 3.5)}"/>` : "")) + textBlock(label.lines, left + 32, legendY, 16, 'class="tgc-ink" font-size="12"');
    legendY += label.lines.length * 16 + 8;
  }
  const badges = placeBadges(pending, placed, left - 4, width - 2);
  const key = verdictKey(rows.flatMap((row) => row.points), o.markers, left, legendY + 4, right - left);
  legendY += key.height;
  marks += key.svg;
  // Rules and heads stop above the group brackets, so a ruling's head never sits on a solved mark.
  const events = drawMarks(o.marks ?? [], px, top - groupRowHeight(o.bands), bottom, left, right, xLabel, 22);
  return `<svg class="tgc-svg tgc-trajectories" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${legendY + 12}" viewBox="0 0 ${width} ${legendY + 12}" role="group" aria-label="${esc(o.y.label)} by ${esc(o.x.label)}"><style>${rules}</style>${marks}${events}${points}${badges}${tips}</svg>`;
}

function axisGutter(ticks: readonly YTick[], stripName?: string): number {
  return Math.max(64, ...ticks.map((tick) => Math.ceil(textWidth(tick.label, 12, "mono")) + 20), stripName ? Math.ceil(textWidth(stripName, 11)) + 14 : 0);
}
