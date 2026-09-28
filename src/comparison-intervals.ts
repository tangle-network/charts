/**
 * `comparisonIntervals`: is each step in an order real.
 *
 * One row per comparison, "{favored} over {other}", with the pair count. x is
 * the difference in points with a muted zero line. The clustered interval is a
 * 6 px accent bar, the exact interval a 2 px muted bar under it, and a dashed
 * ink tick marks the row's registered minimum effect. There is no point
 * estimate, because the record carries none.
 *
 * Refuses: a row whose interval names no level or method, or that has no pair
 * count or no registered minimum effect (each is listed in the note); the
 * whole figure when no row can be drawn.
 */

import { intervalGap, intervalName, pts } from "./format.js";
import { linear, linearTicks } from "./scale.js";
import { line, NARROW, rect, svgRoot, text, titled, WIDE } from "./svg.js";
import { type Column, table } from "./table.js";
import { capitalize, listJoin, plural, textBlock, wrap } from "./text.js";
import type { ComparisonRow, Figure, Refusal, Setup } from "./types.js";

export interface ComparisonIntervalsOptions {
  /** The measure the difference is in, lower case: "solve rate". */
  measure: string;
  id?: string;
}

interface Drawn {
  row: ComparisonRow;
  title: string;
}

function gaps(row: ComparisonRow): string[] {
  const out: string[] = [];
  const gap = intervalGap(row.interval);
  if (gap) out.push(gap);
  if (row.exactInterval !== null) {
    const exactGap = intervalGap(row.exactInterval);
    if (exactGap) out.push(`exact interval: ${exactGap}`);
  }
  if (row.pairs === null) out.push("no pair count");
  else if (!Number.isInteger(row.pairs) || row.pairs <= 0) out.push("invalid pair count");
  if (row.minimumEffect === null) out.push("no registered minimum effect");
  else if (!Number.isFinite(row.minimumEffect)) out.push("invalid registered minimum effect");
  return out;
}

export function comparisonIntervals(
  rows: ComparisonRow[],
  setups: Setup[],
  o: ComparisonIntervalsOptions,
): Figure | Refusal {
  const id = o.id ?? "comparison-intervals";
  const name = (setupId: string) => setups.find((s) => s.id === setupId)?.label ?? setupId;
  const title = (row: ComparisonRow) => `${name(row.favored)} over ${name(row.other)}`;
  if (rows.length === 0) return { id, refused: "No comparison was registered." };
  const drawn: Drawn[] = [];
  const refused: string[] = [];
  for (const row of rows) {
    const missing = gaps(row);
    if (missing.length) refused.push(`${title(row)}: ${listJoin(missing)}`);
    else drawn.push({ row, title: title(row) });
  }
  if (drawn.length === 0) {
    return {
      id,
      refused: rows.every((r) => r.interval === null)
        ? `${rows.length} ${plural(rows.length, "comparison")} listed; none carries an interval.`
        : `No comparison can be drawn. ${refused.join("; ")}.`,
    };
  }

  // A step is backed only when every interval drawn for it clears the minimum effect.
  const clears = drawn.filter(
    ({ row }) =>
      row.interval!.lower > row.minimumEffect! &&
      (intervalGap(row.exactInterval) !== null || row.exactInterval!.lower > row.minimumEffect!),
  );
  const finding =
    clears.length === drawn.length
      ? drawn.length === 1
        ? "The step clears its registered minimum effect."
        : `Each of the ${drawn.length} steps clears its registered minimum effect.`
      : clears.length === 0
        ? `No step clears its registered minimum effect.`
        : `${clears.length} of ${drawn.length} steps clear their registered minimum effect.`;
  const pairs = drawn.reduce((s, d) => s + d.row.pairs!, 0);
  const lede = `${drawn.length} ${plural(drawn.length, "comparison")} over ${pairs} paired ${plural(pairs, "attempt")}${refused.length ? `; ${refused.length} not drawn` : ""}.`;
  const names = [...new Set(drawn.map((d) => intervalName(d.row.interval!)))];
  const exactNames = [
    ...new Set(drawn.filter((d) => intervalGap(d.row.exactInterval) === null).map((d) => intervalName(d.row.exactInterval!))),
  ];
  const read =
    `Each bar is the ${names.join(" or ")} interval on the difference in ${o.measure}` +
    (exactNames.length ? `; the thin bar under it is the ${exactNames.join(" or ")} interval` : "") +
    ". A step is backed when every bar lies wholly right of the dashed minimum effect.";

  const columns: Column[] = [
    { label: "Comparison" },
    { label: "Pairs", numeric: true },
    { label: "Minimum effect", numeric: true },
    { label: "Interval", numeric: true },
    { label: "Exact interval", numeric: true },
  ];
  const fmt = (i: ComparisonRow["interval"], n: number | null) =>
    i && intervalGap(i) === null
      ? `${pts(i.lower)} to ${pts(i.upper)} (${intervalName(i)}, n=${n})`
      : i ? `not drawn (${intervalGap(i)})` : "none";
  const tableRows = rows.map((row) => [
    title(row),
    row.pairs === null ? "not recorded" : String(row.pairs),
    row.minimumEffect === null ? "none registered" : pts(row.minimumEffect),
    fmt(row.interval, row.pairs),
    fmt(row.exactInterval, row.pairs),
  ]);

  const values = drawn.flatMap(({ row }) => [
    row.interval!.lower,
    row.interval!.upper,
    row.minimumEffect!,
    0,
    ...(intervalGap(row.exactInterval) === null ? [row.exactInterval!.lower, row.exactInterval!.upper] : []),
  ]);
  const span = Math.max(...values) - Math.min(...values) || 0.1;
  const domain: [number, number] = [Math.min(...values) - span * 0.08, Math.max(...values) + span * 0.08];

  return {
    id,
    finding,
    lede,
    read,
    svg: { wide: draw(drawn, domain, WIDE, 272, 264), narrow: draw(drawn, domain, NARROW, 0, 0) },
    table: table(`Comparisons on ${o.measure}`, columns, tableRows),
    note: {
      method: `${capitalize(o.measure)} difference, favored minus other, in points. Intervals: ${[...names, ...exactNames].join(", ")}.`,
      n: `${pairs} paired ${plural(pairs, "attempt")} over ${drawn.length} ${plural(drawn.length, "comparison")}.`,
      exclusions: refused.map((r) => `Not drawn: ${r}.`),
    },
  };
}

