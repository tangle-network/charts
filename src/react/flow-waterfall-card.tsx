import type { ReactNode } from 'react'
import type { FlowSpan } from '../flow-trace.js'
import { CloseGlyph, KindGlyph } from './flow-waterfall-icons.js'
import { type FlowWaterfallRow, formatCost, formatCount, formatSpanDuration, spanRunning, toneKey } from './flow-waterfall-model.js'


/** Names wrap between words, never at their hyphens ("memscale-engineer-" / "2" read as two names). */
const keepWords = (name: string) => name.replace(/-/g, '\u2011')

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

const unknown = <span className="fw-unknown" title="Not recorded by the harness">—</span>
const count = (n: number | undefined) => n === undefined ? unknown : <span title={n.toLocaleString()}>{formatCount(n)}</span>

/** The span card: what ran, for how long, at what recorded cost, on what input. */
export function SpanCard({ id, row, agent, clockMs, left, top, pinned, onClose, renderIcon, compact }: SpanCardProps) {
  const span = row.span
  const running = spanRunning(span)
  const status = running ? 'Running' : row.ok ? 'Done' : 'Failed'
  const tokens = span.kind === 'model' || span.kind === 'pipeline' || span.promptTokens !== undefined
  const owner = agent && agent.id !== row.id ? agent : undefined
  const lasted = (s: FlowSpan) => {
    const stop = spanRunning(s) ? Math.max(s.endMs, clockMs) : s.endMs
    return Number.isFinite(stop - s.startMs) && stop >= s.startMs ? formatSpanDuration(stop - s.startMs) : '—'
  }
  const duration = lasted(span)
  if (compact) {
    // The reference tooltip: who and the outcome, harness and model, two to four recorded values, one sentence.
    // A segment inside an agent bar keeps the agent's facts; the segment itself is one line under them.
    const who = owner ?? row
    const subject = who.span
    const outcome = subject.outcome
    const tokenCount = subject.promptTokens !== undefined || subject.completionTokens !== undefined ? (subject.promptTokens ?? 0) + (subject.completionTokens ?? 0) : undefined
    const cost = subject.costUsd ?? who.rollupCostUsd
    const cells: [string, ReactNode][] = [[subject.kind === 'model' ? 'Thinking' : KIND_LABEL[subject.kind], lasted(subject)]]
    for (const fact of (subject.facts ?? []).slice(0, 3)) cells.push([fact.label, fact.value])
    cells.push(['Started', `+${formatSpanDuration(Math.max(0, subject.startMs))}`])
    if (tokenCount !== undefined) cells.push(['Tokens', count(tokenCount)])
    if (cost !== undefined) cells.push(['Cost', formatCost(cost)])
    cells.splice(6)
    const kind = span.kind === 'model' ? 'Thinking' : KIND_LABEL[span.kind]
    const step = owner ? `${kind}${span.name && span.name !== kind && span.name.toLowerCase() !== span.kind ? ` ${span.name}` : ''} · ${duration}${row.ok ? '' : ' · failed'}` : undefined
    // The sentence is what the agent did; a name repeated from the title says nothing.
    const sentence = !owner && span.output && span.output !== who.name ? span.output : undefined
    return (
      <div id={id} role={pinned ? 'dialog' : 'tooltip'} aria-label={pinned ? `${span.name} details` : undefined}
        className="fw-card fw-card-compact" data-tone={toneKey(who.tone)} data-outcome={outcome?.tone} style={{ left, top }}
        onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }}>
        <div className="fw-card-agent"><span className="fw-agent-dot" aria-hidden /><span className="fw-card-who">{keepWords(who.name)}</span>
          {outcome
            ? <span className="fw-pill fw-pill-outcome" data-tone="0" data-outcome={outcome.tone}>{outcome.label}</span>
            : <span className={`fw-pill fw-pill-${status.toLowerCase()}`}>{status}</span>}
          {pinned && <button type="button" className="fw-icon-button" style={{ width: 20, height: 20 }} aria-label="Close details" onClick={onClose} autoFocus><CloseGlyph /></button>}
        </div>
        {who.span.detail && <p className="fw-card-detail">{who.span.detail}</p>}
        <dl className="fw-card-cells">{cells.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
        {step && <p className="fw-card-step">{step}</p>}
        {sentence && <p className="fw-card-result">{sentence}</p>}
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
          <div className="fw-card-name">{keepWords(span.name)}</div>
          {span.detail && <div className="fw-muted">{span.detail}</div>}
        </div>
        <span className={`fw-pill fw-pill-${status.toLowerCase()}`}>{status}</span>
        {pinned && <button type="button" className="fw-icon-button" aria-label="Close details" onClick={onClose} autoFocus><CloseGlyph /></button>}
      </div>
      <dl className="fw-card-stats">
        <div><dt>Duration</dt><dd>{duration}</dd></div>
        <div><dt>Started</dt><dd>+{formatSpanDuration(Math.max(0, span.startMs))}</dd></div>
        {/* A value nobody recorded is left out, not printed as unknown; the host's own facts follow. */}
        {span.costUsd !== undefined && <div><dt>Cost</dt><dd>{formatCost(span.costUsd)}</dd></div>}
        {tokens && span.promptTokens !== undefined && <div><dt>Tokens in</dt><dd>{count(span.promptTokens)}</dd></div>}
        {tokens && span.completionTokens !== undefined && <div><dt>Tokens out</dt><dd>{count(span.completionTokens)}</dd></div>}
        {(span.facts ?? []).slice(0, 3).map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
        {row.hasChildren && <div><dt>Steps</dt><dd>{row.descendants}</dd></div>}
      </dl>
      {span.input && <div className="fw-card-text"><div className="fw-card-label">Input</div><p>{span.input}</p></div>}
      {span.output && <div className="fw-card-text"><div className="fw-card-label">{row.ok ? 'Output' : 'Error'}</div><p>{span.output}</p></div>}
    </div>
  )
}
