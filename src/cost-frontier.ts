/**
 * `costFrontier`: which setup gives the most passes per dollar.
 *
 * y is the measure on a fixed 0–1 axis. x is cost per pass on a log
 * scale, reversed so cheaper sits right and better is always up and right. A
 * point on the producer's frontier is an accent disc; any other point is a
 * hollow muted circle, and an estimated cost is never a filled disc. An ink
 * line joins frontier points. Every point is labelled directly; a label that
 * collides everywhere becomes a number listed in the table. A setup with no
 * pass, an unknown cost or too few units for a rate is listed under the axis,
 * never placed: a log axis has no origin, and a point's height is a rate. On a
 * phone the plot becomes a list in rate order, with the same point marks, a
 * rate bar and the cost as text.
 *
 * Refuses: the whole figure when fewer than two setups have both a cost per
 * pass and enough units for a rate; the frontier line unless two or more
 * plotted rows carry `onFront: true` (it never computes dominance itself).
 */

import { costText, drawable, estimateNote, intervalGap, intervalName, kn, pct, perPass, rateOrder, usd, usdTick } from "./format.js";
import { log, logDomain, logTicks } from "./scale.js";
import { circle, hbar, line, NARROW, polyline, svgRoot, text, titled, WIDE } from "./svg.js";
import { type Column, table } from "./table.js";
import { capitalize, fitLines, listJoin, textBlock, textWidth, wrap } from "./text.js";
import type { Figure, RateRow, Refusal } from "./types.js";

export interface CostFrontierOptions {
  /** The y measure, lower case: "solve rate". */
  measure: string;
  id?: string;
}

