import { type CSSProperties, type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FlowSpan, FlowTrace } from '../flow-trace.js'
import { FlowBody, ROW_HEIGHT } from './flow-waterfall-body.js'
import { SpanCard } from './flow-waterfall-card.js'
import { useTraceClock } from './flow-waterfall-clock.js'
import { FailGlyph, FitGlyph, PauseGlyph, PlayGlyph, RestartGlyph, SearchGlyph, TraceGlyph, ZoomInGlyph, ZoomOutGlyph } from './flow-waterfall-icons.js'
import {
  busyMs, type FlowWaterfallRow, flowWaterfallRows, formatCost, formatCount, formatSpanDuration, slowestRow, spanFailed, spanRunning,
  toneKey, visibleFlowWaterfallRows,
} from './flow-waterfall-model.js'
import type { FlowView } from './flow-waterfall-row.js'
import { clampWindow, type ViewWindow, zoomWindow } from './flow-waterfall-time.js'

export type { FlowView } from './flow-waterfall-row.js'

const SPEEDS = [0.5, 1, 1.5, 2, 4]
const LANE_PAD = 12
const END_LABEL_GUTTER: Record<FlowView, number> = { spans: 120, agents: 16 }
const NAME_WIDTH: Record<FlowView, number> = { spans: 300, agents: 200 }

export interface FlowWaterfallProps {
  trace: FlowTrace
  /** Extend running spans between incoming snapshots. Inferred from span status by default. */
  live?: boolean
  /** Epoch-ms origin when the producer supplies one; otherwise advance from the latest snapshot. */
  startedAt?: number
  /** Accessible name also distinguishes multiple waterfalls on one page. */
  label?: string
  /** One line after the title: the run's goal or question. */
  description?: string
  /** Fold all branches on first mount for large traces; search still reveals matches. */
  defaultCollapsed?: boolean
  /** `agents` shows one row per agent (the agent timeline); expanding a row opens the full span tree. */
  defaultView?: FlowView
  /** Host brand marks by span; the inspector draws kind glyphs without it. */
  renderIcon?: (span: FlowSpan) => ReactNode
  /** Scroll height of the rows; the tree is virtualized beyond it. */
  maxHeight?: number
}

interface CardState { target: string; pinned: boolean; left: number; top: number; above: boolean }

const headlineSeconds = (ms: number) => ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : formatSpanDuration(ms)

/** Shared trace inspector: the agent timeline and the span waterfall over one clock.
 * Data remains producer-owned; playback, zoom and folding change presentation only. */
