/**
 * `taskMatrix`: where each setup succeeds and fails.
 *
 * Rows are tasks in the given (registered) order; columns are setups in rank
 * order when every setup is ranked, otherwise in the given order. Each cell
 * draws one 12 px tile per attempt, best first, then `solved/attempts`.
 * App Grade tiles fill by tier and F is an outline; U (unable to measure) is a
 * dashed outline and an integrity-flagged grade is a struck outline. Runner
 * verification fills solved tiles with the accent. A lens matrix (`show:
 * "means"`) draws one tinted cell per mean.
 *
 * Refuses: a fill for an attempt without a grade (outline with a dot); a zero
 * for a cell that never ran ("·"); counts that do not add up; any column order
 * but the given rank.
 */

import { kn, TIERS_BEST_FIRST, tierSummary, tierTotal, usd } from "./format.js";
import { circle, line, NARROW, rect, svgRoot, text, titled, WIDE } from "./svg.js";
import { table } from "./table.js";
import { capitalize, plural, textBlock, textWidth, wrap } from "./text.js";
import type { Exclusion, Figure, MatrixCell, Refusal, Setup, Tier, TierCounts } from "./types.js";

export interface TaskMatrixOptions {
  /** The App Grade tier a pass needs; named in the legend. */
  passTier?: Tier;
  /** "attempts" draws a tile per attempt; "means" draws one tinted cell per mean. */
  show?: "attempts" | "means";
  /** Singular, lower-case nouns for rows and columns. */
  nouns?: { task: string; setup: string };
  id?: string;
  excluded?: Exclusion[];
}

type TileKind = "S" | "A" | "B" | "C" | "F" | "flagged" | "unmeasured" | "ungraded" | "solved" | "open";

const TILE = 12;
const STEP = 14;

const KIND_LABEL: Record<TileKind, string> = {
  S: "S",
  A: "A",
  B: "B",
  C: "C",
  F: "F",
  flagged: "flagged",
  unmeasured: "U, not measured",
  ungraded: "not graded",
  solved: "passed",
  open: "did not pass",
};

function tilesOf(cell: MatrixCell): TileKind[] {
  const attempts = cell.attempts ?? 0;
  if (cell.tiers) {
    const out: TileKind[] = [];
    for (const tier of TIERS_BEST_FIRST) for (let i = 0; i < cell.tiers[tier]; i++) out.push(tier);
    for (let i = 0; i < (cell.flagged ?? 0); i++) out.push("flagged");
    for (let i = 0; i < (cell.unmeasured ?? 0); i++) out.push("unmeasured");
    while (out.length < attempts) out.push("ungraded");
    return out;
  }
  if (cell.solved !== null) {
    return [...Array(cell.solved).fill("solved"), ...Array(attempts - cell.solved).fill("open")];
  }
  return Array(attempts).fill("ungraded");
}

function tile(kind: TileKind, x: number, y: number): string {
  switch (kind) {
    case "S":
    case "A":
    case "B":
    case "C":
      return rect(x, y, TILE, TILE, `tgc-tier-${kind.toLowerCase()}`, 'rx="2"');
    case "solved":
      return rect(x, y, TILE, TILE, "tgc-bar", 'rx="2"');
    case "F":
    case "open":
      return rect(x + 0.75, y + 0.75, TILE - 1.5, TILE - 1.5, "tgc-open", 'rx="2"');
    case "flagged":
      return rect(x + 0.75, y + 0.75, TILE - 1.5, TILE - 1.5, "tgc-open", 'rx="2"') + line(x + 2, y + TILE - 2, x + TILE - 2, y + 2, "tgc-strike");
    case "unmeasured":
      return rect(x + 0.75, y + 0.75, TILE - 1.5, TILE - 1.5, "tgc-open tgc-dashed", 'rx="2"');
    case "ungraded":
      return rect(x + 0.75, y + 0.75, TILE - 1.5, TILE - 1.5, "tgc-open", 'rx="2"') + circle(x + TILE / 2, y + TILE / 2, 1.5, "tgc-dot");
  }
}

function cellText(cell: MatrixCell | undefined, means: boolean): string {
  if (!cell || (means ? cell.mean === null : cell.attempts === null)) return "·";
  if (means) return cell.mean!.toFixed(2);
  if (cell.attempts === 0) return "none counted";
  if (cell.solved !== null) return kn(cell.solved, cell.attempts!);
  if (cell.tiers) return tierSummary(cell.tiers, cell.unmeasured, cell.flagged);
  return `${cell.attempts}`;
}

