/** Forest rows: each row draws p50 and p95 with their confidence bands, prints both and n, and hovers as one target. */
import type { RateIdentity } from "./identity.js";
import { linearTicks, logTicks } from "./scale.js";
import { circle, line, NARROW, rect, text, tipBox, tipWidth } from "./svg.js";
import { esc, textWidth, wrap } from "./text.js";
import { image } from "./vertical-columns.js";

export type Band = readonly [number, number];

export interface PlotRow {
  id: string;
  label: string;
  value: number;
  valueBand?: Band;
  /** The p95; null draws no diamond. */
  spread: number | null;
  spreadBand?: Band;
  n: number;
  /** Hover lines; the first is the row's name and a `key: value` line aligns. */
  facts: string[];
  status?: "pass" | "breach";
}

export interface RowLayout {
  measure: string;
  scale: "log" | "linear";
  min: number;
  max: number;
  format: (value: number) => string;
  identities?: Readonly<Record<string, RateIdentity>>;
  threshold?: number;
}

const SIZE = 12;

export function drawRows(rows: PlotRow[], o: RowLayout, width: number): string {
  const linear = o.scale === "linear", rowH = width === NARROW ? 28 : 24, top = 22, bottom = top + rows.length * rowH;
  let right = width - 6;
  const columns = [
    { head: "n", key: "", value: (r: PlotRow) => String(r.n) },
    { head: "p95", key: "p95", value: (r: PlotRow) => (r.spread === null ? "–" : o.format(r.spread)) },
    { head: "p50", key: "p50", value: (r: PlotRow) => o.format(r.value) },
  ].map((c) => {
    const room = Math.max(textWidth(c.head, SIZE, "sans") + (c.key ? 14 : 0), ...rows.map((r) => textWidth(c.value(r), SIZE, "mono")));
    const x = right;
    right -= room + 12;
    return { ...c, x };
  });
  const logoW = rows.some((r) => o.identities?.[r.id]?.model) ? 22 : 0;
  const nameW = Math.min(Math.max(...rows.map((r) => textWidth(r.label, SIZE, "sans"))) + 6, width * 0.34);
  const left = 6 + logoW + nameW + 10, plotW = right - left - 2;
  const scale = (value: number) => left + (linear ? value / o.max : Math.log(value / o.min) / Math.log(o.max / o.min)) * plotW;
  const band = ([lo, hi]: Band, cls: string, cy: number) => rect(scale(Math.max(lo, o.min)), cy - 4, Math.max(2, scale(Math.min(hi, o.max)) - scale(Math.max(lo, o.min))), 8, cls, 'rx="4"');
  let axis = "", body = "", tips = "", rules = "", lastTick = -Infinity;
  for (const tick of linear ? linearTicks(0, o.max, 3) : logTicks(o.min, o.max)) {
    const x = scale(tick), label = o.format(tick), half = textWidth(label, SIZE, "mono") / 2;
    if (x - half < lastTick + 8 || x + half > right) continue;
    lastTick = x + half;
    axis += line(x, top, x, bottom, "tgc-gridline") + text(x, 14, label, { size: SIZE, cls: "tgc-ink-muted tgc-num", anchor: "middle" });
  }
  for (const c of columns) {
    axis += text(c.x, 14, c.head, { size: SIZE, cls: "tgc-ink-muted", anchor: "end" });
    const keyX = c.x - textWidth(c.head, SIZE, "sans") - 9;
    if (c.key === "p50") axis += circle(keyX, 10, 4, "tgc-row-mark");
    if (c.key === "p95") axis += `<path class="tgc-row-p95" d="M${keyX} 5.5l4.5 4.5l-4.5 4.5l-4.5 -4.5z"/>`;
  }
  if (o.threshold !== undefined) axis += line(scale(o.threshold), top - 6, scale(o.threshold), bottom, "tgc-threshold");
  rows.forEach((r, i) => {
    const y = top + i * rowH, cy = y + rowH / 2, mark = o.identities?.[r.id]?.model;
    let marks = rect(0, y + 1, width, rowH - 2, "tgc-row-hit", 'rx="4"');
    if (mark) marks += image(mark, 6, cy - 8, 16);
    marks += text(6 + logoW, cy + 4, wrap(r.label, nameW, SIZE, "sans", 1).lines[0]!, { size: SIZE });
    if (r.spread !== null) marks += line(scale(r.value), cy, scale(r.spread), cy, "tgc-row-link");
    if (r.spreadBand) marks += band(r.spreadBand, "tgc-row-band-p95", cy);
    if (r.valueBand) marks += band(r.valueBand, "tgc-row-band", cy);
    if (r.spread !== null) marks += `<path class="tgc-row-p95" d="M${scale(r.spread)} ${cy - 4.5}l4.5 4.5l-4.5 4.5l-4.5 -4.5z"/>`;
    marks += circle(scale(r.value), cy, 4, r.status ? `tgc-range-dot-${r.status}` : "tgc-row-mark");
    for (const [k, c] of columns.entries()) marks += text(c.x, cy + 4, c.value(r), { size: SIZE, weight: k === 2 ? 600 : 400, cls: "tgc-ink tgc-num", anchor: "end" });
    body += `<g class="tgc-row" data-column="${i}" tabindex="0" role="img" aria-label="${esc(r.facts.join(" · "))}">${marks}</g>`;
    const tipW = Math.min(tipWidth(r.facts), width - 12), tipH = r.facts.length * 18 + 14;
    const tipX = Math.max(6, Math.min(width - tipW - 6, scale(r.value) - tipW / 2));
    tips += tipBox(r.facts, tipX, i >= rows.length / 2 ? y - tipH - 3 : y + rowH + 3, tipW, `class="tgc-row-tip" data-tip="${i}"`);
    rules += `.tgc-rows:has(.tgc-row[data-column="${i}"]:hover) [data-tip="${i}"],.tgc-rows:not(:has(.tgc-row:hover)):has(.tgc-row[data-column="${i}"]:focus-visible) [data-tip="${i}"]{opacity:1}`;
  });
  const height = bottom + 2;
  return `<svg class="tgc-svg tgc-rows" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="group" aria-label="${esc(o.measure)} by setup"><style>${rules}</style>${axis}${body}${tips}</svg>`;
}
