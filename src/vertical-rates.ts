/** Vertical rate geometry; values, eligibility and ordering stay with rankedRates. */
import { costText, drawable, duration, estimateNote, intervalName, kn, pct, perPass, rateIntervalGap, TIERS_BEST_FIRST, tierAtLeast } from "./format.js";
import type { RankedRatesOptions, RateIdentity } from "./ranked-rates.js";
import { line, rect, text } from "./svg.js";
import { esc, textBlock, wrap } from "./text.js";
import type { RateRow } from "./types.js";

export function identityGap(rows: RateRow[], identities: RankedRatesOptions["identities"]): string | null {
  if (!identities) return null;
  for (const [id, identity] of Object.entries(identities)) {
    if (!rows.some((row) => row.id === id)) return `Identity names unknown setup ${id}.`;
    if (!identity || typeof identity !== "object") return `Invalid display identity for ${id}.`;
    for (const mark of [identity.model, identity.harness]) {
      if (!mark) continue;
      if (typeof mark.label !== "string" || !mark.label.trim() || typeof mark.src !== "string") return `Invalid display identity for ${id}.`;
      // Same-origin assets and HTTPS images only; protocol-relative URLs are not local assets.
      const local = /^\/(?!\/)[^\s<>"']+$/.test(mark.src);
      const https = /^https:\/\/[a-z0-9.-]+(?::\d+)?\/[^\s<>"']*$/i.test(mark.src);
      if (!local && !https) return `Invalid identity image for ${id}.`;
    }
  }
  return null;
}

function image(mark: NonNullable<RateIdentity["model"]>, x: number, y: number, size: number): string {
  return `<image href="${esc(mark.src)}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"><title>${esc(mark.label)}</title></image>`;
}

const rateLabel = (rate: number) => `${Number((rate * 100).toFixed(1))}%`;

export function verticalRates(rows: RateRow[], viewport: number, ranked: boolean, o: RankedRatesOptions): string {
  const width = Math.max(viewport, 64 + rows.length * 112);
  const left = 48;
  const top = 42;
  const bottom = 302;
  const band = bottom - top;
  const slot = 112;
  const barWidth = Math.min(viewport < 720 ? 44 : 64, slot * 0.55);
  const labelWidth = Math.min(slot - 12, 170);
  const labels = rows.map((row) => wrap(o.identities?.[row.id]?.model?.label ?? row.label, labelWidth, 14, "sans", 8));
  const labelLines = Math.max(...labels.map((label) => label.lines.length));
  const height = 408 + Math.max(0, labelLines - 1) * 18;
  let grid = "";
  for (const tick of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
    const y = bottom - tick * band;
    grid += `<line class="${tick === 0 ? "tgc-axis" : "tgc-gridline"}" x1="${left}" y1="${y}" x2="100%" y2="${y}"/>`;
    grid += text(left - 10, y + 4, pct(tick), { cls: "tgc-ink-muted tgc-num", anchor: "end" });
  }
  grid += text(left, 18, o.measure, { cls: "tgc-ink-muted" });
  let columns = "";
  let tips = "";
  let rules = "";
  for (const [i, row] of rows.entries()) {
    const x = left + slot * (i + 0.5);
    const y = bottom - row.rate * band;
    const identity = o.identities?.[row.id];
    const facts = [row.label, `${kn(row.solved, row.attempts)} passed`, drawable(row.estimate) ? rateLabel(row.rate) : estimateNote(row.estimate, row.attempts)];
    if (row.interval && rateIntervalGap(row) === null) facts.push(`${intervalName(row.interval)}: ${rateLabel(row.interval.lower)}–${rateLabel(row.interval.upper)}`);
    if (row.solved > 0 && perPass(row.cost) !== null) facts.push(`${costText(row.cost, row.solved)} per pass`);
    if (row.medianWallMs !== null) facts.push(`${duration(row.medianWallMs)} median run`);
    let marks = rect(x - slot / 2 + 3, top - 24, slot - 6, height - top + 12, "tgc-column-hit", 'rx="6"');
    if (drawable(row.estimate)) {
      marks += rect(x - barWidth / 2, y, barWidth, row.rate * band, "tgc-vertical-bar", 'rx="5"');
      if (row.interval && rateIntervalGap(row) === null) {
        const lo = bottom - row.interval.lower * band;
        const hi = bottom - row.interval.upper * band;
        marks += line(x, lo, x, hi, "tgc-whisker");
        marks += line(x - 5, lo, x + 5, lo, "tgc-whisker") + line(x - 5, hi, x + 5, hi, "tgc-whisker");
      }
      // Values remain above short bars; no minimum bar height can turn zero into a positive rate.
      marks += text(x + barWidth / 2 + 7, Math.max(top - 8, y - 9), rateLabel(row.rate), { size: 15, weight: 600, anchor: "middle", cls: "tgc-ink tgc-num" });
    } else {
      marks += text(x, bottom - 12, estimateNote(row.estimate, row.attempts), { anchor: "middle", cls: "tgc-ink-muted" });
    }
    if (row.tiers && row.attempts > 0 && drawable(row.estimate)) {
      let cursor = x - barWidth / 2;
      for (const tier of TIERS_BEST_FIRST) {
        const segment = row.tiers[tier] / row.attempts * barWidth;
        if (segment > 0) marks += rect(cursor, bottom + 9, segment, 5, tier === "F" ? "tgc-open" : `tgc-tier-${tier.toLowerCase()}`);
        cursor += segment;
      }
      if (o.passTier) {
        const count = TIERS_BEST_FIRST.filter((tier) => tierAtLeast(tier, o.passTier!)).reduce((sum, tier) => sum + row.tiers![tier], 0);
        const tx = x - barWidth / 2 + count / row.attempts * barWidth;
        marks += line(tx, bottom + 6, tx, bottom + 17, "tgc-tick");
      }
    }
    if (identity?.model) {
      marks += rect(x - 18, bottom + 23, 36, 36, "tgc-logo-plate", 'rx="6"');
      marks += image(identity.model, x - 16, bottom + 25, 32);
    }
    if (identity?.harness) {
      marks += rect(x + 3, bottom + 43, 22, 22, "tgc-logo-plate", 'rx="5"');
      marks += image(identity.harness, x + 6, bottom + 46, 16);
    }
    marks += textBlock(labels[i]!.lines, x, bottom + 84, 18, 'class="tgc-ink" font-size="14" text-anchor="middle"');
    if (identity?.harness) marks += text(x, bottom + 103 + (labels[i]!.lines.length - 1) * 18, identity.harness.label, { anchor: "middle", cls: "tgc-ink-muted" });
    if (ranked) marks += text(x, 33, `Rank ${row.rank}`, { anchor: "middle", cls: "tgc-ink-muted tgc-num" });
    columns += `<g class="tgc-column" data-column="${i}" tabindex="0" role="img" aria-label="${esc(facts.join(" · "))}"><title>${esc(facts.join(" · "))}</title>${marks}</g>`;
    const tipWidth = Math.min(280, width - 24);
    const tipX = Math.max(12, Math.min(width - tipWidth - 12, x - tipWidth / 2));
    const tipLines = facts.flatMap((fact) => wrap(fact, tipWidth - 24, 12, "sans", 8).lines);
    const tipHeight = tipLines.length * 17 + 24;
    tips += `<g class="tgc-column-tip" data-tip="${i}" aria-hidden="true">${rect(tipX, top, tipWidth, tipHeight, "tgc-tip-bg", 'rx="7"')}${textBlock(tipLines, tipX + 12, top + 20, 17, 'class="tgc-tip-ink" font-size="12"')}</g>`;
    rules += `.tgc-vertical:has(.tgc-column[data-column="${i}"]:hover) [data-tip="${i}"],.tgc-vertical:not(:has(.tgc-column:hover)):has(.tgc-column[data-column="${i}"]:focus-visible) [data-tip="${i}"]{opacity:1}`;
  }
  return `<svg class="tgc-svg tgc-vertical" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="height:${height}px;min-width:${64 + rows.length * 112}px" role="group" aria-label="${esc(o.measure)} by setup"><style>${rules}</style>${grid}${columns}${tips}</svg>`;
}
