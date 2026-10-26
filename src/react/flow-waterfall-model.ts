import type { FlowSpan, FlowTrace } from '../flow-trace.js'

/** A minimap mark on a parent row: merged descendant activity of one kind. */
export interface FlowSegment {
  startMs: number
  /** Infinity while running; the presentation clips it at the clock. */
  endMs: number
  kind: 'model' | 'tool' | 'failed'
  tone: number
  /** The first span merged into this mark, and how many were merged. */
  id: string
  count: number
  retry: boolean
  /** In a family row, every other member's marks take a darker shade of the family's one hue. */
  alt?: boolean
}

export interface FlowWaterfallRow {
  id: string
  parentId?: string
  name: string
  kind: FlowSpan['kind']
  durationLabel: string
  approx: boolean
  ok: boolean
  depth: number
  hasChildren: boolean
  span: FlowSpan
  /** Agent hue: the index of the nearest pipeline ancestor (or self), in first-start order. */
  tone: number
  /** All descendants, for the collapsed "+N" count. */
  descendants: number
  /** Parent rows only: merged descendant activity, drawn as the row's minimap. */
  segments: FlowSegment[]
  /** Direct non-agent children: the row's own thinking and tool work, drawn over its waiting extent. */
  own: FlowSegment[]
  /** The span retries a failed one; its bar carries a retry glyph. */
  retry: boolean
  /** The row delegates to child agents, so the gaps in its own work are waiting. */
  hasAgents: boolean
  /** Recorded cost of the row and its descendants, only when every model call below it has a recorded cost. */
  rollupCostUsd?: number
  /** Agent view: the family row this agent belongs to, when agents sharing a role are folded together. */
  family?: string
}

/** The CSS hue slot: 0 is the root agent's neutral, then five agent hues cycle. */
export const toneKey = (tone: number): number => tone <= 0 ? 0 : ((tone - 1) % 5) + 1

export const spanFailed = (span: FlowSpan): boolean => span.status === 'failed'
export const spanRunning = (span: FlowSpan): boolean => span.status === 'running'
const ordered = (span: FlowSpan) => Number.isFinite(span.startMs) && Number.isFinite(span.endMs) && span.endMs >= span.startMs

/** 542ms, 6.9s, 23s, 1m 22s, 2h 05m: the precision a reader compares at each scale. */
export function formatSpanDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3_600_000) {
    const m = Math.floor(ms / 60_000), s = Math.round((ms % 60_000) / 1000)
    return s === 60 ? `${m + 1}m` : s ? `${m}m ${s}s` : `${m}m`
  }
  const h = Math.floor(ms / 3_600_000), m = Math.round((ms % 3_600_000) / 60_000)
  return m === 60 ? `${h + 1}h` : `${h}h ${String(m).padStart(2, '0')}m`
}

/** $0.12, $0.005, $12.40; never rounds a recorded nonzero cost to $0.00. */
export function formatCost(usd: number): string {
  if (usd === 0) return '$0.00'
  if (usd < 0.01) return `$${usd.toPrecision(1).replace(/0+$/, '')}`
  return `$${usd.toFixed(2)}`
}

/** 9.8k, 754.4k, 1.2M with the exact count left to a title. */
export function formatCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

/** Merge marks closer than `gapMs` so a dense row stays a readable strip of at most `cap` marks. Marks narrower
 * than the gap merge across kinds and take the kind that covers more time; failures and retries stay distinct. */
function mergeSegments(marks: FlowSegment[], gapMs: number, cap = 240): FlowSegment[] {
  marks.sort((a, b) => a.startMs - b.startMs)
  let gap = gapMs
  for (let pass = 0; pass < 40; pass++, gap *= 2) {
    const out: FlowSegment[] = []
    const covered = new Map<FlowSegment, { model: number; tool: number }>()
    for (const mark of marks) {
      const last = out[out.length - 1]
      const width = Math.min(mark.endMs, mark.startMs + gap * 4) - mark.startMs
      const distinct = (m: FlowSegment) => m.retry || m.kind === 'failed'
      const small = width < gap || last !== undefined && last.endMs - last.startMs < gap
      if (last && !distinct(last) && !distinct(mark) && last.tone === mark.tone && mark.startMs - last.endMs <= gap && (last.kind === mark.kind || small)) {
        const share = covered.get(last) ?? { model: last.kind === 'model' ? last.endMs - last.startMs : 0, tool: last.kind === 'tool' ? last.endMs - last.startMs : 0 }
        share[mark.kind === 'model' ? 'model' : 'tool'] += width
        covered.set(last, share)
        last.endMs = Math.max(last.endMs, mark.endMs)
        last.count += mark.count
        last.kind = share.model >= share.tool ? 'model' : 'tool'
      } else out.push({ ...mark })
    }
    if (out.length <= cap) return out
  }
  return marks
}

