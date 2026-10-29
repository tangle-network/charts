/** Recorded version lanes; callers supply their domain model, filters and selection. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useWidth } from './live.js'

/** `muted` chips sit beside the title; any other tone gets the second line. */
/** A status tone from `statusOf`, or a non-status chip: `accent` for a series, `info` and `muted` for plain facts. */
export type VersionGraphTone = 'pass' | 'live' | 'attention' | 'fail' | 'neutral' | 'accent' | 'info' | 'muted'

export interface VersionGraphChip {
  readonly label: string
  readonly tone?: VersionGraphTone
  readonly title?: string
}

export interface VersionGraphNode {
  readonly id: string
  /** Parents in the model; one that is not in it (or is hidden) is skipped, and a hidden one passes its own on. */
  readonly parents: readonly string[]
  readonly lane: string
  readonly at: string | null
  readonly title: string
  readonly detail?: string | null
  /** A style hook and a filter key: `write`, `integrate`, `profile`, `version`, `authored`, `ghost`. */
  readonly kind: string
  readonly chips?: readonly VersionGraphChip[]
}

export interface VersionGraphLane {
  readonly id: string
  readonly label: string
  readonly detail?: string | null
}

/** Nodes newest first, every child above its parents. */
export interface VersionGraphModel {
  readonly lanes: readonly VersionGraphLane[]
  readonly nodes: readonly VersionGraphNode[]
}

/**
 * Rows in model order, one column per lane that holds a shown node, and one edge from each shown node to each nearest
 * shown ancestor: a hidden node (an integration when integrations are hidden, a commit of a lane filtered out) passes
 * its parents on, so a lane's line stays connected.
 */
export function layoutVersionGraph(model: VersionGraphModel, shown: (node: VersionGraphNode) => boolean = () => true) {
  const byId = new Map(model.nodes.map((node) => [node.id, node]))
  const visible = model.nodes.filter(shown)
  const visibleIds = new Set(visible.map((node) => node.id))
  const lanes = model.lanes.filter((lane) => visible.some((node) => node.lane === lane.id))
  for (const node of visible) if (!lanes.some((lane) => lane.id === node.lane)) lanes.push({ id: node.lane, label: node.lane })
  const column = new Map(lanes.map((lane, i) => [lane.id, i]))
  const rowOf = new Map(visible.map((node, i) => [node.id, i]))
  const nearest = (id: string, seen: Set<string>): string[] => {
    if (seen.has(id)) return []
    seen.add(id)
    if (visibleIds.has(id)) return [id]
    const node = byId.get(id)
    return node ? node.parents.flatMap((parent) => nearest(parent, seen)) : []
  }
  const edges = []
  for (const node of visible) {
    const seen = new Set<string>([node.id])
    const targets = [...new Set(node.parents.flatMap((parent) => nearest(parent, seen)))]
    for (const target of targets) {
      const toRow = rowOf.get(target)!
      if (toRow <= rowOf.get(node.id)!) continue
      edges.push({
        from: node.id,
        to: target,
        fromRow: rowOf.get(node.id)!,
        fromColumn: column.get(node.lane)!,
        toRow,
        toColumn: column.get(byId.get(target)!.lane)!,
      })
    }
  }
  return { rows: visible.map((node, i) => ({ node, row: i, column: column.get(node.lane)! })), edges, lanes }
}


// Geometry, in CSS pixels at the workspace's type scale; a phone gets narrower lanes so the text keeps its room.
const WIDE = { column: 16, gutter: 14 }
const NARROW = { column: 5, gutter: 4 }
const LINE = 30
const TALL = 54
const BEND = 22
const COLORS = 8

const tall = (node: VersionGraphNode) => (node.chips ?? []).some((chip) => chip.tone && chip.tone !== 'muted')

