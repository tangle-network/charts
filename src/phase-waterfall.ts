/** Static cumulative timing from ordered, disjoint producer phases. */
import { NARROW, rect, svgRoot, text, titled, WIDE } from "./svg.js";
import { table } from "./table.js";
import { capitalize, plural, wrap } from "./text.js";
import type { Figure, Refusal } from "./types.js";

export interface WaterfallPhase { id: string; label: string; ms: number }
export interface PhaseWaterfallOptions { measure: string; totalMs: number; id?: string }

export function phaseWaterfall(phases: WaterfallPhase[], o: PhaseWaterfallOptions): Figure | Refusal {
  const id = o.id ?? "phase-waterfall";
  if (!phases.length) return { id, refused: "No phases recorded." };
  if (!o.measure?.trim() || !Number.isFinite(o.totalMs) || o.totalMs <= 0) return { id, refused: "A waterfall needs a measure and positive total time." };
  if (new Set(phases.map(p => p.id)).size !== phases.length) return { id, refused: "Duplicate phase ids." };
  if (phases.some(p => p.id === "__unaccounted")) return { id, refused: "Phase id __unaccounted is reserved." };
  for (const phase of phases) if (!Number.isFinite(phase.ms) || phase.ms < 0) return { id, refused: `${phase.label}: invalid duration.` };
  const accounted = phases.reduce((s, p) => s + p.ms, 0);
  if (accounted > o.totalMs + 0.001) return { id, refused: `Phase durations ${accounted} ms exceed the reported total ${o.totalMs} ms; phases may overlap.` };
  const unaccounted = Math.max(0, o.totalMs - accounted);
  const fmt = (ms: number) => `${(ms / 1000).toFixed(2)} s`;
  const largest = phases.reduce((a, p) => p.ms > a.ms ? p : a, phases[0]!);
  const all = unaccounted > 0.001 ? [...phases, { id: "__unaccounted", label: "Unaccounted time", ms: unaccounted }] : phases;
  let cumulative = 0;
  const rows = all.map(p => { const start = cumulative; cumulative += p.ms; return { ...p, start }; });
  return {
    id,
    finding: `${capitalize(largest.label)} takes the longest recorded phase: ${fmt(largest.ms)} of ${fmt(o.totalMs)}.`,
    lede: `${fmt(accounted)} accounted for across ${phases.length} ordered ${plural(phases.length, "phase")}; ${fmt(unaccounted)} unaccounted.`,
    read: "Each bar begins where the previous phase ends. Grey unaccounted time closes the reported total; zero phases remain listed without a positive bar.",
    svg: { wide: draw(rows, o.totalMs, WIDE), narrow: draw(rows, o.totalMs, NARROW) },
    table: table(`${capitalize(o.measure)} by phase`, [{ label: "Phase" }, { label: "Duration", numeric: true }, { label: "Cumulative", numeric: true }], rows.map(p => [p.label, fmt(p.ms), fmt(p.start + p.ms)])),
    note: { method: "Ordered disjoint leaf durations as supplied by the producer; no overlap or critical-path inference. Unaccounted time is total minus the sum of leaves.", n: `${phases.length} phases, ${fmt(o.totalMs)} reported total.`, exclusions: [] },
  };
}

function draw(rows: Array<WaterfallPhase & { start: number }>, total: number, width: number): string {
  const phone = width === NARROW, left = phone ? 12 : 190, right = phone ? 52 : 64;
  const plotW = width - left - right, rowH = phone ? 47 : 28;
  let body = "";
  rows.forEach((p, i) => {
    const y = i * rowH, start = left + p.start / total * plotW, w = p.ms / total * plotW;
    const label = wrap(p.label, phone ? width - 65 : left - 6, phone ? 11 : 12, "sans", 1);
    body += titled(p.label, text(phone ? 12 : 2, y + (phone ? 13 : 18), label.lines[0]!, { size: phone ? 11 : 12, cls: p.id === "__unaccounted" ? "tgc-ink-muted" : "tgc-ink" }));
    const barY = y + (phone ? 21 : 7), cls = p.id === "__unaccounted" ? "tgc-waterfall-unaccounted" : "tgc-waterfall-bar";
    body += titled(`${p.label}: ${(p.ms / 1000).toFixed(2)} s; cumulative ${((p.start + p.ms) / 1000).toFixed(2)} s`, rect(start, barY, Math.max(p.ms > 0 ? 1 : 0, w), 13, cls, 'rx="2"'));
    body += text(width - 2, barY + 11, `${(p.ms / 1000).toFixed(2)}`, { size: phone ? 10 : 11, cls: "tgc-ink tgc-num", anchor: "end" });
  });
  return svgRoot(width, rows.length * rowH + 2, body);
}