/** Hierarchy only; presentation owns geometry.
 * Orphaned parents become roots; cycles are broken without dropping any span. */
export function flowWaterfallRows(trace: FlowTrace, resolutionMs?: number): FlowWaterfallRow[] {
  const ids = new Set<string>()
  const rows: FlowWaterfallRow[] = [...trace.spans]
    .map((span, i) => ({ span, key: span.id ?? `span-${i}` }))
    .sort((a, b) => a.span.startMs - b.span.startMs)
    .map(({ span, key }, index) => {
      let id = key
      let suffix = index
      while (ids.has(id)) id = `${key}:${suffix++}`
      ids.add(id)
      return {
        id, parentId: span.parentId, name: span.name, kind: span.kind,
        durationLabel: ordered(span) ? `${formatSpanDuration(span.endMs - span.startMs)}${span.approx ? '~' : ''}` : '—',
        approx: span.approx === true, ok: !spanFailed(span), depth: 0, hasChildren: false, span,
        tone: -1, descendants: 0, segments: [], own: [], retry: span.retryOf !== undefined, hasAgents: false,
      }
    })
  const byId = new Map(rows.map(row => [row.id, row]))
  const children = new Map<string, FlowWaterfallRow[]>()
  for (const row of rows) {
    const seen = new Set([row.id])
    let parent = row.parentId
    while (parent && byId.has(parent)) {
      if (seen.has(parent)) { row.parentId = undefined; break }
      seen.add(parent)
      parent = byId.get(parent)?.parentId
    }
    if (row.parentId && !byId.has(row.parentId)) row.parentId = undefined
    if (row.parentId) {
      const siblings = children.get(row.parentId) ?? []
      siblings.push(row)
      children.set(row.parentId, siblings)
    }
  }
  const total = Math.max(1, Number.isFinite(trace.totalMs) ? trace.totalMs : 1)
  const gap = resolutionMs ?? total / 900
  const ordered_: FlowWaterfallRow[] = []
  let agents = 0
  const visit = (row: FlowWaterfallRow, depth: number, tone: number): FlowSegment[] => {
    row.depth = depth
    row.tone = row.kind === 'pipeline' ? agents++ : tone
    const kids = children.get(row.id) ?? []
    row.hasChildren = kids.length > 0
    ordered_.push(row)
    const marks: FlowSegment[] = []
    let cost = row.span.costUsd ?? 0
    let costKnown = row.span.kind !== 'model' || row.span.costUsd !== undefined
    for (const child of kids) {
      for (const mark of visit(child, depth + 1, row.tone)) marks.push(mark)
      row.descendants += 1 + child.descendants
      if (child.kind === 'pipeline') row.hasAgents = true
      const childCost = child.hasChildren ? child.rollupCostUsd : child.span.costUsd
      if (childCost === undefined) { if (child.kind === 'model' || child.hasChildren) costKnown = false }
      else cost += childCost
      if (child.kind !== 'pipeline' && child.kind !== 'waiting' && ordered(child.span)) row.own.push(segmentOf(child))
    }
    if (row.hasChildren && costKnown) row.rollupCostUsd = cost
    if (row.hasChildren) {
      row.segments = mergeSegments(marks.map(mark => ({ ...mark })), gap)
      row.own = mergeSegments(row.own, gap)
    }
    if (row.kind === 'pipeline' || row.kind === 'waiting' || !ordered(row.span)) return marks
    marks.push(segmentOf(row))
    return marks
  }
  for (const row of rows) if (!row.parentId) visit(row, 0, -1)
  return ordered_
}

function segmentOf(row: FlowWaterfallRow): FlowSegment {
  return {
    startMs: row.span.startMs,
    endMs: spanRunning(row.span) ? Number.POSITIVE_INFINITY : row.span.endMs,
    kind: !row.ok ? 'failed' : row.kind === 'model' ? 'model' : 'tool',
    tone: row.tone,
    id: row.id,
    count: 1,
    retry: row.retry,
  }
}

