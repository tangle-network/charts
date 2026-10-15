/**
 * One small trajectory per arm on shared axes. A panel without data is a
 * hatched "no data: <reason>" panel, never a zero line; a panel that stopped
 * early ends at its recorded end mark.
 */
import { type ChartMark, drawMarks, eventsGap, eventsTable, type MarkKind } from "./events.js";
import { domainGap, observationLabel, scalarGap, scalarLabel } from "./scalar.js";
import { circle, hatch, line, NARROW, polyline, svgRoot, text, titled, WIDE } from "./svg.js";
import { table } from "./table.js";
import { capitalize, esc, plural, textBlock, textWidth, wrap } from "./text.js";
import type { TimePoint } from "./time-series.js";
import type { Figure, Refusal } from "./types.js";

export interface MultiplePanel {
  id: string;
  label: string;
  /** The panel's recorded unit. Every panel must match the figure's y unit. */
  unit?: string;
  /** The panel's own y domain; required when only the x axis is shared. */
  domain?: [number, number];
  points?: TimePoint[];
  /** The arm produced no data. The panel is hatched and names the reason. */
  missing?: { why: string; detail?: string };
  /** The arm stopped before the window closed, for example `{ at, kind: "died" }`. */
  end?: { at: number; kind: MarkKind; label?: string };
  marks?: ChartMark[];
}

export interface SmallMultiplesOptions {
  x: { label: string; domain: [number, number] };
  y: { label: string; unit: string; domain: [number, number] };
  /** `both`: every panel on one x and y domain. `x`: one x domain; each panel supplies its own y domain. */
  shared: "both" | "x";
  /** What one panel is, for the lede: "3 of 4 arms have data". Default: panel. */
  noun?: string;
  formatX?: (value: number) => string;
  formatY?: (value: number) => string;
  id?: string;
}

