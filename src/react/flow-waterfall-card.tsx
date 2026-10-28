import type { ReactNode } from 'react'
import { runStatus, statusMeta } from '@tangle-network/ui/run'
import type { FlowSpan } from '../flow-trace.js'
import { CloseGlyph, KindGlyph } from './flow-waterfall-icons.js'
import { type FlowWaterfallRow, rowCostText, formatCount, formatSpanDuration, spanRunning, toneKey } from './flow-waterfall-model.js'


/** Names wrap between words, never at their hyphens ("memscale-engineer-" / "2" read as two names). */
const keepWords = (name: string) => name.replace(/-/g, '‑')

export const KIND_LABEL: Record<FlowSpan['kind'], string> = {
  pipeline: 'Agent', model: 'Model call', tool: 'Tool call', waiting: 'Waiting', handoff: 'Handoff',
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
  /** The agent timeline's card: the agent and its outcome, its table, then the step under the pointer. */
  compact?: boolean
}

const count = (n: number, unit: string) => <span title={`${n.toLocaleString()} ${unit}`}>{formatCount(n)} {unit}</span>
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`
/** Nearest-rank percentile of ascending values. */
const percentile = (sorted: readonly number[], p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]!
const TOOLS_SHOWN = 4

/** The card's table: what the row recorded, every value with its unit. A value nobody recorded is left out, never printed as zero. */
function metrics(row: FlowWaterfallRow, clockMs: number, full: boolean): [string, ReactNode][] {
  const span = row.span
  const out: [string, ReactNode][] = []
  if (span.detail) out.push([span.kind === 'tool' ? 'Provider' : 'Model', span.detail])
  const stop = spanRunning(span) ? Math.max(span.endMs, clockMs) : span.endMs
  out.push(['Ran for', Number.isFinite(stop - span.startMs) && stop >= span.startMs ? formatSpanDuration(stop - span.startMs) : '—'])
  if (full) out.push(['Started at', `+${formatSpanDuration(Math.max(0, span.startMs))}`])
  const tokens = row.tokens
  if (tokens) {
    const parts = ([['prompt', 'in'], ['completion', 'out'], ['cached', 'cached']] as const).flatMap(([key, unit]) => tokens[key] === undefined ? [] : [count(tokens[key], unit)])
    out.push(['Tokens', parts.length ? <span className={`fw-card-parts${parts.length > 2 ? ' fw-card-stack' : ''}`}>{parts.map((part, i) => <span key={i}>{part}</span>)}</span> : <span title="Tokens not reported">—</span>])
  }
  const latency = row.modelMs
  if (latency?.length) out.push(['Model latency', <span className="fw-card-parts"><span>{formatSpanDuration(percentile(latency, 0.5))} median</span>{latency.length >= 10 && <span>{formatSpanDuration(percentile(latency, 0.95))} p95</span>}</span>])
  const cost = span.costUsd ?? row.rollupCostUsd
  if (cost !== undefined) out.push(['Cost', rowCostText(row, cost)])
  const counts = row.counts
  if (counts?.model) out.push(['Model calls', counts.model.toLocaleString()])
  if (counts?.tool) {
    const tools = Object.entries(counts.tools).sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    const rest = tools.length - TOOLS_SHOWN

    out.push(['Tool calls', <>{counts.tool.toLocaleString()}<span className="fw-card-tools" title={tools.map(([tool, n]) => `${tool} ${n}`).join(', ')}>
      {tools.slice(0, rest > 1 ? TOOLS_SHOWN : tools.length).map(([tool, n]) => <span key={tool}><span>{tool}</span><span>{n.toLocaleString()}</span></span>)}
      {rest > 1 && <span><span>{rest} more tools</span><span>{tools.slice(TOOLS_SHOWN).reduce((sum, [, n]) => sum + n, 0).toLocaleString()}</span></span>}</span></>])
  }
  if (counts?.failed) out.push(['Failures', plural(counts.failed, 'failed step')])
  const restarts = span.marks?.filter(mark => mark.kind === 'restart').length ?? 0
  if (counts?.retried || restarts) out.push(['Retries', [counts?.retried ? plural(counts.retried, 'step retried', 'steps retried') : '', restarts ? plural(restarts, 'restart') : ''].filter(Boolean).join(' · ')])
  if (full && row.hasChildren) out.push(['Steps', row.descendants.toLocaleString()])

  for (const fact of span.facts ?? []) if (!out.some(([label]) => label.toLowerCase() === fact.label.toLowerCase())) out.push([fact.label, fact.value])
  return out
}

function Table({ rows }: { rows: [string, ReactNode][] }) {
  return <dl className="fw-card-table">{rows.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
}

/** The span card: what ran, for how long, on what tokens and at what recorded cost, then its input and output. */
export function SpanCard({ id, row, agent, clockMs, left, top, pinned, onClose, renderIcon, compact }: SpanCardProps) {
  const span = row.span
  const failure = span.facts?.find(fact => fact.label.toLowerCase() === 'failure')?.value
  const state = runStatus(span.status ?? 'unknown')
  const meta = statusMeta(state)
  const status = meta.label
  const owner = agent && agent.id !== row.id ? agent : undefined
  const frame = {
    id, role: pinned ? 'dialog' : 'tooltip', 'aria-label': pinned ? `${span.name} details` : undefined, style: { left, top, '--fw-status': `var(${meta.token})` },
    onKeyDown: (event: { key: string; stopPropagation: () => void }) => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } },
  }
  const close = pinned && <button type="button" className="fw-icon-button fw-card-close" aria-label="Close details" onClick={onClose} autoFocus><CloseGlyph /></button>
  if (compact) {

    const who = owner ?? row
    const outcome = who.span.outcome
    const outcomes = who.outcomes ?? (outcome ? [outcome] : [])
    const kind = span.kind === 'model' ? 'Thinking' : KIND_LABEL[span.kind]

    const named = span.name && span.name.toLowerCase() !== kind.toLowerCase() && span.name.toLowerCase() !== span.kind ? ` ${span.name}` : ''
    const stop = spanRunning(span) ? Math.max(span.endMs, clockMs) : span.endMs
    const step = owner && span.endMs > span.startMs ? `${kind}${named} · ${formatSpanDuration(stop - span.startMs)}${row.ok ? '' : ' · failed'}` : undefined

    const sentence = !owner && span.output && span.output !== who.name ? span.output : undefined
    return (
      <div {...frame} className="fw-card fw-card-compact" data-tone={toneKey(who.tone)} data-outcome={outcome?.tone}>
        <div className="fw-card-agent">{outcomes.length ? outcomes.map(state => <span key={`${state.label}:${state.tone}:${state.ring}`} className="fw-agent-dot" data-tone="0" data-outcome={state.tone} data-ring={state.ring || undefined} aria-hidden />) : <span className="fw-agent-dot" aria-hidden />}<span className="fw-card-who">{keepWords(who.name)}</span>
          {outcome
            ? <span className="fw-pill fw-pill-outcome" data-tone="0" data-outcome={outcome.tone}>{outcome.label}</span>
            : <span className={`fw-pill fw-pill-${state}`}>{status}</span>}
          {close}
        </div>
        <Table rows={metrics(who, clockMs, false).filter(([label]) => label.toLowerCase() !== 'failure')} />
        {step && <p className="fw-card-step">{step}</p>}
        {!row.ok && <p className="fw-card-error">{failure ? `Failure: ${failure}` : span.output ? `Recorded output: ${span.output}` : 'Failure detail not reported'}</p>}
        {sentence && row.ok && <p className="fw-card-result">{sentence}</p>}
      </div>
    )
  }
  return (
    <div {...frame} className="fw-card" data-tone={toneKey(row.tone)}>
      {owner && <div className="fw-card-agent"><span className="fw-agent-dot" data-tone="0" data-outcome={owner.span.outcome?.tone} data-ring={owner.span.outcome?.ring || undefined} aria-hidden />{owner.name}</div>}
      <div className="fw-card-head">
        <span className="fw-icon-tile" aria-hidden>{renderIcon?.(span) ?? <KindGlyph kind={span.kind} name={span.name} />}</span>
        <div className="fw-card-name">{keepWords(span.name)}</div>
        <span className={`fw-pill fw-pill-${state}`}>{status}</span>
        {close}
      </div>
      <Table rows={metrics(row, clockMs, true)} />
      {!row.ok && !span.output && !failure && <p className="fw-card-error">Failure detail not reported</p>}
      {span.input && <div className="fw-card-text"><div className="fw-card-label">Input</div><p>{span.input}</p></div>}
      {span.output && <div className="fw-card-text"><div className="fw-card-label">{row.ok ? 'Output' : 'Recorded output'}</div><p>{span.output}</p></div>}
    </div>
  )
}