/** Search keeps ancestor context and deliberately reveals matches inside collapsed branches. */
export function visibleFlowWaterfallRows(rows: FlowWaterfallRow[], query: string, collapsed: Set<string>): FlowWaterfallRow[] {
  const byId = new Map(rows.map(row => [row.id, row]))
  const term = query.trim().toLowerCase()
  if (term) {
    const matching = new Set<string>()
    for (const row of rows) {
      if (!`${row.name} ${row.span.detail ?? ''} ${row.kind} ${row.ok ? '' : 'failed'} ${row.span.status ?? ''}`.toLowerCase().includes(term)) continue
      let cursor: FlowWaterfallRow | undefined = row
      while (cursor && !matching.has(cursor.id)) {
        matching.add(cursor.id)
        cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
      }
    }
    return rows.filter(row => matching.has(row.id))
  }
  const hidden = new Set<string>()
  return rows.filter(row => {
    const isHidden = row.parentId !== undefined && (collapsed.has(row.parentId) || hidden.has(row.parentId))
    if (isHidden) hidden.add(row.id)
    return !isHidden
  })
}

/** The leaf a reader should look at first: the longest completed or running non-agent step. */
export function slowestRow(rows: FlowWaterfallRow[], clockMs: number): FlowWaterfallRow | undefined {
  let best: FlowWaterfallRow | undefined
  let bestMs = -1
  for (const row of rows) {
    if (row.hasChildren || row.kind === 'pipeline' || row.kind === 'waiting' || row.durationLabel === '—') continue
    if (row.span.startMs > clockMs) continue
    const ms = (spanRunning(row.span) ? Math.max(row.span.endMs, clockMs) : Math.min(row.span.endMs, clockMs)) - row.span.startMs
    if (ms > bestMs) { best = row; bestMs = ms }
  }
  return best
}

/** The agents a reader should look at first: the longest one by the clock, and the costliest when two or more are priced. */
export function agentCallouts(agents: FlowWaterfallRow[], clockMs: number): { slowestId?: string; costliestId?: string } {
  let slowest: FlowWaterfallRow | undefined, slowestMs = -1, costliest: FlowWaterfallRow | undefined, top = -1, priced = 0
  for (const row of agents) {
    if (row.durationLabel === '—' || row.span.startMs > clockMs) continue
    const ms = (spanRunning(row.span) ? Math.max(row.span.endMs, clockMs) : Math.min(row.span.endMs, clockMs)) - row.span.startMs
    if (ms > slowestMs) { slowest = row; slowestMs = ms }
    const cost = row.span.costUsd ?? row.rollupCostUsd
    if (cost === undefined) continue
    priced += 1
    if (cost > top) { costliest = row; top = cost }
  }
  return { slowestId: agents.length > 1 ? slowest?.id : undefined, costliestId: priced > 1 && top > 0 ? costliest?.id : undefined }
}

/** Busy time per agent row: the union of its own work. Their sum over wall time is the parallel speedup. */
export function busyMs(row: FlowWaterfallRow, clockMs: number): number {
  let total = 0, end = -Infinity
  for (const mark of row.own) {
    const a = Math.max(mark.startMs, end), b = Math.min(mark.endMs, clockMs)
    if (b > a) total += b - a
    end = Math.max(end, Math.min(mark.endMs, clockMs))
  }
  return total
}

/** Totals as of a playback position, from per-span records. A total the spans do not carry stays the trace's own. */
export function totalsAt(trace: FlowTrace, clockMs: number) {
  let cost = 0, tokens = 0, models = 0, tools = 0, errors = 0
  let costs = false, counted = false
  for (const span of trace.spans) {
    if (span.startMs > clockMs) continue
    if (span.kind === 'model') models++
    if (span.kind === 'tool') tools++
    if (span.endMs > clockMs) continue
    if (spanFailed(span)) errors++
    if (span.costUsd !== undefined) { cost += span.costUsd; costs = true }
    if (span.promptTokens !== undefined || span.completionTokens !== undefined) { tokens += (span.promptTokens ?? 0) + (span.completionTokens ?? 0); counted = true }
  }
  return {
    costUsd: trace.costUsd === undefined ? undefined : costs ? cost : trace.costUsd,
    tokens: counted ? tokens : trace.promptTokens + trace.completionTokens,
    modelCalls: trace.modelCalls === undefined ? undefined : models,
    toolCalls: tools,
    errors,
  }
}

