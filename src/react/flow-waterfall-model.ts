import type { FlowSpan, FlowTrace } from '../flow-trace.js'

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
}

export const spanFailed = (span: FlowSpan): boolean => span.status === 'failed'
export const spanRunning = (span: FlowSpan): boolean => span.status === 'running'

/** Hierarchy only; the shared timing primitives own all bar geometry.
 * Orphaned parents become roots; cycles are broken without dropping any span. */
export function flowWaterfallRows(trace: FlowTrace): FlowWaterfallRow[] {
  const ids = new Set<string>()
  const rows: FlowWaterfallRow[] = [...trace.spans]
    .map((span, i) => ({ span, key: span.id ?? `span-${i}` }))
    .sort((a, b) => a.span.startMs - b.span.startMs)
    .map(({ span, key }, index) => {
      const id = ids.has(key) ? `${key}:${index}` : key
      ids.add(id)
      return {
        id, parentId: span.parentId, name: span.name, kind: span.kind,
        durationLabel: Number.isFinite(span.startMs) && Number.isFinite(span.endMs) && span.endMs >= span.startMs ? `${((span.endMs - span.startMs) / 1000).toFixed(1)}s${span.approx ? '~' : ''}` : '—',
        approx: span.approx === true, ok: !spanFailed(span), depth: 0, hasChildren: false, span,
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
  const ordered: FlowWaterfallRow[] = []
  const visit = (row: FlowWaterfallRow, depth: number) => {
    row.depth = depth
    row.hasChildren = children.has(row.id)
    ordered.push(row)
    for (const child of children.get(row.id) ?? []) visit(child, depth + 1)
  }
  for (const row of rows) if (!row.parentId) visit(row, 0)
  return ordered
}

/** Search keeps ancestor context and deliberately reveals matches inside collapsed branches. */
export function visibleFlowWaterfallRows(rows: FlowWaterfallRow[], query: string, collapsed: Set<string>): FlowWaterfallRow[] {
  const byId = new Map(rows.map(row => [row.id, row]))
  const term = query.trim().toLowerCase()
  if (term) {
    const matching = new Set<string>()
    for (const row of rows) {
      if (!`${row.name} ${row.kind} ${row.ok ? '' : 'failed'} ${row.span.status ?? ''}`.toLowerCase().includes(term)) continue
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
