/**
 * One small trajectory per arm on shared axes. A panel without data is a
 * hatched "no data: <reason>" panel, never a zero line; a panel that stopped
 * early ends at its recorded end mark.
 */
import { categoriesGap, drawTargets, logValueGap, targetKey, targetsTable, type XCategory, xAxis, xTicks, type YScale, yAxisGap, type YTarget, yScale } from "./axis.js";
import { type ChartMark, drawMarks, eventsGap, eventsTable, type MarkKind } from "./events.js";
import { hasPointFields, placeBadges, POINT_COLUMNS, pointCells, pointFacts, pointFieldsGap, pointMark, verdictKey } from "./points.js";
import { domainGap, observationLabel, scalarGap, scalarLabel } from "./scalar.js";
import { logTicks } from "./scale.js";
import { circle, hatch, line, type MarkerShape, NARROW, polyline, svgRoot, text, titled, WIDE } from "./svg.js";
import { table } from "./table.js";
import { capitalize, esc, plural, textBlock, textWidth, wrap } from "./text.js";
import type { TimePoint } from "./time-series.js";
import type { Figure, Refusal } from "./types.js";

export interface MultiplePanel {
  id: string;
  label: string;
  /**
   * The panel's recorded unit. With `shared: "both"` it must match the figure's y unit; with `shared: "x"` each panel
   * may record its own (a rate, a size, a time), and the figure's y unit is the default for panels that set none.
   */
  unit?: string;
  /** `shared: "x"` only: formats this panel's y values in place of the figure's `formatY`. */
  format?: (value: number) => string;
  /** The panel's own y domain; required when only the x axis is shared. */
  domain?: [number, number];
  /** `log` places values on a log10 scale and needs a positive domain. Default: linear. */
  scale?: YScale;
  /** Recorded goals drawn under the panel's data, such as a paper's bar: a shaded band, dashed for a stretch. */
  targets?: YTarget[];
  points?: TimePoint[];
  /** The arm produced no data. The panel is hatched and names the reason. */
  missing?: { why: string; detail?: string };
  /** The arm stopped before the window closed, for example `{ at, kind: "died" }`. */
  end?: { at: number; kind: MarkKind; label?: string };
  marks?: ChartMark[];
}

export interface SmallMultiplesOptions {
  /** `categories` makes x ordinal, as in `timeSeries`: every panel shares the same columns. */
  x: { label: string; domain: [number, number]; categories?: XCategory[] };
  y: { label: string; unit: string; domain: [number, number] };
  /** `both`: every panel on one x and y domain. `x`: one x domain; each panel supplies its own y domain. */
  shared: "both" | "x";
  /** What one panel is, for the lede: "3 of 4 arms have data". Default: panel. */
  noun?: string;
  /** Panels per row in the wide render (default 3); the phone render is one column. */
  columns?: number;
  /** false draws points without joining them, for values that are not one trajectory. Default true. */
  connect?: boolean;
  /** What each point `marker` stands for, such as `{ circle: "check", diamond: "gate" }`, named in the figure's key. */
  markers?: Partial<Record<MarkerShape, string>>;
  formatX?: (value: number) => string;
  formatY?: (value: number) => string;
  id?: string;
}