function describe(task: string, setup: Setup, cell: MatrixCell | undefined, means: boolean): string {
  if (!cell || (means ? cell.mean === null : cell.attempts === null)) return `${task} · ${setup.label}: not run`;
  if (means) return `${task} · ${setup.label}: mean ${cell.mean!.toFixed(2)}`;
  const parts = [`${task} · ${setup.label}`];
  if (cell.attempts === 0) parts.push("no attempt counts");
  else if (cell.solved !== null) parts.push(`${cell.solved} of ${cell.attempts} passed`);
  else parts.push(`${cell.attempts} ${plural(cell.attempts!, "attempt")}`);
  const tiers = tierSummary(cell.tiers, cell.unmeasured, cell.flagged);
  if (tiers) parts.push(tiers);
  if (cell.costUsd !== null) parts.push(usd(cell.costUsd));
  return parts.join(" · ").replace(`${setup.label} · `, `${setup.label}: `);
}

function signature(cell: MatrixCell | undefined): string {
  if (!cell || cell.attempts === null) return "not run";
  return `${cell.attempts}|${tierSummary(cell.tiers, cell.unmeasured, cell.flagged)}`;
}

export function taskMatrix(
  tasks: string[],
  setupsIn: Setup[],
  cells: MatrixCell[],
  o: TaskMatrixOptions = {},
): Figure | Refusal {
  const id = o.id ?? "task-matrix";
  const means = o.show === "means";
  const noun = o.nouns ?? { task: "task", setup: "setup" };
  if (tasks.length === 0 || setupsIn.length === 0) return { id, refused: `No ${noun.task} or no ${noun.setup} to draw.` };
  const setups = setupsIn.every((s) => s.rank !== null) ? [...setupsIn].sort((a, b) => a.rank! - b.rank!) : setupsIn;

  const byKey = new Map<string, MatrixCell>();
  for (const cell of cells) {
    const key = `${cell.task}\u0000${cell.setup}`;
    if (!tasks.includes(cell.task) || !setups.some((s) => s.id === cell.setup)) {
      return { id, refused: `A cell names ${cell.task} × ${cell.setup}, which is not in the ${noun.task} and ${noun.setup} lists.` };
    }
    if (byKey.has(key)) return { id, refused: `Two cells for ${cell.task} × ${cell.setup}.` };
    if (!means && cell.attempts !== null) {
      const graded = tierTotal(cell.tiers) + (cell.flagged ?? 0) + (cell.unmeasured ?? 0);
      if (graded > cell.attempts || (cell.solved !== null && cell.solved > cell.attempts)) {
        return { id, refused: `${cell.task} × ${cell.setup}: grades or passes exceed its ${cell.attempts} attempts.` };
      }
    }
    byKey.set(key, cell);
  }
  const at = (task: string, setup: Setup) => byKey.get(`${task}\u0000${setup.id}`);
  const tasksN = `${tasks.length} ${plural(tasks.length, noun.task)}`;

  // Finding, keyed on what the cells carry.
  let finding: string;
  const passRule = cells.some((c) => c.solved !== null);
  if (means) {
    const leads = new Map<string, number>();
    for (const task of tasks) {
      const scored = setups.map((s) => ({ s, m: at(task, s)?.mean ?? null })).filter((x) => x.m !== null);
      if (scored.length < 2) continue;
      const top = Math.max(...scored.map((x) => x.m!));
      const leaders = scored.filter((x) => x.m === top);
      if (leaders.length === 1) leads.set(leaders[0]!.s.id, (leads.get(leaders[0]!.s.id) ?? 0) + 1);
    }
    const [leaderId, count] = [...leads.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    finding = leaderId
      ? `${setups.find((s) => s.id === leaderId)!.label} has the highest mean on ${count} of ${tasksN}.`
      : `No ${noun.setup} has the highest mean on any ${noun.task}.`;
  } else if (passRule) {
    const k = tasks.filter((task) => setups.every((s) => (at(task, s)?.solved ?? 0) > 0)).length;
    finding =
      k === 0
        ? `No ${noun.task} passed for every ${noun.setup}.`
        : `${k} of ${tasksN} passed at least once for every ${noun.setup}.`;
  } else if (setups.length > 1) {
    const k = tasks.filter((task) => new Set(setups.map((s) => signature(at(task, s)))).size === 1).length;
    finding =
      k === tasks.length
        ? `Every ${noun.setup} gave the same grades on all ${tasksN}.`
        : `Every ${noun.setup} gave the same grades on ${k} of ${tasksN}.`;
  } else {
    const all = cells.reduce(
      (acc, c) => {
        for (const t of TIERS_BEST_FIRST) acc.tiers[t] += c.tiers?.[t] ?? 0;
        acc.u += c.unmeasured ?? 0;
        acc.f += c.flagged ?? 0;
        return acc;
      },
      { tiers: { S: 0, A: 0, B: 0, C: 0, F: 0 } as TierCounts, u: 0, f: 0 },
    );
    finding = `${setups[0]!.label} graded ${tasksN}: ${tierSummary(all.tiers, all.u, all.f)}.`;
  }

  const attempts = cells.reduce((s, c) => s + (c.attempts ?? 0), 0);
  const ran = cells.filter((c) => (means ? c.mean !== null : c.attempts !== null)).length;
  const excluded = (o.excluded ?? []).reduce((s, e) => s + e.count, 0);
  const lede = means
    ? `${ran} of ${tasks.length * setups.length} cells scored, over ${tasksN} and ${setups.length} ${plural(setups.length, noun.setup)}.`
    : `${attempts} ${plural(attempts, "attempt")} over ${tasksN} and ${setups.length} ${plural(setups.length, noun.setup)}${excluded ? `; ${excluded} more excluded` : ""}.`;

  const kinds = new Set<TileKind>();
  if (!means) for (const cell of cells) for (const k of tilesOf(cell)) kinds.add(k);
  const tiered = cells.some((c) => c.tiers !== null);
  const read = means
    ? `Each cell is one ${noun.setup}'s mean on one ${noun.task}; a deeper tint is a higher mean, and · marks a pair never scored.`
    : tiered
      ? `One tile per attempt, best first: tiles fill by App Grade tier and an outline is F${o.passTier ? `; ${o.passTier} or better passes` : ""}. Tile order is not run order.`
      : `One tile per attempt: a filled tile passed and an outline did not. Tile order is not run order.`;

  const method = means
    ? "Each cell is the producer's mean score for that pair; the library computes nothing."
    : [
        tiered ? `Tiles show the App Grade tier of each attempt${o.passTier ? `, and ${o.passTier} or better counts as a pass` : ""}.` : "Filled tiles are the attempts the producer marks solved.",
        kinds.has("unmeasured") ? "U marks an attempt the grader could not measure." : "",
        kinds.has("flagged") ? "A struck tile is a grade that failed an integrity check and awaits human review; it never counts as a pass." : "",
        kinds.has("ungraded") ? "A dotted outline is an attempt with no grade." : "",
      ]
        .filter(Boolean)
        .join(" ");

  const tableHtml = table(
    `${capitalize(noun.task)} by ${noun.setup}`,
    [{ label: capitalize(noun.task) }, ...setups.map((s) => ({ label: s.label, numeric: true }))],
    tasks.map((task) => [
      task,
      ...setups.map((s) => {
        const cell = at(task, s);
        const main = cellText(cell, means);
        const extra =
          !means && cell && cell.solved !== null && cell.tiers ? ` · ${tierSummary(cell.tiers, cell.unmeasured, cell.flagged)}` : "";
        const cost = cell && cell.costUsd !== null ? ` · ${usd(cell.costUsd)}` : "";
        return main === "·" ? "not run" : `${main}${extra}${cost}`;
      }),
    ]),
  );

  const legendKinds = [...kinds].sort(
    (a, b) =>
      ["S", "A", "B", "C", "solved", "F", "open", "flagged", "unmeasured", "ungraded"].indexOf(a) -
      ["S", "A", "B", "C", "solved", "F", "open", "flagged", "unmeasured", "ungraded"].indexOf(b),
  );

  return {
    id,
    finding,
    lede,
    read,
    svg: {
      wide: wideMatrix(tasks, setups, at, means, legendKinds, o),
      narrow: narrowMatrix(tasks, setups, at, means, legendKinds, o),
    },
    table: tableHtml,
    note: {
      method,
      n: means ? `${ran} scored cells.` : `${attempts} ${plural(attempts, "attempt")} in ${ran} cells.`,
      exclusions: (o.excluded ?? []).map((e) => `${e.count} ${plural(e.count, "attempt")} excluded: ${e.why}.`),
    },
  };
}

type At = (task: string, setup: Setup) => MatrixCell | undefined;

/** Tiles and the count for one cell, wrapped within `width`. Returns markup and height. */
function cellMarks(cell: MatrixCell | undefined, x: number, y: number, width: number, means: boolean) {
  const label = cellText(cell, means);
  if (means) {
    if (!cell || cell.mean === null) return { svg: text(x, y + 16, "·", { cls: "tgc-ink-muted tgc-num" }), h: 24 };
    const v = Math.max(0, Math.min(1, cell.mean));
    return {
      svg:
        rect(x, y + 2, width - 4, 22, "tgc-mean", `rx="2" style="--v:${v.toFixed(3)}"`) +
        text(x + 6, y + 17, label, { cls: "tgc-ink tgc-num" }),
      h: 28,
    };
  }
  if (!cell || cell.attempts === null || cell.attempts === 0) {
    return { svg: text(x, y + 16, label, { cls: "tgc-ink-muted tgc-num" }), h: 24 };
  }
  const tiles = tilesOf(cell);
  const labelW = textWidth(label, 12, "mono");
  const perLine = Math.max(1, Math.floor((width - labelW - 8) / STEP));
  let svg = "";
  tiles.forEach((kind, i) => {
    svg += tile(kind, x + (i % perLine) * STEP, y + 6 + Math.floor(i / perLine) * STEP);
  });
  const lines = Math.ceil(tiles.length / perLine);
  const labelX = x + Math.min(tiles.length, perLine) * STEP + 4;
  svg += text(labelX, y + 16, label, { cls: cell.solved === 0 ? "tgc-ink-muted tgc-num" : "tgc-ink tgc-num" });
  return { svg, h: Math.max(24, lines * STEP + 10) };
}

function legend(kinds: TileKind[], width: number, y: number, o: TaskMatrixOptions): { svg: string; h: number } {
  if (kinds.length === 0) return { svg: "", h: 0 };
  let svg = "";
  let x = 0;
  let row = 0;
  const items: Array<{ kind: TileKind; label: string }> = kinds.map((kind) => ({
    kind,
    label: KIND_LABEL[kind] + (o.passTier && ["S", "A", "B", "C", "F"].includes(kind) && kind === o.passTier ? " (pass)" : ""),
  }));
  for (const item of items) {
    const w = STEP + textWidth(item.label, 12) + 16;
    if (x > 0 && x + w > width) {
      x = 0;
      row += 1;
    }
    svg += tile(item.kind, x, y + row * 20 + 2) + text(x + STEP + 2, y + row * 20 + 12, item.label, { cls: "tgc-ink-muted" });
    x += w;
  }
  return { svg, h: (row + 1) * 20 };
}

function wideMatrix(tasks: string[], setups: Setup[], at: At, means: boolean, kinds: TileKind[], o: TaskMatrixOptions): string {
  const labelW = 196;
  const x0 = 208;
  const colW = (WIDE - x0) / setups.length;
  let head = "";
  let headH = 0;
  for (const [j, s] of setups.entries()) {
    const label = wrap(s.label, colW - 8, 12, "sans", 3);
    headH = Math.max(headH, label.lines.length * 16);
    head += titled(s.label, textBlock(label.lines, x0 + j * colW, 14, 16, `class="tgc-ink" font-size="12"`));
  }
  let y = headH + 12;
  head += line(0, y - 4, WIDE, y - 4, "tgc-rule");
  let body = "";
  for (const [i, task] of tasks.entries()) {
    const label = wrap(task, labelW, 12, "sans", 2);
    let h = label.lines.length * 16 + 8;
    let marks = "";
    for (const [j, s] of setups.entries()) {
      const cell = at(task, s);
      const m = cellMarks(cell, x0 + j * colW, y, colW - 8, means);
      h = Math.max(h, m.h);
      marks += titled(describe(task, s, cell, means), m.svg);
    }
    body += titled(task, textBlock(label.lines, 0, y + 16, 16, `class="tgc-ink" font-size="12"`)) + marks;
    y += h + 4;
    if (i < tasks.length - 1) body += line(0, y - 2, WIDE, y - 2, "tgc-gridline");
  }
  const lg = legend(kinds, WIDE, y + 10, o);
  return svgRoot(WIDE, y + 10 + lg.h + 4, head + body + lg.svg);
}

function narrowMatrix(tasks: string[], setups: Setup[], at: At, means: boolean, kinds: TileKind[], o: TaskMatrixOptions): string {
  const cellW = 128;
  const labelW = NARROW - cellW - 8;
  let y = 0;
  let body = "";
  for (const s of setups) {
    const head = wrap(s.label, NARROW, 14, "sans-semibold", 2);
    body += textBlock(head.lines, 0, y + 16, 18, `class="tgc-ink" font-size="14" font-weight="600"`);
    y += head.lines.length * 18 + 8;
    body += line(0, y, NARROW, y, "tgc-rule");
    y += 2;
    for (const task of tasks) {
      const label = wrap(task, labelW, 12, "sans", 2);
      const cell = at(task, s);
      const m = cellMarks(cell, NARROW - cellW, y, cellW, means);
      const h = Math.max(label.lines.length * 16 + 8, m.h);
      body += titled(describe(task, s, cell, means), textBlock(label.lines, 0, y + 16, 16, `class="tgc-ink" font-size="12"`) + m.svg);
      y += h + 2;
    }
    y += 16;
  }
  const lg = legend(kinds, NARROW, y, o);
  return svgRoot(NARROW, y + lg.h + 4, body + lg.svg);
}