export function VersionGraph({
  model,
  selected,
  onSelect,
  label,
  shown,
  maxHeight = 600,
}: {
  model: VersionGraphModel
  selected: string | null
  onSelect: (id: string) => void
  label: string
  shown?: (node: VersionGraphNode) => boolean
  maxHeight?: number
}) {
  const laid = useMemo(() => layoutVersionGraph(model, shown), [model, shown])
  const tops = useMemo(() => {
    const out: number[] = []
    let y = 0
    for (const row of laid.rows) {
      out.push(y)
      y += tall(row.node) ? TALL : LINE
    }
    out.push(y)
    return out
  }, [laid])
  const height = tops.at(-1) ?? 0
  const [measure, measuredWidth] = useWidth<HTMLDivElement>()
  const { column: COLUMN, gutter: GUTTER } = measuredWidth < 700 ? NARROW : WIDE
  const width = GUTTER + laid.lanes.length * COLUMN
  const x = (column: number) => GUTTER / 2 + column * COLUMN + COLUMN / 2
  const y = (row: number) => tops[row]! + LINE / 2
  const path = (fromRow: number, fromColumn: number, toRow: number, toColumn: number) => {
    const [x1, y1, x2, y2] = [x(fromColumn), y(fromRow), x(toColumn), y(toRow)]
    if (x1 === x2) return `M${x1},${y1} V${y2}`
    const bend = Math.min(BEND, y2 - y1)
    return `M${x1},${y1} C${x1},${y1 + bend * 0.7} ${x2},${y1 + bend * 0.3} ${x2},${y1 + bend} V${y2}`
  }
  const pane = useRef<HTMLDivElement>(null)
  const focusTarget = useRef<string | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const first = Math.max(0, tops.findIndex(top => top >= scrollTop) - 7)
  const after = tops.findIndex(top => top > scrollTop + maxHeight)
  const end = after < 0 ? laid.rows.length : Math.min(laid.rows.length, after + 7)
  const visible = laid.rows.slice(first, end)
  const focusRow = (index: number) => {
    const at = Math.max(0, Math.min(laid.rows.length - 1, index)), top = tops[at] ?? 0
    focusTarget.current = laid.rows[at]?.node.id ?? null
    if (pane.current) pane.current.scrollTop = top
    setScrollTop(top)
    const target = pane.current?.querySelector<HTMLButtonElement>(`[data-row="${at}"]`)
    if (target) { focusTarget.current = null; target.focus() }
  }
  useEffect(() => {
    const at = laid.rows.findIndex(row => row.node.id === selected), element = pane.current
    if (at < 0 || !element) return
    const top = tops[at]!, bottom = tops[at + 1]!
    if (top < element.scrollTop) element.scrollTop = Math.max(0, top - 8)
    else if (bottom > element.scrollTop + element.clientHeight) element.scrollTop = bottom - element.clientHeight + 8
    setScrollTop(element.scrollTop)
  }, [selected]) // Live rows do not pull a reader back to the selected commit.
  const allLanes = useMemo(() => layoutVersionGraph(model).lanes, [model])
  const colorOf = new Map(allLanes.map((item, i) => [item.id, i % COLORS]))

  return (
    <div ref={measure} className="tgc-version-graph" data-version-graph={label}>
      {laid.rows.length === 0 ? (
        <p className="ov-empty">Nothing to show with these filters.</p>
      ) : (
        <div ref={pane} className="vg-scroll" style={{ maxHeight, overflow: 'auto' }} onScroll={event => setScrollTop(event.currentTarget.scrollTop)} onKeyDown={event => {
          const at = Number((event.target as HTMLElement).closest('[data-row]')?.getAttribute('data-row'))
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? laid.rows.length - 1 : event.key === 'ArrowDown' ? at + 1 : event.key === 'ArrowUp' ? at - 1 : null
          if (next !== null) { event.preventDefault(); focusRow(next) }
        }}>
        <div className="vg-host" style={{ height }}>
          <svg className="vg-lines" width={width} height={height} aria-hidden="true">
            {laid.edges.filter(edge => y(edge.fromRow) <= scrollTop + maxHeight + TALL && y(edge.toRow) >= scrollTop - TALL).map((edge) => (
              <path
                key={`${edge.from}>${edge.to}`} data-from={edge.from} data-to={edge.to}
                className={`vg-c${colorOf.get(laid.lanes[edge.toColumn]!.id)} ${selected === edge.from || selected === edge.to ? 'hot' : ''}`}
                d={path(edge.fromRow, edge.fromColumn, edge.toRow, edge.toColumn)}
              />
            ))}
            {visible.map((row) => (
              <circle
                key={row.node.id}
                className={`vg-dot vg-c${colorOf.get(row.node.lane)} kind-${row.node.kind} ${selected === row.node.id ? 'on' : ''}`}
                cx={x(row.column)}
                cy={y(row.row)}
                r={row.node.kind === 'integrate' ? 3 : 5}
              />
            ))}
          </svg>
          <ol className="vg-rows" aria-label={label} style={{ paddingLeft: width, paddingTop: tops[first] }}>
            {visible.map((row) => {
              const node = row.node
              const on = selected === node.id
              const loud = (node.chips ?? []).filter((chip) => chip.tone && chip.tone !== 'muted')
              const quiet = (node.chips ?? []).filter((chip) => !chip.tone || chip.tone === 'muted')
              return (
                <li key={node.id} aria-posinset={row.row + 1} aria-setsize={laid.rows.length} style={{ height: tops[row.row + 1]! - tops[row.row]! }}>
                  <button
                    ref={element => { if (element && focusTarget.current === node.id) { focusTarget.current = null; element.focus() } }}
                    type="button"
                    className={`vg-row kind-${node.kind} ${on ? 'on' : ''}`}
                    aria-pressed={on}
                    disabled={node.kind === 'ghost'}
                    data-node={node.id} data-row={row.row}
                    onClick={() => onSelect(node.id)}
                  >
                    <span className="vg-line">
                      <b className="vg-title" title={node.title}>{node.title}</b>
                      {node.detail && <span className="vg-detail">{node.detail}</span>}
                      {quiet.map((chip, i) => (
                        <span key={i} className="vg-chip tone-muted" title={chip.title}>{chip.label}</span>
                      ))}
                    </span>
                    {loud.length > 0 && (
                      <span className="vg-line vg-tags">
                        {loud.map((chip, i) => (
                          <span key={i} className={`vg-chip tone-${chip.tone}`} title={chip.title}>{chip.label}</span>
                        ))}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
        </div>
      )}
    </div>
  )
}

