/**
 * One row per metric, one dot per entity on a shared 0..max axis: an agent's calls per hour, failure rate or idle
 * minutes against the run's other agents. The producer marks outliers; Charts never derives one from a value.
 */
import { useState } from 'react'
import { formatCompact } from '../format.js'
import { Tooltip, type Tip, useWidth } from './live-presentation.js'

/** `value` null is not recorded: listed, never placed. `outlier` is the producer's verdict; `note` its one hover line. */
export interface DotStripDot { id: string; label: string; value: number | null; outlier?: boolean; note?: string }
/** `max` is the axis end, else the largest recorded value. */
export interface DotStripRow { id: string; label: string; dots: readonly DotStripDot[]; max?: number; format?: (value: number) => string }
export interface DotStripProps { label: string; rows: readonly DotStripRow[]; format?: (value: number) => string; entity?: string; selected?: { rowId: string; dotId: string } | null; onSelect?: (rowId: string, dotId: string) => void }
export interface DotStripDotModel extends DotStripDot { x: number | null; outlier: boolean; name: string; text: string }
export interface DotStripRowModel { id: string; label: string; max: number; maxLabel: string; dots: DotStripDotModel[]; unknown: number; outliers: number }

/** Dots placed on each row's axis. An outlier is the producer's `outlier: true` on a recorded value, nothing else. */
export function dotStripRows(rows: readonly DotStripRow[], format: (value: number) => string = formatCompact): DotStripRowModel[] {
  return rows.map(row => {
    const known = row.dots.flatMap(dot => (dot.value !== null && Number.isFinite(dot.value) ? [dot.value] : [])), fmt = row.format ?? format
    const max = Number.isFinite(row.max) && row.max! > 0 ? row.max! : Math.max(0, ...known) || 1
    const dots = row.dots.map((dot): DotStripDotModel => {
      const recorded = dot.value !== null && Number.isFinite(dot.value), outlier = recorded && dot.outlier === true, text = recorded ? fmt(dot.value!) : 'not recorded'
      return { ...dot, x: recorded ? Math.max(0, Math.min(1, dot.value! / max)) : null, outlier, text, name: `${dot.label} ${row.label} ${text}${outlier ? ', outlier' : ''}` }
    })
    return { id: row.id, label: row.label, max, maxLabel: known.length ? `max ${fmt(max)}` : 'unknown on every entity', dots, unknown: dots.filter(dot => dot.x === null).length, outliers: dots.filter(dot => dot.outlier).length }
  })
}

export function DotStrip({ label, rows, format = formatCompact, entity = 'agent', selected, onSelect }: DotStripProps) {
  const [ref, width, em] = useWidth<HTMLDivElement>(), [tip, setTip] = useState<Tip | null>(null)
  if (!rows.length) return <p className="ov-empty">Nothing recorded.</p>
  const rowH = Math.round(2.75 * em), left = Math.round(Math.min(width * 0.3, 13 * em)), plotW = Math.max(0, width - left - Math.round(5 * em))
  const show = (row: DotStripRowModel, dot: DotStripDotModel, y: number) => setTip({ x: Math.min(left + dot.x! * plotW + 10, width - em * 14), y, title: dot.label, lines: [{ label: row.label, value: dot.text }, ...(dot.outlier ? [{ label: 'outlier', value: dot.note ?? 'marked by the producer' }] : dot.note ? [{ label: 'note', value: dot.note }] : [])] })
  return (
    <div ref={ref} className="tgc-dot-strip ov-plot" onMouseLeave={() => setTip(null)}>
      {width > 0 && <svg width={width} height={rows.length * rowH} role="group" aria-label={label}>
        {dotStripRows(rows, format).map((row, i) => {
          const y = i * rowH, axisY = y + rowH * 0.68
          return <g key={row.id} role="row" aria-label={`${row.label}: ${row.maxLabel}${row.outliers ? `, ${row.outliers} outliers` : ''}${row.unknown ? `, ${row.unknown} not recorded` : ''}`}>
            <text x={0} y={y + em * 1.1} className="tgc-dot-strip-label">{row.label}</text>
            <text x={width} y={y + em * 1.1} className="ov-axis" textAnchor="end">{row.maxLabel}</text>
            <line x1={left} x2={left + plotW} y1={axisY} y2={axisY} className="ov-gridline" />
            {row.dots.filter(dot => dot.x !== null).map(dot => {
              const on = selected?.rowId === row.id && selected.dotId === dot.id, pick = onSelect && (() => onSelect(row.id, dot.id))
              return <g key={dot.id} role={onSelect ? 'button' : 'img'} tabIndex={0} aria-label={dot.name} aria-pressed={onSelect ? on : undefined} data-outlier={dot.outlier || undefined} data-selected={on || undefined}
                onFocus={() => show(row, dot, y)} onBlur={() => setTip(null)} onMouseEnter={() => show(row, dot, y)} onClick={pick} onKeyDown={pick && (event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pick() } })}>
                <title>{dot.name}</title>
                <circle className={dot.outlier ? 'tgc-dot-strip-outlier' : 'tgc-dot-strip-dot'} cx={left + dot.x! * plotW} cy={axisY} r={dot.outlier ? Math.max(5, em / 3) : Math.max(3.5, em / 4.5)} />
              </g>
            })}
          </g>
        })}
      </svg>}
      <Tooltip tip={tip} />
      <ul className="ov-key" aria-label="Key"><li><i className="tgc-dot-strip-key-dot" aria-hidden="true" />one {entity}</li><li><i className="tgc-dot-strip-key-outlier" aria-hidden="true" />outlier, as the producer marked it</li><li>axis: 0 to each row's max</li></ul>
    </div>
  )
}
