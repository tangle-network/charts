/**
 * `rankedRates`: which setup passes most, and how uncertain is each rate.
 *
 * One row per setup: rank (only when every row is ranked), label, an accent
 * bar on a shared 0–1 axis with the interval as an ink whisker, `passed/n`,
 * cost per pass and median run. An App Grade grader adds a tier strip under
 * the bar with a tick at the pass tier. Ranked rows keep their rank order;
 * unranked rows sort by rate, and the finding says no comparison backs it.
 *
 * Refuses: a bar when the producer labels the estimate `none` or
 * `insufficient` (the row prints its count only); a whisker whose interval
 * names no level or method; a rank number unless every row carries one; any
 * cost it was not given. It never prints "winner", "best" or "#1".
 */

import {
  costText,
  drawable,
  duration,
  estimateNote,
  intervalGap,
  intervalName,
  kn,
  pct,
  TIERS_BEST_FIRST,
  tierAtLeast,
  tierSummary,
  tierTotal,
} from "./format.js";
import { hbar, line, NARROW, rect, svgRoot, text, titled, WIDE } from "./svg.js";
import { type Column, table } from "./table.js";
import { capitalize, plural, textBlock, textWidth, wrap } from "./text.js";
import type { Exclusion, Figure, RateRow, Refusal, Tier } from "./types.js";

export interface RankedRatesOptions {
  /** What the rate measures, lower case: "solve rate". */
  measure: string;
  /** The App Grade tier a pass needs; marks the tier strip. */
  passTier?: Tier;
  /** Singular, lower-case nouns: what one unit of `attempts` is, and what a row is. */
  nouns?: { attempt: string; setup: string };
  id?: string;
  excluded?: Exclusion[];
}

const TICKS = [0, 0.25, 0.5, 0.75, 1];

interface Layout {
  ranked: boolean;
  cost: boolean;
  median: boolean;
}

