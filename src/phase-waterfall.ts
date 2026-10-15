/** Static cumulative timing from ordered, disjoint producer phases. */
import { hatch, line, NARROW, rect, svgRoot, text, titled, WIDE } from "./svg.js";
import { table } from "./table.js";
import { capitalize, plural, wrap } from "./text.js";
import type { Figure, Refusal } from "./types.js";

export interface WaterfallPhase { id: string; label: string; ms: number; kind?: "measured" | "unaccounted" }
export interface PhaseWaterfallOptions { measure: string; totalMs: number; id?: string }

export function phaseWaterfall(phases: WaterfallPhase[], o: PhaseWaterfallOptions): Figure | Refusal {
  const id = o.id ?? "phase-waterfall";
  if (!phases.length) return { id, refused: "No phases recorded." };
  if (!o.measure?.trim() || !Number.isFinite(o.totalMs) || o.totalMs <= 0) return { id, refused: "A waterfall needs a measure and positive total time." };
  if (new Set(phases.map(p => p.id)).size !== phases.length) return { id, refused: "Duplicate phase ids." };
  if (phases.some(p => p.id === "__unaccounted")) return { id, refused: "Phase id __unaccounted is reserved." };
  for (const phase of phases) {
    if (!Number.isFinite(phase.ms) || phase.ms < 0) return { id, refused: `${phase.label}: invalid duration.` };
    if (phase.kind !== undefined && phase.kind !== "measured" && phase.kind !== "unaccounted") return { id, refused: `${phase.label}: unknown phase kind.` };
  }
  const accounted = phases.reduce((s, p) => s + p.ms, 0);
  if (accounted > o.totalMs + 0.001) return { id, refused: `Phase durations ${accounted} ms exceed the reported total ${o.totalMs} ms; phases may overlap.` };
  const unassigned = Math.max(0, o.totalMs - accounted);
  const namedUnaccounted = phases.filter(p => p.kind === "unaccounted").reduce((s, p) => s + p.ms, 0);
  const fmt = (ms: number) => `${(ms / 1000).toFixed(2)} s`;
  const short = (ms: number) => ms < 1000 ? `${Number(ms.toPrecision(3))} ms` : fmt(ms);
  const largest = phases.reduce((a, p) => p.ms > a.ms ? p : a, phases[0]!);
  const all = unassigned > 0.001 ? [...phases, { id: "__unaccounted", label: "Unassigned remainder", ms: unassigned, kind: "unaccounted" as const }] : phases;
  let cumulative = 0;
  const rows = all.map(p => { const start = cumulative; cumulative += p.ms; return { ...p, start }; });
  return {
    id,
    finding: largest.kind === "unaccounted"
      ? `${capitalize(largest.label)} is the largest leaf, but its work is unaccounted: ${fmt(largest.ms)} of ${fmt(o.totalMs)}.`
      : `${capitalize(largest.label)} takes the longest recorded phase: ${fmt(largest.ms)} of ${fmt(o.totalMs)}.`,
    lede: `${fmt(accounted)} in ${phases.length} ordered ${plural(phases.length, "leaf")}; ${fmt(namedUnaccounted)} producer-labelled unaccounted and ${fmt(unassigned)} unassigned remainder.`,
    read: "Each bar begins where the previous phase ends. Hatched bars are producer-labelled unaccounted leaves or the unassigned remainder; zero phases remain listed without a positive bar.",
    svg: { wide: draw(rows, o.totalMs, WIDE, short), narrow: draw(rows, o.totalMs, NARROW, short) },
    table: table(`${capitalize(o.measure)} by phase`, [{ label: "Phase" }, { label: "Duration", numeric: true }, { label: "Cumulative", numeric: true }, { label: "Kind" }], rows.map(p => [p.label, short(p.ms), fmt(p.start + p.ms), p.kind === "unaccounted" ? "unaccounted" : "measured"])),
    note: { method: "Ordered disjoint leaf durations as supplied by the producer; no overlap or critical-path inference. Hatching marks producer-labelled unaccounted leaves and the calculated remainder; the table names which is which.", n: `${phases.length} phases, ${fmt(o.totalMs)} reported total.`, exclusions: [] },
  };
}

function draw(rows: Array<WaterfallPhase & { start: number }>, total: number, width: number, short: (ms: number) => string): string {
  const phone = width === NARROW, left = phone ? 12 : 190, right = phone ? 52 : 64;
  const plotW = width - left - right, rowH = phone ? 42 : 24, top = 27;
  let body = "";
  for (let i = 0; i <= 4; i++) {
    const x = left + plotW * i / 4;
    body += line(x, top - 4, x, top + rows.length * rowH, "tgc-gridline");
    body += text(x, 15, `${(total * i / 4000).toFixed(0)} s`, { size: 10, cls: "tgc-ink-muted tgc-num", anchor: i === 0 ? "start" : i === 4 ? "end" : "middle" });
  }
  rows.forEach((p, i) => {
    const y = top + i * rowH, start = left + p.start / total * plotW, w = p.ms / total * plotW;
    const label = wrap(p.label, phone ? width - 65 : left - 6, phone ? 11 : 12, "sans", 1);
    body += titled(p.label, text(phone ? 12 : 2, y + (phone ? 13 : 18), label.lines[0]!, { size: phone ? 11 : 12, cls: p.id === "__unaccounted" ? "tgc-ink-muted" : "tgc-ink" }));
    const barY = y + (phone ? 21 : 5), barW = Math.max(p.ms > 0 ? 1 : 0, w);
    const bar = p.kind === "unaccounted" ? hatch(start, barY, barW, 13, "tgc-waterfall-unaccounted") : rect(start, barY, barW, 13, "tgc-waterfall-bar", 'rx="2"');
    body += titled(`${p.label}: ${short(p.ms)}; cumulative ${((p.start + p.ms) / 1000).toFixed(2)} s`, bar);
    body += text(width - 2, barY + 11, short(p.ms), { size: phone ? 10 : 11, cls: "tgc-ink tgc-num", anchor: "end" });
  });
  return svgRoot(width, top + rows.length * rowH + 2, body);
}
