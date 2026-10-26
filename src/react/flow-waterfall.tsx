import { type CSSProperties, type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { FlowMarker, FlowSpan, FlowTrace } from '../flow-trace.js'
import { FlowBody, ROW_HEIGHT } from './flow-waterfall-body.js'
import { SpanCard } from './flow-waterfall-card.js'
import { useTraceClock } from './flow-waterfall-clock.js'
import { FailGlyph, SearchGlyph, TraceGlyph } from './flow-waterfall-icons.js'
import { PlaybackBar } from './flow-waterfall-playback.js'
import {
  agentCallouts, agentViewRows, criticalPathIds, defaultOpenFamilies, busyMs, drawnRow, costSummary, type FlowWaterfallRow, flowWaterfallRows, formatCount, formatSpanDuration, slowestRow, spanFailed, spanRunning,
  toneKey, totalsAt, visibleFlowWaterfallRows,
} from './flow-waterfall-model.js'
import type { FlowView } from './flow-waterfall-row.js'
import { clampWindow, type ViewWindow, zoomWindow } from './flow-waterfall-time.js'

export type { FlowView } from './flow-waterfall-row.js'

const LANE_PAD = 12
// The agents view shows this many rows before it scrolls.
const AGENT_ROWS = 20
// A run with at most this many agents lists each one rather than folding families, keeping the page near its length budget.
const UNFOLD_ROWS = 12
// The agents view's end labels carry a Slowest or Costliest badge after the duration, so its gutter is wider.
const END_LABEL_GUTTER: Record<FlowView, number> = { spans: 120, agents: 176 }
const NAME_WIDTH: Record<FlowView, number> = { spans: 320, agents: 240 }

export interface FlowWaterfallProps {
  trace: FlowTrace
  /** Extend running spans between incoming snapshots. Inferred from span status by default. */
  live?: boolean
  /** Epoch-ms origin when the producer supplies one; otherwise advance from the latest snapshot. */
  startedAt?: number
  /** Accessible name also distinguishes multiple waterfalls on one page. */
  label?: string
  /** Fold all branches on first mount for large traces; search still reveals matches. */
  defaultCollapsed?: boolean
  /** `agents` shows one row per agent (the agent timeline); expanding a row opens the full span tree. */
  defaultView?: FlowView
  /** Host brand marks by span; the inspector draws kind glyphs without it. */
  renderIcon?: (span: FlowSpan) => ReactNode
  /** Scroll height of the rows; the tree is virtualized beyond it. Defaults to 20 agent rows, or 640 px of steps. */
  maxHeight?: number
  /** Called when a row is opened or a bar is pinned, with that row's span; the built-in behavior still runs. */
  onSelect?: (span: FlowSpan) => void
  /** Labelled instants, such as releases, drawn across the rows and as event dots on the axis; click or N/P jumps to one. */
  markers?: FlowMarker[]
  /** The time the reader moved to, in trace ms; `null` when following live or showing the whole trace. */
  onTimeChange?: (t: number | null) => void
  /** What an agent bar's color means. `agent` (default): each agent or family its own muted hue across dot, bar and handoffs, with
   * model and tool steps as darker and lighter shades of it; the outcome stays on the row dot and amber marks the slowest (blind round
   * 25: global step hues made agents blur together). `muted`: one quiet tone, color on state only. `outcome`: the bar takes its outcome. */
  agentFill?: 'muted' | 'outcome' | 'agent'
  /** One line beside the title saying what the run was for, such as its goal. */
  description?: string
  /** The row the host has selected, such as the agent whose transcript is open: it lifts and, in the agent view, its peers dim.
   * A pinned card alone only highlights its row, so the rest of the run stays readable around it. */
  selectedId?: string
  /** Escape clears the host's selection, after closing any open card. */
  onDeselect?: () => void
  /** Show the stat strip (default); a page with its own stat row passes false. */
  summary?: boolean
  /** Mark the steps on the chain that gates the trace's end. */
  criticalPath?: boolean
  /** Controlled search text; pass with `onQueryChange` to keep it in the host's state, such as the URL. */
  query?: string
  onQueryChange?: (query: string) => void
  /** Controlled folded span ids; pass with `onCollapsedChange`. Overrides `defaultCollapsed`. */
  collapsed?: ReadonlySet<string>
  onCollapsedChange?: (collapsed: ReadonlySet<string>) => void
  /** Controlled time window, `null` for the whole trace; pass with `onZoomChange`. */
  zoom?: ViewWindow | null
  onZoomChange?: (zoom: ViewWindow | null) => void
  /** Replaces the built-in search match (name, model, kind, status), such as to search the host's attributes. */
  matchSpan?: (span: FlowSpan, query: string) => boolean
}

/** State the host may own: its value wins when given, and every change is reported either way. */
function useHostable<T>(value: T | undefined, onChange: ((next: T) => void) | undefined, initial: T | (() => T)) {
  const [own, setOwn] = useState(initial)
  const current = value === undefined ? own : value
  const latest = useRef(current)
  latest.current = current
  const report = useRef(onChange)
  report.current = onChange
  const controlled = value !== undefined
  const set = useCallback((next: T | ((previous: T) => T)) => {
    const resolved = typeof next === 'function' ? (next as (previous: T) => T)(latest.current) : next
    latest.current = resolved
    if (!controlled) setOwn(resolved)
    report.current?.(resolved)
  }, [controlled])
  return [current, set] as const
}

interface CardState { target: string; pinned: boolean; left: number; top: number; above: boolean }

/** The summary strip: as of the playhead while scrubbing, the producer's totals otherwise. */
function summaryCells(trace: FlowTrace, at: ReturnType<typeof totalsAt> | undefined, durationMs: number) {
  const cost = costSummary(at ? at.costUsd : trace.costUsd, trace)
  const tokens = at ? at.tokens : trace.promptTokens + trace.completionTokens
  const modelCalls = at ? at.modelCalls : trace.modelCalls
  const errors = at ? at.errors : trace.errors ?? trace.spans.filter(spanFailed).length
  const summary: [string, ReactNode, string?][] = [
    ['Duration', formatSpanDuration(durationMs)],
    // No cost source at all: the tile goes rather than print a dash beside real numbers.
    ...(cost.value === '—' ? [] : [[cost.label, cost.value, cost.title] as [string, ReactNode, string?]]),
    ['Tokens', formatCount(tokens), `${tokens.toLocaleString()} tokens`],
    ['LLM calls', modelCalls === undefined ? '—' : modelCalls.toLocaleString(), modelCalls === undefined ? 'Model output windows do not establish the number of LLM requests' : undefined],
    ['Tool calls', (at ? at.toolCalls : trace.toolCalls)?.toLocaleString() ?? '—', (at ? at.toolCalls : trace.toolCalls) === undefined ? 'The producer did not count tool calls' : undefined],
    ['Errors', errors.toLocaleString()],
  ]
  return { cost, tokens, errors, summary }
}

/** One legend item per outcome label the agents carry, with its count; nothing when no agent has an outcome. */
// Outcome keys keep one order on every page: good news first, then what needs a look, then what produced nothing.
const TONE_ORDER = ['ok', 'warn', 'failed', 'neutral']

/** What each mark means, as the agent view draws it; a key only for kinds the run has. */
function KindLegend({ rows }: { rows: FlowWaterfallRow[] }) {
  const has = (kind: string) => rows.some(row => row.own.some(mark => mark.kind === kind) || row.span.kind === kind)
  const keys: [string, string][] = [['model', 'Model call'], ['tool', 'Tool call'], ['waiting', 'Waiting'], ['handoff', 'Handoff']]
  const shown = keys.filter(([kind]) => kind === 'waiting' ? rows.some(row => row.kind === 'pipeline') : kind === 'handoff' ? rows.some(row => row.span.handoffTo || row.hasAgents) : has(kind))
  if (shown.length === 0) return null
  return <ul className="fw-legend fw-kinds" aria-label="Key">
    {shown.map(([kind, name]) => <li key={kind}><span className={`fw-swatch-${kind === 'waiting' ? 'wait' : kind}`} aria-hidden />{name}</li>)}
  </ul>
}

function OutcomeLegend({ agents }: { agents: FlowWaterfallRow[] }) {
  const items = new Map<string, { tone: string; count: number }>()
  for (const row of agents) {
    const outcome = row.span.outcome
    if (!outcome) continue
    const item = items.get(outcome.label) ?? { tone: outcome.tone, count: 0 }
    item.count += 1
    items.set(outcome.label, item)
  }
  if (items.size === 0) return null
  // A failed step inside a finished agent is a different fact from a failed agent, so it gets its own key.
  const failedSteps = agents.reduce((sum, row) => sum + row.own.reduce((n, mark) => n + (mark.kind === 'failed' ? mark.count : 0), 0), 0)
  return <ul className="fw-legend" aria-label="Outcomes">
    {[...items].sort(([a, x], [b, y]) => TONE_ORDER.indexOf(x.tone) - TONE_ORDER.indexOf(y.tone) || a.localeCompare(b)).map(([label, item]) => <li key={label}><span className="fw-swatch" data-tone="0" data-outcome={item.tone} aria-hidden />{label} <b>{item.count}</b></li>)}
    {failedSteps > 0 && <li><span className="fw-swatch-step" aria-hidden><FailGlyph /></span>Failed step <b>{failedSteps}</b></li>}
  </ul>
}


/** Shared trace inspector: the agent timeline and the span waterfall over one clock.
 * Data remains producer-owned; playback, zoom and folding change presentation only. */
export function FlowWaterfall({
  trace, live, startedAt, label = 'Trace waterfall', defaultCollapsed = false, defaultView = 'spans', renderIcon, maxHeight, onSelect, markers, onTimeChange, agentFill: fillProp, selectedId, onDeselect, description, summary: showSummary = true, criticalPath = false, query: queryProp, onQueryChange, collapsed: collapsedProp, onCollapsedChange, zoom: zoomProp, onZoomChange, matchSpan,
}: FlowWaterfallProps) {
  const root = useRef<HTMLElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const slider = useRef<HTMLInputElement>(null)
  const timeOutput = useRef<HTMLOutputElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const searchId = useId()
  const cardId = useId()
  const [view, setView] = useState<FlowView>(defaultView)
  const [query, setQuery] = useHostable(queryProp, onQueryChange, '')
  const [collapsed, setCollapsed] = useHostable<ReadonlySet<string>>(collapsedProp, onCollapsedChange, () => new Set(defaultCollapsed ? trace.spans.flatMap(span => span.parentId ? [span.parentId] : []) : []))
  const [speed, setSpeed] = useState(1)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState<number | null>(null)
  const [zoom, setZoom] = useHostable<ViewWindow | null>(zoomProp, onZoomChange, null)
  const [nameWidth, setNameWidth] = useState(NAME_WIDTH[defaultView])
  const [laneWidth, setLaneWidth] = useState(0)
  const [card, setCard] = useState<CardState | null>(null)
  const [activeId, setActiveId] = useState<string>()
  const [laneElement, setLaneElement] = useState<HTMLElement | null>(null)

  const observedTotal = Number.isFinite(trace.totalMs) && trace.totalMs >= 0 ? trace.totalMs : 0
  const isLive = live ?? trace.spans.some(spanRunning)
  const agentFill = fillProp ?? 'agent'
  const dataEnd = useMemo(() => Math.max(observedTotal, ...trace.spans.map(span => Number.isFinite(span.endMs) ? span.endMs : 0)), [trace, observedTotal])
  // The end-label gutter shrinks on narrow lanes so bars keep most of the width.
  const trackPx = Math.max(40, laneWidth - LANE_PAD - Math.min(END_LABEL_GUTTER[view], laneWidth * 0.3))

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
  const critical = useMemo(() => criticalPathIds(rows), [rows])
  const agents = useMemo(() => {
    const pipelines = rows.filter(row => row.kind === 'pipeline')
    return pipelines.length ? pipelines : rows.filter(row => !row.parentId)
  }, [rows])
  // When every agent runs the same model, the header says it once instead of every row repeating it.
  const sharedDetail = agents.length > 1 && agents.every(row => row.span.detail && row.span.detail === agents[0]?.span.detail) ? agents[0]?.span.detail : undefined
  const [flippedFamilies, setFlippedFamilies] = useState<ReadonlySet<string>>(new Set())
  const openFamilies = useMemo(() => defaultOpenFamilies(agents, UNFOLD_ROWS, flippedFamilies), [agents, flippedFamilies])
  const [openSteps, setOpenSteps] = useState<ReadonlySet<string>>(new Set())
  const visible = useMemo(() => view === 'agents' ? agentViewRows(agents, rows, openFamilies, openSteps) : visibleFlowWaterfallRows(rows, query, collapsed, matchSpan), [view, agents, rows, openFamilies, openSteps, query, collapsed, matchSpan])
  const slowest = view === 'spans' ? slowestRow(rows, clockMs) : undefined
  const callouts = useMemo<ReturnType<typeof agentCallouts>>(() => view === 'agents' ? agentCallouts(visible, clockMs) : {}, [view, visible, clockMs])
  const rowsHeight = maxHeight ?? (view === 'agents' ? ROW_HEIGHT.agents * AGENT_ROWS : 640)

  // The agent label column fits the longest agent name (CSS caps it at 28%) until the reader drags it.
  const resized = useRef(false)
  useLayoutEffect(() => {
    if (view !== 'agents' || resized.current || !root.current) return
    let widest = 0
    for (const text of root.current.querySelectorAll<HTMLElement>('.fw-view-agents .fw-row:not(.fw-sticky-row) .fw-name-text')) {
      const label = text.closest<HTMLElement>('.fw-label')
      if (label) widest = Math.max(widest, text.scrollWidth + label.clientWidth - text.clientWidth)
    }
    if (widest > 0) setNameWidth(Math.max(140, Math.min(560, Math.ceil(widest) + 16)))
  }, [view, agents])

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
      else if (event.key === 'Escape' && (card || selectedId)) { if (card) closeCard(); onDeselect?.() }
      else if ((event.key === 'n' || event.key === 'p') && markers?.length) {
        // N and P step through the event track from wherever the cursor stands.
        const ats = markers.map(marker => marker.at).sort((a, b) => a - b)
        const next = event.key === 'n' ? ats.find(at => at > clockMs + 1) : [...ats].reverse().find(at => at < clockMs - 1)
        if (next !== undefined) { event.preventDefault(); scrubTo(next) }
      }
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
  // Selecting or expanding a span too narrow to read zooms the axis to it; Fit returns. Reduced motion jumps.
  const zoomFrame = useRef(0)
  const zoomTo = (row: FlowWaterfallRow) => {
    const span = row.span
    const current = viewAt(clockMs)
    const width = current.endMs - current.startMs
    const end = spanRunning(span) ? Math.max(span.endMs, clockMs) : span.endMs
    if (view !== 'spans' || !Number.isFinite(end) || (end - span.startMs) / Math.max(1, width) > 0.25) return
    // One click zooms at most 8x, so a 0 ms step on a day-long run keeps its neighbours in view instead of a 1 s window.
    const pad = Math.max((end - span.startMs) * 0.15, 500, (width / 8 - (end - span.startMs)) / 2)
    const target = clampWindow({ startMs: span.startMs - pad, endMs: end + pad }, limit)
    cancelAnimationFrame(zoomFrame.current)
    if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setZoom(target); return }
    const began = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / 320)
      const e = 1 - (1 - t) ** 3
      setZoom({ startMs: current.startMs + (target.startMs - current.startMs) * e, endMs: current.endMs + (target.endMs - current.endMs) * e })
      if (t < 1) zoomFrame.current = requestAnimationFrame(step)
    }
    zoomFrame.current = requestAnimationFrame(step)
  }
  const pan = (deltaMs: number) => setZoom(previous => previous && clampWindow({ startMs: previous.startMs + deltaMs, endMs: previous.endMs + deltaMs }, limit))

  // Rows are memoized without their handlers, so handlers stay stable and read the latest state through a ref.
  const latest = useRef({ toggle: (_row: FlowWaterfallRow) => {}, pin: (_target: string, _element: HTMLElement) => {}, inspect: (_target: string, _element: HTMLElement) => {} })
  const toggleNow = (row: FlowWaterfallRow) => {
    // In the agent view a family opens its members and an agent opens its own steps, in place.
    const flip = (open: ReadonlySet<string>) => new Set(open.has(row.id) ? [...open].filter(id => id !== row.id) : [...open, row.id])
    if (row.id.startsWith('family:')) { setFlippedFamilies(flip); return }
    onSelect?.(row.span)
    if (view === 'agents') { setOpenSteps(flip); setActiveId(row.id); return }
    if (collapsed.has(row.id)) zoomTo(row)
    setCollapsed(previous => {
      const next = new Set(previous)
      if (next.has(row.id)) next.delete(row.id)
      else next.add(row.id)
      return next
    })
  }
  latest.current.toggle = toggleNow
  const toggle = useCallback((row: FlowWaterfallRow) => latest.current.toggle(row), [])

  const place = (target: string, element: HTMLElement, pinned: boolean) => {
    const host = root.current?.getBoundingClientRect()
    if (!host) return
    const rect = element.getBoundingClientRect()
    // The agent timeline's compact card opens above its mark, clear of the rows below; the span card below unless cramped.
    const above = view === 'agents' ? rect.top - host.top > 150 : globalThis.innerHeight - rect.bottom < 260 && rect.top - host.top > 260
    const left = Math.max(8, Math.min(rect.left - host.left, host.width - 328))
    clearTimeout(hideTimer.current)
    setCard({ target, pinned, left, top: above ? rect.top - host.top - 8 : rect.bottom - host.top + 8, above })
  }
  latest.current.inspect = (target, element) => { if (!card?.pinned) place(target, element, false) }
  const inspect = useCallback((target: string, element: HTMLElement) => latest.current.inspect(target, element), [])
  const leave = useCallback(() => {
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setCard(previous => previous?.pinned ? previous : null), 140)
  }, [])
  // A hover card follows the pointer: it closes as soon as the pointer is over neither a mark nor the card.
  useEffect(() => {
    if (!card || card.pinned) return
    const move = (event: PointerEvent) => {
      if (!(event.target as Element | null)?.closest('.fw-bar, .fw-seg, .fw-card')) leave()
    }
    document.addEventListener('pointermove', move)
    return () => document.removeEventListener('pointermove', move)
  }, [card, leave])

  latest.current.pin = (target, element) => {
    // Clicking the pinned mark again closes its card, so a re-click is never a no-op.
    if (card?.pinned && card.target === target) { closeCard(); return }
    place(target, element, true)
    const row = byId.get(target)
    if (row) { onSelect?.(row.span); zoomTo(row) }
  }
  const pin = useCallback((target: string, element: HTMLElement) => latest.current.pin(target, element), [])
  const selection = selectedId ?? (card?.pinned ? card.target : undefined)
  const closeCard = () => {
    const target = card?.target
    setCard(null)
    if (target) root.current?.querySelector<HTMLElement>(`.fw-canvas [data-span-id="${CSS.escape(target)}"]`)?.focus({ preventScroll: true })
  }

  const scrubTo = useCallback((ms: number) => { setPlaying(false); setPosition(Math.min(ms, clock.limitMs())) }, [clock])
  const timeListener = useRef(onTimeChange)
  timeListener.current = onTimeChange
  useEffect(() => { timeListener.current?.(position) }, [position])
  const togglePlay = () => {
    if (playing) { setPosition(clock.positionMs()); setPlaying(false); return }
    if (position === null || position >= limit - 1) setPosition(0)
    setPlaying(true)
  }

  // Scrubbing shows the run as of the playhead; the full trace shows the producer's totals.
  const scrubbing = position !== null || playing
  const at = scrubbing ? totalsAt(trace, clockMs) : undefined
  const { errors, summary } = summaryCells(trace, at, scrubbing ? clockMs : limit)
  const busy = agents.reduce((sum, row) => sum + busyMs(row, limit), 0)
  const speedup = limit > 0 ? busy / limit : 0
  const done = !isLive && !trace.spans.some(spanRunning)
  // The card takes the row as drawn (a family recolours its members), so its dot matches the lane it describes.
  const shown = (row?: FlowWaterfallRow) => row && drawnRow(row, visible)
  const cardRow = shown(card ? byId.get(card.target) : undefined)
  const cardAgent = cardRow && (() => {
    for (let cursor: FlowWaterfallRow | undefined = cardRow; cursor; cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined) if (cursor.kind === 'pipeline') return shown(cursor)
    return undefined
  })()
  // The agent view keeps its playhead dot in sight at rest, at the end of the run; the line shows only while it moves.
  const moving = isLive || position !== null || playing
  const showCursor = moving || view === 'agents'
  const overviewMarks = useMemo(() => rows.filter(row => !row.parentId).flatMap(row => row.hasChildren ? row.segments : row.kind === 'pipeline' ? [] : [{ startMs: row.span.startMs, endMs: row.span.endMs, kind: row.ok ? 'tool' as const : 'failed' as const, tone: row.tone, id: row.id, count: 1, retry: false }]), [rows])

  // The agent timeline puts play and speed above its lanes, so they stay in view on a long run.
  const playback = (
    <PlaybackBar view={view} playing={playing} limit={limit} clockMs={clockMs} speed={speed} zoom={zoom} marks={overviewMarks}
      slider={slider} timeOutput={timeOutput} followLabel={position === null ? undefined : isLive ? 'Follow live' : 'Show full trace'}
      onTogglePlay={togglePlay} onRestart={() => { setPosition(0); setPlaying(false) }} onSpeed={setSpeed} onScrub={scrubTo}
      onFollow={() => { setPosition(null); setPlaying(false) }} onZoom={zoomBy} onFit={() => setZoom(null)} />
  )

  return (
    <section ref={root} data-flow-waterfall aria-label={label} className={`fw-root fw-root-${view} fw-fill-${agentFill}`} data-selection={selectedId ? '' : undefined}
      style={{ '--fw-name-w': `${nameWidth}px`, '--fw-pad': `${LANE_PAD}px`, '--fw-row-h': `${ROW_HEIGHT[view]}px` } as CSSProperties}>
      <header className="fw-heading">
        <div className="fw-title-block">
          <div className="fw-title-line">
            <span className="fw-title-glyph" aria-hidden><TraceGlyph /></span>
            <h3 className="fw-title">{label}</h3>
            {description && <p className="fw-description" title={description}>{description}</p>}
            {isLive && <span className="fw-state fw-state-live">Live</span>}
          </div>
          {view === 'agents' && <p className="fw-headline" aria-live="polite">
            {/* Duration, cost and tokens live in the stat strip below; the headline says only what the strip cannot. */}
            {done && <span className="fw-done-mark" aria-label="done">✓</span>}
            {agents.length} {agents.length === 1 ? 'agent' : 'agents'}{sharedDetail ? ` · ${sharedDetail}` : ''}{done && speedup >= 1.05 ? ` · ${speedup.toFixed(1)}x parallel` : ''}
          </p>}
          {/* One legend row: outcomes, then the bar-type key (round 24: stacked key bands read as clutter above the rows). */}
          <div className="fw-legends"><OutcomeLegend agents={agents} />{view === 'agents' && <KindLegend rows={rows} />}</div>
        </div>
        <div className="fw-tools">
          <div className="fw-views" role="radiogroup" aria-label="Trace view">
            {(['agents', 'spans'] as const).map(option => <button key={option} type="button" role="radio" aria-checked={view === option} disabled={view === option}
              className="fw-view-button" onClick={() => { setView(option); setNameWidth(NAME_WIDTH[option]); setCard(null) }}>{option === 'agents' ? 'Agents' : 'Steps'}</button>)}
          </div>
          {view === 'spans' && <div className="fw-search">
            <label htmlFor={searchId} className="fw-sr-only">Search trace</label>
            <span className="fw-search-glyph" aria-hidden><SearchGlyph /></span>
            <input ref={search} id={searchId} type="search" value={query} placeholder="Search" aria-keyshortcuts="Meta+f Control+f"
              onChange={event => setQuery(event.target.value)} onKeyDown={event => {
                if (event.key === 'Escape') { setQuery(''); event.stopPropagation() }
              }} className="fw-search-input" />
          </div>}
        </div>
      </header>
      {showSummary && <dl className="fw-summary">
        {summary.map(([name, value, title]) => <div key={name} className={name === 'Errors' && errors > 0 ? 'fw-has-errors' : undefined}>
          <dt>{name}</dt>
          <dd className="fw-value" title={title}>{value}</dd>
        </div>)}
      </dl>}
      {view === 'agents' && playback}
      <FlowBody rows={visible} byId={byId} totalRows={rows.length} view={view} maxHeight={rowsHeight} collapsed={collapsed} searching={Boolean(query.trim())} query={query} matchSpan={matchSpan}
        pauses={trace.pauses} cursorLine={position !== null || playing} sharedDetail={sharedDetail} expandedIds={view === 'agents' ? new Set([...openFamilies, ...openSteps]) : undefined} holdHeight={isLive} slowestId={slowest?.id ?? callouts.slowestId} costliestId={callouts.costliestId} criticalIds={criticalPath && view === 'spans' ? critical : undefined} activeId={activeId} selectedId={selection} focusId={cardAgent?.id ?? (view === 'agents' ? activeId : undefined)} clockMs={clockMs} window={win}
        trackPx={trackPx} showCursor={showCursor} markers={markers} fillByAgent={agentFill !== 'outcome'} zoomed={zoom !== null} renderIcon={renderIcon}
        emptyText={rows.length === 0 ? 'No spans yet. Waiting for trace events.' : `No matching steps for “${query}”.`}
        onToggle={toggle} onInspect={inspect} onLeave={leave} onPin={pin} onActivate={row => setActiveId(row.id)}
        onActiveChange={setActiveId} onScrub={scrubTo} onZoom={zoomBy} onPan={pan}
        nameWidth={nameWidth} onNameWidth={px => { resized.current = true; setNameWidth(Math.max(140, Math.min(560, px))) }} onTrack={setLaneElement}
        onExpandAll={rows.some(row => row.hasChildren) ? () => setCollapsed(new Set()) : undefined}
        onCollapseAll={() => setCollapsed(new Set(rows.filter(row => row.hasChildren).map(row => row.id)))} />
      {card && cardRow && <div className={`fw-card-anchor${card.above ? ' fw-card-above' : ''}`}
        onPointerEnter={() => clearTimeout(hideTimer.current)} onPointerLeave={card.pinned ? undefined : leave}>
        <SpanCard id={cardId} row={cardRow} agent={cardAgent} clockMs={clockMs} left={card.left} top={card.top} pinned={card.pinned} onClose={closeCard} renderIcon={renderIcon} compact={view === 'agents'} />
      </div>}
      {view === 'spans' && playback}
    </section>
  )
}
