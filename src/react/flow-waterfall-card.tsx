import type { CSSProperties, ReactNode } from 'react'
import { RunStatusIcon, runStatus, statusMeta } from '@tangle-network/ui/run/status-meta'
import type { FlowSpan } from '../flow-trace.js'
import { CloseGlyph, KindGlyph } from './flow-waterfall-icons.js'
import { type FlowWaterfallRow, agentSummary, percentile, rowCostText, formatCount, formatSpanDuration, spanFact, spanRunning, toneKey } from './flow-waterfall-model.js'
import { toolLabel } from './agent-graph/naming.js'
import { HBars } from './live.js'

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
  /** `pinned` cards take focus, close on Escape and return focus to the row; a `docked` card is content inside a host's surface (an inspector panel, a HoverCard) and draws no frame of its own. */
  mode: 'hover' | 'pinned' | 'docked'
  onClose: () => void
  renderIcon?: (span: FlowSpan) => ReactNode
  /** The agent timeline's card: three lines, the agent and how it ended, its time, cost and model, then why it failed or what it did last. */
  compact?: boolean
}

const count = (n: number, unit: string) => <span title={`${n.toLocaleString()} ${unit}`}>{formatCount(n)} {unit}</span>
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`
const TOOLS_SHOWN = 4

/** The card's table: what the row recorded, every value with its unit. A value nobody recorded is left out, never printed as zero. */
function metrics(row: FlowWaterfallRow, clockMs: number, withFacts: boolean) {
  const span = row.span
  const out: [string, ReactNode][] = []
  if (span.detail) out.push([span.kind === 'tool' ? 'Provider' : 'Model', span.detail])
  const stop = spanRunning(span) ? Math.max(span.endMs, clockMs) : span.endMs
  out.push(['Ran for', Number.isFinite(stop - span.startMs) && stop >= span.startMs ? formatSpanDuration(stop - span.startMs) : '—'])
  out.push(['Started at', `+${formatSpanDuration(Math.max(0, span.startMs))}`])
  const tokens = row.tokens
  if (tokens) {
    const parts = ([['prompt', 'in'], ['completion', 'out'], ['cached', 'cached']] as const).flatMap(([key, unit]) => tokens[key] === undefined ? [] : [count(tokens[key], unit)])
    out.push(['Tokens', parts.length ? <span className={`fw-card-parts${parts.length > 2 ? ' fw-card-stack' : ''}`}>{parts.map((part, i) => <span key={i}>{part}</span>)}</span> : <span title="Tokens not reported">—</span>])
  }
  const latency = row.modelMs
  if (latency?.length) out.push(['Model latency', <span className="fw-card-parts"><span>{formatSpanDuration(percentile(latency, 50)!)} median</span>{latency.length >= 10 && <span>{formatSpanDuration(percentile(latency, 95)!)} p95</span>}</span>])
  const cost = span.costUsd ?? row.rollupCostUsd
  if (cost !== undefined) out.push(['Cost', rowCostText(row, cost)])
  const counts = row.counts
  if (counts?.model) out.push(['Model calls', counts.model.toLocaleString()])
  if (counts?.tool) out.push(['Tool calls', counts.tool.toLocaleString()])
  if (counts?.failed) out.push(['Failures', plural(counts.failed, 'failed step')])
  const restarts = span.marks?.filter(mark => mark.kind === 'restart').length ?? 0
  if (counts?.retried || restarts) out.push(['Retries', [counts?.retried ? plural(counts.retried, 'step retried', 'steps retried') : '', restarts ? plural(restarts, 'restart') : ''].filter(Boolean).join(' · ')])
  if (row.hasChildren) out.push(['Steps', row.descendants.toLocaleString()])

  // The producer's facts are the inspector's (a docked card); a hover card keeps to what the chart measured.
  const facts = (withFacts ? span.facts ?? [] : []).map(({ label, value }): [string, ReactNode] => [label, value])
  return [...new Map([...out, ...facts].map(row => [row[0].toLowerCase(), row])).values()].map(([label, value]) => ({ label, value }))
}

/** Recorded facts and ranked tool calls, shared by the span card and agent inspectors. */
export function AgentFacts({ facts = [], tools = [], className = 'fw-card-table' }: { facts?: readonly { label: string; value: ReactNode }[]; tools?: FlowSpan['tools']; className?: string }) {
  return <>
    {facts.length > 0 && <dl className={className}>{facts.map(({ label, value }, index) => <div key={index} className="contents"><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
    {tools.length > 0 && <HBars limit={TOOLS_SHOWN} rows={[...tools].sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name)).map(tool => ({ label: toolLabel(tool.name), value: tool.calls, title: `${tool.name}: ${tool.calls.toLocaleString()}${tool.failures ? ` · ${tool.failures} failed` : ''}${tool.detail ? ` · ${tool.detail}` : ''}`, note: [tool.failures ? `${tool.failures} failed` : '', tool.detail].filter(Boolean).join(' · ') || undefined }))} format={value => value.toLocaleString()} />}
  </>
}

/** The span card: what ran, for how long, on what tokens and at what recorded cost, then its input and output. */
export function SpanCard({ id, row, agent, clockMs, mode, onClose, renderIcon, compact }: SpanCardProps) {
  const span = row.span
  const failure = spanFact(span, 'Failure')
  const state = runStatus(span.status ?? 'unknown')
  const meta = statusMeta(state)
  const owner = agent && agent.id !== row.id ? agent : undefined
  const frame = {
    id, 'data-mode': mode, role: { hover: 'tooltip', pinned: 'dialog', docked: 'region' }[mode], 'aria-label': mode === 'hover' ? undefined : `${span.name} details`, style: { '--fw-status': `var(${meta.token})` } as CSSProperties,
    onKeyDown: (event: { key: string; stopPropagation: () => void }) => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } },
  }
  const close = mode === 'pinned' && <button type="button" className="fw-icon-button fw-card-close" aria-label="Close details" onClick={onClose} autoFocus><CloseGlyph /></button>
  if (compact) {
    // Three lines at most (round s-tier): who and how it ended; how long, what it cost, on what; why it failed or what it did last.
    // Every other fact belongs to the host's inspector, so the card never repeats it.
    const who = owner ?? row
    const whoState = runStatus(who.span.status ?? 'unknown')
    const stop = (span: FlowSpan) => spanRunning(span) ? Math.max(span.endMs, clockMs) : span.endMs
    const cost = who.span.costUsd ?? who.rollupCostUsd
    const facts = [formatSpanDuration(Math.max(0, stop(who.span) - who.span.startMs)), cost ? rowCostText(who, cost) : '', who.span.detail].filter(Boolean).join(' · ')
    const reason = spanFact(who.span, 'Failure') ?? (whoState === 'failed' ? who.span.output : undefined)
    const team = who.id.startsWith('family:') ? agentSummary(who).join(' · ') : undefined
    const kind = span.kind === 'model' ? 'Thinking' : toolLabel(span.name)
    const last = owner ? `${kind} · ${formatSpanDuration(Math.max(0, stop(span) - span.startMs))}` : who.own.at(-1) && `Last: ${toolLabel(who.own.at(-1)!.name ?? '')}`
    const failedStep = owner && !row.ok ? spanFact(span, 'Failure') ?? span.output : undefined
    return (
      <div {...frame} className="fw-card fw-card-compact" style={{ '--fw-status': `var(${statusMeta(whoState).token})` } as CSSProperties}>
        <div className="fw-card-agent"><span className="fw-card-who">{keepWords(who.name)}</span>
          <span className="fw-card-state" title={statusMeta(whoState).label}>{whoState === 'running' ? <span className="fw-spinner" data-motion="essential" /> : <RunStatusIcon status={whoState} size={14} aria-hidden />}<span className="fw-sr-only">{statusMeta(whoState).label}</span></span>
          {close}
        </div>
        {facts && <p className="fw-card-line">{facts}</p>}
        {reason || failedStep ? <p className="fw-card-error" title={reason ?? failedStep}>{reason ?? failedStep}</p> : team ? <p className="fw-card-line">{team}</p> : last ? <p className="fw-card-line" title={last}>{last}</p> : null}
      </div>
    )
  }
  return (
    <div {...frame} className="fw-card" data-tone={toneKey(row.tone)}>
      {owner && <div className="fw-card-agent"><span className="fw-agent-dot" data-tone="0" data-outcome={owner.span.outcome?.tone} data-ring={owner.span.outcome?.ring || undefined} aria-hidden />{owner.name}</div>}
      <div className="fw-card-head">
        <span className="fw-icon-tile" aria-hidden>{renderIcon?.(span) ?? <KindGlyph kind={span.kind} name={span.name} />}</span>
        <div className="fw-card-name">{keepWords(span.name)}</div>
        <span className={`fw-pill fw-pill-${state}`}>{meta.label}</span>
        {close}
      </div>
      <AgentFacts facts={metrics(row, clockMs, mode === 'docked')} tools={clockMs >= span.endMs ? span.tools ?? Object.entries(row.counts?.tools ?? {}).map(([name, calls]) => ({ name, calls })) : undefined} />
      {!row.ok && !span.output && !failure && <p className="fw-card-error">Failure detail not reported</p>}
      {span.input && <div className="fw-card-text"><div className="fw-card-label">Input</div><p>{span.input}</p></div>}
      {span.output && <div className="fw-card-text"><div className="fw-card-label">{row.ok ? 'Output' : 'Recorded output'}</div><p>{span.output}</p></div>}
    </div>
  )
}
