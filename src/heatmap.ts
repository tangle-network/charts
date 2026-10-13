/** Recorded values and producer-supplied states in a complete matrix. */
import { NARROW, rect, svgRoot, text, titled, WIDE } from "./svg.js";
import { table } from "./table.js";
import { capitalize, plural, wrap, textBlock } from "./text.js";
import type { Figure, Refusal } from "./types.js";

export type HeatmapStatus = "pass" | "breach" | "no-data";
export interface HeatmapCell { status: HeatmapStatus; value: number | null }
export interface HeatmapRow { id: string; label: string; cells: HeatmapCell[] }
export interface HeatmapColumn { id: string; label: string }
export interface HeatmapOptions {
  measure: string;
  unit: string;
  formatValue?: (value: number) => string;
  /** Explain what the producer's pass and breach states mean. */
  statusRule: string;
  id?: string;
}

export function heatmap(columns: HeatmapColumn[], rows: HeatmapRow[], o: HeatmapOptions): Figure | Refusal {
  const id = o.id ?? "heatmap";
  if (!columns.length || !rows.length) return { id, refused: "A heatmap needs rows and columns." };
  if (!o.measure?.trim() || !o.unit?.trim() || !o.statusRule?.trim()) return { id, refused: "A heatmap needs a measure, unit and status rule." };
  if (new Set(columns.map(c => c.id)).size !== columns.length || new Set(rows.map(r => r.id)).size !== rows.length) return { id, refused: "Duplicate heatmap row or column ids." };
  for (const row of rows) {
    if (row.cells.length !== columns.length) return { id, refused: `${row.label}: expected ${columns.length} cells, got ${row.cells.length}.` };
    for (const [i, cell] of row.cells.entries()) {
      if (!["pass", "breach", "no-data"].includes(cell.status)) return { id, refused: `${row.label} × ${columns[i]!.label}: unknown status.` };
      if (cell.status === "no-data" ? cell.value !== null : cell.value === null || !Number.isFinite(cell.value) || cell.value < 0) {
        return { id, refused: `${row.label} × ${columns[i]!.label}: status and value disagree.` };
      }
    }
  }
  const fmt = (v: number) => o.formatValue?.(v) ?? new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(v);
  const counts = rows.flatMap(r => r.cells).reduce((a, c) => (a[c.status]++, a), { pass: 0, breach: 0, "no-data": 0 });
  const measured = counts.pass + counts.breach;
  const finding = `${counts.breach} of ${measured} measured ${plural(measured, "cell")} breach ${o.statusRule}.`;
  const lede = `${counts.pass} pass · ${counts.breach} breach · ${counts["no-data"]} no data across ${rows.length} ${plural(rows.length, "row")}.`;
  const cellLabel = (cell: HeatmapCell) => cell.value === null ? "No data" : `${fmt(cell.value)} ${o.unit} · ${cell.status}`;
  const tableHtml = table(`${capitalize(o.measure)} by row and column`, [{ label: "Row" }, ...columns.map(c => ({ label: c.label, numeric: true }))], rows.map(r => [r.label, ...r.cells.map(cellLabel)]));
  return {
    id, finding, lede,
    read: `Every cell shows its recorded ${o.measure}; colour shows the producer's pass or breach status. A dash means no data.`,
    svg: { wide: drawWide(columns, rows, fmt), narrow: drawNarrow(columns, rows, fmt) },
    table: tableHtml,
    note: { method: `Producer-supplied status. ${o.statusRule}. Values are ${o.unit}; no data is never zero.`, n: `${measured} measured of ${rows.length * columns.length} cells.`, exclusions: [`${counts["no-data"]} cells have no data.`] },
  };
}

function cellMark(cell: HeatmapCell, x: number, y: number, w: number, h: number, label: string, fmt: (value: number) => string): string {
  const value = cell.value === null ? "—" : fmt(cell.value);
  const status = cell.status === "no-data" ? "no data" : cell.status;
  return titled(`${label}: ${value} · ${status}`, rect(x, y, w, h, `tgc-heat-${cell.status}`, 'rx="5"') + text(x + w / 2, y + h / 2 + 5, value, { cls: `tgc-heat-label tgc-num${cell.status === "no-data" ? " tgc-heat-missing" : ""}`, anchor: "middle", size: 13, weight: 600 }));
}

function drawWide(columns: HeatmapColumn[], rows: HeatmapRow[], fmt: (value: number) => string): string {
  const left = 144, gap = 4, cellW = Math.max(58, (WIDE - left - 8 - gap * (columns.length - 1)) / columns.length);
  const width = Math.ceil(left + columns.length * (cellW + gap));
  let head = "", headHeight = 44;
  columns.forEach((c, i) => {
    const label = wrap(c.label, cellW - 5, 10, "sans", 2);
    head += titled(c.label, textBlock(label.lines, left + i * (cellW + gap) + cellW / 2, 14, 12, 'class="tgc-ink-muted" font-size="10" text-anchor="middle"'));
    headHeight = Math.max(headHeight, 12 + label.lines.length * 12 + 10);
  });
  let body = "";
  rows.forEach((r, j) => {
    const y = headHeight + j * 32;
    const name = wrap(r.label, left - 8, 12, "sans", 1);
    body += titled(r.label, text(2, y + 19, name.lines[0]!, { size: 12, weight: 600 }));
    r.cells.forEach((cell, i) => { body += cellMark(cell, left + i * (cellW + gap), y, cellW, 28, `${r.label} · ${columns[i]!.label}`, fmt); });
  });
  return svgRoot(width, headHeight + rows.length * 32 + 2, head + body);
}

function drawNarrow(columns: HeatmapColumn[], rows: HeatmapRow[], fmt: (value: number) => string): string {
  const width = NARROW, cols = 3, gap = 6, cellW = (width - 2 * 12 - 2 * gap) / cols;
  const groups = Math.ceil(columns.length / cols), groupH = 49, rowH = 29 + groups * groupH + 12;
  let body = "";
  rows.forEach((r, j) => {
    const top = j * rowH;
    body += text(12, top + 18, r.label, { size: 14, weight: 600 });
    columns.forEach((c, i) => {
      const group = Math.floor(i / cols), col = i % cols, x = 12 + col * (cellW + gap), y = top + 29 + group * groupH;
      const label = wrap(c.label, cellW - 3, 10, "sans", 1);
      body += titled(c.label, text(x + 2, y + 9, label.lines[0]!, { size: 10, cls: "tgc-ink-muted" }));
      body += cellMark(r.cells[i]!, x, y + 13, cellW, 29, `${r.label} · ${c.label}`, fmt);
    });
  });
  return svgRoot(width, rows.length * rowH, body);
}
