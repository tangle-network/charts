import { type CSSProperties, type KeyboardEvent, type ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { formatCompact, LIVE_SERIES, useWidth } from './live.js'

export interface CountHeatmapColumn { id: string; label: string }
export interface CountHeatmapCell { value: number; failures?: number }
export interface CountHeatmapRow {
  id: string
  label: string
  cells: Readonly<Record<string, CountHeatmapCell | null | undefined>>
  total?: number | null
}
export interface CountHeatmapInspection { rowId: string; columns: string[]; rect: DOMRect }
export interface CountHeatmapProps {
  label: string
  columns: readonly CountHeatmapColumn[]
  rows: readonly CountHeatmapRow[]
  color?: string
  format?: (value: number) => string
  renderLabel?: (row: CountHeatmapRow) => ReactNode
  onSelectRow?: (id: string) => void
  onInspect?: (cell: CountHeatmapInspection | null) => void
}

/** Recorded counts, with failures separate from magnitude. Missing cells remain unknown; large row sets are windowed. */
export function CountHeatmap({ label, columns, rows, color = LIVE_SERIES[1], format = formatCompact, renderLabel, onSelectRow, onInspect }: CountHeatmapProps) {
  const [measure, width] = useWidth<HTMLDivElement>()
  const scroll = useRef<HTMLDivElement>(null)
  const [target, setTarget] = useState<[number, number] | null>(null)
  const [top, setTop] = useState(0)
  const narrow = width > 0 && width < 600, rowHeight = narrow ? 44 : 32, height = 8 * rowHeight
  const fit = Math.max(0, Math.floor(((width || 720) - (narrow ? 120 : 208) - 88) / 76))
  const shown = columns.length <= fit ? columns : columns.slice(0, Math.max(0, fit - 1))
  const rest = columns.slice(shown.length)
  const groups = [...shown.map(column => ({ label: column.label, ids: [column.id] })), ...(rest.length ? [{ label: `${rest.length} ${shown.length ? 'more' : 'tools'}`, ids: rest.map(column => column.id) }] : [])]
  const cells = useMemo(() => rows.map(row => groups.map(group => {
    const known = group.ids.flatMap(id => { const cell = row.cells[id]; return cell && Number.isFinite(cell.value) && cell.value >= 0 ? [cell] : [] })
    return { value: known.length ? known.reduce((sum, cell) => sum + cell.value, 0) : null, failures: known.reduce((sum, cell) => sum + (cell.failures ?? 0), 0), partial: known.length < group.ids.length }
  })), [rows, groups.map(group => group.ids.join('\0')).join('\n')])
  const max = cells.reduce((maximum, row) => row.reduce((value, cell) => Math.max(value, cell.value ?? 0), maximum), 0)
  const virtual = rows.length > 100, start = virtual ? Math.max(0, Math.min(rows.length - 1, Math.floor(top / rowHeight) - 4)) : 0
  const visible = virtual ? rows.slice(start, start + 22) : rows
  const grid = { gridTemplateColumns: `minmax(${narrow ? 120 : 208}px, 2fr) repeat(${groups.length}, minmax(60px, 1fr)) 76px` }
  useLayoutEffect(() => { if (target) scroll.current?.querySelector<HTMLElement>(`[data-heat-row="${target[0]}"][data-heat-column="${target[1]}"]`)?.focus({ preventScroll: true }); if (target) setTarget(null) }, [target, start])
  const inspect = (row: CountHeatmapRow, group: (typeof groups)[number], element: HTMLElement) => onInspect?.({ rowId: row.id, columns: group.ids, rect: element.getBoundingClientRect() })
  const move = (event: KeyboardEvent, row: number, column: number) => {
    const keys: Record<string, [number, number]> = { ArrowDown: [row + 1, column], ArrowUp: [row - 1, column], ArrowRight: [row, column + 1], ArrowLeft: [row, column - 1], Home: [row, 0], End: [row, groups.length + 1] }
    const next = keys[event.key], pane = scroll.current
    if (!next || !pane) return
    event.preventDefault()
    const r = Math.max(0, Math.min(rows.length - 1, next[0])), c = Math.max(0, Math.min(groups.length + 1, next[1]))
    if (r * rowHeight < pane.scrollTop) pane.scrollTop = r * rowHeight
    else if ((r + 1) * rowHeight > pane.scrollTop + pane.clientHeight) pane.scrollTop = (r + 1) * rowHeight - pane.clientHeight
    setTop(pane.scrollTop)
    setTarget([r, c])
  }
  return <div ref={measure} className="tgc-count-heatmap" role="table" aria-label={label} aria-rowcount={rows.length + 1} aria-colcount={groups.length + 2} style={{ '--heatmap-color': color, '--heatmap-row': `${rowHeight}px` } as CSSProperties}>
    <div className="tgc-count-head" role="row" style={grid} aria-rowindex={1}>
      <span role="columnheader">Agent</span>
      {groups.map(group => <span key={group.ids.join(':')} role="columnheader" title={columns.filter(column => group.ids.includes(column.id)).map(column => column.label).join(', ')}>{group.label}</span>)}
      <span role="columnheader">Total</span>
    </div>
    <div ref={scroll} className="tgc-count-scroll" role="rowgroup" style={{ maxHeight: height }} onScroll={event => setTop(event.currentTarget.scrollTop)} onPointerLeave={() => onInspect?.(null)}>
      <div role="presentation" style={virtual ? { height: rows.length * rowHeight, position: 'relative' } : undefined}>
        <div role="presentation" style={virtual ? { position: 'absolute', top: start * rowHeight, width: '100%' } : undefined}>
          {visible.map((row, index) => {
            const r = start + index, values = cells[r]!, total = row.total === undefined ? values.every(cell => cell.value !== null && !cell.partial) ? values.reduce((sum, cell) => sum + cell.value!, 0) : null : row.total
            return <div key={row.id} role="row" aria-rowindex={r + 2} className="tgc-count-row" style={grid}>
              <div role="rowheader">{onSelectRow ? <button type="button" className="tgc-count-label" title={row.label} data-heat-row={r} data-heat-column={0} onKeyDown={event => move(event, r, 0)} onClick={() => onSelectRow(row.id)}>{renderLabel?.(row) ?? row.label}</button>
                : <span className="tgc-count-label" tabIndex={0} title={row.label} data-heat-row={r} data-heat-column={0} onKeyDown={event => move(event, r, 0)}>{renderLabel?.(row) ?? row.label}</span>}</div>
              {groups.map((group, c) => {
                const cell = values[c]!, shade = cell.value ? 10 + 35 * Math.sqrt(cell.value / Math.max(1, max)) : 0
                return <span key={group.ids.join(':')} role="cell" tabIndex={0} data-heat-row={r} data-heat-column={c + 1} data-value={cell.value ?? undefined}
                  className={`tgc-count-cell${cell.value === null ? ' missing' : cell.value === 0 ? ' zero' : ''}`}
                  style={{ background: shade ? `color-mix(in srgb, ${color} ${shade}%, var(--chart-live-bg, #fff))` : undefined }}
                  title={`${row.label} · ${group.label}: ${cell.value === null ? 'not recorded' : `${cell.partial ? 'at least ' : ''}${cell.value.toLocaleString()} calls`}${cell.failures ? `; ${cell.failures} failed` : ''}`}
                  onKeyDown={event => move(event, r, c + 1)} onPointerEnter={event => inspect(row, group, event.currentTarget)} onFocus={event => inspect(row, group, event.currentTarget)} onBlur={() => onInspect?.(null)}>
                  {cell.value === null ? '—' : `${cell.partial ? '≥' : ''}${format(cell.value)}`}{cell.failures > 0 && <span className="tgc-count-failed">✕{cell.failures}</span>}
                </span>
              })}
              <span role="cell" className="tgc-count-total" tabIndex={0} data-heat-row={r} data-heat-column={groups.length + 1} onKeyDown={event => move(event, r, groups.length + 1)}>{total === null ? '—' : format(total)}</span>
            </div>
          })}
        </div>
      </div>
    </div>
    {!rows.length && <p className="ov-empty">No recorded calls.</p>}
    <div className="tgc-count-key"><span>0</span><i /><span>{format(max)}</span><span>✕ failed calls</span><span>{rows.length} agents</span></div>
  </div>
}