/** The cost a reader can rely on: a lower bound when some calls are unpriced, a dash only when nothing is priced. */
export function costSummary(costUsd: number | undefined, trace: Pick<FlowTrace, 'costBasis' | 'costCoverage' | 'billedUsd' | 'costUpperBound'>): { value: string; title: string; label: string } {
  const list = trace.costBasis === 'list'
  const label = list ? 'Cost · list price' : 'Cost'
  if (costUsd === undefined) {
    return trace.billedUsd !== undefined
      ? { value: `${formatCost(trace.billedUsd)} billed`, title: 'No list price for these calls; billed is the seat charge', label }
      : { value: '—', title: 'No cost source: the harness recorded no cost and no price catalog was given', label }
  }
  const coverage = trace.costCoverage
  const partial = coverage !== undefined && coverage.priced < coverage.total
  const upper = !partial && trace.costUpperBound === true
  const value = `${partial ? '≥' : upper ? '≤' : list ? '≈' : ''}${formatCost(costUsd)}${trace.billedUsd !== undefined ? ` · ${formatCost(trace.billedUsd)} billed` : ''}`
  const parts = [partial ? `${coverage.priced} of ${coverage.total} model calls priced` : coverage ? `all ${coverage.total} model calls priced` : '',
    list ? 'at the model catalog list price; not a bill' : '', upper ? 'cached input is not split out, so it is priced as fresh input: at most this' : '', trace.billedUsd !== undefined ? `billed ${formatCost(trace.billedUsd)} (the seat charge)` : '']
  return { value, title: parts.filter(Boolean).join('; '), label }
}

/** The role an agent plays: its name without a trailing counter ("memscale-engineer-3", "Subagent 2"). */
const roleOf = (name: string) => name.replace(/[-\s]\d+$/, '')

/**
 * Agents sharing a role fold into one family row until opened: a 17-agent run reads as its few roles, and the bar of a
 * family carries every member's work in each member's hue. Members follow their opened family, marked with `family`.
 */
export function agentFamilies(agents: readonly FlowWaterfallRow[], open: ReadonlySet<string>): FlowWaterfallRow[] {
  const groups = new Map<string, FlowWaterfallRow[]>()
  for (const row of agents) {
    const key = row.parentId === undefined ? `root:${row.id}` : roleOf(row.name)
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  const out: FlowWaterfallRow[] = []
  for (const [role, members] of groups) {
    if (members.length < 2) { out.push(...members); continue }
    const id = `family:${role}`
    const startMs = Math.min(...members.map(row => row.span.startMs))
    const endMs = Math.max(...members.map(row => row.span.endMs))
    const running = members.some(row => spanRunning(row.span))
    const costs = members.map(row => row.span.costUsd ?? row.rollupCostUsd)
    const known = costs.filter((cost): cost is number => cost !== undefined)
    const failed = members.filter(row => !row.ok).length
    out.push({
      // The family hangs off its members' parent, so the spawn elbow reaches it from the agent that started them.
      id, parentId: members[0]!.parentId, name: `${role} ×${members.length}`, kind: 'pipeline', durationLabel: formatSpanDuration(endMs - startMs),
      approx: members.some(row => row.approx), ok: failed === 0, depth: 0, hasChildren: true, tone: members[0]!.tone,
      descendants: members.length, segments: [], retry: false, hasAgents: false,
      // One hue per family (round 5: mixed member hues in one lane read as "muddy"); members alternate shades of it.
      own: members.flatMap((row, i) => row.own.map(mark => ({ ...mark, tone: members[0]!.tone, alt: i % 2 === 1 }))).sort((a, b) => a.startMs - b.startMs),
      ...(known.length ? { rollupCostUsd: known.reduce((sum, cost) => sum + cost, 0) } : {}),
      span: { id, kind: 'pipeline', name: role, startMs, endMs, status: running ? 'running' : failed ? 'failed' : 'done', detail: members[0]!.span.detail, meta: { failedAgents: failed, costPartial: known.length < members.length } },
    })
    if (open.has(id)) out.push(...members.map(row => ({ ...row, family: id })))
  }
  return out
}

/** The second line of an agent row: how it ended and how much it did ("failed · 3 turns · 412 tool calls", "6 agents · 4 failed"). */
export function agentSummary(row: FlowWaterfallRow): string {
  if (row.id.startsWith('family:')) {
    const failed = Number(row.span.meta?.failedAgents ?? 0)
    return `${row.descendants} agents${failed ? ` · ${failed} failed` : ''}`
  }
  const count = (kind: FlowSegment['kind']) => row.own.reduce((sum, mark) => sum + (mark.kind === kind ? mark.count : 0), 0)
  const turns = count('model') + count('failed')
  const tools = count('tool')
  const state = row.span.outcome?.label ?? (spanRunning(row.span) ? 'running' : row.ok ? 'done' : 'failed')
  return [state, turns ? `${turns} ${turns === 1 ? 'turn' : 'turns'}` : '', tools ? `${tools} tool ${tools === 1 ? 'call' : 'calls'}` : ''].filter(Boolean).join(' · ')
}
