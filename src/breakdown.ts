/**
 * `breakdown`: why attempts fail.
 *
 * Rows are reasons (a failure layer, cause or check); columns are setups with
 * `n=` under each name. Each cell prints its count over a neutral tint of
 * count / n, capped at 50% so ink keeps its contrast. The accent never marks a
 * failure. On a phone the table is the view.
 *
 * Refuses: a share without its column n (the count prints with no tint);
 * counting excluded attempts (they are stated in the note); hiding a zero.
 */

import { rect, svgRoot, text, titled, WIDE } from "./svg.js";
import { table } from "./table.js";
import { capitalize, listJoin, plural, textBlock, wrap } from "./text.js";
import type { BreakdownInput, Figure, Refusal } from "./types.js";

export interface BreakdownOptions {
  /** What a row counts, lower case: "failed checks". */
  measure: string;
  id?: string;
}

export function breakdown(input: BreakdownInput, o: BreakdownOptions): Figure | Refusal {
  const id = o.id ?? "breakdown";
  const { reasons, setups } = input;
  if (reasons.length === 0 || setups.length === 0) return { id, refused: `No ${o.measure} to break down.` };
  for (const setup of setups) {
    if (setup.n !== null && (!Number.isInteger(setup.n) || setup.n < 0)) return { id, refused: `${setup.label}: invalid denominator.` };
  }
  const count = new Map<string, number | null>();
  for (const c of input.counts) {
    if (!reasons.includes(c.reason) || !setups.some((s) => s.id === c.setup)) {
      return { id, refused: `A count names ${c.reason} × ${c.setup}, which is not in the reason and setup lists.` };
    }
    const key = `${c.reason}\u0000${c.setup}`;
    if (count.has(key)) return { id, refused: `Two counts for ${c.reason} × ${c.setup}.` };
    if (c.count !== null && (!Number.isInteger(c.count) || c.count < 0)) return { id, refused: `${c.reason} × ${c.setup}: invalid count.` };
    const n = setups.find((s) => s.id === c.setup)!.n;
    if (c.count !== null && n !== null && c.count > n) {
      return { id, refused: `${c.reason} × ${c.setup}: ${c.count} exceeds the column's ${n} attempts.` };
    }
    count.set(key, c.count);
  }
  const get = (reason: string, setup: string) => count.get(`${reason}\u0000${setup}`) ?? null;

  // The reason that stops the largest share of attempts across setups with a known n.
  const withN = setups.filter((s) => s.n !== null);
  const total = withN.reduce((s, x) => s + x.n!, 0);
  const sums = reasons.map((r) => ({ r, k: withN.reduce((s, x) => s + (get(r, x.id) ?? 0), 0) }));
  const top = Math.max(...sums.map((x) => x.k));
  const leaders = sums.filter((x) => x.k === top).map((x) => x.r);
  const finding =
    total === 0 || top === 0
      ? `No ${o.measure} recorded.`
      : leaders.length === 1
        ? `${capitalize(leaders[0]!)} stops the most attempts: ${top} of ${total}.`
        : `${capitalize(listJoin(leaders))} each stop ${top} of ${total} attempts.`;
  const lede = `${total} ${plural(total, "attempt")} across ${setups.length} ${plural(setups.length, "setup")}, ${reasons.length} ${plural(reasons.length, "reason")}.`;
  const read =
    "Each cell counts attempts stopped by that reason out of the column's n; the tint deepens with the share." +
    (input.overlapping ? " One attempt can count under more than one reason." : "");
  const noN = setups.filter((s) => s.n === null);
  const exclusions = [
    ...(input.excluded ? [`${input.excluded.count} ${plural(input.excluded.count, "attempt")} excluded: ${input.excluded.why}.`] : []),
    ...(noN.length ? [`No share for ${listJoin(noN.map((s) => s.label))}: the column has no n.`] : []),
  ];

  const tableHtml = table(
    `${capitalize(o.measure)} by setup`,
    [{ label: "Reason" }, ...setups.map((s) => ({ label: `${s.label} (n=${s.n ?? "unknown"})`, numeric: true }))],
    reasons.map((r) => [r, ...setups.map((s) => {
      const k = get(r, s.id);
      return k === null ? "not recorded" : String(k);
    })]),
  );

  return {
    id,
    finding,
    lede,
    read,
    svg: { wide: wide(input, get), narrow: null },
    table: tableHtml,
    note: {
      method: `Counts of ${o.measure} per setup${input.overlapping ? "; reasons overlap" : ""}. Tint is count over n, capped at half strength.`,
      n: `${total} ${plural(total, "attempt")} over ${setups.length} ${plural(setups.length, "setup")}.`,
      exclusions,
    },
  };
}

function wide(input: BreakdownInput, get: (r: string, s: string) => number | null): string {
  const x0 = 208;
  const colW = (WIDE - x0) / input.setups.length;
  let head = "";
  let headH = 0;
  for (const [j, s] of input.setups.entries()) {
    const label = wrap(s.label, colW - 8, 12, "sans", 3);
    head += titled(s.label, textBlock(label.lines, x0 + j * colW, 14, 16, `class="tgc-ink" font-size="12"`));
    head += text(x0 + j * colW, 14 + label.lines.length * 16, `n=${s.n ?? "?"}`, { cls: "tgc-ink-muted tgc-num" });
    headH = Math.max(headH, label.lines.length * 16 + 16);
  }
  let y = headH + 8;
  let body = "";
  for (const reason of input.reasons) {
    const label = wrap(reason, 196, 14, "sans", 2);
    const h = Math.max(32, label.lines.length * 18 + 12);
    body += textBlock(label.lines, 0, y + 20, 18, `class="tgc-ink" font-size="14"`);
    for (const [j, s] of input.setups.entries()) {
      const k = get(reason, s.id);
      const x = x0 + j * colW;
      const share = k !== null && s.n ? k / s.n : null;
      let marks = share !== null ? rect(x, y + 2, colW - 8, h - 4, "tgc-tint", `rx="2" style="--s:${share.toFixed(3)}"`) : "";
      marks += text(x + 8, y + 20, k === null ? "·" : String(k), { cls: k === null ? "tgc-ink-muted tgc-num" : "tgc-ink tgc-num" });
      body += titled(`${reason} · ${s.label}: ${k === null ? "not recorded" : `${k} of ${s.n ?? "?"}`}`, marks);
    }
    y += h;
  }
  return svgRoot(WIDE, y + 4, head + body);
}
