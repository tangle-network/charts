import { type CSSProperties, type ReactNode, memo } from 'react'
import type { FlowSpan } from '../flow-trace.js'
import { KIND_LABEL } from './flow-waterfall-card.js'
import { AlertGlyph, ChevronGlyph, FailGlyph, KindGlyph, RetryGlyph } from './flow-waterfall-icons.js'
import { type FlowSegment, type FlowWaterfallRow, agentSummary, formatCost, rowCostText, formatSpanDuration, spanRunning, toneKey } from './flow-waterfall-model.js'
import type { RowMotion } from './flow-waterfall-motion.js'

export type FlowView = 'spans' | 'agents'

/** Running ends are drawn to the clock; CSS clips with min(), so a far-future end stands in for "still open". */
export const OPEN_END = 1e13
const at = (startMs: number, endMs: number): CSSProperties => ({ '--s': startMs, '--e': Number.isFinite(endMs) ? endMs : OPEN_END } as CSSProperties)
// 12 px tabular text runs about 7 px a character; each badge adds its gap, padding and word. A little over, never under: a stacked
// name stops this far from the lane's end.
const endLabelWidth = (label: string, slowest?: boolean, costliest?: boolean) => label.length * 7 + 8 + (slowest ? 80 : 0) + (costliest ? 90 : 0)

export interface RowEvents {
  onToggle: (row: FlowWaterfallRow) => void
  /** Hover of a mark: the card shows `target` (a span id) anchored to `element`, at the pointer's `x`. */
  onInspect: (target: string, element: HTMLElement, x?: number) => void
  onLeave: () => void
  onPin: (target: string, element: HTMLElement, x?: number) => void
  onActivate: (row: FlowWaterfallRow) => void
}

export interface RowProps extends RowEvents {
  row: FlowWaterfallRow
  view: FlowView
  top: number
  collapsed: boolean
  searching: boolean
  slowest: boolean
  costliest?: boolean
  critical?: boolean
  /** While searching: the row matched by itself, rather than showing as a match's ancestor. */
  matched?: boolean
  active: boolean
  focusable: boolean
  selected: boolean
  /** Grow and unfold when the row just arrived, settle when it just finished; undefined when it rests. */
  motion?: RowMotion
  sticky?: boolean
  /** Clock at 10 Hz; only running rows read it, so idle rows skip re-render. */
  clockMs: number
  renderIcon?: (span: FlowSpan) => ReactNode
  fillByAgent?: boolean
  sharedDetail?: string
  /** The outcome most agents share: the outcome key names it, so only the rows that differ say theirs. */
  sharedOutcome?: string
  /** Agent view: a family or agent opened in place, its members or steps shown below it. */
  expanded?: boolean
}

function Segment({ mark, events, agentView, ending }: { mark: FlowSegment; events: RowEvents; agentView: boolean; ending?: boolean }) {
  // In the agent view only the turn that ended a failed agent carries the failure glyph; a retry always shows its own.
  const glyph = mark.kind === 'failed' ? (agentView && !ending ? null : 'fail') : mark.retry ? 'retry' : null
  // Every agent-view step labels itself as the trace references do: its tool's icon and name, a count chip when merged steps share a
  // tool ("bash" ×9), then duration and cost. Each part shows whole or not at all: parts that do not fit wrap out of the one-line box,
  // so a label is never cut to "b…" and never paints past its step (blind round 28).
  const model = mark.kind === 'model' || mark.modelCall
  const name = model ? undefined : mark.count === 1 ? mark.name : mark.tool
  const duration = Number.isFinite(mark.endMs) ? formatSpanDuration(mark.endMs - mark.startMs) : ''
  const meta = [duration, mark.costUsd ? formatCost(mark.costUsd) : ''].filter(Boolean).join(' · ')
  return <span className={`fw-seg fw-seg-${mark.kind}${mark.alt ? ' fw-seg-alt' : ''}`} data-tone={toneKey(mark.tone)} style={at(mark.startMs, mark.endMs)}
    title={mark.name ? `${mark.name}${mark.count > 1 ? ` +${mark.count - 1} more` : ''}${meta ? ` · ${meta}` : ''}` : undefined}
    onPointerEnter={agentView ? event => events.onInspect(mark.id, event.currentTarget, event.clientX) : undefined}
    onClick={agentView ? event => { event.stopPropagation(); events.onPin(mark.id, event.currentTarget, event.clientX) } : undefined}>
    {glyph && <span className="fw-glyph" data-glyph={glyph}>{glyph === 'fail' ? <FailGlyph /> : <RetryGlyph />}</span>}
    {agentView && <span className="fw-seg-label">
      <span className="fw-seg-icon" aria-hidden><KindGlyph kind={model ? 'model' : 'tool'} name={mark.tool ?? mark.name} /></span>
      {name && <span className="fw-seg-name">{name}</span>}
      {/* A count reads only beside the tool it counts (round 29: a bare "×4" needed decoding). */}
      {mark.count > 1 && name && <span className="fw-seg-chip">×{mark.count}</span>}
      {duration && <span className="fw-seg-meta">{duration}</span>}
      {mark.costUsd ? <span className="fw-seg-meta">{formatCost(mark.costUsd)}</span> : null}
    </span>}
  </span>
}

