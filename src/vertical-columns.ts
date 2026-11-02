/** Shared column geometry. Values and recorded annotations arrive from a figure adapter. */
import type { RateIdentity } from "./identity.js";
import { line, rect, text, tipBox, tipWidth, WIDE } from "./svg.js";
import { esc, textBlock, textWidth, wrap } from "./text.js";

export interface VerticalColumn {
  id: string;
  label: string;
  value: number | null;
  valueLabel: string;
  interval: { lower: number; upper: number } | null;
  facts: string[];
  identity?: RateIdentity;
  /** A short line printed under the name. */
  detail?: string;
  rankLabel?: string;
  belowBar?: (x: number, width: number, baseline: number) => string;
}

export function image(mark: NonNullable<RateIdentity["model"]>, x: number, y: number, size: number): string {
  return `<image href="${esc(mark.src)}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"><title>${esc(mark.label)}</title></image>`;
}

export function verticalColumns(rows: VerticalColumn[], viewport: number, measure: string, domain: [number, number], tickLabel: (v: number) => string, scalarLayout = false, compact = false): string {
  // A dashboard cell: shorter, and its columns share the cell instead of scrolling.
  const slot = compact ? Math.max(58, Math.min(112, (viewport - 56) / rows.length)) : 112;
  const width = Math.max(viewport, Math.ceil(56 + rows.length * slot), compact ? 0 : 64 + rows.length * 112);
  const left = 48;
  const top = 42;
  const bottom = compact ? 196 : 302;
  const band = bottom - top;
  const barWidth = Math.min(viewport < WIDE ? 44 : 64, slot * 0.55);
  const name = compact ? 12 : 14, nameLine = compact ? 15 : 18, valueSize = compact ? 12 : 15;
  const shown = (row: VerticalColumn) => row.identity?.model?.label ?? row.label;
  // A word never breaks in a cell: the widest one sets the label's column.
  const labelWidth = compact ? Math.max(slot, ...rows.flatMap((row) => shown(row).split(" ").map((word) => textWidth(word, name)))) : Math.min(slot - 12, 170);
  const nameY = bottom + (compact ? (rows.some((row) => row.identity?.harness?.src) ? 62 : rows.some((row) => row.identity?.model) ? 48 : 18) : 84);
  const labels = rows.map((row) => wrap(shown(row), labelWidth, name, "sans", 8));
  const labelLines = Math.max(...labels.map((label) => label.lines.length));
  const harnessLabels = rows.map((row) => wrap(row.identity?.harness?.label ?? "", labelWidth, 12, "sans", 8));
  const harnessLines = scalarLayout ? Math.max(1, ...harnessLabels.map((label) => label.lines.length)) : 1;
  const hasHarness = rows.some((row) => row.identity?.harness);
  const height = compact
    ? nameY + labelLines * nameLine + (hasHarness ? harnessLines * nameLine : 0) + (rows.some((row) => row.detail) ? 16 : 0) + 6
    : 408 + Math.max(0, labelLines - 1) * 18 + (harnessLines - 1) * 16;
  let grid = "";
  for (const tick of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
    const y = bottom - tick * band;
    grid += `<line class="${tick === 0 ? "tgc-axis" : "tgc-gridline"}" x1="${left}" y1="${y}" x2="100%" y2="${y}"/>`;
    grid += text(left - 10, y + 4, tickLabel(domain[0] + tick * (domain[1] - domain[0])).replace(/\.0(?=\D*$)/, ""), { cls: "tgc-ink-muted tgc-num", anchor: "end" });
  }
  grid += text(left, compact ? 14 : 18, measure, { cls: "tgc-ink-muted" });
  let columns = "";
  let tips = "";
  let rules = "";
  for (const [i, row] of rows.entries()) {
    const x = left + slot * (i + 0.5);
    const y = bottom - ((row.value ?? domain[0]) - domain[0]) / (domain[1] - domain[0]) * band;
    const identity = row.identity;
    const facts = row.facts;
    let labelY = y;
    let marks = rect(x - slot / 2 + 3, top - 24, slot - 6, height - top + 12, "tgc-column-hit", 'rx="6"');
    if (row.value !== null) {
      marks += rect(x - barWidth / 2, y, barWidth, (row.value - domain[0]) / (domain[1] - domain[0]) * band, "tgc-vertical-bar", 'rx="5"');
      if (row.interval) {
        const lo = bottom - (row.interval.lower - domain[0]) / (domain[1] - domain[0]) * band;
        const hi = bottom - (row.interval.upper - domain[0]) / (domain[1] - domain[0]) * band;
        marks += line(x, lo, x, hi, "tgc-whisker");
        marks += line(x - 5, lo, x + 5, lo, "tgc-whisker") + line(x - 5, hi, x + 5, hi, "tgc-whisker");
        labelY = hi;
      }
      // Values remain above short bars; no minimum bar height can turn zero into a positive rate.
      marks += text(scalarLayout ? x : x + barWidth / 2 + 7, Math.max(top - 8, labelY - 9), scalarLayout ? wrap(row.valueLabel, slot - 4, valueSize, "mono", 1).lines[0]! : row.valueLabel, { size: valueSize, weight: 600, anchor: "middle", cls: "tgc-ink tgc-num" });
    } else {
      marks += text(x, bottom - 12, row.valueLabel, { anchor: "middle", cls: "tgc-ink-muted" });
    }
    if (row.belowBar) marks += row.belowBar(x, barWidth, bottom);
    if (identity?.model) {
      const logo = compact ? 28 : 36, y0 = bottom + (compact ? 10 : 23);
      marks += rect(x - logo / 2, y0, logo, logo, "tgc-logo-plate", 'rx="6"') + image(identity.model, x - logo / 2 + 2, y0 + 2, logo - 4);
    }
    if (identity?.harness?.src) {
      const y0 = bottom + (compact ? 24 : 43);
      marks += rect(x + 3, y0, 22, 22, "tgc-logo-plate", 'rx="5"') + image({ label: identity.harness.label, src: identity.harness.src }, x + 6, y0 + 3, 16);
    }
    marks += textBlock(labels[i]!.lines, x, nameY, nameLine, `class="tgc-ink" font-size="${name}" text-anchor="middle"`);
    const harnessY = nameY + (compact ? nameLine : 19) + (labels[i]!.lines.length - 1) * nameLine;
    if (identity?.harness) {
      marks += scalarLayout
        ? textBlock(harnessLabels[i]!.lines, x, harnessY, compact ? nameLine : 16, 'class="tgc-ink-muted" font-size="12" text-anchor="middle"')
        : text(x, harnessY, identity.harness.label, { anchor: "middle", cls: "tgc-ink-muted" });
    }
    if (row.detail) marks += text(x, height - 8, wrap(row.detail, slot - 4, 12, "mono", 1).lines[0]!, { size: 12, anchor: "middle", cls: "tgc-ink tgc-num" });
    if (row.rankLabel) marks += text(x, 33, row.rankLabel, { anchor: "middle", cls: "tgc-ink-muted tgc-num" });
    columns += `<g class="tgc-column" data-column="${i}" tabindex="0" role="img" aria-label="${esc(facts.join(" · "))}">${marks}</g>`;
    const tipW = Math.min(tipWidth(facts), width - 12);
    tips += tipBox(facts, Math.max(6, Math.min(width - tipW - 6, x - tipW / 2)), top, tipW, `class="tgc-column-tip" data-tip="${i}"`);
    rules += `.tgc-vertical:has(.tgc-column[data-column="${i}"]:hover) [data-tip="${i}"],.tgc-vertical:not(:has(.tgc-column:hover)):has(.tgc-column[data-column="${i}"]:focus-visible) [data-tip="${i}"]{opacity:1}`;
  }
  return `<svg class="tgc-svg tgc-vertical" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ${compact ? `viewBox="0 0 ${width} ${height}" style="height:auto${width > viewport ? `;min-width:${width}px` : ""}"` : `style="height:${height}px;min-width:${64 + rows.length * 112}px"`} role="group" aria-label="${esc(measure)} by setup"><style>${rules}</style>${grid}${columns}${tips}</svg>`;
}
