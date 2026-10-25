import { type CSSProperties, type ReactNode, memo } from 'react'
import type { FlowSpan } from '../flow-trace.js'
import { KIND_LABEL } from './flow-waterfall-card.js'
import { AlertGlyph, ChevronGlyph, FailGlyph, KindGlyph, RetryGlyph } from './flow-waterfall-icons.js'
import { type FlowSegment, type FlowWaterfallRow, formatCost, formatSpanDuration, spanRunning, toneKey } from './flow-waterfall-model.js'

export type FlowView = 'spans' | 'agents'

/** Running ends are drawn to the clock; CSS clips with min(), so a far-future end stands in for "still open". */
export const OPEN_END = 1e13
const at = (startMs: number, endMs: number): CSSProperties => ({ '--s': startMs, '--e': Number.isFinite(endMs) ? endMs : OPEN_END } as CSSProperties)

export interface RowEvents {
  onToggle: (row: FlowWaterfallRow) => void
  /** Hover or focus of a mark: the card shows `target` (a span id) anchored to `element`. */
  onInspect: (target: string, element: HTMLElement) => void
  onLeave: () => void
  onPin: (target: string, element: HTMLElement) => void
  onActivate: (row: FlowWaterfallRow) => void
}

export interface RowProps extends RowEvents {
  row: FlowWaterfallRow
  view: FlowView
  top: number
  collapsed: boolean
  searching: boolean
  slowest: boolean
  active: boolean
  focusable: boolean
  selected: boolean
  sticky?: boolean
  /** Clock at 10 Hz; only running rows read it, so idle rows skip re-render. */
  clockMs: number
  renderIcon?: (span: FlowSpan) => ReactNode
}

function Segment({ mark, events, agentView }: { mark: FlowSegment; events: RowEvents; agentView: boolean }) {
  const glyph = mark.kind === 'failed' ? <FailGlyph /> : mark.retry ? <RetryGlyph /> : null
  return <span className={`fw-seg fw-seg-${mark.kind}`} data-tone={toneKey(mark.tone)} style={at(mark.startMs, mark.endMs)}
    onPointerEnter={agentView ? event => events.onInspect(mark.id, event.currentTarget) : undefined}
    onClick={agentView ? event => { event.stopPropagation(); events.onPin(mark.id, event.currentTarget) } : undefined}>
    {glyph && <span className="fw-glyph">{glyph}</span>}
  </span>
}

/** A span the clock is inside: it grows live, or playback has not reached its end. */
const open = (row: FlowWaterfallRow, clockMs: number) => spanRunning(row.span) || row.span.startMs <= clockMs && clockMs < row.span.endMs

function endLabel(row: FlowWaterfallRow, clockMs: number): string {
  const span = row.span
  if (row.durationLabel === '—') return '—'
  // A point event (an approximate zero-length span) has no duration to state.
  if (row.approx && span.endMs === span.startMs && !spanRunning(span)) return span.costUsd === undefined ? '' : formatCost(span.costUsd)
  if (!spanRunning(span) && clockMs < span.endMs) return `${formatSpanDuration(Math.max(0, clockMs - span.startMs))}${row.approx ? '~' : ''}`
  const duration = spanRunning(span) ? `${formatSpanDuration(Math.max(span.endMs, clockMs) - span.startMs)}${row.approx ? '~' : ''}` : row.durationLabel
  const cost = span.costUsd ?? (row.rollupCostUsd ? row.rollupCostUsd : undefined)
  return cost === undefined ? duration : `${duration} · ${formatCost(cost)}`
}

