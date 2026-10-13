import { useEffect, useId, useState } from "react";
import type { KeyboardEvent } from "react";

export type LinePoint = readonly [x: number, y: number | null];
export interface LineSeries {
  name: string;
  color: string;
  points: readonly LinePoint[];
  dots?: boolean;
  label?: (x: number) => string;
}
export interface LineSelection {
  seriesIndex: number;
  pointIndex: number;
  x: number;
  y: number;
}
export interface LineReference { value: number; label: string; color?: string }
export interface LineBand { min: number; max: number; label: string; color?: string }
export interface LinesProps {
  series: readonly LineSeries[];
  format?: (value: number) => string;
  /** Human-readable positions in the readout. The default formats epoch milliseconds. */
  xFormat?: (x: number) => string;
  /** Short tick labels. Retained for existing consumers. */
  axis?: (x: number) => string;
  rows?: number;
  label?: string;
  xLabel?: string;
  yLabel?: string;
  xDomain?: readonly [number, number];
  yDomain?: readonly [number, number];
  references?: readonly LineReference[];
  bands?: readonly LineBand[];
  endLabels?: boolean;
  markers?: boolean;
  curve?: "linear" | "step";
  /** Stepped frontiers default to at-or-before; ordinary lines default to nearest. */
  inspection?: "nearest" | "at-or-before";
  /** Opens an observed point. Indices always refer to the supplied, unfiltered series. */
  onSelect?: (point: LineSelection) => void;
  /** Keeps historical observations visible while suppressing links the app cannot resolve. */
  canSelect?: (point: LineSelection) => boolean;
  /** Optional externally selected observation, addressed in the original supplied arrays. */
  selectedPoint?: Pick<LineSelection, "seriesIndex" | "pointIndex"> | null;
  emptyLabel?: string;
  unavailableLabel?: string;
  className?: string;
}

