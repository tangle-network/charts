import { type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import type { FlowMarker, FlowPause, FlowSpan } from '../flow-trace.js'
import { type FlowWaterfallRow, spanRunning } from './flow-waterfall-model.js'
import { type FlowLink, type FlowView, FlowRow, LinkMark, type RowEvents } from './flow-waterfall-row.js'
import { useRowMotion } from './flow-waterfall-motion.js'
import { clockTicks, formatClock, type ViewWindow } from './flow-waterfall-time.js'

// 40 px agent rows keep a 17-agent run, its axis and its controls inside a 945 px viewport.
export const ROW_HEIGHT: Record<FlowView, number> = { spans: 36, agents: 40 }
const OVERSCAN = 8
/** Rows re-render once per CHUNK rows scrolled; overscan covers the rows in between. */
const CHUNK = 4
const STICKY_LEVELS = 3

export interface BodyProps extends RowEvents {
  rows: FlowWaterfallRow[]
  /** Every row by id, so links can walk through ancestors the view hides. */
  byId: Map<string, FlowWaterfallRow>
  totalRows: number
  view: FlowView
  maxHeight: number
  collapsed: Set<string>
  searching: boolean
  slowestId?: string
  costliestId?: string
  activeId?: string
  pauses?: readonly FlowPause[]
  /** The model every agent shares: rows leave it out because the header names it. */
  sharedDetail?: string
  /** Live: the body keeps its full height as agents arrive, so the page below never shifts. */
  fixedHeight?: boolean
  /** Agent view: family and agent rows opened in place. */
  expandedIds?: ReadonlySet<string>
  selectedId?: string
  /** The agent whose handoff connectors draw at full strength; the rest stay dim in the agent view. */
  focusId?: string
  clockMs: number
  window: ViewWindow
  trackPx: number
  showCursor: boolean
  markers?: FlowMarker[]
  zoomed: boolean
  renderIcon?: (span: FlowSpan) => ReactNode
  fillByAgent?: boolean
  emptyText: string
  onActiveChange: (id: string) => void
  onScrub: (ms: number) => void
  onZoom: (factor: number, anchorMs: number) => void
  onPan: (deltaMs: number) => void
  onNameWidth: (px: number) => void
  nameWidth: number
  onTrack: (element: HTMLElement | null) => void
  onExpandAll?: () => void
  onCollapseAll?: () => void
}

/** Spawn links from each agent to its parent agent, and explicit handoffs to their targets; agent view adds returns. */
function linksFor(rows: FlowWaterfallRow[], byId: Map<string, FlowWaterfallRow>, view: FlowView): FlowLink[] {
  const index = new Map(rows.map((row, i) => [row.id, i]))
  const owner = (row: FlowWaterfallRow): number | undefined => {
    let id = row.parentId
    while (id !== undefined) {
      const i = index.get(id)
      if (i !== undefined && (view === 'spans' || rows[i]!.kind === 'pipeline')) return i
      id = byId.get(id)?.parentId
    }
    return undefined
  }
  const links: FlowLink[] = []
  const explicit = new Set<string>()
  for (const row of rows) {
    const target = row.span.handoffTo !== undefined ? index.get(row.span.handoffTo) : undefined
    const from = row.kind === 'pipeline' ? index.get(row.id) : owner(row)
    if (target === undefined || from === undefined || target === from) continue
    explicit.add(rows[target]!.id)
    links.push({ id: `h-${row.id}`, from, to: target, atMs: row.span.startMs, tone: rows[target]!.tone, dir: target > from ? 'down' : 'up' })
  }
  for (const [i, row] of rows.entries()) {
    if (row.kind !== 'pipeline' || row.parentId === undefined) continue
    const parent = owner(row)
    if (parent === undefined) continue
    if (!explicit.has(row.id)) links.push({ id: `s-${row.id}`, from: parent, to: i, atMs: row.span.startMs, tone: row.tone, dir: 'down' })
    if (view === 'agents' && !spanRunning(row.span) && Number.isFinite(row.span.endMs)) {
      links.push({ id: `r-${row.id}`, from: i, to: parent, atMs: row.span.endMs, tone: row.tone, dir: 'up' })
    }
  }
  return links
}

/** The scrolling tree: rows are virtualized, ancestors stay pinned, the axis and cursor stay in view. */
export function FlowBody(props: BodyProps) {
  const { rows, view, maxHeight, collapsed, searching, slowestId, activeId, selectedId, clockMs, window: win, trackPx, showCursor, zoomed } = props
  const rowHeight = ROW_HEIGHT[view]
  const scroller = useRef<HTMLDivElement>(null)
  const surface = useRef<HTMLDivElement>(null)
  const [chunk, setChunk] = useState(0)
  const [viewport, setViewport] = useState(maxHeight)
  const latest = useRef(props)
  latest.current = props
  const height = props.fixedHeight ? maxHeight : Math.min(maxHeight, Math.max(rows.length, 1) * rowHeight)
  const links = useMemo(() => linksFor(rows, props.byId, view), [rows, props.byId, view])
  const index = useMemo(() => new Map(rows.map((row, i) => [row.id, i])), [rows])
  const motion = useRowMotion(rows)
  // The event the reader jumped to keeps its label up on the axis, so the jump says where it went.
  const [jumped, setJumped] = useState<FlowMarker>()
  // Ticks run into the end-label gutter but stop where a label would be cut at the right edge.
  const msPerPx = (win.endMs - win.startMs) / Math.max(1, trackPx)
  const tickEnd = win.startMs + (trackPx + (view === 'spans' ? 72 : 0)) * msPerPx
  const ticks = clockTicks(win.startMs, tickEnd, Math.max(1, trackPx + (view === 'spans' ? 72 : 0)))
  // Marker labels thin out where they would collide (the line stays) and flip left at the right edge.
  const markerLabels = useMemo(() => {
    const shown = new Map<FlowMarker, 'right' | 'left'>()
    let freeFrom = -Infinity
    for (const marker of [...(props.markers ?? [])].sort((a, b) => a.at - b.at)) {
      const x = (marker.at - win.startMs) / msPerPx
      const width = marker.label.length * 7 + 16
      const side = x + width > trackPx ? 'left' : 'right'
      const left = side === 'right' ? x : x - width
      if (x < 0 || x > trackPx || left < freeFrom) continue
      shown.set(marker, side)
      freeFrom = left + width + 8
    }
    return shown
  }, [props.markers, win.startMs, msPerPx, trackPx])

  useEffect(() => {
    const element = scroller.current
    if (!element) return
    const observer = new ResizeObserver(() => setViewport(element.clientHeight))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Wheel: Ctrl/Cmd zooms about the pointer; horizontal or Shift wheel pans a zoomed window.
  useEffect(() => {
    const element = surface.current
    if (!element) return
    const wheel = (event: WheelEvent) => {
      const { window: w, trackPx: px, zoomed: isZoomed } = latest.current
      const lane = element.querySelector<HTMLElement>('[data-fw-track]')
      if (!lane) return
      const rect = lane.getBoundingClientRect()
      const msPerPx = (w.endMs - w.startMs) / Math.max(1, px)
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        const anchor = w.startMs + (event.clientX - rect.left - 12) * msPerPx
        latest.current.onZoom(Math.exp(event.deltaY * 0.0025), anchor)
      } else if (isZoomed && (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY))) {
        event.preventDefault()
        latest.current.onPan((event.shiftKey ? event.deltaY : event.deltaX) * msPerPx)
      }
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [])

  const first = Math.max(0, chunk * CHUNK - OVERSCAN)
  const last = Math.min(rows.length, chunk * CHUNK + Math.ceil(viewport / rowHeight) + CHUNK + OVERSCAN)

  const focusRow = (id: string) => {
    const i = index.get(id)
    const element = scroller.current
    if (i === undefined || !element) return
    const offset = (view === 'spans' ? Math.min(STICKY_LEVELS, rows[i]!.depth) : 0) * rowHeight
    if (i * rowHeight - offset < element.scrollTop) element.scrollTop = Math.max(0, i * rowHeight - offset)
    else if ((i + 1) * rowHeight > element.scrollTop + element.clientHeight) element.scrollTop = (i + 1) * rowHeight - element.clientHeight
    props.onActiveChange(id)
    requestAnimationFrame(() => element.querySelector<HTMLElement>(`.fw-canvas [data-span-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true }))
  }

  const keydown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = index.get(activeId ?? '') ?? 0
    const row = rows[current]
    if (!row) return
    const page = Math.max(1, Math.floor(viewport / rowHeight) - 1)
    const move = (i: number) => { event.preventDefault(); focusRow(rows[Math.max(0, Math.min(rows.length - 1, i))]!.id) }
    const folded = collapsed.has(row.id) && !searching
    switch (event.key) {
      case 'ArrowDown': return move(current + 1)
      case 'ArrowUp': return move(current - 1)
      case 'PageDown': return move(current + page)
      case 'PageUp': return move(current - page)
      case 'Home': return move(0)
      case 'End': return move(rows.length - 1)
      case 'ArrowRight':
        if (view === 'spans' && row.hasChildren && folded) { event.preventDefault(); props.onToggle(row) }
        else if (view === 'agents' && row.hasChildren) { event.preventDefault(); props.onToggle(row) }
        else if (row.hasChildren) move(current + 1)
        return
      case 'ArrowLeft':
        if (view === 'spans' && row.hasChildren && !folded) { event.preventDefault(); props.onToggle(row) }
        else if (row.parentId !== undefined && index.has(row.parentId)) move(index.get(row.parentId)!)
        return
      case 'Enter':
      case ' ': {
        event.preventDefault()
        const bar = scroller.current?.querySelector<HTMLElement>(`[data-span-id="${CSS.escape(row.id)}"] .fw-bar`)
        if (bar) props.onPin(row.id, bar)
      }
    }
  }

  const scrub = (event: ReactPointerEvent<HTMLElement>) => {
    const lane = event.currentTarget
    const rect = lane.getBoundingClientRect()
    const toMs = (x: number) => Math.max(0, win.startMs + (x - rect.left - 12) * (win.endMs - win.startMs) / Math.max(1, trackPx))
    props.onScrub(toMs(event.clientX))
    lane.setPointerCapture(event.pointerId)
    const moveScrub = (e: PointerEvent) => props.onScrub(toMs(e.clientX))
    const up = () => { lane.removeEventListener('pointermove', moveScrub); lane.removeEventListener('pointerup', up) }
    lane.addEventListener('pointermove', moveScrub)
    lane.addEventListener('pointerup', up)
  }

  const resize = (event: ReactPointerEvent<HTMLElement>) => {
    const handle = event.currentTarget
    const startX = event.clientX, startW = props.nameWidth
    handle.setPointerCapture(event.pointerId)
    const moveResize = (e: PointerEvent) => props.onNameWidth(startW + e.clientX - startX)
    const up = () => { handle.removeEventListener('pointermove', moveResize); handle.removeEventListener('pointerup', up) }
    handle.addEventListener('pointermove', moveResize)
    handle.addEventListener('pointerup', up)
  }

  const axis = (
    <div className="fw-axis fw-axis-top">
      <div className="fw-axis-label">
        {view === 'spans' && <>
          {props.onExpandAll && <span className="fw-branch-controls">
            <button type="button" className="fw-text-button" onClick={props.onExpandAll}>Expand all</button>
            <button type="button" className="fw-text-button" onClick={props.onCollapseAll}>Collapse all</button>
          </span>}
        </>}
        <span role="separator" aria-orientation="vertical" aria-label="Resize the step column" tabIndex={0} className="fw-resize"
          aria-valuenow={Math.round(props.nameWidth)} aria-valuemin={140} aria-valuemax={560} onPointerDown={resize}
          onKeyDown={event => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); props.onNameWidth(props.nameWidth + (event.key === 'ArrowLeft' ? -16 : 16)) }
          }} />
      </div>
      <div className="fw-axis-track" data-fw-track ref={props.onTrack} onPointerDown={scrub} title="Drag to scrub">
        {ticks.map(tick => <span key={tick} className="fw-tick" style={{ '--s': tick } as CSSProperties}>{formatClock(tick)}</span>)}
        {props.markers?.map(marker => <button key={`e-${marker.at}-${marker.label}`} type="button" className="fw-event" data-tone={marker.tone ?? 'neutral'}
          style={{ '--s': marker.at } as CSSProperties} title={marker.kind ? `${marker.kind}: ${marker.label}` : marker.label}
          aria-label={`Jump to ${marker.kind ? `${marker.kind} ` : ''}${marker.label}`} aria-pressed={jumped === marker}
          onPointerDown={event => event.stopPropagation()} onClick={() => { setJumped(marker); props.onScrub(marker.at) }} />)}
        {jumped && <span className="fw-event-label" data-tone={jumped.tone ?? 'neutral'} style={{ '--s': jumped.at } as CSSProperties}>{jumped.label}</span>}
        {showCursor && <span className="fw-cursor-handle" aria-hidden />}
      </div>
    </div>
  )

  const row = (item: FlowWaterfallRow, i: number, isSticky = false) => (
    <FlowRow key={isSticky ? `sticky-${item.id}` : item.id} row={item} view={view} top={i * rowHeight}
      collapsed={collapsed.has(item.id)} searching={searching} slowest={item.id === slowestId} costliest={item.id === props.costliestId}
      active={item.id === activeId} focusable={!isSticky && (item.id === activeId || (activeId === undefined || !index.has(activeId)) && i === 0)}
      selected={item.id === selectedId} sticky={isSticky} motion={isSticky ? undefined : motion.get(item.id)} clockMs={clockMs} renderIcon={props.renderIcon} fillByAgent={props.fillByAgent} sharedDetail={props.sharedDetail} expanded={props.expandedIds?.has(item.id)}
      onToggle={props.onToggle} onInspect={props.onInspect} onLeave={props.onLeave} onPin={props.onPin} onActivate={item => props.onActiveChange(item.id)} />
  )

  return (
    <div className={`fw-body fw-view-${view}${zoomed ? ' fw-zoomed' : ''}`} ref={surface}>
      {axis}
      <div className="fw-viewport">
        <div className="fw-gridlayer" aria-hidden>
          {ticks.map(tick => <span key={tick} className="fw-gridline" style={{ '--s': tick } as CSSProperties} />)}
        </div>
        <div ref={scroller} role="treegrid" aria-label="Trace timeline" aria-rowcount={rows.length} aria-multiselectable={false}
          tabIndex={-1} className="fw-scroller" data-primary-content="" style={{ height, maxHeight }} onKeyDown={keydown}
          onScroll={event => { const next = Math.floor(event.currentTarget.scrollTop / rowHeight / CHUNK); if (next !== chunk) setChunk(next) }}>
          <div className="fw-canvas" style={{ height: rows.length * rowHeight }}>
            <div className="fw-links" aria-hidden>
              {links.filter(link => Math.max(link.from, link.to) >= first && Math.min(link.from, link.to) <= last)
                .map(link => <LinkMark key={link.id} link={link} rowHeight={rowHeight} hot={props.focusId !== undefined && (rows[link.from]?.id === props.focusId || rows[link.to]?.id === props.focusId)} />)}
            </div>
            {rows.slice(first, last).map((item, offset) => row(item, first + offset))}
          </div>
          {rows.length === 0 && <p role="status" className="fw-empty">{props.emptyText}</p>}
        </div>
        {view === 'spans' && <StickyRows scroller={scroller} rows={rows} index={index} rowHeight={rowHeight} render={row} />}
        {props.markers?.length || props.pauses?.length ? <div className="fw-marker-layer">
          {props.pauses?.map(pause => <span key={`p-${pause.startMs}`} className="fw-pause" style={{ '--s': pause.startMs, '--e': pause.endMs } as CSSProperties} title={pause.label}>
            <span className="fw-pause-label">{pause.label}</span>
          </span>)}
          {props.markers?.map(marker => <span key={`${marker.at}-${marker.label}`} className="fw-marker" data-tone={marker.tone ?? 'neutral'}
            style={{ '--s': marker.at } as CSSProperties} title={marker.label}>
            {markerLabels.has(marker) && <span className={`fw-marker-label${markerLabels.get(marker) === 'left' ? ' fw-marker-label-left' : ''}`}>{marker.label}</span>}
          </span>)}
        </div> : null}
        {showCursor && <div className="fw-cursor-layer" aria-hidden><span className="fw-cursor" /></div>}
      </div>
    </div>
  )
}

/** Ancestors of the first visible row stay pinned while their children scroll beneath them. This layer follows
 * scroll per row on its own, so the virtualized rows below re-render only per chunk. */
function StickyRows({ scroller, rows, index, rowHeight, render }: {
  scroller: { current: HTMLDivElement | null }
  rows: FlowWaterfallRow[]
  index: Map<string, number>
  rowHeight: number
  render: (row: FlowWaterfallRow, level: number, sticky: boolean) => ReactNode
}) {
  const [top, setTop] = useState(0)
  useEffect(() => {
    const element = scroller.current
    if (!element) return
    const scroll = () => setTop(element.scrollTop > 0 ? Math.floor(element.scrollTop / rowHeight) : -1)
    scroll()
    element.addEventListener('scroll', scroll, { passive: true })
    return () => element.removeEventListener('scroll', scroll)
  }, [scroller, rowHeight])
  const sticky: FlowWaterfallRow[] = []
  if (top >= 0) {
    const chain: FlowWaterfallRow[] = []
    let cursor = rows[Math.min(rows.length - 1, top + 1)]
    while (cursor?.parentId !== undefined) {
      const parentIndex = index.get(cursor.parentId)
      if (parentIndex === undefined) break
      cursor = rows[parentIndex]
      if (cursor) chain.unshift(cursor)
    }
    for (const [level, row] of chain.slice(-STICKY_LEVELS).entries()) if ((index.get(row.id) ?? 0) < top + level + 1) sticky.push(row)
  }
  if (!sticky.length) return null
  return <div className="fw-sticky" style={{ height: sticky.length * rowHeight }}>{sticky.map((item, level) => render(item, level, true))}</div>
}