export function smallMultiples(panels: MultiplePanel[], o: SmallMultiplesOptions): Figure | Refusal {
  const id = o.id ?? "small-multiples";
  if (o.shared !== "both" && o.shared !== "x") return { id, refused: "Small multiples need shared axes: both or x." };
  const axis = domainGap(o.x.domain) ?? domainGap(o.y.domain) ?? categoriesGap(o.x.categories, o.x.domain);
  if (axis) return { id, refused: axis };
  if (o.columns !== undefined && (!Number.isInteger(o.columns) || o.columns < 1)) return { id, refused: "Columns must be a whole number of at least 1." };
  const columns = o.x.categories?.length ? new Set(o.x.categories.map((c) => c.at)) : null;
  if (!panels.length) return { id, refused: "No panels recorded." };
  if (new Set(panels.map((p) => p.id)).size !== panels.length) return { id, refused: "Duplicate panel ids." };
  const ownUnits = o.shared === "x";
  if (!o.y.unit?.trim() && !(ownUnits && panels.every((p) => p.unit?.trim()))) return { id, refused: "Small multiples need a y unit." };
  for (const panel of panels) {
    if (!ownUnits && panel.unit !== undefined && panel.unit !== o.y.unit) return { id, refused: `Mixed units: ${panel.label} records ${panel.unit}, the figure draws ${o.y.unit}.` };
    if (ownUnits && panel.unit !== undefined && !panel.unit.trim()) return { id, refused: `${panel.label}: a panel unit needs text.` };
    if (panel.format !== undefined && !ownUnits) return { id, refused: `${panel.label}: a panel format needs shared: "x"; panels on a shared y axis use formatY.` };
    if (panel.format !== undefined && typeof panel.format !== "function") return { id, refused: `${panel.label}: a panel format is a function.` };
    if (panel.missing) {
      if (!panel.missing.why?.trim()) return { id, refused: `${panel.label}: a missing panel needs its reason.` };
      if (panel.points?.length || panel.end) return { id, refused: `${panel.label}: a missing panel cannot also carry points or an end.` };
      continue;
    }
    if (!panel.points?.length) return { id, refused: `${panel.label}: a panel needs points or a missing reason.` };
    const domain = domainOf(panel, o);
    if (!domain) return { id, refused: `${panel.label}: an x-only shared figure needs each panel's y domain.` };
    const own = domainGap(domain) ?? yAxisGap({ domain, scale: panel.scale, targets: panel.targets }, panel.label);
    if (own) return { id, refused: `${panel.label}: ${own}` };
    let previous = -Infinity;
    for (const point of panel.points) {
      const ordered = columns ? point.x >= previous && columns.has(point.x) : point.x > previous;
      if (!Number.isFinite(point.x) || !ordered || point.x < o.x.domain[0] || point.x > o.x.domain[1]) return { id, refused: columns ? `${panel.label}: x values must be categories, in order.` : `${panel.label}: x values must be finite, strictly increasing and inside the shared domain.` };
      previous = point.x;
      const problem = scalarGap(point.y, point.interval, point.observations, domain) ?? logValueGap(point.y, panel.scale) ?? pointFieldsGap(point);
      if (problem) return { id, refused: `${panel.label} at ${point.x}: ${problem}` };
    }
    if (panel.end) {
      const endGap = eventsGap([{ at: panel.end.at, kind: panel.end.kind, label: panel.end.label ?? panel.end.kind }], [], o.x.domain);
      if (endGap) return { id, refused: `${panel.label}: ${endGap}` };
      if (previous > panel.end.at) return { id, refused: `${panel.label}: points are recorded after the panel's end.` };
    }
    const markGap = eventsGap(panel.marks, [], o.x.domain);
    if (markGap) return { id, refused: `${panel.label}: ${markGap}` };
  }
  const noun = o.noun?.trim() || "panel";
  const category = new Map((o.x.categories ?? []).map((c) => [c.at, c.label]));
  const xLabel = (x: number) => o.formatX ? o.formatX(x) : category.get(x) ?? String(x);
  const recorded = hasPointFields(panels.flatMap((p) => p.points ?? []));
  const targets = panels.filter((p) => p.targets?.length);
  // Each panel labels its values in its own unit and format when the y axis is not shared.
  const yLabelOf = (p: MultiplePanel) => (y: number) => scalarLabel(y, (ownUnits ? p.unit : undefined) ?? o.y.unit, (ownUnits ? p.format : undefined) ?? o.formatY);
  const withData = panels.filter((p) => !p.missing), ended = withData.filter((p) => p.end);
  const marksOf = (p: MultiplePanel): ChartMark[] => [...(p.marks ?? []), ...(p.end ? [{ at: p.end.at, kind: p.end.kind, label: p.end.label ?? p.end.kind }] : [])];
  const rows = panels.flatMap((p) => p.missing
    ? [[p.label, "", `no data: ${p.missing.why}`, p.missing.detail ?? "", ...(recorded ? ["", "", "", "", "", "", ""] : [])]]
    : p.points!.map((pt) => [p.label, xLabel(pt.x), pt.y === null ? "not measured" : yLabelOf(p)(pt.y), observationLabel(pt.observations), ...(recorded ? [pt.label ?? "", ...pointCells(pt), pt.annotation ?? ""] : [])]));
  const events = panels.flatMap((p) => marksOf(p).map((m) => ({ ...m, label: `${p.label}: ${m.label}` })));
  return {
    id,
    finding: `${capitalize(o.y.label)} by ${o.x.label}, one panel per ${noun}, on ${o.shared === "both" ? "shared axes" : "a shared x axis"}.`,
    lede: `${withData.length} of ${panels.length} ${plural(panels.length, noun)} have data${ended.length ? `; ${ended.length} ended before the window closed` : ""}.`,
    read: `Each panel is one ${noun} on ${o.shared === "both" ? "the same x and y axes" : "the same x axis; y axes differ per panel"}. Hatched panels have no data and name the reason. A vertical rule with a cross marks where a line ended.${recorded ? " A filled mark is a pass, an outline a fail; * is not comparable with the goal and ? of unknown comparability; ✓ marks a solve and ✕ a failing candidate." : ""}${targets.length ? " Shaded bands are recorded targets; dashed bands are stretch targets." : ""}${panels.some((p) => p.scale === "log") ? " Log-scale panels say so in their y labels." : ""}`,
    svg: { wide: draw(panels, o, WIDE, xLabel, yLabelOf, marksOf), narrow: draw(panels, o, NARROW, xLabel, yLabelOf, marksOf) },
    table: table(`${capitalize(o.y.label)} by ${o.x.label} and ${noun}`, [{ label: capitalize(noun) }, { label: o.x.label, numeric: true }, { label: o.y.label, numeric: true }, { label: "Observations or detail" }, ...(recorded ? [{ label: "Label" }, ...POINT_COLUMNS, { label: "Recorded annotation" }] : [])], rows) + targets.map((p) => targetsTable(p.targets!, yLabelOf(p)).replace("<caption>Recorded targets</caption>", `<caption>${esc(p.label)}: recorded targets</caption>`)).join("") + eventsTable(events, [], o.x.label, xLabel),
    note: {
      method: "Recorded values per panel on explicit axis domains. Missing panels and positions are not interpolated or drawn as zero; no ranking is made.",
      n: `${withData.length} of ${panels.length} ${plural(panels.length, noun)} with data.`,
      exclusions: [
        ...panels.filter((p) => p.missing).map((p) => `${p.label}: no data: ${p.missing!.why}${p.missing!.detail ? ` (${p.missing!.detail})` : ""}.`),
        ...ended.map((p) => `${p.label}: ${p.end!.label ?? p.end!.kind} at ${o.x.label} ${xLabel(p.end!.at)}.`),
      ],
    },
  };
}

