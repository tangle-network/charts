/** Shared column geometry. Values and recorded annotations arrive from a figure adapter. */
import type { RateIdentity } from "./identity.js";
import { line, rect, text } from "./svg.js";
import { esc, textBlock, wrap } from "./text.js";

export interface VerticalColumn {
  id: string;
  label: string;
  value: number | null;
  valueLabel: string;
  interval: { lower: number; upper: number } | null;
  facts: string[];
  identity?: RateIdentity;
  rankLabel?: string;
  belowBar?: (x: number, width: number, baseline: number) => string;
}

function image(mark: NonNullable<RateIdentity["model"]>, x: number, y: number, size: number): string {
  return `<image href="${esc(mark.src)}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"><title>${esc(mark.label)}</title></image>`;
}

export function verticalColumns(rows: VerticalColumn[], viewport: number, measure: string, domain: [number, number], tickLabel: (v: number) => string, scalarLayout = false): string {
  const width = Math.max(viewport, 64 + rows.length * 112);
  const left = 48;
  const top = 42;
  const bottom = 302;
  const band = bottom - top;
  const slot = 112;
  const barWidth = Math.min(viewport < 720 ? 44 : 64, slot * 0.55);
  const labelWidth = Math.min(slot - 12, 170);
  const labels = rows.map((row) => wrap(row.identity?.model?.label ?? row.label, labelWidth, 14, "sans", 8));
  const labelLines = Math.max(...labels.map((label) => label.lines.length));
  const harnessLabels = rows.map((row) => wrap(row.identity?.harness?.label ?? "", labelWidth, 12, "sans", 8));
  const harnessLines = scalarLayout ? Math.max(1, ...harnessLabels.map((label) => label.lines.length)) : 1;
  const height = 408 + Math.max(0, labelLines - 1) * 18 + (harnessLines - 1) * 16;
  let grid = "";
  for (const tick of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
    const y = bottom - tick * band;
    grid += `<line class="${tick === 0 ? "tgc-axis" : "tgc-gridline"}" x1="${left}" y1="${y}" x2="100%" y2="${y}"/>`;
    grid += text(left - 10, y + 4, tickLabel(domain[0] + tick * (domain[1] - domain[0])), { cls: "tgc-ink-muted tgc-num", anchor: "end" });
  }
  grid += text(left, 18, measure, { cls: "tgc-ink-muted" });
  let columns = "";
  let tips = "";
  let rules = "";
  for (const [i, row] of rows.entries()) {
    const x = left + slot * (i + 0.5);
    const y = bottom - ((row.value ?? domain[0]) - domain[0]) / (domain[1] - domain[0]) * band;
    const identity = row.identity;
    const facts = row.facts;
    let marks = rect(x - slot / 2 + 3, top - 24, slot - 6, height - top + 12, "tgc-column-hit", 'rx="6"');
    if (row.value !== null) {
      marks += rect(x - barWidth / 2, y, barWidth, (row.value - domain[0]) / (domain[1] - domain[0]) * band, "tgc-vertical-bar", 'rx="5"');
      if (row.interval) {
        const lo = bottom - (row.interval.lower - domain[0]) / (domain[1] - domain[0]) * band;
        const hi = bottom - (row.interval.upper - domain[0]) / (domain[1] - domain[0]) * band;
        marks += line(x, lo, x, hi, "tgc-whisker");
        marks += line(x - 5, lo, x + 5, lo, "tgc-whisker") + line(x - 5, hi, x + 5, hi, "tgc-whisker");
      }
      // Values remain above short bars; no minimum bar height can turn zero into a positive rate.
      marks += text(scalarLayout ? x : x + barWidth / 2 + 7, Math.max(top - 8, y - 9), scalarLayout ? wrap(row.valueLabel, slot - 12, 15, "mono", 1).lines[0]! : row.valueLabel, { size: 15, weight: 600, anchor: "middle", cls: "tgc-ink tgc-num" });
    } else {
      marks += text(x, bottom - 12, row.valueLabel, { anchor: "middle", cls: "tgc-ink-muted" });
    }
    if (row.belowBar) marks += row.belowBar(x, barWidth, bottom);
    if (identity?.model) {
      marks += rect(x - 18, bottom + 23, 36, 36, "tgc-logo-plate", 'rx="6"');
      marks += image(identity.model, x - 16, bottom + 25, 32);
    }
    if (identity?.harness) {
      marks += rect(x + 3, bottom + 43, 22, 22, "tgc-logo-plate", 'rx="5"');
      marks += image(identity.harness, x + 6, bottom + 46, 16);
    }
    marks += textBlock(labels[i]!.lines, x, bottom + 84, 18, 'class="tgc-ink" font-size="14" text-anchor="middle"');
    if (identity?.harness) {
      const harnessY = bottom + 103 + (labels[i]!.lines.length - 1) * 18;
      marks += scalarLayout
        ? textBlock(harnessLabels[i]!.lines, x, harnessY, 16, 'class="tgc-ink-muted" font-size="12" text-anchor="middle"')
        : text(x, harnessY, identity.harness.label, { anchor: "middle", cls: "tgc-ink-muted" });
    }
    if (row.rankLabel) marks += text(x, 33, row.rankLabel, { anchor: "middle", cls: "tgc-ink-muted tgc-num" });
    columns += `<g class="tgc-column" data-column="${i}" tabindex="0" role="img" aria-label="${esc(facts.join(" · "))}"><title>${esc(facts.join(" · "))}</title>${marks}</g>`;
    const tipWidth = Math.min(280, width - 24);
    const tipX = Math.max(12, Math.min(width - tipWidth - 12, x - tipWidth / 2));
    const tipLines = facts.flatMap((fact) => wrap(fact, tipWidth - 24, 12, "sans", 8).lines);
    const tipHeight = tipLines.length * 17 + 24;
    tips += `<g class="tgc-column-tip" data-tip="${i}" aria-hidden="true">${rect(tipX, top, tipWidth, tipHeight, "tgc-tip-bg", 'rx="7"')}${textBlock(tipLines, tipX + 12, top + 20, 17, 'class="tgc-tip-ink" font-size="12"')}</g>`;
    rules += `.tgc-vertical:has(.tgc-column[data-column="${i}"]:hover) [data-tip="${i}"],.tgc-vertical:not(:has(.tgc-column:hover)):has(.tgc-column[data-column="${i}"]:focus-visible) [data-tip="${i}"]{opacity:1}`;
  }
  return `<svg class="tgc-svg tgc-vertical" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="height:${height}px;min-width:${64 + rows.length * 112}px" role="group" aria-label="${esc(measure)} by setup"><style>${rules}</style>${grid}${columns}${tips}</svg>`;
}
