import type { ReactNode } from 'react'
import type { FlowSpan } from '../flow-trace.js'
import { CloseGlyph, KindGlyph, ReturnGlyph } from './flow-waterfall-icons.js'
import { type FlowWaterfallRow, formatCost, formatCount, formatSpanDuration, spanRunning, toneKey } from './flow-waterfall-model.js'

export const KIND_LABEL: Record<FlowSpan['kind'], string> = {
  pipeline: 'Agent', model: 'LLM call', tool: 'Tool call', waiting: 'Waiting', handoff: 'Handoff',
}

export interface SpanCardProps {
  id: string
  row: FlowWaterfallRow
  /** The agent that owns the span, for the agent-level header. */
  agent?: FlowWaterfallRow
  clockMs: number
  left: number
  top: number
  /** Pinned cards take focus, close on Escape and return focus to the row. */
  pinned: boolean
  onClose: () => void
  renderIcon?: (span: FlowSpan) => ReactNode
  /** The agent timeline's card: the result first, then kind, time and tokens, then the message it handed back. */
  compact?: boolean
}

const unknown = <span className="fw-unknown" title="Not recorded by the harness">Unknown</span>
const count = (n: number | undefined) => n === undefined ? unknown : <span title={n.toLocaleString()}>{formatCount(n)}</span>

/** The span card: what ran, for how long, at what recorded cost, on what input. */
export function SpanCard({ id, row, agent, clockMs, left, top, pinned, onClose, renderIcon, compact }: SpanCardProps) {
  const span = row.span
  const running = spanRunning(span)
  const end = running ? Math.max(span.endMs, clockMs) : span.endMs
  const status = running ? 'Running' : row.ok ? 'Done' : 'Failed'
  const tokens = span.kind === 'model' || span.kind === 'pipeline' || span.promptTokens !== undefined
  const owner = agent && agent.id !== row.id ? agent : undefined
  const duration = Number.isFinite(end - span.startMs) && end >= span.startMs ? formatSpanDuration(end - span.startMs) : '—'
  if (compact) {
    const who = owner ?? row
    const tokenCount = span.promptTokens !== undefined || span.completionTokens !== undefined ? (span.promptTokens ?? 0) + (span.completionTokens ?? 0) : undefined
    const meta = [span.kind === 'model' ? 'Thinking' : KIND_LABEL[span.kind], duration, tokenCount !== undefined ? `${tokenCount.toLocaleString()} tokens` : undefined, span.costUsd !== undefined ? formatCost(span.costUsd) : undefined]
    return (
      <div id={id} role={pinned ? 'dialog' : 'tooltip'} aria-label={pinned ? `${span.name} details` : undefined}
        className="fw-card fw-card-compact" data-tone={toneKey(who.tone)} style={{ left, top }}
        onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }}>
        <div className="fw-card-agent"><span className="fw-agent-dot" aria-hidden />{who.name}{who.span.detail && <span className="fw-muted"> {who.span.detail}</span>}
          {!row.ok && <span className="fw-pill fw-pill-failed" style={{ marginLeft: 'auto' }}>Failed</span>}
          {pinned && <button type="button" className="fw-icon-button" style={{ marginLeft: row.ok ? 'auto' : 0, width: 20, height: 20 }} aria-label="Close details" onClick={onClose} autoFocus><CloseGlyph /></button>}
        </div>
        <div className="fw-card-result">{span.output ?? span.name}</div>
        <div className="fw-card-meta">{meta.filter(Boolean).join(' · ')}</div>
        {span.input && <div className="fw-card-message"><ReturnGlyph /><span>{span.input}</span></div>}
      </div>
    )
  }
  return (
    <div id={id} role={pinned ? 'dialog' : 'tooltip'} aria-label={pinned ? `${span.name} details` : undefined}
      className="fw-card" data-tone={toneKey(row.tone)} style={{ left, top }}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }}>
      {owner && <div className="fw-card-agent"><span className="fw-agent-dot" aria-hidden />{owner.name}{owner.span.detail && <span className="fw-muted"> {owner.span.detail}</span>}</div>}
      <div className="fw-card-head">
        <span className="fw-icon-tile" aria-hidden>{renderIcon?.(span) ?? <KindGlyph kind={span.kind} />}</span>
        <div className="fw-card-title">
          <div className="fw-card-name">{span.name}</div>
          <div className="fw-muted">{KIND_LABEL[span.kind]}{span.detail ? ` · ${span.detail}` : ''}</div>
        </div>
        <span className={`fw-pill fw-pill-${status.toLowerCase()}`}>{status}</span>
        {pinned && <button type="button" className="fw-icon-button" aria-label="Close details" onClick={onClose} autoFocus><CloseGlyph /></button>}
      </div>
      <dl className="fw-card-stats">
        <div><dt>Duration</dt><dd>{duration}</dd></div>
        <div><dt>Started</dt><dd>+{formatSpanDuration(Math.max(0, span.startMs))}</dd></div>
        <div><dt>Cost</dt><dd>{span.costUsd === undefined ? unknown : formatCost(span.costUsd)}</dd></div>
        {tokens && <div><dt>Tokens in</dt><dd>{count(span.promptTokens)}</dd></div>}
        {tokens && <div><dt>Tokens out</dt><dd>{count(span.completionTokens)}</dd></div>}
        {row.hasChildren && <div><dt>Steps</dt><dd>{row.descendants}</dd></div>}
      </dl>
      {span.input && <div className="fw-card-text"><div className="fw-card-label">Input</div><p>{span.input}</p></div>}
      {span.output && <div className="fw-card-text"><div className="fw-card-label">{row.ok ? 'Output' : 'Error'}</div><p>{span.output}</p></div>}
    </div>
  )
}