interface Placed {
  row: RateRow;
  x: number;
  y: number;
  estimated: boolean;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Whether the segment a→b crosses `box` (Liang–Barsky clipping). */
function crosses(box: Box, a: [number, number], b: [number, number]): boolean {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [
    [-dx, a[0] - box.x0],
    [dx, box.x1 - a[0]],
    [-dy, a[1] - box.y0],
    [dy, box.y1 - a[1]],
  ] as const) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

/** A row the plot can place: a cost per pass and enough units for its height. */
const plottable = (row: RateRow) => perPass(row.cost) !== null && drawable(row.estimate);

/** Why a row is listed under the axis instead of placed. */
function unplacedReason(row: RateRow): string {
  if (row.solved === 0) return "0 passed";
  if (!drawable(row.estimate)) return estimateNote(row.estimate, row.attempts);
  return "cost unknown";
}

export function costFrontier(rows: RateRow[], o: CostFrontierOptions): Figure | Refusal {
  const id = o.id ?? "cost-frontier";
  const costed = rows.filter(plottable);
  const unplaced = rateOrder(rows.filter((row) => !plottable(row)));
  if (!rows.some((row) => perPass(row.cost) !== null)) return { id, refused: `No setup has a cost per pass, so cost is not drawn.` };
  if (costed.length < 2) {
    return {
      id,
      refused: `Fewer than two setups have both a cost per pass and enough units for a rate (${costed.length} of ${rows.length}); ${unplacedText(unplaced)}.`,
    };
  }
  const front = costed.filter((row) => row.onFront === true);
  const drawLine = front.length >= 2;

  const cost = (row: RateRow) => perPass(row.cost)!;
  const cheapestFront = [...front].sort((a, b) => cost(a) - cost(b))[0];
  // The setup the reader compares against: first in rank, or highest drawn rate.
  const top = rateOrder(rows)[0]!;
  const est = (row: RateRow) => (row.cost.basis === "receipts" ? "" : " (estimated)");
  let finding: string;
  if (cheapestFront && costed.includes(top) && cheapestFront.id !== top.id) {
    const saving = 1 - cost(cheapestFront) / cost(top);
    finding = `${cheapestFront.label} costs ${usd(cost(cheapestFront))} per pass${est(cheapestFront)}, ${pct(saving)} less than ${top.label}.`;
  } else if (cheapestFront && cheapestFront.id === top.id) {
    finding = `${top.label} leads on both ${o.measure} and cost per pass.`;
  } else {
    const cheapest = [...costed].sort((a, b) => cost(a) - cost(b))[0]!;
    finding = `${cheapest.label} has the lowest cost per pass, ${usd(cost(cheapest))}${est(cheapest)}.`;
  }
  const lede =
    `${costed.length} of ${rows.length} setups are plotted; ` +
    (drawLine
      ? `${front.length} sit on the producer's frontier.`
      : front.length === 1
        ? "1 sits on the producer's frontier."
        : "the producer computed no frontier.");
  const read =
    `Up is a higher ${o.measure}; right is cheaper per pass.` +
    (drawLine ? " Filled points sit on the frontier; the line joins them." : "") +
    (costed.some((r) => r.onFront && r.cost.basis !== "receipts") ? " A hollow accent ring is a frontier point with an estimated cost." : "");

  const intervals = [...new Set(costed.filter((r) => intervalGap(r.interval) === null).map((r) => intervalName(r.interval!)))];
  const bases = [...new Set(costed.map((r) => r.cost.basis))];
  const method = [
    `Cost per pass is model spend over passed attempts, ${bases.map((b) => (b === "receipts" ? "from router receipts" : b === "estimated" ? "estimated, not billed" : "from an unrecorded source")).join(" or ")}.`,
    "The frontier is the producer's: no setup off it is both cheaper and higher.",
    intervals.length ? `Vertical lines: ${intervals.join(", ")} on the ${o.measure}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const columns: Column[] = [
    { label: "Setup" },
    { label: capitalize(o.measure), numeric: true },
    { label: "Passed", numeric: true },
    { label: "Cost per pass", numeric: true },
    { label: "Cost basis" },
    { label: "On frontier" },
  ];
  const sorted = rateOrder(rows);
  const tableRows = sorted.map((row) => [
    row.label,
    drawable(row.estimate) ? pct(row.rate) : estimateNote(row.estimate, row.attempts),
    kn(row.solved, row.attempts),
    costText(row.cost, row.solved),
    row.cost.basis,
    row.onFront === null ? "not computed" : row.onFront ? "yes" : "no",
  ]);

  const { svg, numbered } = plot(costed, unplaced, drawLine, o);
  const tableHtml = table(
    `${capitalize(o.measure)} and cost per pass`,
    numbered.size ? [{ label: "Setup" }, { label: "Mark", numeric: true }, ...columns.slice(1)] : columns,
    numbered.size
      ? sorted.map((row, i) => [tableRows[i]![0]!, numbered.get(row.id) ?? "", ...tableRows[i]!.slice(1)])
      : tableRows,
  );

  return {
    id,
    finding,
    lede,
    read,
    svg: { wide: svg, narrow: narrowList(sorted) },
    table: tableHtml,
    note: {
      method,
      n: `${rows.reduce((s, r) => s + r.attempts, 0)} attempts over ${rows.length} setups.`,
      exclusions: unplaced.length ? [`Not placed: ${unplacedText(unplaced)}.`] : [],
    },
  };
}

/**
 * The phone view: a list sorted by the measure. Each row keeps the plot's
 * point mark, a rate bar and the cost as text; a log axis does not fit 358 px.
 */
function narrowList(rows: RateRow[]): string {
  const x1 = 300;
  let out = "";
  let y = 4;
  for (const [i, row] of rows.entries()) {
    const placed = plottable(row);
    const label = wrap(row.label, NARROW - 16, 14);
    let marks = placed
      ? circle(4, y + 10, 4, row.onFront ? (row.cost.basis === "receipts" ? "tgc-pt-front" : "tgc-pt-est") : "tgc-pt")
      : "";
    marks += textBlock(label.lines, 16, y + 14, 18, `class="tgc-ink" font-size="14"`);
    let cy = y + label.lines.length * 18 + 6;
    // The same rule as rankedRates: no bar over too few units, only the count.
    if (drawable(row.estimate)) {
      let end = row.rate * x1;
      marks += hbar(0, cy, end, 10, "tgc-bar");
      if (intervalGap(row.interval) === null) {
        const lo = row.interval!.lower * x1;
        const hi = row.interval!.upper * x1;
        marks += line(lo, cy + 5, hi, cy + 5, "tgc-whisker") + line(lo, cy + 1, lo, cy + 9, "tgc-whisker") + line(hi, cy + 1, hi, cy + 9, "tgc-whisker");
        end = Math.max(end, hi);
      }
      marks += text(end + 6, cy + 9.5, pct(row.rate), { cls: "tgc-ink tgc-num" });
      cy += 16;
    }
    const count = `${kn(row.solved, row.attempts)} passed${drawable(row.estimate) ? "" : `, ${estimateNote(row.estimate, row.attempts)}`}`;
    const reason = row.solved > 0 && drawable(row.estimate) ? "cost unknown · " : "";
    const fact = placed
      ? `${count} · ${costText(row.cost, row.solved)} per pass${row.onFront ? " · on the frontier" : ""}`
      : `${count} · ${reason}not plotted`;
    const facts = fitLines(fact.split(" · "), NARROW, 12, "mono");
    marks += textBlock(facts, 0, cy + 12, 16, `class="tgc-ink-muted tgc-num" font-size="12"`);
    out += titled(`${row.label} · ${fact}`, marks);
    y = cy + 4 + facts.length * 16;
    if (i < rows.length - 1) out += line(0, y + 2, NARROW, y + 2, "tgc-rule");
    y += 10;
  }
  if (rows.some((r) => drawable(r.estimate))) {
    for (const t of [0, 0.5, 1]) {
      out += text(t * x1, y + 6, pct(t), { cls: "tgc-ink-muted tgc-num", anchor: t === 0 ? "start" : t === 1 ? "end" : "middle" });
    }
    y += 12;
  }
  return svgRoot(NARROW, y, out);
}

function unplacedText(rows: RateRow[]): string {
  return listJoin(rows.map((r) => `${r.label} (${unplacedReason(r)})`));
}

function plot(costed: RateRow[], unplaced: RateRow[], drawLine: boolean, o: CostFrontierOptions) {
  const left = 48;
  const right = WIDE - 24;
  const top = 32;
  const bottom = 272;
  const costs = costed.map((r) => perPass(r.cost)!);
  const [lo, hi] = logDomain(Math.min(...costs), Math.max(...costs));
  const x = log([lo, hi], [left, right].reverse() as [number, number]);
  // y starts at 0 and ends at the first fifth above every rate and interval,
  // so low rates do not crowd the bottom of an empty plot.
  const highest = Math.max(
    ...costed.map((r) => Math.max(r.rate, intervalGap(r.interval) === null ? r.interval!.upper : 0)),
  );
  const yMax = Math.min(1, Math.max(0.2, Math.ceil(highest * 5 - 1e-9) / 5));
  const yStep = yMax <= 0.4 ? 0.1 : 0.2;
  const y = (v: number) => bottom - (v / yMax) * (bottom - top);

  let out = text(0, 14, capitalize(o.measure), { cls: "tgc-ink-muted" });
  for (let i = 0; i <= Math.round(yMax / yStep); i++) {
    const v = Number((i * yStep).toFixed(10));
    out += line(left, y(v), right, y(v), v === 0 ? "tgc-axis" : "tgc-gridline");
    out += text(left - 8, y(v) + 4, pct(v), { cls: "tgc-ink-muted tgc-num", anchor: "end" });
  }
  for (const t of logTicks(lo, hi)) {
    out += line(x(t), bottom, x(t), bottom + 4, "tgc-axis");
    out += text(x(t), bottom + 18, usdTick(t), { cls: "tgc-ink-muted tgc-num", anchor: "middle" });
  }
  out += text((left + right) / 2, bottom + 40, "Cost per pass, log scale, cheaper to the right", {
    cls: "tgc-ink-muted",
    anchor: "middle",
  });

  const placed: Placed[] = costed.map((row) => ({
    row,
    x: x(perPass(row.cost)!),
    y: y(row.rate),
    estimated: row.cost.basis !== "receipts",
  }));
  const frontLine: Array<[number, number]> = drawLine
    ? placed.filter((p) => p.row.onFront).sort((a, b) => a.x - b.x).map((p) => [p.x, p.y])
    : [];
  if (drawLine) out += polyline(frontLine, "tgc-front-line");
  for (const p of placed) {
    if (intervalGap(p.row.interval) === null) {
      out += line(p.x, y(p.row.interval!.lower), p.x, y(p.row.interval!.upper), "tgc-pt-ci");
    }
  }

  const obstacles: Box[] = placed.map((p) => ({ x0: p.x - 6, y0: p.y - 6, x1: p.x + 6, y1: p.y + 6 }));
  // Interval lines are obstacles too, so a label never sits on one.
  for (const p of placed) {
    if (intervalGap(p.row.interval) === null) {
      obstacles.push({ x0: p.x - 2, y0: y(p.row.interval!.upper), x1: p.x + 2, y1: y(p.row.interval!.lower) });
    }
  }
  const bounds: Box = { x0: 0, y0: top - 8, x1: WIDE, y1: bottom - 2 };
  const labels: string[] = [];
  const numbered = new Map<string, string>();
  for (const p of placed) {
    const w = textWidth(p.row.label, 12);
    const near: Array<[number, number, "start" | "end" | "middle", boolean]> = [
      [p.x + 9, p.y + 4, "start", false],
      [p.x - 9, p.y + 4, "end", false],
      [p.x, p.y - 10, "middle", false],
      [p.x, p.y + 18, "middle", false],
      [p.x + 26, p.y - 20, "start", true],
      [p.x - 26, p.y - 20, "end", true],
      [p.x + 26, p.y + 26, "start", true],
      [p.x - 26, p.y + 26, "end", true],
    ];
    let done = false;
    for (const [lx, ly, anchor, leader] of near) {
      const x0 = anchor === "start" ? lx : anchor === "end" ? lx - w : lx - w / 2;
      const box: Box = { x0, y0: ly - 11, x1: x0 + w, y1: ly + 3 };
      const inside = box.x0 >= bounds.x0 && box.x1 <= bounds.x1 && box.y0 >= bounds.y0 && box.y1 <= bounds.y1;
      // A label never sits on a point, an interval, another label or the frontier line.
      const onLine = frontLine.some((a, i) => i > 0 && crosses(box, frontLine[i - 1]!, a));
      if (!inside || onLine || obstacles.some((b) => overlaps(b, box))) continue;
      obstacles.push(box);
      if (leader) labels.push(line(p.x, p.y, anchor === "start" ? lx - 3 : lx + 3, ly - 4, "tgc-leader"));
      labels.push(text(lx, ly, p.row.label, { cls: "tgc-ink", anchor }));
      done = true;
      break;
    }
    if (!done) {
      const mark = String(numbered.size + 1);
      numbered.set(p.row.id, mark);
      labels.push(text(p.x + 8, p.y - 6, mark, { cls: "tgc-ink tgc-num" }));
    }
  }
  for (const p of placed) {
    const cls = p.row.onFront ? (p.estimated ? "tgc-pt-est" : "tgc-pt-front") : "tgc-pt";
    out += titled(
      `${p.row.label} · ${pct(p.row.rate)} ${o.measure} · ${costText(p.row.cost, p.row.solved)} per pass${p.row.onFront ? " · on the frontier" : ""}`,
      circle(p.x, p.y, 4, cls),
    );
  }
  out += labels.join("");

  let h = bottom + 48;
  if (unplaced.length) {
    const strip = wrap(`Not placed: ${unplacedText(unplaced)}.`, WIDE, 12, "sans", 4);
    for (const [i, lineText] of strip.lines.entries()) {
      out += text(0, h + 12 + i * 16, lineText, { cls: "tgc-ink-muted" });
    }
    h += strip.lines.length * 16 + 8;
  }
  return { svg: svgRoot(WIDE, h, out), numbered };
}