export function FlowWaterfall({
  trace, live, startedAt, label = 'Trace waterfall', description, defaultCollapsed = false, defaultView = 'spans', renderIcon, maxHeight = 640,
}: FlowWaterfallProps) {
  const root = useRef<HTMLElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const slider = useRef<HTMLInputElement>(null)
  const timeOutput = useRef<HTMLOutputElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const searchId = useId()
  const cardId = useId()
  const [view, setView] = useState<FlowView>(defaultView)
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(defaultCollapsed ? trace.spans.flatMap(span => span.parentId ? [span.parentId] : []) : []))
  const [speed, setSpeed] = useState(1)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState<number | null>(null)
  const [zoom, setZoom] = useState<ViewWindow | null>(null)
  const [nameWidth, setNameWidth] = useState(NAME_WIDTH[defaultView])
  const [laneWidth, setLaneWidth] = useState(0)
  const [card, setCard] = useState<CardState | null>(null)
  const [activeId, setActiveId] = useState<string>()
  const [laneElement, setLaneElement] = useState<HTMLElement | null>(null)

  const observedTotal = Number.isFinite(trace.totalMs) && trace.totalMs >= 0 ? trace.totalMs : 0
  const isLive = live ?? trace.spans.some(spanRunning)
  const dataEnd = useMemo(() => Math.max(observedTotal, ...trace.spans.map(span => Number.isFinite(span.endMs) ? span.endMs : 0)), [trace, observedTotal])
  const trackPx = Math.max(40, laneWidth - LANE_PAD - END_LABEL_GUTTER[view])

  useEffect(() => {
    if (!laneElement) return
    const observer = new ResizeObserver(([entry]) => setLaneWidth(entry!.contentRect.width))
    observer.observe(laneElement)
    return () => observer.disconnect()
  }, [laneElement])

  const viewAt = useCallback((t: number): ViewWindow => zoom ?? { startMs: 0, endMs: Math.max(dataEnd, isLive ? t : 0, 1) }, [zoom, dataEnd, isLive])
  const clock = useTraceClock({
    root, slider, timeOutput, observedTotal: dataEnd, live: isLive, startedAt, snapshot: trace, playing, speed, position,
    onPlaybackEnd: end => { setPlaying(false); setPosition(end) }, view: viewAt, trackPx,
  })
  const clockMs = clock.clockMs
  const win = viewAt(clockMs)
  const limit = Math.max(dataEnd, isLive ? clockMs : 0)

  // Merge marks at about two per pixel of the current window; buckets keep zoom from re-merging every frame.
  const resolution = 2 ** Math.round(Math.log2(Math.max(1, (win.endMs - win.startMs) / Math.max(200, trackPx) * 1.5)))
  const rows = useMemo(() => flowWaterfallRows({ ...trace, totalMs: dataEnd }, resolution), [trace, dataEnd, resolution])
  const byId = useMemo(() => new Map(rows.map(row => [row.id, row])), [rows])
  const agents = useMemo(() => {
    const pipelines = rows.filter(row => row.kind === 'pipeline')
    return pipelines.length ? pipelines : rows.filter(row => !row.parentId)
  }, [rows])
  const visible = useMemo(() => view === 'agents' ? agents : visibleFlowWaterfallRows(rows, query, collapsed), [view, agents, rows, query, collapsed])
  const slowest = view === 'spans' ? slowestRow(rows, clockMs) : undefined

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const active = document.activeElement
      const ownsFocus = root.current?.contains(active)
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        const first = Array.from(document.querySelectorAll<HTMLElement>('[data-flow-waterfall]')).find(element => element.getClientRects().length > 0)
        if (!ownsFocus && (active !== document.body || first !== root.current)) return
        event.preventDefault()
        if (view === 'agents') setView('spans')
        requestAnimationFrame(() => { search.current?.focus(); search.current?.select() })
        return
      }
      if (!ownsFocus || active instanceof HTMLInputElement || active instanceof HTMLSelectElement || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === '+' || event.key === '=') zoomBy(0.5)
      else if (event.key === '-' || event.key === '_') zoomBy(2)
      else if (event.key === '0') setZoom(null)
      else if (event.key === 'Escape' && card) closeCard()
    }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  })

  useEffect(() => {
    if (!card?.pinned) return
    const down = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (target?.closest('.fw-card') || target?.closest('.fw-bar, .fw-seg')) return
      setCard(null)
    }
    document.addEventListener('pointerdown', down)
    return () => document.removeEventListener('pointerdown', down)
  }, [card?.pinned])

  const zoomBy = (factor: number, anchor?: number) => setZoom(previous => {
    const current = previous ?? viewAt(clockMs)
    const next = zoomWindow(current, factor, anchor ?? (current.startMs + current.endMs) / 2, limit)
    return next.endMs - next.startMs >= limit - 1 ? null : next
  })
  const pan = (deltaMs: number) => setZoom(previous => previous && clampWindow({ startMs: previous.startMs + deltaMs, endMs: previous.endMs + deltaMs }, limit))

  const toggle = useCallback((row: FlowWaterfallRow) => {
    if (view === 'agents') {
      // Expanding an agent opens the span tree with that agent unfolded and its peers folded.
      const keep = new Set<string>()
      for (let cursor: FlowWaterfallRow | undefined = row; cursor; cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined) keep.add(cursor.id)
      setCollapsed(new Set(rows.filter(item => item.hasChildren && !keep.has(item.id) && item.kind === 'pipeline').map(item => item.id)))
      setView('spans')
      setActiveId(row.id)
      return
    }
    setCollapsed(previous => {
      const next = new Set(previous)
      if (next.has(row.id)) next.delete(row.id)
      else next.add(row.id)
      return next
    })
  }, [view, rows, byId])

  const place = (target: string, element: HTMLElement, pinned: boolean) => {
    const host = root.current?.getBoundingClientRect()
    if (!host) return
    const rect = element.getBoundingClientRect()
    const above = globalThis.innerHeight - rect.bottom < 260 && rect.top - host.top > 260
    const left = Math.max(8, Math.min(rect.left - host.left, host.width - 328))
    clearTimeout(hideTimer.current)
    setCard({ target, pinned, left, top: above ? rect.top - host.top - 8 : rect.bottom - host.top + 8, above })
  }
  const inspect = useCallback((target: string, element: HTMLElement) => {
    if (card?.pinned) return
    place(target, element, false)
  }, [card?.pinned])
  const leave = useCallback(() => {
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setCard(previous => previous?.pinned ? previous : null), 140)
  }, [])
  const pin = useCallback((target: string, element: HTMLElement) => place(target, element, true), [])
  const closeCard = () => {
    const target = card?.target
    setCard(null)
    if (target) root.current?.querySelector<HTMLElement>(`.fw-canvas [data-span-id="${CSS.escape(target)}"]`)?.focus({ preventScroll: true })
  }

  const scrubTo = useCallback((ms: number) => { setPlaying(false); setPosition(Math.min(ms, clock.limitMs())) }, [clock])
  const togglePlay = () => {
    if (playing) { setPosition(clock.positionMs()); setPlaying(false); return }
    if (position === null || position >= limit - 1) setPosition(0)
    setPlaying(true)
  }

  const tokens = trace.promptTokens + trace.completionTokens
  const errors = trace.errors ?? trace.spans.filter(spanFailed).length
  const shownDuration = position !== null || playing ? clockMs : limit
  const summary: [string, ReactNode, string?][] = [
    ['Duration', formatSpanDuration(shownDuration)],
    ['Cost', trace.costUsd === undefined ? 'Unknown' : formatCost(trace.costUsd), trace.costUsd === undefined ? 'The harness recorded no cost for this trace' : undefined],
    ['Tokens', formatCount(tokens), `${tokens.toLocaleString()} tokens`],
    ['LLM calls', trace.modelCalls === undefined ? 'Unknown' : String(trace.modelCalls), trace.modelCalls === undefined ? 'Model output windows do not establish the number of LLM requests' : undefined],
    ['Tool calls', String(trace.toolCalls)],
    ['Errors', String(errors)],
  ]
  const busy = agents.reduce((sum, row) => sum + busyMs(row, limit), 0)
  const speedup = limit > 0 ? busy / limit : 0
  const done = !isLive && !trace.spans.some(spanRunning)
  const cardRow = card ? byId.get(card.target) : undefined
  const cardAgent = cardRow && (() => {
    for (let cursor: FlowWaterfallRow | undefined = cardRow; cursor; cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined) if (cursor.kind === 'pipeline') return cursor
    return undefined
  })()
  const showCursor = isLive || position !== null || playing
  const overviewMarks = useMemo(() => rows.filter(row => !row.parentId).flatMap(row => row.hasChildren ? row.segments : row.kind === 'pipeline' ? [] : [{ startMs: row.span.startMs, endMs: row.span.endMs, kind: row.ok ? 'tool' : 'failed', tone: row.tone, id: row.id, count: 1, retry: false }]), [rows])

  return (
    <section ref={root} data-flow-waterfall aria-label={label} className={`fw-root fw-root-${view}`}
      style={{ '--fw-name-w': `${nameWidth}px`, '--fw-pad': `${LANE_PAD}px`, '--fw-row-h': `${ROW_HEIGHT[view]}px` } as CSSProperties}>
      <header className="fw-heading">
        <div className="fw-title-block">
          <div className="fw-title-line">
            <span className="fw-title-glyph" aria-hidden><TraceGlyph /></span>
            <h3 className="fw-title">{label}</h3>
            {description && <span className="fw-description">{description}</span>}
            <span className={`fw-state ${isLive ? 'fw-state-live' : done ? 'fw-state-done' : ''}`}>{isLive ? 'Live' : done ? 'Done' : 'Recorded'}</span>
          </div>
          {view === 'agents' && <p className="fw-headline" aria-live="polite">
            {done
              ? <><span className="fw-done-mark" aria-hidden>✓</span>{agents.length} agents · {headlineSeconds(limit)}{speedup >= 1.05 ? ` · ${speedup.toFixed(1)}x faster than sequential` : ''}{trace.costUsd !== undefined ? ` · ${formatCost(trace.costUsd)}` : ''}</>
              : <>Running · {headlineSeconds(clockMs)} · {tokens.toLocaleString()} tokens{trace.costUsd !== undefined ? ` · ${formatCost(trace.costUsd)}` : ''}</>}
          </p>}
        </div>
        <div className="fw-tools">
          <div className="fw-views" role="radiogroup" aria-label="Trace view">
            {(['agents', 'spans'] as const).map(option => <button key={option} type="button" role="radio" aria-checked={view === option}
              className="fw-view-button" onClick={() => { setView(option); setNameWidth(NAME_WIDTH[option]); setCard(null) }}>{option === 'agents' ? 'Agents' : 'Steps'}</button>)}
          </div>
          {view === 'spans' && <div className="fw-search">
            <label htmlFor={searchId} className="fw-sr-only">Search trace</label>
            <span className="fw-search-glyph" aria-hidden><SearchGlyph /></span>
            <input ref={search} id={searchId} type="search" value={query} placeholder="Search" aria-keyshortcuts="Meta+f Control+f"
              onChange={event => setQuery(event.target.value)} onKeyDown={event => {
                if (event.key === 'Escape') { setQuery(''); event.stopPropagation() }
              }} className="fw-search-input" />
            <kbd className="fw-kbd" title="Search trace (⌘F / Ctrl+F)">⌘F</kbd>
          </div>}
        </div>
      </header>
      {view === 'spans' && <dl className="fw-summary">
        {summary.map(([name, value, title]) => <div key={name} className={name === 'Errors' && errors > 0 ? 'fw-has-errors' : undefined}>
          <dt>{name}</dt>
          <dd className="fw-value" title={title}>{value}</dd>
        </div>)}
      </dl>}
      <FlowBody rows={visible} byId={byId} totalRows={rows.length} view={view} maxHeight={maxHeight} collapsed={collapsed} searching={Boolean(query.trim())}
        slowestId={slowest?.id} activeId={activeId} selectedId={card?.pinned ? card.target : undefined} clockMs={clockMs} window={win}
        trackPx={trackPx} showCursor={showCursor} zoomed={zoom !== null} renderIcon={renderIcon}
        emptyText={rows.length === 0 ? 'No spans yet. Waiting for trace events.' : `No matching steps for “${query}”.`}
        onToggle={toggle} onInspect={inspect} onLeave={leave} onPin={pin} onActivate={row => setActiveId(row.id)}
        onActiveChange={setActiveId} onScrub={scrubTo} onZoom={zoomBy} onPan={pan}
        nameWidth={nameWidth} onNameWidth={px => setNameWidth(Math.max(140, Math.min(560, px)))} onTrack={setLaneElement}
        onExpandAll={rows.some(row => row.hasChildren) ? () => setCollapsed(new Set()) : undefined}
        onCollapseAll={() => setCollapsed(new Set(rows.filter(row => row.hasChildren).map(row => row.id)))} />
      {card && cardRow && <div className={`fw-card-anchor${card.above ? ' fw-card-above' : ''}`}
        onPointerEnter={() => clearTimeout(hideTimer.current)} onPointerLeave={card.pinned ? undefined : leave}>
        <SpanCard id={cardId} row={cardRow} agent={cardAgent} clockMs={clockMs} left={card.left} top={card.top} pinned={card.pinned} onClose={closeCard} renderIcon={renderIcon} />
      </div>}
      <footer className="fw-playback">
        <button type="button" className="fw-round-button" aria-label={playing ? 'Pause' : 'Play'} disabled={limit === 0} onClick={togglePlay}>
          {playing ? <PauseGlyph /> : <PlayGlyph />}
        </button>
        <button type="button" className="fw-icon-button" aria-label="Restart" title="Replay from the start" disabled={limit === 0}
          onClick={() => { setPosition(0); setPlaying(false) }}><RestartGlyph /></button>
        <label className="fw-speed"><span className="fw-sr-only">Playback speed</span>
          <select aria-label="Playback speed" value={speed} onChange={event => setSpeed(Number(event.target.value))}>
            {SPEEDS.map(value => <option key={value} value={value}>{value}x</option>)}
          </select>
        </label>
        <div className="fw-overview">
          <div className="fw-overview-marks" aria-hidden>
            {overviewMarks.map((mark, i) => <span key={i} className={`fw-ov fw-seg-${mark.kind}`} data-tone={toneKey(mark.tone)}
              style={{ left: `${mark.startMs / Math.max(1, limit) * 100}%`, width: `${Math.max(0.15, (Math.min(mark.endMs, limit) - mark.startMs) / Math.max(1, limit) * 100)}%` }} />)}
            {zoom && <span className="fw-brush" style={{ left: `${zoom.startMs / limit * 100}%`, width: `${(zoom.endMs - zoom.startMs) / limit * 100}%` }} />}
          </div>
          <input ref={slider} aria-label="Playback position" type="range" min={0} max={Math.max(1, limit)} step="any" defaultValue={clockMs}
            disabled={limit === 0} className="fw-slider" style={{ '--fw-progress': `${clockMs / Math.max(1, limit) * 100}%` } as CSSProperties}
            onChange={event => scrubTo(Number(event.target.value))} />
        </div>
        <output ref={timeOutput} className="fw-time" aria-label="Playback time">{formatSpanDuration(clockMs)}</output>
        {position !== null && <button type="button" className="fw-text-button" onClick={() => { setPosition(null); setPlaying(false) }}>{isLive ? 'Follow live' : 'Show full trace'}</button>}
        <div className="fw-zoom" role="group" aria-label="Zoom">
          <button type="button" className="fw-icon-button" aria-label="Zoom out" disabled={!zoom} onClick={() => zoomBy(2)}><ZoomOutGlyph /></button>
          <button type="button" className="fw-icon-button" aria-label="Zoom in" disabled={limit === 0} onClick={() => zoomBy(0.5)}><ZoomInGlyph /></button>
          <button type="button" className="fw-icon-button" aria-label="Fit the whole trace" disabled={!zoom} onClick={() => setZoom(null)}><FitGlyph /></button>
        </div>
        <ul className="fw-legend" aria-label="Span types">
          <li><span className="fw-swatch fw-swatch-model" aria-hidden />{view === 'agents' ? 'Thinking' : 'Model call'}</li>
          <li><span className="fw-swatch fw-swatch-tool" aria-hidden />Tool call</li>
          <li><span className="fw-swatch fw-swatch-waiting" aria-hidden />Waiting</li>
          <li><span className="fw-swatch fw-swatch-handoff" aria-hidden />Handoff</li>
          <li><span className="fw-swatch fw-swatch-failed" aria-hidden><FailGlyph /></span>Failed</li>
        </ul>
      </footer>
    </section>
  )
}