export function smallMultiples(panels: MultiplePanel[], o: SmallMultiplesOptions): Figure | Refusal {
  const id = o.id ?? "small-multiples";
  if (o.shared !== "both" && o.shared !== "x") return { id, refused: "Small multiples need shared axes: both or x." };
  const axis = domainGap(o.x.domain) ?? domainGap(o.y.domain);
  if (axis) return { id, refused: axis };
  if (!o.y.unit?.trim()) return { id, refused: "Small multiples need a y unit." };
  if (!panels.length) return { id, refused: "No panels recorded." };
  if (new Set(panels.map((p) => p.id)).size !== panels.length) return { id, refused: "Duplicate panel ids." };
  for (const panel of panels) {
    if (panel.unit !== undefined && panel.unit !== o.y.unit) return { id, refused: `Mixed units: ${panel.label} records ${panel.unit}, the figure draws ${o.y.unit}.` };
    if (panel.missing) {
      if (!panel.missing.why?.trim()) return { id, refused: `${panel.label}: a missing panel needs its reason.` };
      if (panel.points?.length || panel.end) return { id, refused: `${panel.label}: a missing panel cannot also carry points or an end.` };
      continue;
    }
    if (!panel.points?.length) return { id, refused: `${panel.label}: a panel needs points or a missing reason.` };
    const domain = domainOf(panel, o);
    if (!domain) return { id, refused: `${panel.label}: an x-only shared figure needs each panel's y domain.` };
    const own = domainGap(domain);
    if (own) return { id, refused: `${panel.label}: ${own}` };
    let previous = -Infinity;
    for (const point of panel.points) {
      if (!Number.isFinite(point.x) || point.x <= previous || point.x < o.x.domain[0] || point.x > o.x.domain[1]) return { id, refused: `${panel.label}: x values must be finite, strictly increasing and inside the shared domain.` };
      previous = point.x;
      const problem = scalarGap(point.y, point.interval, point.observations, domain);
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
  const xLabel = (x: number) => o.formatX ? o.formatX(x) : String(x);
  const yLabel = (y: number) => scalarLabel(y, o.y.unit, o.formatY);
  const withData = panels.filter((p) => !p.missing), ended = withData.filter((p) => p.end);
  const marksOf = (p: MultiplePanel): ChartMark[] => [...(p.marks ?? []), ...(p.end ? [{ at: p.end.at, kind: p.end.kind, label: p.end.label ?? p.end.kind }] : [])];
  const rows = panels.flatMap((p) => p.missing
    ? [[p.label, "", `no data: ${p.missing.why}`, p.missing.detail ?? ""]]
    : p.points!.map((pt) => [p.label, xLabel(pt.x), pt.y === null ? "not measured" : yLabel(pt.y), observationLabel(pt.observations)]));
  const events = panels.flatMap((p) => marksOf(p).map((m) => ({ ...m, label: `${p.label}: ${m.label}` })));
  return {
    id,
    finding: `${capitalize(o.y.label)} by ${o.x.label}, one panel per ${noun}, on ${o.shared === "both" ? "shared axes" : "a shared x axis"}.`,
    lede: `${withData.length} of ${panels.length} ${plural(panels.length, noun)} have data${ended.length ? `; ${ended.length} ended before the window closed` : ""}.`,
    read: `Each panel is one ${noun} on ${o.shared === "both" ? "the same x and y axes" : "the same x axis; y axes differ per panel"}. Hatched panels have no data and name the reason. A vertical rule with a cross marks where a line ended.`,
    svg: { wide: draw(panels, o, WIDE, xLabel, yLabel, marksOf), narrow: draw(panels, o, NARROW, xLabel, yLabel, marksOf) },
    table: table(`${capitalize(o.y.label)} by ${o.x.label} and ${noun}`, [{ label: capitalize(noun) }, { label: o.x.label, numeric: true }, { label: o.y.label, numeric: true }, { label: "Observations or detail" }], rows) + eventsTable(events, [], o.x.label, xLabel),
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

function draw(panels: MultiplePanel[], o: SmallMultiplesOptions, width: number, xLabel: (x: number) => string, yLabel: (y: number) => string, marksOf: (p: MultiplePanel) => ChartMark[]): string {
  const cols = width === NARROW ? 1 : Math.min(3, panels.length), gap = 16;
  const panelW = (width - gap * (cols - 1)) / cols, panelH = width === NARROW ? 150 : 170;
  let body = "";
  panels.forEach((panel, i) => {
    const ox = (i % cols) * (panelW + gap), oy = Math.floor(i / cols) * (panelH + gap);
    const domain = domainOf(panel, o) ?? o.y.domain;
    const left = ox + Math.max(...[domain[0], domain[1]].map((v) => Math.ceil(textWidth(yLabel(v), 10, "mono")) + 10), 40), right = ox + panelW - 6;
    const top = oy + 40, bottom = oy + panelH - 24;
    const px = (x: number) => left + (x - o.x.domain[0]) / (o.x.domain[1] - o.x.domain[0]) * (right - left);
    const py = (y: number) => bottom - (y - domain[0]) / (domain[1] - domain[0]) * (bottom - top);
    const name = wrap(panel.label, panelW - 4, 12, "sans-semibold", 1);
    body += titled(panel.label, text(ox + 2, oy + 14, name.lines[0]!, { size: 12, weight: 600 }));
    if (panel.missing) {
      body += `<g data-panel="${esc(panel.id)}" data-missing="true">${hatch(ox, top - 12, panelW, bottom - top + 12, "tgc-panel-missing")}`;
      const why = wrap(`no data: ${panel.missing.why}`, panelW - 24, 12, "sans", 3);
      body += titled(`${panel.label}: no data: ${panel.missing.why}${panel.missing.detail ? ` (${panel.missing.detail})` : ""}`, textBlock(why.lines, ox + panelW / 2, (top + bottom) / 2 - (why.lines.length - 1) * 8, 16, 'class="tgc-mark-label" font-size="12" text-anchor="middle"'));
      body += "</g>";
      return;
    }
    body += `<g data-panel="${esc(panel.id)}">`;
    for (const [j, y] of [domain[0], (domain[0] + domain[1]) / 2, domain[1]].entries()) {
      body += line(left, py(y), right, py(y), j === 0 ? "tgc-axis" : "tgc-gridline");
      if (j !== 1) body += text(left - 6, py(y) + 4, yLabel(y), { size: 10, anchor: "end", cls: "tgc-ink-muted tgc-num" });
    }
    body += text(left, bottom + 16, xLabel(o.x.domain[0]), { size: 10, cls: "tgc-ink-muted tgc-num" }) + text(right, bottom + 16, xLabel(o.x.domain[1]), { size: 10, anchor: "end", cls: "tgc-ink-muted tgc-num" });
    let segment: Array<[number, number]> = [];
    const flush = () => { if (segment.length > 1) body += polyline(segment, "tgc-series-line"); segment = []; };
    for (const point of panel.points!) {
      if (point.y === null) { flush(); continue; }
      segment.push([px(point.x), py(point.y)]);
      body += titled(`${panel.label} · ${o.x.label} ${xLabel(point.x)} · ${yLabel(point.y)} · ${observationLabel(point.observations)}`, circle(px(point.x), py(point.y), 2.5, "tgc-series-point"));
    }
    flush();
    body += drawMarks(marksOf(panel), px, top - 12, bottom, left, right, xLabel);
    body += "</g>";
  });
  const rows = Math.ceil(panels.length / cols);
  return svgRoot(width, rows * panelH + (rows - 1) * gap, body);
}
