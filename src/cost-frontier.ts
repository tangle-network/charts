/**
 * `costFrontier`: which setup gives the most solves per dollar.
 *
 * y is the measure on a fixed 0–1 axis. x is cost per solved task on a log
 * scale, reversed so cheaper sits right and better is always up and right. A
 * point on the producer's frontier is an accent disc; any other point is a
 * hollow muted circle, and an estimated cost is never a filled disc. An ink
 * line joins frontier points. Every point is labelled directly; a label that
 * collides everywhere becomes a number listed in the table. A setup with no
 * solve or an unknown cost is listed under the axis, never placed at an
 * origin a log axis does not have.
 *
 * Refuses: the whole figure when fewer than two setups have a cost per solved
 * task; the frontier line unless two or more rows carry `onFront: true` (it
 * never computes dominance itself).
 */

import { costText, intervalGap, intervalName, kn, pct, usd } from "./format.js";
import { log, logDomain, logTicks } from "./scale.js";
import { circle, line, polyline, svgRoot, text, titled, WIDE } from "./svg.js";
import { type Column, table } from "./table.js";
import { capitalize, listJoin, plural, textWidth, wrap } from "./text.js";
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

export function costFrontier(rows: RateRow[], o: CostFrontierOptions): Figure | Refusal {
  const id = o.id ?? "cost-frontier";
  const costed = rows.filter((row) => row.cost.perSolvedUsd !== null && row.cost.perSolvedUsd > 0);
  const unplaced = rows.filter((row) => !costed.includes(row));
  if (costed.length < 2) {
    return {
      id,
      refused: `Fewer than two setups have a cost per solved task (${costed.length} of ${rows.length}); ${unplacedText(unplaced)}.`,
    };
  }
  const front = costed.filter((row) => row.onFront === true);
  const drawLine = front.length >= 2;

  const cheapestFront = [...front].sort((a, b) => a.cost.perSolvedUsd! - b.cost.perSolvedUsd!)[0];
  const top = rows.every((r) => r.rank !== null)
    ? [...rows].sort((a, b) => a.rank! - b.rank!)[0]!
    : [...rows].sort((a, b) => b.rate - a.rate)[0]!;
  const est = (row: RateRow) => (row.cost.basis === "receipts" ? "" : " (estimated)");
  let finding: string;
  if (cheapestFront && top.cost.perSolvedUsd !== null && cheapestFront.id !== top.id) {
    const saving = 1 - cheapestFront.cost.perSolvedUsd! / top.cost.perSolvedUsd;
    finding = `${cheapestFront.label} costs ${usd(cheapestFront.cost.perSolvedUsd!)} per solved task${est(cheapestFront)}, ${pct(saving)} less than ${top.label}.`;
  } else if (cheapestFront && cheapestFront.id === top.id) {
    finding = `${top.label} leads on both ${o.measure} and cost per solved task.`;
  } else {
    const cheapest = [...costed].sort((a, b) => a.cost.perSolvedUsd! - b.cost.perSolvedUsd!)[0]!;
    finding = `${cheapest.label} has the lowest cost per solved task, ${usd(cheapest.cost.perSolvedUsd!)}${est(cheapest)}.`;
  }
  const lede =
    `${costed.length} of ${rows.length} setups have a cost per solved task; ` +
    (drawLine
      ? `${front.length} sit on the producer's frontier.`
      : front.length === 1
        ? "1 sits on the producer's frontier."
        : "the producer computed no frontier.");
  const read =
    `Up is a higher ${o.measure}; right is cheaper per solved task.` +
    (drawLine ? " Filled points sit on the frontier; the line joins them." : "") +
    (costed.some((r) => r.cost.basis !== "receipts") ? " A hollow accent ring is a frontier point with an estimated cost." : "");

  const intervals = [...new Set(costed.filter((r) => intervalGap(r.interval) === null).map((r) => intervalName(r.interval!)))];
  const bases = [...new Set(costed.map((r) => r.cost.basis))];
  const method = [
    `Cost per solved task is model spend over solved attempts, ${bases.map((b) => (b === "receipts" ? "from router receipts" : b === "estimated" ? "estimated, not billed" : "from an unrecorded source")).join(" or ")}.`,
    "The frontier is the producer's: no setup off it is both cheaper and higher.",
    intervals.length ? `Vertical lines: ${intervals.join(", ")} on the ${o.measure}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const columns: Column[] = [
    { label: "Setup" },
    { label: capitalize(o.measure), numeric: true },
    { label: "Solved", numeric: true },
    { label: "Cost per solve", numeric: true },
    { label: "Cost basis" },
    { label: "On frontier" },
  ];
  const sorted = [...rows].sort((a, b) => b.rate - a.rate);
  const tableRows = sorted.map((row) => [
    row.label,
    pct(row.rate),
    kn(row.solved, row.attempts),
    costText(row.cost, row.solved),
    row.cost.basis,
    row.onFront === null ? "not computed" : row.onFront ? "yes" : "no",
  ]);

  const { svg, numbered } = plot(costed, unplaced, drawLine, o);
  const tableHtml = table(
    `${capitalize(o.measure)} and cost per solved task`,
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
    svg: { wide: svg, narrow: null },
    table: tableHtml,
    note: {
      method,
      n: `${rows.reduce((s, r) => s + r.attempts, 0)} attempts over ${rows.length} setups.`,
      exclusions: unplaced.length ? [`Not placed: ${unplacedText(unplaced)}.`] : [],
    },
  };
}

function unplacedText(rows: RateRow[]): string {
  return listJoin(rows.map((r) => `${r.label}, ${r.solved === 0 ? "0 solved" : "cost unknown"}`));
}

function plot(costed: RateRow[], unplaced: RateRow[], drawLine: boolean, o: CostFrontierOptions) {
  const left = 48;
  const right = WIDE - 24;
  const top = 32;
  const bottom = 272;
  const costs = costed.map((r) => r.cost.perSolvedUsd!);
  const [lo, hi] = logDomain(Math.min(...costs), Math.max(...costs));
  const x = log([lo, hi], [left, right].reverse() as [number, number]);
  const y = (v: number) => bottom - v * (bottom - top);

  let out = text(0, 14, capitalize(o.measure), { cls: "tgc-ink-muted" });
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    out += line(left, y(v), right, y(v), v === 0 ? "tgc-axis" : "tgc-gridline");
    out += text(left - 8, y(v) + 4, pct(v), { cls: "tgc-ink-muted tgc-num", anchor: "end" });
  }
  for (const t of logTicks(lo, hi)) {
    out += line(x(t), bottom, x(t), bottom + 4, "tgc-axis");
    out += text(x(t), bottom + 18, usd(t), { cls: "tgc-ink-muted tgc-num", anchor: "middle" });
  }
  out += text((left + right) / 2, bottom + 40, "Cost per solved task, log scale, cheaper to the right", {
    cls: "tgc-ink-muted",
    anchor: "middle",
  });

  const placed: Placed[] = costed.map((row) => ({
    row,
    x: x(row.cost.perSolvedUsd!),
    y: y(row.rate),
    estimated: row.cost.basis !== "receipts",
  }));
  if (drawLine) {
    const pts = placed.filter((p) => p.row.onFront).sort((a, b) => a.x - b.x);
    out += polyline(pts.map((p) => [p.x, p.y]), "tgc-front-line");
  }
  for (const p of placed) {
    if (intervalGap(p.row.interval) === null) {
      out += line(p.x, y(p.row.interval!.lower), p.x, y(p.row.interval!.upper), "tgc-pt-ci");
    }
  }

  const obstacles: Box[] = placed.map((p) => ({ x0: p.x - 6, y0: p.y - 6, x1: p.x + 6, y1: p.y + 6 }));
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
      if (!inside || obstacles.some((b) => overlaps(b, box))) continue;
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
      `${p.row.label} · ${pct(p.row.rate)} ${o.measure} · ${costText(p.row.cost, p.row.solved)} per solved task${p.row.onFront ? " · on the frontier" : ""}`,
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