function domainOf(panel: MultiplePanel, o: SmallMultiplesOptions): [number, number] | null {
  return o.shared === "both" ? o.y.domain : panel.domain ?? null;
}

function draw(panels: MultiplePanel[], o: SmallMultiplesOptions, width: number, xLabel: (x: number) => string, yLabelOf: (p: MultiplePanel) => (y: number) => string, marksOf: (p: MultiplePanel) => ChartMark[]): string {
  const cols = width === NARROW ? 1 : Math.min(o.columns ?? 3, panels.length), gap = 16;
  const panelW = (width - gap * (cols - 1)) / cols, panelH = width === NARROW ? 150 : 170;
  // An ordinal axis labels as many full-width columns as fit; a continuous one its two ends.
  const labelled = (o.x.categories ?? []).filter((c) => xLabel(c.at) !== "" && (c.weight ?? 1) >= 1).map((c) => c.at);
  let body = "";
  panels.forEach((panel, i) => {
    const ox = (i % cols) * (panelW + gap), oy = Math.floor(i / cols) * (panelH + gap);
    const domain = domainOf(panel, o) ?? o.y.domain;
    const yLabel = yLabelOf(panel);
    const log = panel.scale === "log";
    // A log panel labels its powers of ten (or its first and last tick); a linear panel its ends, gridded at the middle.
    const logged = log ? logTicks(domain[0], domain[1]) : [];
    const decades = logged.filter((v) => Number.isInteger(Math.log10(v)));
    const yTicks = log ? (decades.length >= 2 ? decades : logged.length >= 2 ? [logged[0]!, logged.at(-1)!] : [domain[0], domain[1]]) : [domain[0], domain[1]];
    const left = ox + Math.max(...yTicks.map((v) => Math.ceil(textWidth(yLabel(v), 10, "mono")) + 10), 40), right = ox + panelW - 6;
    const top = oy + 40, bottom = oy + panelH - 24;
    const axis = xAxis(o.x.domain, o.x.categories, left, right);
    const px = axis.px;
    const py = yScale(domain, panel.scale, top, bottom);
    const name = wrap(panel.label, panelW - 4 - (log ? 52 : 0), 12, "sans-semibold", 1);
    body += titled(panel.label, text(ox + 2, oy + 14, name.lines[0]!, { size: 12, weight: 600 }));
    if (log) body += text(right, oy + 14, "log scale", { size: 10, anchor: "end", cls: "tgc-ink-muted" });
    if (panel.missing) {
      body += `<g data-panel="${esc(panel.id)}" data-missing="true">${hatch(ox, top - 12, panelW, bottom - top + 12, "tgc-panel-missing")}`;
      const why = wrap(`no data: ${panel.missing.why}`, panelW - 24, 12, "sans", 3);
      body += titled(`${panel.label}: no data: ${panel.missing.why}${panel.missing.detail ? ` (${panel.missing.detail})` : ""}`, textBlock(why.lines, ox + panelW / 2, (top + bottom) / 2 - (why.lines.length - 1) * 8, 16, 'class="tgc-mark-label" font-size="12" text-anchor="middle"'));
      body += "</g>";
      return;
    }
    body += `<g data-panel="${esc(panel.id)}"${log ? ' data-scale="log"' : ""}>`;
    if (log) {
      body += line(left, bottom, right, bottom, "tgc-axis");
      for (const y of yTicks) body += (y === domain[0] ? "" : line(left, py(y), right, py(y), "tgc-gridline")) + text(left - 6, py(y) + 4, yLabel(y), { size: 10, anchor: "end", cls: "tgc-ink-muted tgc-num" });
    } else {
      for (const [j, y] of [domain[0], (domain[0] + domain[1]) / 2, domain[1]].entries()) {
        body += line(left, py(y), right, py(y), j === 0 ? "tgc-axis" : "tgc-gridline");
        if (j !== 1) body += text(left - 6, py(y) + 4, yLabel(y), { size: 10, anchor: "end", cls: "tgc-ink-muted tgc-num" });
      }
    }
    // Bands are named in a key under the title: in a small panel an in-place label would cover the data.
    body += drawTargets(panel.targets ?? [], py, left, right, yLabel, false) + targetKey(panel.targets ?? [], ox + 2, oy + 30, panelW - 4);
    if (labelled.length) for (const x of xTicks(labelled, px, left, right, right + 4, xLabel, 10)) body += text(px(x), bottom + 16, xLabel(x), { size: 10, anchor: "middle", cls: "tgc-ink-muted tgc-num" });
    else body += text(left, bottom + 16, xLabel(o.x.domain[0]), { size: 10, cls: "tgc-ink-muted tgc-num" }) + text(right, bottom + 16, xLabel(o.x.domain[1]), { size: 10, anchor: "end", cls: "tgc-ink-muted tgc-num" });
    // Points sharing a column are spread across it in input order.
    const shared = new Map<number, TimePoint[]>();
    for (const point of panel.points!) if (point.y !== null) shared.set(point.x, [...(shared.get(point.x) ?? []), point]);
    const xOf = (point: TimePoint) => {
      const list = shared.get(point.x)!, room = axis.column(point.x);
      const step = room === null ? 0 : Math.min(9, room / (list.length + 1));
      return px(point.x) + (list.indexOf(point) - (list.length - 1) / 2) * step;
    };
    const placed: Array<[number, number, number, number]> = [];
    const pending: Array<{ x: number; y: number; r: number; point: TimePoint }> = [];
    let segment: Array<[number, number]> = [];
    const flush = () => { if (segment.length > 1 && o.connect !== false) body += polyline(segment, "tgc-series-line"); segment = []; };
    for (const point of panel.points!) {
      if (point.y === null) { flush(); continue; }
      const x = xOf(point), y = py(point.y);
      segment.push([x, y]);
      if (!hasPointFields([point]) && point.marker === undefined) {
        body += titled(`${panel.label} · ${o.x.label} ${xLabel(point.x)} · ${yLabel(point.y)} · ${observationLabel(point.observations)}`, circle(x, y, 2.5, "tgc-series-point"));
        continue;
      }
      const facts = [panel.label, `${o.x.label} ${xLabel(point.x)}`, yLabel(point.y), ...(point.label ? [point.label] : []), ...pointFacts(point), ...(point.observations ? [observationLabel(point.observations)] : []), ...(point.annotation ? [point.annotation] : [])];
      body += titled(facts.join(" · "), `<g data-point-verdict="${point.verdict ?? "none"}">${circle(x, y, 9, "tgc-series-hit")}${pointMark(x, y, point.marker ?? "circle", 4, point)}</g>`);
      placed.push([x - 4, x + 4, y - 4, y + 4]);
      pending.push({ x, y, r: 4, point });
    }
    flush();
    body += placeBadges(pending, placed, left - 4, right + 4);
    body += drawMarks(marksOf(panel), px, top - 12, bottom, left, right, xLabel);
    body += "</g>";
  });
  const rows = Math.ceil(panels.length / cols), height = rows * panelH + (rows - 1) * gap;
  const key = verdictKey(panels.flatMap((p) => p.points ?? []), o.markers, 2, height + 4, width - 4);
  return svgRoot(width, height + key.height, body + key.svg);
}
