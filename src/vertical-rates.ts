/** Rate-specific annotations for the shared vertical columns. */
import { costText, drawable, duration, estimateNote, intervalName, kn, pct, perPass, rateIntervalGap, TIERS_BEST_FIRST, tierAtLeast } from "./format.js";
import type { RankedRatesOptions } from "./ranked-rates.js";
import { line, rect } from "./svg.js";
import type { RateRow } from "./types.js";
import { verticalColumns } from "./vertical-columns.js";

const rateLabel = (rate: number) => `${Number((rate * 100).toFixed(1))}%`;

export function verticalRates(rows: RateRow[], viewport: number, ranked: boolean, o: RankedRatesOptions): string {
  return verticalColumns(rows.map((row) => {
    const facts = [row.label, `${kn(row.solved, row.attempts)} passed`, drawable(row.estimate) ? rateLabel(row.rate) : estimateNote(row.estimate, row.attempts)];
    if (row.interval && rateIntervalGap(row) === null) facts.push(`${intervalName(row.interval)}: ${rateLabel(row.interval.lower)}–${rateLabel(row.interval.upper)}`);
    if (row.solved > 0 && perPass(row.cost) !== null) facts.push(`${costText(row.cost, row.solved)} per pass`);
    if (row.medianWallMs !== null) facts.push(`${duration(row.medianWallMs)} median run`);
    return {
      id: row.id, label: row.label, value: drawable(row.estimate) ? row.rate : null,
      valueLabel: drawable(row.estimate) ? rateLabel(row.rate) : estimateNote(row.estimate, row.attempts),
      interval: rateIntervalGap(row) === null ? row.interval : null,
      facts, identity: o.identities?.[row.id], ...(ranked ? { rankLabel: `Rank ${row.rank}` } : {}),
      belowBar: (x: number, barWidth: number, bottom: number) => {
        let marks = "";
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
        return marks;
      },
    };
  }), viewport, o.measure, [0, 1], pct);
}
