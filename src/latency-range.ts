/** p50 point, p95 extent, and a caller-supplied SLO. */
import { circle, line, NARROW, rect, svgRoot, text, titled, WIDE } from "./svg.js";
import { table } from "./table.js";
import { capitalize, plural, wrap } from "./text.js";
import type { Figure, Refusal } from "./types.js";

export interface LatencyRangeRow { id: string; label: string; p50Ms: number; p95Ms: number; n: number }
export interface LatencyRangeOptions { measure: string; sloMs: number; minN: number; excluded?: string[]; id?: string }

export function latencyRange(rows: LatencyRangeRow[], o: LatencyRangeOptions): Figure | Refusal {
  const id = o.id ?? "latency-range";
  if (!rows.length) return { id, refused: "No latency ranges recorded." };
  if (!o.measure?.trim() || !Number.isFinite(o.sloMs) || o.sloMs <= 0 || !Number.isInteger(o.minN) || o.minN < 1) return { id, refused: "A latency range needs a measure, positive SLO and minimum n." };
  if (new Set(rows.map(r => r.id)).size !== rows.length) return { id, refused: "Duplicate latency row ids." };
  for (const r of rows) {
    if (!Number.isInteger(r.n) || r.n < o.minN) return { id, refused: `${r.label}: n=${r.n} is below the stated minimum n=${o.minN}.` };
    if (!Number.isFinite(r.p50Ms) || !Number.isFinite(r.p95Ms) || r.p50Ms <= 0 || r.p95Ms < r.p50Ms) return { id, refused: `${r.label}: invalid p50 or p95 for a log axis.` };
  }
  const breached = rows.filter(r => r.p95Ms > o.sloMs);
  const fmt = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
  const min = Math.min(o.sloMs, ...rows.map(r => r.p50Ms)) / 1.5;
  const max = Math.max(o.sloMs, ...rows.map(r => r.p95Ms)) * 1.12;
  return {
    id,
    finding: `${breached.length} of ${rows.length} ${plural(rows.length, "range")} exceed the ${fmt(o.sloMs)} p95 SLO.`,
    lede: `${rows.length} of ${rows.length + (o.excluded?.length ?? 0)} ${plural(rows.length + (o.excluded?.length ?? 0), "setup")} have at least ${o.minN} observations.`,
    read: "The dot is p50; the bar runs from p50 to p95 on a logarithmic time axis. The dashed rule is the p95 SLO. Input order is preserved.",
    svg: { wide: draw(rows, o, min, max, WIDE), narrow: draw(rows, o, min, max, NARROW) },
    table: table(`${capitalize(o.measure)} by setup`, [{ label: "Setup" }, { label: "p50", numeric: true }, { label: "p95", numeric: true }, { label: "n", numeric: true }, { label: "p95 SLO" }], rows.map(r => [r.label, fmt(r.p50Ms), fmt(r.p95Ms), String(r.n), r.p95Ms > o.sloMs ? "breach" : "pass"])),
    note: { method: `Recorded p50 and p95 in milliseconds on a logarithmic time axis; producer supplies quantiles. The p95 SLO is ${fmt(o.sloMs)}.`, n: `${rows.reduce((s, r) => s + r.n, 0)} observations across ${rows.length} rows; minimum n=${o.minN} per row.`, exclusions: o.excluded ?? [] },
  };
}

function draw(rows: LatencyRangeRow[], o: LatencyRangeOptions, min: number, max: number, width: number): string {
  const phone = width === NARROW, left = phone ? 122 : 148, right = phone ? 69 : 92;
  const plotW = width - left - right, top = 48, rowH = phone ? 49 : 39;
  const scale = (ms: number) => left + (Math.log(ms) - Math.log(min)) / (Math.log(max) - Math.log(min)) * plotW;
  let body = line(scale(o.sloMs), top - 11, scale(o.sloMs), top + rows.length * rowH, "tgc-threshold");
  body += text(scale(o.sloMs) + 3, 15, `SLO ${(o.sloMs / 1000).toFixed(0)} s`, { size: 11, cls: "tgc-ink-muted tgc-num" });
  for (let exponent = Math.floor(Math.log10(min)); exponent <= Math.ceil(Math.log10(max)); exponent++) {
    for (const step of [1, 5]) {
      const tick = step * 10 ** exponent;
      if (tick <= min || tick >= max || Math.abs(scale(tick) - scale(o.sloMs)) < 19) continue;
      body += line(scale(tick), top - 8, scale(tick), top + rows.length * rowH, "tgc-gridline");
      body += text(scale(tick), top - 13, `${Number((tick / 1000).toPrecision(2))} s`, { size: 10, cls: "tgc-ink-muted tgc-num", anchor: "middle" });
    }
  }
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    const label = wrap(r.label, left - 10, phone ? 11 : 13, "sans", phone ? 2 : 1);
    body += titled(r.label, label.lines.map((part, j) => text(2, y + 5 + j * 14, part, { size: phone ? 11 : 13, weight: 600 })).join(""));
    const cy = y + (phone ? 7 : 0), status = r.p95Ms > o.sloMs ? "breach" : "pass";
    body += titled(`${r.label}: p50 ${(r.p50Ms / 1000).toFixed(1)} s; p95 ${(r.p95Ms / 1000).toFixed(1)} s; n=${r.n}; ${status}`,
      rect(scale(r.p50Ms), cy - 5, Math.max(2, scale(r.p95Ms) - scale(r.p50Ms)), 10, `tgc-range-${status}`, 'rx="5"') +
      circle(scale(r.p50Ms), cy, 6, `tgc-range-dot-${status}`));
    body += text(width - 4, cy + 4, `${(r.p95Ms / 1000).toFixed(1)} · ${r.n}`, { cls: "tgc-ink tgc-num", anchor: "end", size: phone ? 10 : 12 });
  });
  return svgRoot(width, top + rows.length * rowH + 4, body);
}