export function rankedRates(input: RateRow[], o: RankedRatesOptions): Figure | Refusal {
  const id = o.id ?? "ranked-rates";
  const noun = o.nouns ?? { attempt: "attempt", setup: "setup" };
  if (input.length === 0) return { id, refused: `No ${noun.setup} has an ${noun.attempt}.` };
  for (const row of input) {
    const expected = row.attempts > 0 ? row.solved / row.attempts : 0;
    if (row.solved > row.attempts || Math.abs(row.rate - expected) > 1e-6) {
      return { id, refused: `${row.label}: rate ${row.rate} disagrees with ${kn(row.solved, row.attempts)} passed.` };
    }
  }

  const ranked = input.every((row) => row.rank !== null);
  const rows = ranked
    ? [...input].sort((a, b) => a.rank! - b.rank!)
    : [...input].sort((a, b) => b.rate - a.rate);
  const layout: Layout = {
    ranked,
    cost: rows.some((r) => r.cost.perSolvedUsd !== null || r.cost.basis !== "unknown" || r.cost.receipts !== null),
    median: rows.some((r) => r.medianWallMs !== null),
  };
  const bars = rows.filter((row) => drawable(row.estimate));
  const noBar = rows.filter((row) => !drawable(row.estimate));
  const whiskers = bars.filter((row) => intervalGap(row.interval) === null);
  const noWhisker = bars.filter((row) => intervalGap(row.interval) !== null);
  const tiered = rows.some((row) => row.tiers !== null);

  const passed = rows.reduce((sum, row) => sum + row.solved, 0);
  const attempts = rows.reduce((sum, row) => sum + row.attempts, 0);
  const setupsN = `${rows.length} ${plural(rows.length, noun.setup)}`;
  const top = rows[0]!;
  const uniqueTop = rows.length === 1 || rows[1]!.rate < top.rate;

  const finding = ranked
    ? `${top.label} ranks first, passing ${pct(top.rate)} of ${plural(2, noun.attempt)}.`
    : rows.length === 1 && drawable(top.estimate)
      ? `${top.label} passes ${pct(top.rate)} of ${top.attempts} ${plural(top.attempts, noun.attempt)}.`
      : drawable(top.estimate) && uniqueTop
        ? `${top.label} has the highest ${o.measure}, ${pct(top.rate)} of ${top.attempts} ${plural(top.attempts, noun.attempt)}; no comparison backs the order.`
        : `Sorted by ${o.measure}; no comparison backs the order.`;
  const lede =
    `${passed} of ${attempts} ${plural(attempts, noun.attempt)} passed across ${setupsN}.` +
    (noBar.length === rows.length
      ? ` No ${noun.setup} has enough units to draw a rate.`
      : noBar.length
        ? ` ${noBar.length} of ${setupsN} have too few units to draw a rate.`
        : "");

  const intervalNames = [...new Set(whiskers.map((row) => intervalName(row.interval!)))];
  const read = bars.length
    ? [
        `Bars show the share of ${plural(2, noun.attempt)} that passed${whiskers.length ? `; whiskers show the ${intervalNames.join(" or ")} interval` : ""}.`,
        tiered
          ? `The strip under a bar splits ${plural(2, noun.attempt)} by App Grade tier${o.passTier ? `, and the tick marks ${o.passTier} or better` : ""}.`
          : "",
      ]
        .filter(Boolean)
        .join(" ")
    : `Counts show ${plural(2, noun.attempt)} passed; no ${noun.setup} has enough units to draw a rate.`;

  const bases = [...new Set(rows.filter((r) => r.cost.perSolvedUsd !== null).map((r) => r.cost.basis))];
  const method = [
    `${capitalize(o.measure)} is ${plural(2, noun.attempt)} passed over ${plural(2, noun.attempt)}${o.passTier ? `, a pass being App Grade ${o.passTier} or better` : ""}.`,
    intervalNames.length ? `Intervals: ${intervalNames.join(", ")}, per ${noun.setup}.` : "",
    bases.length ? `Cost per pass is model spend over passes, ${bases.map(basisPhrase).join(" or ")}.` : "",
    layout.median ? `Median run is the median wall time of one ${noun.attempt}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const exclusions = [
    ...(o.excluded ?? []).map((e) => `${e.count} ${plural(e.count, noun.attempt)} excluded: ${e.why}.`),
    ...(noBar.length ? [`No bar for ${noBar.map((r) => `${r.label} (${estimateNote(r.estimate, r.attempts)})`).join(", ")}.`] : []),
    ...(noWhisker.length ? [`No whisker for ${noWhisker.map((r) => `${r.label} (${intervalGap(r.interval)})`).join(", ")}.`] : []),
  ];

  const columns: Column[] = [
    { label: capitalize(noun.setup) },
    ...(ranked ? [{ label: "Rank", numeric: true }] : []),
    { label: "Passed", numeric: true },
    { label: capitalize(plural(2, noun.attempt)), numeric: true },
    { label: capitalize(o.measure), numeric: true },
    { label: "Interval", numeric: true },
    ...(tiered ? [{ label: "Tiers" }] : []),
    ...(layout.cost ? [{ label: "Cost per pass", numeric: true }, { label: "Cost basis" }] : []),
    ...(layout.median ? [{ label: "Median run", numeric: true }] : []),
  ];
  const tableRows = rows.map((row) => {
    const offLadder = row.tiers ? row.attempts - tierTotal(row.tiers) : 0;
    return [
      row.label,
      ...(ranked ? [String(row.rank)] : []),
      String(row.solved),
      String(row.attempts),
      drawable(row.estimate) ? pct(row.rate) : estimateNote(row.estimate, row.attempts),
      row.interval
        ? `${pct(row.interval.lower)}–${pct(row.interval.upper)} (${intervalGap(row.interval) ?? intervalName(row.interval)})`
        : "none recorded",
      ...(tiered
        ? [row.tiers ? [tierSummary(row.tiers), offLadder ? `${offLadder} off the ladder` : ""].filter(Boolean).join(" · ") || "none" : "not graded"]
        : []),
      ...(layout.cost
        ? [costText(row.cost, row.solved), row.cost.basis + (row.cost.receipts !== null ? `, ${row.cost.receipts} receipts` : "")]
        : []),
      ...(layout.median ? [row.medianWallMs === null ? "unknown" : duration(row.medianWallMs)] : []),
    ];
  });

  return {
    id,
    finding,
    lede,
    read,
    svg: { wide: wide(rows, layout, noun, o), narrow: narrow(rows, layout, o) },
    table: table(`${capitalize(o.measure)} by ${noun.setup}`, columns, tableRows),
    note: {
      method,
      n: `${attempts} ${plural(attempts, noun.attempt)} over ${setupsN}.`,
      exclusions,
    },
  };
}

function basisPhrase(basis: RateRow["cost"]["basis"]): string {
  if (basis === "receipts") return "from router receipts";
  if (basis === "estimated") return "estimated, not billed (marked est.)";
  return "from an unrecorded source";
}

/** The bar, whisker, rate label and tier strip for one row between x0 and x1. */
function barMarks(row: RateRow, x0: number, x1: number, y: number, o: RankedRatesOptions): string {
  const w = x1 - x0;
  const at = (v: number) => x0 + Math.max(0, Math.min(1, v)) * w;
  let out = rect(x0, y, w, 12, "tgc-track");
  out += hbar(x0, y, at(row.rate) - x0, 12, "tgc-bar");
  let end = at(row.rate);
  if (row.interval && intervalGap(row.interval) === null) {
    const lo = at(row.interval.lower);
    const hi = at(row.interval.upper);
    out += line(lo, y + 6, hi, y + 6, "tgc-whisker");
    out += line(lo, y + 2, lo, y + 10, "tgc-whisker") + line(hi, y + 2, hi, y + 10, "tgc-whisker");
    end = Math.max(end, hi);
  }
  out += text(end + 6, y + 10.5, pct(row.rate), { cls: "tgc-ink tgc-num" });
  if (row.tiers && row.attempts > 0) {
    const sy = y + 16;
    let cursor = x0;
    for (const tier of TIERS_BEST_FIRST) {
      const count = row.tiers[tier];
      if (!count) continue;
      const segment = (count / row.attempts) * w;
      out +=
        tier === "F"
          ? rect(cursor + 0.75, sy + 0.75, Math.max(0, segment - 3.5), 4.5, "tgc-open")
          : rect(cursor, sy, Math.max(0, segment - 2), 6, `tgc-tier-${tier.toLowerCase()}`);
      cursor += segment;
    }
    if (tierTotal(row.tiers) < row.attempts) out += rect(cursor, sy, x0 + w - cursor, 6, "tgc-track");
    if (o.passTier) {
      const passing = TIERS_BEST_FIRST.filter((t) => tierAtLeast(t, o.passTier!)).reduce((s, t) => s + row.tiers![t], 0);
      const tx = x0 + (passing / row.attempts) * w;
      out += line(tx, sy - 3, tx, sy + 9, "tgc-tick");
    }
  }
  return out;
}

function hoverText(row: RateRow): string {
  const parts = [
    row.label,
    `${kn(row.solved, row.attempts)} passed`,
    drawable(row.estimate) ? pct(row.rate) : estimateNote(row.estimate, row.attempts),
  ];
  if (row.interval && intervalGap(row.interval) === null) {
    parts.push(`${intervalName(row.interval)} ${pct(row.interval.lower)}–${pct(row.interval.upper)}`);
  }
  if (row.tiers) parts.push(tierSummary(row.tiers));
  if (row.cost.perSolvedUsd !== null) parts.push(`${costText(row.cost, row.solved)} per pass`);
  return parts.join(" · ");
}

function wide(rows: RateRow[], layout: Layout, noun: { setup: string }, o: RankedRatesOptions): string {
  const labelX = layout.ranked ? 32 : 0;
  const labelW = layout.ranked ? 200 : 232;
  const x0 = 248;
  const extra = (layout.cost ? 80 : 0) + (layout.median ? 72 : 0);
  const knRight = WIDE - extra;
  const x1 = knRight - 96;
  const costRight = knRight + 80;
  const top = 34;
  let body = "";
  let y = top;
  for (const [i, row] of rows.entries()) {
    const label = wrap(row.label, labelW, 14);
    const h = Math.max(label.lines.length * 18 + 14, row.tiers && drawable(row.estimate) ? 40 : 32);
    let marks = "";
    if (layout.ranked) marks += text(20, y + 18, String(row.rank), { cls: "tgc-ink-muted tgc-num", anchor: "end" });
    marks += textBlock(label.lines, labelX, y + 18, 18, `class="tgc-ink" font-size="14"`);
    marks += drawable(row.estimate)
      ? barMarks(row, x0, x1, y + 7, o)
      : text(x0, y + 18, estimateNote(row.estimate, row.attempts), { cls: "tgc-ink-muted" });
    marks += text(knRight, y + 18, kn(row.solved, row.attempts), { cls: "tgc-ink tgc-num", anchor: "end" });
    if (layout.cost) {
      const billed = row.cost.perSolvedUsd !== null && row.cost.basis === "receipts";
      marks += text(costRight, y + 18, costText(row.cost, row.solved), {
        cls: billed ? "tgc-ink tgc-num" : "tgc-ink-muted tgc-num",
        anchor: "end",
      });
    }
    if (layout.median) {
      marks += text(WIDE, y + 18, row.medianWallMs === null ? "unknown" : duration(row.medianWallMs), {
        cls: row.medianWallMs === null ? "tgc-ink-muted tgc-num" : "tgc-ink tgc-num",
        anchor: "end",
      });
    }
    body += titled(hoverText(row), marks);
    if (i < rows.length - 1) body += line(0, y + h, WIDE, y + h, "tgc-rule");
    y += h;
  }
  const bottom = y;
  let grid = "";
  for (const t of TICKS) grid += line(x0 + t * (x1 - x0), top - 4, x0 + t * (x1 - x0), bottom, "tgc-gridline");
  let head = text(labelX, 16, capitalize(noun.setup), { cls: "tgc-ink-muted" });
  head += text(x0, 16, capitalize(o.measure), { cls: "tgc-ink-muted" });
  head += text(knRight, 16, "Passed", { cls: "tgc-ink-muted", anchor: "end" });
  if (layout.cost) head += text(costRight, 16, "Per pass", { cls: "tgc-ink-muted", anchor: "end" });
  if (layout.median) head += text(WIDE, 16, "Median run", { cls: "tgc-ink-muted", anchor: "end" });
  head += line(0, 26, WIDE, 26, "tgc-rule");
  let axis = "";
  if (rows.some((r) => drawable(r.estimate))) {
    for (const t of TICKS) {
      axis += text(x0 + t * (x1 - x0), bottom + 16, pct(t), {
        cls: "tgc-ink-muted tgc-num",
        anchor: t === 0 ? "start" : t === 1 ? "end" : "middle",
      });
    }
  }
  return svgRoot(WIDE, bottom + 24, grid + head + body + axis);
}

function narrow(rows: RateRow[], layout: Layout, o: RankedRatesOptions): string {
  const x0 = 0;
  const x1 = 300;
  let body = "";
  let y = 8;
  for (const [i, row] of rows.entries()) {
    const labelX = layout.ranked ? 24 : 0;
    const label = wrap(row.label, NARROW - labelX, 14);
    let marks = "";
    if (layout.ranked) marks += text(0, y + 14, String(row.rank), { cls: "tgc-ink-muted tgc-num" });
    marks += textBlock(label.lines, labelX, y + 14, 18, `class="tgc-ink" font-size="14"`);
    let cy = y + (label.lines.length - 1) * 18 + 22;
    if (drawable(row.estimate)) {
      marks += barMarks(row, x0, x1, cy, o);
      cy += row.tiers ? 30 : 20;
    }
    const facts = [
      `${kn(row.solved, row.attempts)} passed`,
      ...(drawable(row.estimate) ? [] : [estimateNote(row.estimate, row.attempts)]),
      ...(layout.cost ? [`${costText(row.cost, row.solved)} per pass`] : []),
      ...(layout.median ? [row.medianWallMs === null ? "run time unknown" : `${duration(row.medianWallMs)} run`] : []),
    ];
    const factLines: string[] = [];
    for (const fact of facts) {
      const last = factLines[factLines.length - 1];
      if (last && textWidth(`${last} · ${fact}`, 12, "mono") <= NARROW) factLines[factLines.length - 1] = `${last} · ${fact}`;
      else factLines.push(fact);
    }
    marks += textBlock(factLines, 0, cy + 12, 16, `class="tgc-ink-muted tgc-num" font-size="12"`);
    body += titled(hoverText(row), marks);
    y = cy + factLines.length * 16 + 4;
    if (i < rows.length - 1) body += line(0, y + 4, NARROW, y + 4, "tgc-rule");
    y += 12;
  }
  let axis = "";
  if (rows.some((row) => drawable(row.estimate))) {
    for (const t of [0, 0.5, 1]) {
      axis += text(x0 + t * (x1 - x0), y + 4, pct(t), {
        cls: "tgc-ink-muted tgc-num",
        anchor: t === 0 ? "start" : t === 1 ? "end" : "middle",
      });
    }
    y += 12;
  }
  return svgRoot(NARROW, y, body + axis);
}
