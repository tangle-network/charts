/** Ranked rows: one row per entrant, the whole row a hover target, each number on its mark or lined up at the row's end. */
import type { RateIdentity } from "./identity.js";
import { circle, line, NARROW, rect, text } from "./svg.js";
import { esc, textBlock, textWidth, wrap } from "./text.js";
import { image } from "./vertical-columns.js";

export interface PlotRow {
  id: string;
  label: string;
  value: number;
  /** The upper end of a drawn range; only a log scale draws it. */
  spread: number | null;
  /** The same measure on a second setup: an open dot, with its own column. */
  compare?: number;
  /** A printed figure in its own column, such as a reached rate. */
  extra?: string;
  /** Hover lines; the first is the row's name. */
  facts: string[];
  status?: "pass" | "breach";
}

export interface RowLayout {
  measure: string;
  scale: "log" | "linear";
  min: number;
  max: number;
  format: (value: number) => string;
  heads: { value: string; spread?: string; compare?: string; extra?: string };
  ranked?: boolean;
  highlight?: readonly string[];
  identities?: Readonly<Record<string, RateIdentity>>;
  threshold?: number;
}

interface Column { head: string; value: (row: PlotRow) => string; key?: "bar" | "open" }

export function drawRows(rows: PlotRow[], o: RowLayout, width: number): string {
  const phone = width === NARROW, linear = o.scale === "linear", compared = rows.some((r) => r.compare !== undefined);
  // A single linear value sits at its bar's end; anything else lines up in columns, right to left.
  const onBar = linear && !compared;
  const spreadShown = !linear && !phone && rows.some((r) => r.spread !== null);
  const columns: Column[] = [
    ...(o.heads.extra ? [{ head: o.heads.extra, value: (r: PlotRow) => r.extra ?? "–" }] : []),
    ...(compared ? [{ head: o.heads.compare!, value: (r: PlotRow) => (r.compare === undefined ? "–" : o.format(r.compare)), key: "open" as const }] : []),
    ...(spreadShown ? [{ head: o.heads.spread ?? "p95", value: (r: PlotRow) => (r.spread === null ? "–" : o.format(r.spread)) }] : []),
    ...(onBar ? [] : [{ head: o.heads.value, value: (r: PlotRow) => o.format(r.value), ...(compared ? { key: "bar" as const } : {}) }]),
  ];
  const size = 14, rowH = phone ? 40 : 36, columnW = compared ? (phone ? 76 : 96) : phone ? 60 : 84;
  const rankW = o.ranked ? (phone ? 32 : 36) : 10;
  const logoW = rows.some((r) => o.identities?.[r.id]?.model) ? 30 : 0;
  const longest = Math.max(...rows.map((r) => textWidth(r.label, size, "sans")));
  const nameW = Math.min(longest + 14, phone ? 130 : 260);
  const left = rankW + logoW + nameW;
  const room = onBar ? Math.max(...rows.map((r) => textWidth(o.format(r.value), size, "mono"))) + 16 : 0;
  const plotW = width - left - columns.length * columnW - room - 10;
  const scale = (value: number) => left + (linear ? value / o.max : (Math.log(value) - Math.log(o.min)) / (Math.log(o.max) - Math.log(o.min))) * plotW;
  const decades = linear ? [] : Array.from({ length: Math.ceil(Math.log10(o.max)) - Math.floor(Math.log10(o.min)) + 1 }, (_, i) => 10 ** (Math.floor(Math.log10(o.min)) + i)).filter((tick) => tick > o.min && scale(tick) < left + plotW - 24);
  const ticked = decades.length > 0 && plotW / decades.length >= 52;
  const top = columns.length || ticked || o.threshold !== undefined ? 30 : 6;
  const bottom = top + rows.length * rowH;
  let axis = "", body = "", tips = "", rules = "";
  columns.forEach((c, k) => {
    const x = width - 8 - k * columnW;
    axis += text(x, 18, c.head, { size, cls: "tgc-ink-muted", anchor: "end" });
    const keyX = x - textWidth(c.head, size, "sans") - 12;
    if (c.key === "bar") axis += rect(keyX - 5, 9, 11, 9, "tgc-row-mark", 'rx="2"');
    if (c.key === "open") axis += circle(keyX, 13, 4.5, "tgc-row-open");
  });
  if (o.threshold !== undefined) {
    axis += line(scale(o.threshold), top - 8, scale(o.threshold), bottom, "tgc-threshold");
    axis += text(scale(o.threshold) + 3, 15, `SLO ${o.format(o.threshold)}`, { size: 12, cls: "tgc-ink-muted tgc-num" });
  }
  if (ticked) {
    for (const tick of decades) {
      if (o.threshold !== undefined && Math.abs(scale(tick) - scale(o.threshold)) < 19) continue;
      axis += line(scale(tick), top, scale(tick), bottom, "tgc-gridline");
      axis += text(scale(tick), 18, o.format(tick), { size: 12, cls: "tgc-ink-muted tgc-num", anchor: "middle" });
    }
  }
  rows.forEach((r, i) => {
    const y = top + i * rowH, cy = y + rowH / 2, on = o.highlight?.includes(r.id) ?? false;
    const mark = o.identities?.[r.id]?.model;
    let marks = rect(0, y + 1, width, rowH - 2, "tgc-row-hit", 'rx="6"');
    if (o.ranked) marks += text(rankW - 10, cy + 5, String(i + 1), { size, cls: "tgc-ink-muted tgc-num", anchor: "end" });
    if (mark) marks += rect(rankW, cy - 11, 22, 22, "tgc-logo-plate", 'rx="5"') + image(mark, rankW + 3, cy - 8, 16);
    marks += text(rankW + logoW, cy + 5, wrap(r.label, nameW - 6, size, "sans", 1).lines[0]!, { size, weight: on ? 600 : 400 });
    if (r.status) {
      marks += rect(scale(r.value), cy - 5, Math.max(2, scale(r.spread ?? r.value) - scale(r.value)), 10, `tgc-range-${r.status}`, 'rx="5"') + circle(scale(r.value), cy, 6, `tgc-range-dot-${r.status}`);
    } else if (linear) {
      marks += rect(left, cy - 8, Math.max(2, scale(r.value) - left), 16, "tgc-row-mark", 'rx="4"');
      if (onBar) marks += text(scale(r.value) + 8, cy + 5, o.format(r.value), { size, weight: 600, cls: "tgc-ink tgc-num" });
    } else {
      if (r.spread !== null) marks += rect(scale(r.value), cy - 2.5, Math.max(2, scale(r.spread) - scale(r.value)), 5, "tgc-row-mark", 'rx="2.5"');
      marks += circle(scale(r.value), cy, on ? 7 : 5.5, "tgc-row-mark");
    }
    if (r.compare !== undefined) marks += circle(scale(r.compare), cy, 5.5, "tgc-row-open");
    columns.forEach((c, k) => {
      marks += text(width - 8 - k * columnW, cy + 5, c.value(r), { size, weight: k === columns.length - 1 ? 600 : 400, cls: "tgc-ink tgc-num", anchor: "end" });
    });
    body += `<g class="tgc-row${on ? " tgc-row-on" : ""}" data-column="${i}" tabindex="0" role="img" aria-label="${esc(r.facts.join(" · "))}">${marks}</g>`;
    const tipW = Math.min(300, width - 24);
    const lines = r.facts.flatMap((fact) => wrap(fact, tipW - 28, size, "sans", 4).lines);
    const tipH = lines.length * 19 + 16;
    const tipX = Math.max(12, Math.min(width - tipW - 12, scale(r.value) - tipW / 2));
    const tipY = Math.max(4, i > rows.length / 2 ? y - tipH - 6 : y + rowH + 6);
    tips += `<g class="tgc-row-tip" data-tip="${i}" aria-hidden="true">${rect(tipX, tipY, tipW, tipH, "tgc-tip-bg", 'rx="7"')}${textBlock(lines, tipX + 14, tipY + 22, 19, 'class="tgc-tip-ink" font-size="14"')}</g>`;
    rules += `.tgc-rows:has(.tgc-row[data-column="${i}"]:hover) [data-tip="${i}"],.tgc-rows:not(:has(.tgc-row:hover)):has(.tgc-row[data-column="${i}"]:focus-visible) [data-tip="${i}"]{opacity:1}`;
  });
  const height = Math.ceil(bottom + 4);
  return `<svg class="tgc-svg tgc-rows${o.highlight ? "" : " tgc-rows-even"}" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="group" aria-label="${esc(o.measure)} by setup"><style>${rules}</style>${axis}${body}${tips}</svg>`;
}