type Reading = LineSelection & { series: LineSeries };
const selection = ({ seriesIndex, pointIndex, x, y }: Reading): LineSelection => ({ seriesIndex, pointIndex, x, y });
const isValue = (y: number | null): y is number => y !== null && Number.isFinite(y);
const compact = (value: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const date = (x: number) => Number.isFinite(new Date(x).getTime()) ? new Date(x).toISOString().slice(0, 16).replace("T", " ") : String(x);
const fraction = (value: number, min: number, max: number) =>
  max === min ? 0.5 : Number.isFinite(max - min) ? (value - min) / (max - min) : (value / 2 - min / 2) / (max / 2 - min / 2);
function domain(value: readonly [number, number] | undefined, name: string) {
  if (value && (!value.every(Number.isFinite) || value[0] > value[1])) throw new RangeError(`Lines ${name} must be a finite, ordered domain`);
}

/** Linear, shared-axis observations with honest gaps and keyboard/touch inspection. */
export function Lines({
  series, format = compact, xFormat = date, axis, rows = 13, label = "Recorded history", xLabel,
  yLabel, xDomain, yDomain, references = [], bands = [], endLabels = false, markers = false,
  curve = "linear", inspection = curve === "step" ? "at-or-before" : "nearest", onSelect, canSelect, selectedPoint, emptyLabel = "No history yet.", unavailableLabel = "Not available", className,
}: LinesProps) {
  const [element, ref] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, em: 16 });
  const [inspectedX, setInspectedX] = useState<number | null>(null);
  const [pinnedX, setPinnedX] = useState<number | null>(null);
  const [tickWidth, setTickWidth] = useState(0);
  const readoutId = useId();
  useEffect(() => { setInspectedX(null); setPinnedX(null); }, [selectedPoint?.seriesIndex, selectedPoint?.pointIndex]);
  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: Math.floor(entry!.contentRect.width), em: parseFloat(getComputedStyle(element).fontSize) || 16 }));
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  domain(xDomain, "xDomain"); domain(yDomain, "yDomain");
  if (!Number.isFinite(rows) || rows < 8) throw new RangeError("Lines rows must be finite and at least eight");
  const readings: Reading[] = [];
  series.forEach((entry, seriesIndex) => {
    let previous = -Infinity;
    entry.points.forEach(([x, y], pointIndex) => {
      if (!Number.isFinite(x) || x <= previous) throw new RangeError("Lines positions must be finite and strictly increasing within each series");
      previous = x;
      if (isValue(y) && (!xDomain || (x >= xDomain[0] && x <= xDomain[1]))) readings.push({ x, y, seriesIndex, pointIndex, series: entry });
    });
  });
  for (const reference of references) if (!Number.isFinite(reference.value)) throw new RangeError("Lines references must be finite");
  for (const band of bands) if (!Number.isFinite(band.min) || !Number.isFinite(band.max) || band.min > band.max) throw new RangeError("Lines bands require finite, ordered bounds");
  if (!readings.length) {
    const hasPoints = series.some((entry) => entry.points.length);
    const hasValues = series.some((entry) => entry.points.some(([, value]) => isValue(value)));
    return <div ref={ref} className={["ov-plot ov-lines", className].filter(Boolean).join(" ")}><p className="ov-empty">{!hasPoints ? emptyLabel : !hasValues ? unavailableLabel : "No recorded points in this range."}</p>{hasPoints && <RecordedData series={series} label={label} xLabel={xLabel} yLabel={yLabel} xFormat={xFormat} format={format} unavailableLabel={unavailableLabel} />}</div>;
  }
  const positions = [...new Set(readings.map(({ x }) => x))].sort((a, b) => a - b);
  const [t0, t1] = xDomain ?? [positions[0]!, positions[positions.length - 1]!];
  let lo = 0, hi = 0;
  for (const { y } of readings) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
  for (const { value } of references) { lo = Math.min(lo, value); hi = Math.max(hi, value); }
  for (const { min, max } of bands) { lo = Math.min(lo, min); hi = Math.max(hi, max); }
  const [y0, y1] = yDomain ?? (lo === hi ? [lo - 1, hi + 1] : [lo, hi]);
  if (readings.some(({ y }) => y < y0 || y > y1) || references.some(({ value }) => value < y0 || value > y1) || bands.some(({ min, max }) => min < y0 || max > y1)) throw new RangeError("Lines values and reference marks must lie inside yDomain");
  const { width, em } = size;
  const height = Math.round(rows * em);
  const top = yLabel ? em * 2 : em;
  const bottom = em * (xLabel ? 3 : 2);
  const left = Math.max(em * 4, tickWidth + em * 0.75);
  const showEndLabels = endLabels && width >= 640;
  const right = showEndLabels ? em * 11 : em;
  const plotW = Math.max(1, width - left - right), plotH = Math.max(1, height - top - bottom);
  const x = (value: number) => left + fraction(value, t0, t1) * plotW;
  const y = (value: number) => top + (1 - fraction(value, y0, y1)) * plotH;
  const nearestPosition = (value: number) => positions.reduce((best, current) => Math.abs(current - value) < Math.abs(best - value) ? current : best, positions[0]!);
  const selectedReading = selectedPoint ? readings.find((point) => point.seriesIndex === selectedPoint.seriesIndex && point.pointIndex === selectedPoint.pointIndex) : undefined;
  const activeX = inspectedX ?? pinnedX ?? selectedReading?.x ?? null;
  const active = activeX === null ? [] : series.flatMap((_, seriesIndex) => {
    const entries = readings.filter((point) => point.seriesIndex === seriesIndex);
    if (!entries.length) return [];
    if (inspection === "at-or-before") return entries.filter((point) => point.x <= activeX).slice(-1);
    return [entries.reduce((best, point) => Math.abs(point.x - activeX) < Math.abs(best.x - activeX) ? point : best)];
  });
  const last = series.flatMap((_, seriesIndex) => readings.filter((point) => point.seriesIndex === seriesIndex).slice(-1));
  const labels = last.map((point) => ({ point, py: y(point.y) })).sort((a, b) => a.py - b.py);
  const separation = Math.min(em * 1.4, plotH / Math.max(1, labels.length));
  labels.forEach((entry, i) => { entry.py = Math.max(entry.py, top + i * separation, i ? labels[i - 1]!.py + separation : top); });
  const shift = Math.max(0, (labels.at(-1)?.py ?? top) - top - plotH);
  labels.forEach((entry) => { entry.py -= shift; });
  const inspect = (clientX: number) => {
    if (!element) return;
    const px = clientX - element.getBoundingClientRect().left;
    setInspectedX(px < left || px > left + plotW ? null : nearestPosition(t0 * (1 - Math.max(0, Math.min(1, (px - left) / plotW))) + t1 * Math.max(0, Math.min(1, (px - left) / plotW))));
  };
  const openPointerPoint = (event: { clientX: number; clientY: number; currentTarget: SVGSVGElement }) => {
    if (!onSelect) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - bounds.left, py = event.clientY - bounds.top;
    let closest: Reading | undefined, distance = 24 ** 2;
    for (const point of readings) {
      const candidate = (x(point.x) - px) ** 2 + (y(point.y) - py) ** 2;
      if (candidate <= distance) { closest = point; distance = candidate; }
    }
    if (closest && (!canSelect || canSelect(selection(closest)))) onSelect(selection(closest));
  };
  const keyboard = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === "Escape") { setInspectedX(null); setPinnedX(null); return; }
    const actionable = selectedReading && activeX === selectedReading.x ? active.find((point) => point.seriesIndex === selectedReading.seriesIndex) : active[0];
    if ((event.key === "Enter" || event.key === " ") && onSelect) {
      event.preventDefault();
      if (actionable && (!canSelect || canSelect(selection(actionable)))) onSelect(selection(actionable));
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const current = activeX === null ? -1 : positions.indexOf(nearestPosition(activeX));
    const index = event.key === "Home" ? 0 : event.key === "End" ? positions.length - 1 : event.key === "ArrowRight" ? Math.min(positions.length - 1, current + 1) : Math.max(0, current - 1);
    setInspectedX(null); setPinnedX(positions[index]!);
  };
  const tick = axis ?? (xFormat === date ? (value: number) => date(value).slice(5, 10) : xFormat);
  // Keep exact values in the readout and data table while leaving room for the
  // plot on phones when a caller's full value formatter is very long.
  const yTick = (value: number) => {
    const exact = format(value);
    return width > 0 && width < 520 && exact.length > 14 ? compact(value) : exact;
  };
  return <div ref={ref} className={["ov-plot ov-lines", className].filter(Boolean).join(" ")}>
    <ul className="ov-lines-legend" aria-label="Series">{last.map((point) => <li key={point.seriesIndex}><i style={{ background: point.series.color }} /><span>{point.series.name}</span><b>{format(point.y)}</b></li>)}</ul>
    {width > 0 && <svg width={width} height={height} role="img" aria-label={`${label}. Use Left and Right arrows to inspect recorded points${onSelect ? "; Enter opens a linked inspected record, when available" : ""}.`} tabIndex={0} aria-describedby={readoutId} data-scale="linear" onClick={openPointerPoint} onKeyDown={keyboard} onFocus={() => { if (pinnedX === null && !selectedReading) setPinnedX(positions[0]!); }} onPointerMove={(event) => { if (event.pointerType !== "touch") inspect(event.clientX); }} onPointerLeave={() => setInspectedX(null)} onPointerDown={(event) => { if (event.pointerType === "touch") { inspect(event.clientX); const px = event.clientX - event.currentTarget.getBoundingClientRect().left; setPinnedX(nearestPosition(t0 * (1 - Math.max(0, Math.min(1, (px - left) / plotW))) + t1 * Math.max(0, Math.min(1, (px - left) / plotW)))); } }}>
      {yLabel && <text x={left} y={em} className="ov-axis">{yLabel}</text>}
      {bands.map((band, index) => <g key={index}><rect x={left} y={y(band.max)} width={plotW} height={Math.max(1, y(band.min) - y(band.max))} fill={band.color ?? "var(--chart-live-faint, #777)"} opacity={0.1} /><text x={left + em * 0.4} y={y(band.max) + em} className="ov-axis">{band.label}</text></g>)}
      {[y0, y0 / 2 + y1 / 2, y1].filter((value, index, array) => array.indexOf(value) === index).map((value, index) => <g key={index}><line x1={left} x2={left + plotW} y1={y(value)} y2={y(value)} className="ov-gridline" /><text ref={(node) => { if (node && typeof node.getComputedTextLength === "function") setTickWidth((current) => Math.max(current, node.getComputedTextLength())); }} x={left - em * 0.5} y={y(value)} dominantBaseline="middle" className="ov-axis" textAnchor="end" aria-label={format(value)}>{yTick(value)}</text></g>)}
      {references.map((reference, index) => <g key={index}><line x1={left} x2={left + plotW} y1={y(reference.value)} y2={y(reference.value)} className="ov-reference" style={{ stroke: reference.color }} /><text x={left + plotW} y={y(reference.value) - em * 0.35} className="ov-axis" textAnchor="end">{reference.label} · {format(reference.value)}</text></g>)}
      {[t0, t0 / 2 + t1 / 2, t1].filter((value, index, array) => array.indexOf(value) === index).map((value, index, array) => <text key={value} x={x(value)} y={height - em * (xLabel ? 1.8 : 0.5)} className="ov-axis" textAnchor={index === 0 && array.length > 1 ? "start" : index === array.length - 1 && array.length > 1 ? "end" : "middle"}>{tick(value)}</text>)}
      {xLabel && <text x={left + plotW / 2} y={height - em * 0.35} textAnchor="middle" className="ov-axis">{xLabel}</text>}
      {series.map((entry, seriesIndex) => {
        const runs: Reading[][] = [];
        let run: Reading[] = [];
        const flush = () => { if (run.length) runs.push(run); run = []; };
        entry.points.forEach(([px, py], pointIndex) => {
          if (!isValue(py) || px < t0 || px > t1) { flush(); return; }
          run.push({ x: px, y: py, seriesIndex, pointIndex, series: entry });
        });
        flush();
        return <g key={seriesIndex}>{!entry.dots && runs.filter((segment) => segment.length > 1).map((segment, index) => <path key={index} d={segment.map((point, i) => i === 0 ? `M${x(point.x)},${y(point.y)}` : curve === "step" ? `H${x(point.x)}V${y(point.y)}` : `L${x(point.x)},${y(point.y)}`).join(" ")} fill="none" stroke={entry.color} strokeWidth={2.5} strokeLinejoin="round" />)}
          {runs.flat().filter((point) => entry.dots || markers || runs.some((segment) => segment.length === 1 && segment[0] === point)).map((point) => <circle key={point.pointIndex} cx={x(point.x)} cy={y(point.y)} r={3.5} fill={entry.color} />)}
        </g>;
      })}
      {showEndLabels && labels.map(({ point, py }) => <g key={point.seriesIndex}><path d={`M${x(point.x)},${y(point.y)}L${left + plotW + em * 0.5},${py}`} stroke={point.series.color} opacity={0.5} fill="none" /><text x={left + plotW + em * 0.7} y={py} dominantBaseline="middle" className="ov-axis" style={{ fill: point.series.color }}><title>{point.series.name}: {format(point.y)}</title>{point.series.name.length > 14 ? `${point.series.name.slice(0, 13)}…` : point.series.name}</text></g>)}
      {activeX !== null && <line x1={x(nearestPosition(activeX))} x2={x(nearestPosition(activeX))} y1={top} y2={top + plotH} className="ov-crosshair" />}
      {active.map((point) => <circle key={point.seriesIndex} cx={x(point.x)} cy={y(point.y)} r={5} fill={point.series.color} stroke="var(--chart-live-surface, #fff)" strokeWidth={2} />)}
    </svg>}
    <div id={readoutId} className="ov-lines-readout" aria-live="polite" aria-atomic="true">{active.length ? active.map((point) => <div key={point.seriesIndex}><span><i style={{ background: point.series.color }} />{point.series.label?.(point.x) ?? point.series.name}</span><b>{format(point.y)}</b><time>{xFormat(point.x)}</time>{onSelect && (!canSelect || canSelect(selection(point))) && <button type="button" onClick={() => { if (!canSelect || canSelect(selection(point))) onSelect(selection(point)); }} aria-label={`Open ${point.series.name} at ${xFormat(point.x)}`}>Open point</button>}{onSelect && canSelect && !canSelect(selection(point)) && <span className="ov-lines-unlinked">No linked result</span>}</div>) : <span className="ov-lines-hint">Hover, tap or use arrow keys to inspect a recorded point.</span>}</div>
    <RecordedData series={series} label={label} xLabel={xLabel} yLabel={yLabel} xFormat={xFormat} format={format} unavailableLabel={unavailableLabel} />
  </div>;
}

function RecordedData({ series, label, xLabel, yLabel, xFormat, format, unavailableLabel }: Pick<LinesProps, "series" | "xLabel" | "yLabel"> & { label: string; xFormat: (x: number) => string; format: (y: number) => string; unavailableLabel: string }) {
  const [open, setOpen] = useState(false);
  return <details className="ov-lines-data" onToggle={(event) => setOpen(event.currentTarget.open)}><summary>View recorded data</summary>{open && <div><table><caption>{label}</caption><thead><tr><th scope="col">Series</th><th scope="col">{xLabel ?? "Position"}</th><th scope="col">{yLabel ?? "Value"}</th></tr></thead><tbody>{series.flatMap((entry, seriesIndex) => entry.points.map(([px, py], pointIndex) => <tr key={`${seriesIndex}-${pointIndex}`}><th scope="row">{entry.name}</th><td>{xFormat(px)}</td><td>{isValue(py) ? format(py) : unavailableLabel}</td></tr>))}</tbody></table></div>}</details>;
}