/** labelW 0 stacks the label above the bar (phone). */
function draw(drawn: Drawn[], domain: [number, number], width: number, plotX: number, labelW: number): string {
  const x = linear(domain, [plotX, width - 8]);
  let body = "";
  let y = 8;
  const rowsTop = y;
  for (const { row, title } of drawn) {
    let marks = "";
    let barY: number;
    if (labelW > 0) {
      const label = wrap(title, labelW, 14);
      marks += textBlock(label.lines, 0, y + 14, 18, `class="tgc-ink" font-size="14"`);
      marks += text(0, y + 14 + label.lines.length * 18, `${row.pairs} pairs`, { cls: "tgc-ink-muted tgc-num" });
      barY = y + 8;
      y += Math.max(label.lines.length * 18 + 22, 36);
    } else {
      const label = wrap(title, width, 14);
      marks += textBlock(label.lines, 0, y + 14, 18, `class="tgc-ink" font-size="14"`);
      marks += text(width, y + 14, `${row.pairs} pairs`, { cls: "tgc-ink-muted tgc-num", anchor: "end" });
      barY = y + label.lines.length * 18 + 4;
      y = barY + 24;
    }
    const lo = x(row.interval!.lower);
    const hi = x(row.interval!.upper);
    marks += rect(lo, barY, Math.max(hi - lo, 2), 6, "tgc-ci");
    if (row.exactInterval && intervalGap(row.exactInterval) === null) {
      const elo = x(row.exactInterval.lower);
      const ehi = x(row.exactInterval.upper);
      marks += rect(elo, barY + 9, Math.max(ehi - elo, 2), 2, "tgc-ci-exact");
    }
    const me = x(row.minimumEffect!);
    marks += line(me, barY - 8, me, barY + 20, "tgc-threshold");
    body += titled(
      `${title} · ${row.pairs} pairs · ${intervalName(row.interval!)} interval ${pts(row.interval!.lower)} to ${pts(row.interval!.upper)}${rateExactTitle(row)} · minimum effect ${pts(row.minimumEffect!)}`,
      marks,
    );
  }
  const zero = x(0);
  let axis = line(zero, rowsTop, zero, y, "tgc-zero");
  for (const t of linearTicks(domain[0], domain[1], width > 400 ? 6 : 3)) {
    axis += text(x(t), y + 16, pts(t), { cls: "tgc-ink-muted tgc-num", anchor: "middle" });
  }
  return svgRoot(width, y + 24, axis + body);
}

function rateExactTitle(row: ComparisonRow): string {
  return intervalGap(row.exactInterval) === null
    ? ` · ${intervalName(row.exactInterval!)} exact interval ${pts(row.exactInterval!.lower)} to ${pts(row.exactInterval!.upper)}`
    : "";
}
