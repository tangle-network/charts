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
  /** The first merged span's name, e.g. a tool's: shown in the segment's tooltip, and in the bar when one step fits it. */
  name?: string
  /** The tool every merged step shares (the name before " · "); undefined once the merged steps differ. */
  tool?: string
  /** What the merged steps cost, when any of them recorded a cost. */
  costUsd?: number
  /** A failed mark that was a model call, so it draws the model's icon and no tool name. */
  modelCall?: boolean
}

const toolOf = (name?: string) => name?.split(' · ')[0]

/** A row's direct steps: model and tool calls (failed ones included), the failed and retrying ones, and tool calls by tool. */
export interface StepCounts { model: number; tool: number; failed: number; retried: number; tools: Record<string, number> }

/** Tokens in, out and cached; a field nobody recorded stays undefined. */
export interface TokenCounts { prompt?: number; completion?: number; cached?: number }

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
  /** Direct steps counted from the spans, before marks merge for display (merging depends on zoom). */
  counts?: StepCounts
  /** Durations of its finished direct model calls, ascending: the card's latency. */
  modelMs?: number[]
  /** The span's own tokens, else the sum of its children's, as its cost rolls up. */
  tokens?: TokenCounts
  /** Its cost is a floor ("≥"): its own bound, its trace's, or a family with unpriced members. */
  costFloor?: boolean
  /** The span retries a failed one; its bar carries a retry glyph. */
  retry: boolean
  /** The row delegates to child agents, so the gaps in its own work are waiting. */
  hasAgents: boolean
  /** Recorded cost of the row and its descendants, only when every model call below it has a recorded cost. */
  rollupCostUsd?: number
  /** Agent view: the family row this agent belongs to, when agents sharing a role are folded together. */
  family?: string
  /** Agent view: the agent whose steps this row is, shown nested under it. */
  stepOf?: string
  /** Agent view: indent level (members under a family, steps under an agent). */
  inset?: number
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
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`
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
        if (last.tool !== mark.tool) last.tool = undefined
        if (mark.costUsd !== undefined) last.costUsd = (last.costUsd ?? 0) + mark.costUsd
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
        ...(span.costBound === 'lower' || (span.costBound === undefined && trace.costBound === 'lower') ? { costFloor: true } : {}),
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
    const own = row.span.promptTokens !== undefined || row.span.completionTokens !== undefined || row.span.cachedTokens !== undefined
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
    Object.assign(row, stepStats(kids))
    const tokens = own ? { prompt: row.span.promptTokens, completion: row.span.completionTokens, cached: row.span.cachedTokens } : sumTokens(kids)
    if (tokens) row.tokens = tokens
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

/** What a row's direct steps add up to; nothing when it has none. */
function stepStats(steps: readonly FlowWaterfallRow[]): Pick<FlowWaterfallRow, 'counts' | 'modelMs'> {
  let counts: StepCounts | undefined
  const modelMs: number[] = []
  for (const step of steps) {
    if (step.kind === 'pipeline' || step.kind === 'waiting' || !ordered(step.span)) continue
    counts ??= { model: 0, tool: 0, failed: 0, retried: 0, tools: {} }
    if (!step.ok) counts.failed++
    if (step.retry) counts.retried++
    if (step.kind === 'model') {
      counts.model++
      if (!spanRunning(step.span)) modelMs.push(step.span.endMs - step.span.startMs)
    } else {
      counts.tool++
      const tool = toolOf(step.name) || step.kind
      counts.tools[tool] = (counts.tools[tool] ?? 0) + 1
    }
  }
  return counts ? { counts, modelMs: modelMs.sort((a, b) => a - b) } : {}
}

/** Several rows' steps as one: a family's members or a folded run. */
function mergeStats(rows: readonly FlowWaterfallRow[]): Pick<FlowWaterfallRow, 'counts' | 'modelMs' | 'tokens'> {
  let counts: StepCounts | undefined
  for (const row of rows) {
    if (!row.counts) continue
    counts ??= { model: 0, tool: 0, failed: 0, retried: 0, tools: {} }
    counts.model += row.counts.model; counts.tool += row.counts.tool; counts.failed += row.counts.failed; counts.retried += row.counts.retried
    for (const [tool, n] of Object.entries(row.counts.tools)) counts.tools[tool] = (counts.tools[tool] ?? 0) + n
  }
  const tokens = sumTokens(rows)
  return { ...(counts ? { counts, modelMs: rows.flatMap(row => row.modelMs ?? []).sort((a, b) => a - b) } : {}), ...(tokens ? { tokens } : {}) }
}

function sumTokens(rows: readonly FlowWaterfallRow[]): TokenCounts | undefined {
  let out: TokenCounts | undefined
  for (const row of rows) for (const key of ['prompt', 'completion', 'cached'] as const) {
    const n = row.tokens?.[key]
    if (n !== undefined) (out ??= {})[key] = (out[key] ?? 0) + n
  }
  return out
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
    name: row.name,
    tool: toolOf(row.name),
    ...(row.span.costUsd === undefined ? {} : { costUsd: row.span.costUsd }),
    ...(!row.ok && row.kind === 'model' ? { modelCall: true } : {}),
  }
}

/** The rows a search term matches by themselves, before ancestor context is added. */
export function searchMatchIds(rows: readonly FlowWaterfallRow[], query: string, matchSpan?: (span: FlowSpan, query: string) => boolean): ReadonlySet<string> {
  const term = query.trim()
  const lower = term.toLowerCase()
  return new Set(rows.filter(row => matchSpan ? matchSpan(row.span, term) : `${row.name} ${row.span.detail ?? ''} ${row.kind} ${row.ok ? '' : 'failed'} ${row.span.status ?? ''}`.toLowerCase().includes(lower)).map(row => row.id))
}

/** Search keeps ancestor context and deliberately reveals matches inside collapsed branches. */
export function visibleFlowWaterfallRows(rows: FlowWaterfallRow[], query: string, collapsed: ReadonlySet<string>, matchSpan?: (span: FlowSpan, query: string) => boolean): FlowWaterfallRow[] {
  const byId = new Map(rows.map(row => [row.id, row]))
  if (query.trim()) {
    const matching = new Set<string>()
    for (const id of searchMatchIds(rows, query, matchSpan)) {
      let cursor = byId.get(id)
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

/** The chain of steps that gates the trace's end: from each root, descend into the latest-ending child until a leaf; the root whose
 * chain ends last wins. Cutting latency anywhere else leaves the trace's end unchanged. */
export function criticalPathIds(rows: readonly FlowWaterfallRow[]): ReadonlySet<string> {
  const children = new Map<string, FlowWaterfallRow[]>()
  for (const row of rows) {
    if (!row.parentId) continue
    const siblings = children.get(row.parentId)
    if (siblings) siblings.push(row)
    else children.set(row.parentId, [row])
  }
  let best: { end: number; chain: string[] } | undefined
  for (const root of rows) {
    if (root.parentId) continue
    const chain: string[] = []
    let end = root.span.endMs
    for (let cursor: FlowWaterfallRow | undefined = root; cursor;) {
      chain.push(cursor.id)
      end = Math.max(end, cursor.span.endMs)
      cursor = children.get(cursor.id)?.reduce<FlowWaterfallRow | undefined>((latest, child) => !latest || child.span.endMs > latest.span.endMs ? child : latest, undefined)
    }
    if (!best || end > best.end) best = { end, chain }
  }
  return new Set(best?.chain)
}

/** The agents a reader should look at first: the longest one by the clock, and the costliest when two or more are priced. */
export function agentCallouts(agents: FlowWaterfallRow[], clockMs: number): { slowestId?: string; costliestId?: string } {
  let slowest: FlowWaterfallRow | undefined, slowestMs = -1, costliest: FlowWaterfallRow | undefined, top = -1, priced = 0, timed = 0
  for (const row of agents) {
    // Only agents compete: a family's bar is its members' extent and its cost their sum, and an opened step is not an agent.
    if (row.durationLabel === '—' || row.span.startMs > clockMs || row.kind !== 'pipeline' || row.id.startsWith('family:') || row.id.startsWith('run:')) continue
    // Slowest ranks agents with a parent: the root spans the whole run by construction, so it would always win.
    if (row.parentId !== undefined) {
      const ms = (spanRunning(row.span) ? Math.max(row.span.endMs, clockMs) : Math.min(row.span.endMs, clockMs)) - row.span.startMs
      timed += 1
      if (ms > slowestMs) { slowest = row; slowestMs = ms }
    }
    const cost = row.span.costUsd ?? row.rollupCostUsd
    if (cost === undefined) continue
    priced += 1
    if (cost > top) { costliest = row; top = cost }
  }
  return { slowestId: timed > 1 ? slowest?.id : undefined, costliestId: priced > 1 && top > 0 ? costliest?.id : undefined }
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
    toolCalls: trace.toolCalls === undefined ? undefined : tools,
    errors,
  }
}

/** The cost a reader can rely on: a lower bound when some calls are unpriced, a dash only when nothing is priced. */
export function costSummary(costUsd: number | undefined, trace: Pick<FlowTrace, 'costBasis' | 'costCoverage' | 'billedUsd' | 'costBound'>): { value: string; title: string; label: string } {
  const list = trace.costBasis === 'list'
  const label = list ? 'Cost · list price' : 'Cost'
  if (costUsd === undefined) {
    return trace.billedUsd !== undefined
      ? { value: `${formatCost(trace.billedUsd)} billed`, title: 'No list price for these calls; billed is the seat charge', label }
      : { value: '—', title: 'No cost source: the harness recorded no cost and no price catalog was given', label }
  }
  const coverage = trace.costCoverage
  const partial = coverage !== undefined && coverage.priced < coverage.total
  const upper = !partial && trace.costBound === 'upper'
  const value = `${partial || trace.costBound === 'lower' ? '≥' : upper ? '≤' : list ? '≈' : ''}${formatCost(costUsd)}${trace.billedUsd !== undefined ? ` · ${formatCost(trace.billedUsd)} billed` : ''}`
  const parts = [partial ? `${coverage.priced} of ${coverage.total} model calls priced` : coverage ? `all ${coverage.total} model calls priced` : '',
    list ? 'at the model catalog list price; not a bill' : '', upper ? 'cached input is not split out, so it is priced as fresh input: at most this' : '', trace.costBound === 'lower' ? 'a floor: the producer reports at least this' : '', trace.billedUsd !== undefined ? `billed ${formatCost(trace.billedUsd)} (the seat charge)` : '']
  return { value, title: parts.filter(Boolean).join('; '), label }
}

/** The role an agent plays: its name without a trailing counter ("memscale-engineer-3", "Subagent 2"). */
const roleOf = (name: string) => name.replace(/[-\s]\d+$/, '')

/**
 * Agents sharing a role fold into one family row until opened: a 17-agent run reads as its few roles, and the bar of a
 * family carries every member's work in each member's hue. Members follow their opened family, marked with `family`.
 */
/** The families open by default: all of them when every agent fits in `rows`, so a reader sees each agent and its steps (the
 *  blind reviews preferred agent rows to `role ×N`); none on bigger runs. `flipped` holds the families the reader toggled. */
export function defaultOpenFamilies(agents: readonly FlowWaterfallRow[], rows: number, flipped: ReadonlySet<string>): ReadonlySet<string> {
  const unfold = agents.length <= rows
  const ids = agentFamilies(agents, new Set()).filter(row => row.id.startsWith('family:')).map(row => row.id)
  return new Set(ids.filter(id => unfold !== flipped.has(id)))
}

export function agentFamilies(agents: readonly FlowWaterfallRow[], open: ReadonlySet<string>): FlowWaterfallRow[] {
  const groups = new Map<string, FlowWaterfallRow[]>()
  for (const row of agents) {
    const key = row.parentId === undefined ? `root:${row.id}` : roleOf(row.name)
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  const out: FlowWaterfallRow[] = []
  // Each top-level row takes the next hue slot, so no two families share a hue band (two cyan families read as one).
  let next = 0
  const hue = (row: FlowWaterfallRow) => row.tone <= 0 ? row.tone : ++next
  for (const [role, members] of groups) {
    if (members.length < 2) { out.push(...members.map(row => ({ ...row, tone: hue(row) }))); continue }
    const tone = hue(members[0]!)
    const id = `family:${role}`
    const startMs = Math.min(...members.map(row => row.span.startMs))
    const endMs = Math.max(...members.map(row => row.span.endMs))
    const running = members.some(row => spanRunning(row.span))
    const costs = members.map(row => row.span.costUsd ?? row.rollupCostUsd)
    const known = costs.filter((cost): cost is number => cost !== undefined)
    // Failed means the outcome the host recorded when it gave one (a member can fail a step and still ship); status otherwise.
    const failed = members.filter(row => row.span.outcome ? row.span.outcome.tone === 'failed' : !row.ok).length
    // A family takes its members' outcome when they share one; mixed outcomes leave it without, drawn neutral.
    const outcome = members.every(row => row.span.outcome && row.span.outcome.tone === members[0]!.span.outcome?.tone && !row.span.outcome.ring === !members[0]!.span.outcome?.ring) ? members[0]!.span.outcome : undefined
    out.push({
      // The family hangs off its members' parent, so the spawn elbow reaches it from the agent that started them.
      costFloor: known.length < members.length || members.some(row => row.costFloor),
      id, parentId: members[0]!.parentId, name: role, kind: 'pipeline', durationLabel: formatSpanDuration(endMs - startMs),
      approx: members.some(row => row.approx), ok: failed === 0, depth: 0, hasChildren: true, tone,
      descendants: members.length, segments: [], retry: false, hasAgents: false,
      // One hue per family (round 5: mixed member hues in one lane read as "muddy"); members alternate shades of it.
      own: members.flatMap((row, i) => row.own.map(mark => ({ ...mark, tone, alt: i % 2 === 1 }))).sort((a, b) => a.startMs - b.startMs),
      ...(known.length ? { rollupCostUsd: known.reduce((sum, cost) => sum + cost, 0) } : {}),
      ...mergeStats(members),
      span: { id, kind: 'pipeline', name: role, startMs, endMs, status: running ? 'running' : failed ? 'failed' : 'done', ...(outcome ? { outcome } : {}), detail: members[0]!.span.detail, meta: { failedAgents: failed, costPartial: known.length < members.length, members: members.map(row => row.id) } },
    })
    if (open.has(id)) out.push(...members.map((row, i) => ({ ...row, family: id, inset: 1, tone, own: row.own.map(mark => ({ ...mark, tone, alt: i % 2 === 1 })) })))
  }
  return out
}

/** The second line of an agent row in parts: how it ended and how much it did (failed, 3 model calls, 412 tool calls; 6 agents, 4 failed).
 * The row shows the parts in order and drops the last ones whole when the line is full, never half a word. */
export function agentSummary(row: FlowWaterfallRow): string[] {
  if (row.id.startsWith('family:')) {
    const failed = Number(row.span.meta?.failedAgents ?? 0)
    return [`${row.descendants} agents`, ...(failed ? [`${failed} failed`] : [])]
  }
  // A folded run of steps already says its count in its name; its second line says how it ended.
  if (row.id.startsWith('run:')) { const failed = row.own.filter(mark => mark.kind === 'failed').length; return [failed ? `${failed} failed` : 'all done'] }
  // Counted from the spans, not the display marks: merging short neighbours changes with zoom (Codex review on #30).
  const calls = row.counts?.model ?? 0
  const tools = row.counts?.tool ?? 0
  // An agent without a recorded outcome says only that it runs or failed; a bare "done" read as a verdict the host never gave.
  const state = row.span.outcome?.label ?? (spanRunning(row.span) ? 'running' : !row.ok ? 'failed' : row.kind === 'pipeline' ? '' : 'done')
  // Model calls, as the summary strip and the card name them; a host's own "turns" can mean harness turns, a different count.
  return [state, calls ? `${calls} model ${calls === 1 ? 'call' : 'calls'}` : '', tools ? `${tools} tool ${tools === 1 ? 'call' : 'calls'}` : ''].filter(Boolean)
}

/**
 * The agent view's rows: families folded until opened, and an opened agent's own steps (its turns and tool calls, not its
 * child agents) nested beneath it with their icons, durations and costs, as a reader drills from the run into one agent.
 */
export function agentViewRows(agents: readonly FlowWaterfallRow[], rows: readonly FlowWaterfallRow[], openFamilies: ReadonlySet<string>, openSteps: ReadonlySet<string>): FlowWaterfallRow[] {
  const base = agentFamilies(agents, openFamilies)
  if (openSteps.size === 0) return base
  const steps = new Map<string, FlowWaterfallRow[]>()
  for (const row of rows) {
    if (row.parentId === undefined || !openSteps.has(row.parentId) || row.kind === 'pipeline') continue
    steps.set(row.parentId, [...(steps.get(row.parentId) ?? []), row])
  }
  return base.flatMap(row => openSteps.has(row.id)
    ? [row, ...stepRuns(steps.get(row.id) ?? []).map(step => ({ ...step, stepOf: row.id, inset: (row.inset ?? 0) + 1, tone: row.tone, own: step.own.map(mark => ({ ...mark, tone: row.tone })) }))]
    : [row])
}

/** Three or more consecutive steps of one kind and name read as one row ("15 model calls · 4h"), each a mark in its bar. */
function stepRuns(steps: readonly FlowWaterfallRow[]): FlowWaterfallRow[] {
  const out: FlowWaterfallRow[] = []
  for (let i = 0; i < steps.length;) {
    let j = i
    while (j < steps.length && steps[j]!.kind === steps[i]!.kind && steps[j]!.name === steps[i]!.name) j++
    const run = steps.slice(i, j)
    if (run.length < 3) { out.push(...run); i = j; continue }
    const first = run[0]!
    const startMs = Math.min(...run.map(step => step.span.startMs))
    const endMs = Math.max(...run.map(step => step.span.endMs))
    const failed = run.filter(step => !step.ok).length
    const costs = run.map(step => step.span.costUsd ?? step.rollupCostUsd).filter((cost): cost is number => cost !== undefined)
    const noun = first.kind === 'model' ? 'model calls' : first.kind === 'tool' ? `${first.name} calls` : `${first.name} steps`
    out.push({
      ...first, id: `run:${first.id}`, name: `${run.length} ${noun}`, durationLabel: formatSpanDuration(endMs - startMs), ok: failed === 0,
      hasChildren: false, descendants: 0, segments: [], ...stepStats(run), tokens: sumTokens(run),
      own: run.map(step => ({ startMs: step.span.startMs, endMs: step.span.endMs, kind: step.ok ? (step.kind === 'model' ? 'model' : 'tool') : 'failed', tone: first.tone, id: step.id, count: 1, retry: step.retry, name: step.name, tool: toolOf(step.name) })),
      ...(costs.length ? { rollupCostUsd: costs.reduce((sum, cost) => sum + cost, 0) } : {}),
      span: { ...first.span, id: `run:${first.id}`, name: `${run.length} ${noun}`, startMs, endMs, status: failed ? 'failed' : first.span.status, costUsd: undefined },
    })
    i = j
  }
  return out
}

/** A row as the view draws it: its drawn copy, or for a member of a folded family, itself in the family's hue. */
export function drawnRow(row: FlowWaterfallRow, visible: readonly FlowWaterfallRow[]): FlowWaterfallRow {
  const drawn = visible.find(item => item.id === row.id)
  if (drawn) return drawn
  const family = visible.find(item => (item.span.meta?.members as string[] | undefined)?.includes(row.id))
  return family ? { ...row, tone: family.tone } : row
}

/** A row's cost as printed: "≥" when it is a floor. */
export const rowCostText = (row: FlowWaterfallRow, cost: number): string => `${row.costFloor ? '≥' : ''}${formatCost(cost)}`