/** One trace row. Geometry comes from CSS variables, so a row re-renders only when its own state changes. */
export const FlowRow = memo(function FlowRow(props: RowProps) {
  const { row, view, top, collapsed, searching, slowest, active, focusable, selected, sticky, clockMs, renderIcon } = props
  const span = row.span
  const running = spanRunning(span)
  const agentView = view === 'agents'
  const folded = row.hasChildren && collapsed && !searching
  const invalid = row.durationLabel === '—'
  const isAgent = row.kind === 'pipeline'
  const kind = !row.ok ? 'failed' : row.kind
  const marks = isAgent || row.hasChildren ? (folded && !agentView ? row.segments : row.own) : []
  const label = endLabel(row, clockMs)
  const inspect = (event: { currentTarget: HTMLElement }) => props.onInspect(row.id, event.currentTarget)

  return (
    <div role="row" data-span-id={row.id} data-span-kind={kind} data-slowest={slowest || undefined}
      aria-level={agentView ? undefined : row.depth + 1} aria-expanded={row.hasChildren && !agentView ? !folded : undefined}
      aria-selected={selected} tabIndex={focusable ? 0 : -1} data-tone={toneKey(row.tone)} data-outcome={span.outcome?.tone}
      className={`fw-row${active ? ' fw-active' : ''}${sticky ? ' fw-sticky-row' : ''}${isAgent ? ' fw-agent-row' : ''}`}
      style={{ '--row-y': `${top}px` } as CSSProperties}
      onFocus={event => { if (event.target === event.currentTarget) props.onActivate(row) }}
      onClick={() => props.onActivate(row)}>
      <div role="gridcell" className="fw-label" style={{ '--depth': agentView ? 0 : row.depth } as CSSProperties}>
        {!agentView && <span className="fw-guides" aria-hidden />}
        {!agentView && (row.hasChildren
          ? <button type="button" tabIndex={-1} className={`fw-toggle${folded ? '' : ' fw-open'}`} disabled={searching}
            aria-label={`${folded ? 'Expand' : 'Collapse'} ${row.name}`} aria-expanded={!folded}
            onClick={event => { event.stopPropagation(); props.onToggle(row) }}><ChevronGlyph /></button>
          : <span className="fw-toggle-space" aria-hidden />)}
        {agentView && <span className="fw-agent-dot" aria-hidden />}
        {!agentView && <span className="fw-icon-tile" aria-hidden>{renderIcon?.(span) ?? <KindGlyph kind={span.kind} />}</span>}
        <span className="fw-names" title={`${row.name}${span.detail ? ` · ${span.detail}` : ''} · ${KIND_LABEL[span.kind]}${running ? ' · running' : ''}${row.ok ? '' : ' · failed'}`}>
          <span className={`fw-span-name${isAgent || row.hasChildren ? ' fw-strong' : ''}`}>
            {running && <span className="fw-spinner" role="status" aria-label="running" />}
            <span className="fw-name-text">{row.name}</span>
          </span>
          {agentView && renderIcon && <span className="fw-detail-icon" aria-hidden>{renderIcon(span)}</span>}
        </span>
        {folded && <span className="fw-count" aria-label={`${row.descendants} hidden steps`}>+{row.descendants}</span>}
        {!row.ok && <span className="fw-alert"><AlertGlyph label="failed" /></span>}
      </div>
      <div role="gridcell" className="fw-lane" data-waterfall-track aria-label={`${KIND_LABEL[span.kind]}, ${label}${slowest ? ', slowest step' : ''}`}>
        {invalid ? <span className="fw-invalid">—</span> : <>
          <span className={`fw-bar fw-k-${isAgent ? 'pipeline' : kind}${row.approx ? ' fw-approx' : ''}${marks.length ? ' fw-has-marks' : ''}${row.hasAgents ? ' fw-has-agents' : ''}`}
            data-tone={toneKey(row.tone)} style={at(span.startMs, running ? OPEN_END : span.endMs)}
            onPointerEnter={inspect} onPointerLeave={props.onLeave}
            onClick={event => { event.stopPropagation(); props.onPin(row.id, event.currentTarget) }}>
            {!isAgent && !row.ok && <span className="fw-glyph"><FailGlyph /></span>}
            {!isAgent && row.ok && row.retry && <span className="fw-glyph"><RetryGlyph /></span>}
          </span>
          {marks.map((mark, i) => <Segment key={`${mark.id}-${i}`} mark={mark} events={props} agentView={agentView} />)}
          {!agentView && <span className="fw-end" style={at(span.startMs, running ? OPEN_END : span.endMs)}>
            <span className="fw-duration">{label}</span>
            {slowest && <span className="fw-badge">Slowest</span>}
          </span>}
        </>}
      </div>
    </div>
  )
}, (a, b) => a.row === b.row && a.view === b.view && a.top === b.top && a.collapsed === b.collapsed && a.searching === b.searching &&
  a.slowest === b.slowest && a.active === b.active && a.focusable === b.focusable && a.selected === b.selected &&
  a.sticky === b.sticky && a.renderIcon === b.renderIcon && (a.clockMs === b.clockMs || !open(a.row, a.clockMs) && !open(b.row, b.clockMs)))

export interface FlowLink { id: string; from: number; to: number; atMs: number; tone: number; dir: 'down' | 'up' }

/** An elbow connector between two rows at one moment, drawn in the row's tone; appears when the clock reaches it. */
export function LinkMark({ link, rowHeight }: { link: FlowLink; rowHeight: number }) {
  const upper = Math.min(link.from, link.to), lower = Math.max(link.from, link.to)
  const style = {
    ...at(link.atMs, link.atMs),
    top: upper * rowHeight + rowHeight / 2 + 5,
    height: (lower - upper) * rowHeight - 5,
  } as CSSProperties
  return <span className={`fw-link fw-link-${link.dir}`} data-tone={toneKey(link.tone)} style={style} aria-hidden />
}
