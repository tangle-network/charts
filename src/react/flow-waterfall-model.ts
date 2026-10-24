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
    const ms = (spanRunning(row.span) ? Math.max(row.span.endMs, clockMs) : row.span.endMs) - row.span.startMs
    if (ms > bestMs) { best = row; bestMs = ms }
  }
  return best
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