/** A span the clock is inside: it grows live, or playback has not reached its end. */
const open = (row: FlowWaterfallRow, clockMs: number) => spanRunning(row.span) || row.span.startMs <= clockMs && clockMs < row.span.endMs

function endLabel(row: FlowWaterfallRow, clockMs: number): string {
  const span = row.span
  if (row.durationLabel === '—') return '—'
  // A point event (an approximate zero-length span) has no duration to state.
  if (row.approx && span.endMs === span.startMs && !spanRunning(span)) return span.costUsd === undefined ? '' : rowCostText(row, span.costUsd)
  if (!spanRunning(span) && clockMs < span.endMs) return `${formatSpanDuration(Math.max(0, clockMs - span.startMs))}${row.approx ? '~' : ''}`
  const duration = spanRunning(span) ? `${formatSpanDuration(Math.max(span.endMs, clockMs) - span.startMs)}${row.approx ? '~' : ''}` : row.durationLabel
  const cost = span.costUsd ?? (row.rollupCostUsd ? row.rollupCostUsd : undefined)
  return cost === undefined ? duration : `${duration} · ${rowCostText(row, cost)}`
}

/** One trace row. Geometry comes from CSS variables, so a row re-renders only when its own state changes. */
export const FlowRow = memo(function FlowRow(props: RowProps) {
  const { row, view, top, collapsed, searching, slowest, costliest, critical, matched, active, focusable, selected, sticky, clockMs, renderIcon, fillByAgent, motion } = props
  const span = row.span
  const running = spanRunning(span)
  const agentView = view === 'agents'
  const folded = row.hasChildren && collapsed && !searching
  const invalid = row.durationLabel === '—'
  const isAgent = row.kind === 'pipeline'
  const kind = !row.ok ? 'failed' : row.kind
  const marks = isAgent || row.hasChildren || row.id.startsWith('run:') ? (folded && !agentView ? row.segments : row.own) : []
  const label = endLabel(row, clockMs)
  // The model leads the second line unless the header names it for every agent.
  const summary = [...(span.detail && span.detail !== props.sharedDetail ? [span.detail] : []), ...agentSummary(row).filter(part => part !== props.sharedOutcome)]
  const inspect = (event: { currentTarget: HTMLElement; clientX: number }) => props.onInspect(row.id, event.currentTarget, event.clientX)
  const family = agentView && row.id.startsWith('family:')
  const step = agentView && row.stepOf !== undefined
  // An agent with its own steps opens them in place; a family opens its members.
  const opens = family || (agentView && isAgent && row.own.length > 0)
  const ending = agentView && !row.ok ? marks.map(mark => mark.kind).lastIndexOf('failed') : -1

  return (
    <div role="row" data-span-id={row.id} data-span-kind={kind} data-slowest={slowest || undefined} data-critical={critical || undefined} data-search={searching ? (matched ? 'match' : 'context') : undefined} data-running={running || undefined}
      aria-level={agentView ? undefined : row.depth + 1} aria-expanded={row.hasChildren && !agentView ? !folded : undefined}
      aria-selected={selected} tabIndex={focusable ? 0 : -1} data-tone={toneKey(row.tone)} data-outcome={fillByAgent ? undefined : span.outcome?.tone}
      className={`fw-row${active ? ' fw-active' : ''}${sticky ? ' fw-sticky-row' : ''}${isAgent ? ' fw-agent-row' : ''}${step ? ' fw-step' : ''}${motion?.enter !== undefined ? ' fw-enter' : ''}${motion?.settle ? ' fw-settle' : ''}`}
      // The end label's width rides on the row: a label that would run past the lane slides back over its bar's tail, and a stacked name stops short of it.
      style={{ '--row-y': `${top}px`, '--fw-enter-delay': `${motion?.enter ?? 0}ms`, '--fw-end-w': `${endLabelWidth(label, slowest, costliest)}px` } as CSSProperties}
      onFocus={event => { if (event.target === event.currentTarget) props.onActivate(row) }}
      onClick={event => {
        props.onActivate(row)
        if (family) { props.onToggle(row); return }
        // In the agent view a click anywhere on the row opens the agent, as its bar does; readers click the name first.
        const bar = agentView ? event.currentTarget.querySelector<HTMLElement>('.fw-bar') : null
        if (bar) props.onPin(row.id, bar, event.target instanceof Element && event.target.closest('.fw-lane') ? event.clientX : undefined)
      }}>
      <div role="gridcell" className="fw-label" style={{ '--depth': agentView ? (row.inset ?? 0) : row.depth } as CSSProperties}>
        {opens && <button type="button" tabIndex={-1} className={`fw-toggle${props.expanded ? ' fw-open' : ''}`}
          aria-label={`${props.expanded ? 'Collapse' : 'Expand'} ${row.name}`} aria-expanded={Boolean(props.expanded)}
          onClick={event => { event.stopPropagation(); props.onToggle(row) }}><ChevronGlyph /></button>}
        {!agentView && <span className="fw-guides" aria-hidden />}
        {!agentView && (row.hasChildren
          ? <button type="button" tabIndex={-1} className={`fw-toggle${folded ? '' : ' fw-open'}`} disabled={searching}
            aria-label={`${folded ? 'Expand' : 'Collapse'} ${row.name}`} aria-expanded={!folded}
            onClick={event => { event.stopPropagation(); props.onToggle(row) }}><ChevronGlyph /></button>
          : <span className="fw-toggle-space" aria-hidden />)}
        {/* Every agent row keeps the chevron's gutter, so names line up whether or not a row opens. */}
        {agentView && !opens && <span className="fw-toggle-space" aria-hidden />}
        {(!agentView || step) && <span className="fw-icon-tile" aria-hidden>{renderIcon?.(span) ?? <KindGlyph kind={span.kind} name={span.name} />}</span>}
        <span className="fw-names" title={`${row.name}${span.detail ? ` · ${span.detail}` : ''} · ${KIND_LABEL[span.kind]}${running ? ' · running' : ''}${row.ok ? '' : ' · failed'}`}>
          <span className={`fw-span-name${isAgent || row.hasChildren ? ' fw-strong' : ''}`}>
            {/* With agent fill, the outcome rides on the agent's dot in both views. */}
            {fillByAgent && isAgent && span.outcome
              ? <span className="fw-agent-dot" data-tone="0" data-outcome={span.outcome.tone} data-ring={span.outcome.ring || undefined} title={span.outcome.label} aria-hidden />
              : agentView && !step && <span className="fw-agent-dot" aria-hidden />}
            {/* A live outcome dot already says it runs; a spinner beside it was a second, contradicting mark. */}
            {running && !(fillByAgent && isAgent && span.outcome) && <span className="fw-spinner" role="status" aria-label="running" />}
            <span className="fw-name-text">{row.name}</span>
          </span>
          {/* Two levels on every agent row: the name, then how it ended and how much it did. */}
          {/* The host's mark leads the second line: a third line would overflow the 40 px row into the next one. */}
          {agentView && (
            <span className="fw-subtitle">
              {renderIcon && <span className="fw-detail-icon" aria-hidden>{renderIcon(span)}</span>}
              <span className="fw-subtitle-tail">
                <span className="fw-subtitle-text">{summary[0]}</span>
                {summary.slice(1).map(part => <span key={part} className="fw-subtitle-extra">· {part}</span>)}
              </span>
            </span>
          )}
        </span>
        {folded && <span className="fw-count" aria-label={`${row.descendants} hidden steps`}>+{row.descendants}</span>}
        {/* An agent row already says it failed in its second line and marks the failed turn in its bar. */}
        {!row.ok && !agentView && <span className="fw-alert"><AlertGlyph label="failed" /></span>}
      </div>
      <div role="gridcell" className="fw-lane" data-waterfall-track aria-label={`${KIND_LABEL[span.kind]}, ${label}${slowest ? `, slowest ${agentView ? 'agent' : 'step'}` : ''}${costliest ? ', costliest agent' : ''}${critical ? ', critical path' : ''}`}>
        {invalid ? <span className="fw-invalid">—</span> : <>
          {span.marks?.map(mark => <span key={`m-${mark.at}-${mark.label}`} className="fw-mark" data-mark={mark.kind} style={at(mark.at, mark.at)} title={mark.label} aria-label={mark.label} role="img" />)}
          <span className={`fw-bar fw-k-${isAgent ? 'pipeline' : kind}${row.approx ? ' fw-approx' : ''}${marks.length ? ' fw-has-marks' : ''}${row.hasAgents ? ' fw-has-agents' : ''}`}
            data-tone={toneKey(row.tone)} style={at(span.startMs, running ? OPEN_END : span.endMs)}
            onPointerEnter={inspect} onPointerLeave={props.onLeave}
            onClick={event => { event.stopPropagation(); if (family) props.onToggle(row); else props.onPin(row.id, event.currentTarget, event.clientX) }}>
            {!isAgent && !row.ok && <span className="fw-glyph"><FailGlyph /></span>}
            {!isAgent && row.ok && row.retry && <span className="fw-glyph"><RetryGlyph /></span>}
          </span>
          {marks.map((mark, i) => <Segment key={`${mark.id}-${i}`} mark={mark} events={props} agentView={agentView} ending={i === ending} />)}
          <span className="fw-end" style={at(span.startMs, running ? OPEN_END : span.endMs)}>
            <span className="fw-duration">{label}</span>
            {slowest && <span className="fw-badge">Slowest</span>}
            {costliest && <span className="fw-badge">Costliest</span>}
          </span>
        </>}
      </div>
    </div>
  )
}, (a, b) => a.row === b.row && a.view === b.view && a.top === b.top && a.collapsed === b.collapsed && a.searching === b.searching &&
  a.slowest === b.slowest && a.costliest === b.costliest && a.critical === b.critical && a.matched === b.matched && a.active === b.active && a.focusable === b.focusable && a.selected === b.selected &&
  a.sticky === b.sticky && a.motion === b.motion && a.renderIcon === b.renderIcon && a.fillByAgent === b.fillByAgent && a.sharedDetail === b.sharedDetail && a.sharedOutcome === b.sharedOutcome && a.expanded === b.expanded && (a.clockMs === b.clockMs || !open(a.row, a.clockMs) && !open(b.row, b.clockMs)))

export interface FlowLink { id: string; from: number; to: number; atMs: number; tone: number; dir: 'down' | 'up' }

/** An elbow connector between two rows at one moment, drawn in the row's tone; appears when the clock reaches it. */
/** `short`: only the last row of the connector, an elbow into the row it reaches. */
export function LinkMark({ link, rowHeight, hot, short }: { link: FlowLink; rowHeight: number; hot?: boolean; short?: boolean }) {
  const lower = Math.max(link.from, link.to), upper = short ? Math.max(Math.min(link.from, link.to), lower - 1) : Math.min(link.from, link.to)
  const style = {
    ...at(link.atMs, link.atMs),
    top: upper * rowHeight + rowHeight / 2 + 5,
    height: (lower - upper) * rowHeight - 5,
  } as CSSProperties
  return <span className={`fw-link fw-link-${link.dir}${hot ? ' fw-link-hot' : ''}`} data-tone={toneKey(link.tone)} style={style} aria-hidden />
}
