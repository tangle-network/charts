import { type CSSProperties, type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { statusMeta } from '@tangle-network/ui/run'
import type { FlowMarker, FlowSpan, FlowTrace } from '../flow-trace.js'
import { FlowBody, ROW_HEIGHT } from './flow-waterfall-body.js'
import { SpanCard } from './flow-waterfall-card.js'
import { useTraceClock } from './flow-waterfall-clock.js'
import { FailGlyph, SearchGlyph, TraceGlyph } from './flow-waterfall-icons.js'
import { PlaybackBar } from './flow-waterfall-playback.js'
import {
  quietActivity, agentCallouts, agentViewRows, criticalPathIds, defaultOpenFamilies, busyMs, drawnRow, costSummary, type FlowWaterfallRow, flowWaterfallRows, formatCount, formatSpanDuration, slowestRow, spanFailed, spanRunning,
  toneKey, totalsAt, visibleFlowWaterfallRows,
} from './flow-waterfall-model.js'
import type { FlowView } from './flow-waterfall-row.js'
import { clampWindow, type ViewWindow, zoomWindow } from './flow-waterfall-time.js'
export type { FlowView } from './flow-waterfall-row.js'
const LANE_PAD = 12
const AGENT_ROWS = 20
const UNFOLD_ROWS = 12
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
/** A card's anchor: the mark's top and bottom in the root, the side it opens on, and whether that side was checked against the viewport. */
interface CardState { target: string; pinned: boolean; left: number; anchorTop: number; anchorBottom: number; above: boolean; fitted?: boolean; top?: number }
const CARD_WIDTH = 320
/** The value at least half of several agents share, if one does. */
function usual(values: readonly (string | undefined)[]): string | undefined {
  const counts = new Map<string, number>()
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1)
  const [top, n] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? []
  return values.length > 1 && n !== undefined && n >= 2 && n * 2 >= values.length ? top : undefined
}
/** The summary strip: as of the playhead while scrubbing, the producer's totals otherwise. */
function summaryCells(trace: FlowTrace, at: ReturnType<typeof totalsAt> | undefined, durationMs: number) {
  const cost = costSummary(at ? at.costUsd : trace.costUsd, trace)
  const tokens = at ? at.tokens : trace.promptTokens + trace.completionTokens
  const modelCalls = at ? at.modelCalls : trace.modelCalls
  const errors = at ? at.errors : trace.errors ?? (trace.spans.filter(span => spanFailed(span) && span.kind !== 'pipeline').length || trace.spans.filter(spanFailed).length)
  const summary: [string, ReactNode, string?][] = [
    ['Duration', formatSpanDuration(durationMs)],
    ...(cost.value === '—' ? [] : [[cost.label, cost.value, cost.title] as [string, ReactNode, string?]]),
    ['Tokens', formatCount(tokens), `${tokens.toLocaleString()} tokens`],
    ['Model calls', modelCalls === undefined ? '—' : modelCalls.toLocaleString(), modelCalls === undefined ? 'Model output windows do not establish the number of model requests' : undefined],
    ['Tool calls', (at ? at.toolCalls : trace.toolCalls)?.toLocaleString() ?? '—', (at ? at.toolCalls : trace.toolCalls) === undefined ? 'The producer did not count tool calls' : undefined],
    ['Errors', errors.toLocaleString()],
  ]
  return { cost, tokens, errors, summary }
}
/** One legend item per outcome label the agents carry, with its count; nothing when no agent has an outcome. */
const TONE_ORDER = ['failed', 'warn', 'live', 'neutral', 'ok']
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
/** The axis dots and the dashed lines they drop: one key naming what they mark (a release, or the kinds the host gave). */
function MarkerLegend({ markers }: { markers?: FlowMarker[] }) {
  if (!markers?.length) return null
  const kinds = [...new Set(markers.map(marker => marker.kind ?? 'event'))]
  const name = kinds.length === 1 ? `${kinds[0]![0]!.toUpperCase()}${kinds[0]!.slice(1)}` : 'Event'
  return <ul className="fw-legend fw-kinds" aria-label="Markers"><li><span className="fw-swatch-event" aria-hidden />{name} <b>{markers.length}</b></li></ul>
}
function OutcomeLegend({ agents, selected, onFilter, neutral }: { neutral: boolean; agents: FlowWaterfallRow[]; selected: string | null; onFilter: (label: string) => void }) {
  const items = new Map<string, { tone: string; ring?: boolean; count: number }>()
  for (const row of agents) {
    const outcome = row.span.outcome
    if (!outcome) { const unknown = items.get('Unknown') ?? { tone: 'neutral', ring: true, count: 0 }; unknown.count += 1; items.set('Unknown', unknown); continue }
    const item = items.get(outcome.label) ?? { tone: outcome.tone, ring: outcome.ring, count: 0 }
    item.count += 1
    items.set(outcome.label, item)
  }
  if (items.size === 0) return null
  const failedSteps = agents.reduce((sum, row) => sum + row.own.reduce((n, mark) => n + (mark.kind === 'failed' ? mark.count : 0), 0), 0)
  return <ul className="fw-legend" aria-label="Outcomes">
    {neutral && !items.has("Unknown") && <li><button type="button" aria-pressed={selected === null} onClick={() => onFilter("__all")}><span className="fw-swatch" data-tone="0" data-outcome="neutral" data-ring aria-hidden />All outcomes <b>{agents.length}</b></button></li>}
    {[...items].sort(([a, x], [b, y]) => TONE_ORDER.indexOf(x.tone) - TONE_ORDER.indexOf(y.tone) || a.localeCompare(b)).map(([label, item]) => <li key={label}><button type="button" aria-pressed={selected === label} onClick={() => onFilter(label)}><span className="fw-swatch" data-tone="0" data-outcome={item.tone} data-ring={item.ring || undefined} aria-hidden />{label} <b>{item.count}</b></button></li>)}
    {failedSteps > 0 && <li><button type="button" aria-pressed={selected === "__errors"} onClick={() => onFilter("__errors")}><span className="fw-swatch-step" aria-hidden><FailGlyph /></span>Failed step <b>{failedSteps}</b></button></li>}
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
  const [filter, setFilter] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string>()
  const [laneElement, setLaneElement] = useState<HTMLElement | null>(null)
  const observedTotal = Number.isFinite(trace.totalMs) && trace.totalMs >= 0 ? trace.totalMs : 0
  const isLive = live ?? trace.spans.some(spanRunning)
  const agentFill = fillProp ?? 'agent'
  const dataEnd = useMemo(() => Math.max(observedTotal, ...trace.spans.map(span => Number.isFinite(span.endMs) ? span.endMs : 0)), [trace, observedTotal])
  const trackPx = Math.max(40, laneWidth - LANE_PAD - (root.current && root.current.clientWidth < 600 ? LANE_PAD : Math.min(END_LABEL_GUTTER[view], laneWidth * 0.3)))
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
  useEffect(() => { for (const animation of root.current?.getAnimations?.({ subtree: true }) ?? []) if ('animationName' in animation && animation.animationName === 'tangle-breathe') animation.startTime = 0 }, [trace, view])
  const clockMs = clock.clockMs
  const win = viewAt(clockMs)
  const limit = Math.max(dataEnd, isLive ? clockMs : 0)
  const resolution = 2 ** Math.round(Math.log2(Math.max(1, (win.endMs - win.startMs) / Math.max(200, trackPx) * 1.5)))
  const rows = useMemo(() => flowWaterfallRows({ ...trace, totalMs: dataEnd }, resolution), [trace, dataEnd, resolution])
  const byId = useMemo(() => new Map(rows.map(row => [row.id, row])), [rows])
  const critical = useMemo(() => criticalPathIds(rows), [rows])
  const agents = useMemo(() => {
    const pipelines = rows.filter(row => row.kind === 'pipeline')
    return pipelines.length ? pipelines : rows.filter(row => !row.parentId)
  }, [rows])
  const matchesFilter = (row: FlowWaterfallRow) => !filter || (filter === '__quiet' ? quietActivity(row, clockMs).quiet : filter === '__errors' ? row.span.outcome?.tone === 'failed' || !row.ok || Boolean(row.counts?.failed) : (row.span.outcome?.label ?? 'Unknown') === filter)
  const filteredAgents = useMemo(() => agents.filter(matchesFilter), [agents, filter, Math.floor(clockMs / 1000)])
  const sharedDetail = usual(agents.map(row => row.span.detail))
  const sharedOutcome = usual(agents.map(row => row.span.outcome?.label))
  const [flippedFamilies, setFlippedFamilies] = useState<ReadonlySet<string>>(new Set())
  const openFamilies = useMemo(() => defaultOpenFamilies(filteredAgents, filter ? Infinity : UNFOLD_ROWS, flippedFamilies), [filteredAgents, filter, flippedFamilies])
  const [openSteps, setOpenSteps] = useState<ReadonlySet<string>>(new Set())
  const visible = useMemo(() => view === 'agents' ? agentViewRows(filteredAgents, rows, openFamilies, filter ? new Set(filteredAgents.map(row => row.id)) : openSteps) : visibleFlowWaterfallRows(rows, query, collapsed, matchSpan), [view, filteredAgents, filter, rows, openFamilies, openSteps, query, collapsed, matchSpan])
  const slowest = view === 'spans' ? slowestRow(rows, clockMs) : undefined
  const callouts = useMemo<ReturnType<typeof agentCallouts>>(() => view === 'agents' ? agentCallouts(visible, clockMs) : {}, [view, visible, clockMs])
  const rowsHeight = maxHeight ?? (view === 'agents' ? ROW_HEIGHT.agents * AGENT_ROWS : 640)
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
  const zoomFrame = useRef(0)
  const zoomTo = (row: FlowWaterfallRow) => {
    const span = row.span
    const current = viewAt(clockMs)
    const width = current.endMs - current.startMs
    const end = spanRunning(span) ? Math.max(span.endMs, clockMs) : span.endMs
    if (view !== 'spans' || !Number.isFinite(end) || (end - span.startMs) / Math.max(1, width) > 0.25) return
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
  const latest = useRef({ toggle: (_row: FlowWaterfallRow) => {}, pin: (_target: string, _element: HTMLElement, _x?: number) => {}, inspect: (_target: string, _element: HTMLElement, _x?: number) => {} })
  const toggleNow = (row: FlowWaterfallRow) => {
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
  const place = (target: string, element: HTMLElement, pinned: boolean, x?: number) => {
    const host = root.current?.getBoundingClientRect()
    if (!host) return
    const rect = element.getBoundingClientRect()
    const width = Math.min(CARD_WIDTH, host.width - 16)
    const left = Math.max(8, Math.min((x ?? rect.left + 24) - host.left - 24, host.width - width - 8))
    clearTimeout(hideTimer.current)
    setCard({ target, pinned, left, anchorTop: rect.top - host.top, anchorBottom: rect.bottom - host.top, above: view === 'agents' })
  }
  useLayoutEffect(() => {
    if (!card || card.fitted || !root.current) return
    const box = document.getElementById(cardId)?.getBoundingClientRect()
    if (!box) return
    const hostTop = root.current.getBoundingClientRect().top
    const room = { above: card.anchorTop - 16, below: globalThis.innerHeight - (hostTop + card.anchorBottom) - 16 }
    const preferred = card.above ? room.above : room.below
    const other = card.above ? room.below : room.above
    const above = box.height <= preferred || (box.height > other && preferred >= other) ? card.above : !card.above
    const floor = globalThis.innerHeight - hostTop - 8 - box.height
    const top = Math.max(Math.min(above ? card.anchorTop - 8 - box.height : card.anchorBottom + 8, floor), Math.max(8, 8 - hostTop))
    setCard({ ...card, fitted: true, above, top })
  }, [card, cardId])
  latest.current.inspect = (target, element, x) => { if (!card?.pinned) place(target, element, false, x) }
  const inspect = useCallback((target: string, element: HTMLElement, x?: number) => latest.current.inspect(target, element, x), [])
  const leave = useCallback(() => {
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setCard(previous => previous?.pinned ? previous : null), 140)
  }, [])
  useEffect(() => {
    if (!card || card.pinned) return
    const move = (event: PointerEvent) => {
      if (!(event.target as Element | null)?.closest('.fw-bar, .fw-seg, .fw-card')) leave()
    }
    document.addEventListener('pointermove', move)
    return () => document.removeEventListener('pointermove', move)
  }, [card, leave])
  latest.current.pin = (target, element, x) => {
    if (card?.pinned && card.target === target) { closeCard(); return }
    place(target, element, true, x)
    const row = byId.get(target)
    if (row) { onSelect?.(row.span); zoomTo(row) }
  }
  const pin = useCallback((target: string, element: HTMLElement, x?: number) => latest.current.pin(target, element, x), [])
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
  const scrubbing = position !== null || playing
  const at = scrubbing ? totalsAt(trace, clockMs) : undefined
  const { errors, summary } = summaryCells(trace, at, scrubbing ? clockMs : limit)
  const busy = agents.reduce((sum, row) => sum + busyMs(row, limit), 0)
  const speedup = limit > 0 ? busy / limit : 0
  const applyFilter = (label: string) => { setFilter(previous => previous === label || label === "__all" ? null : label); setView('agents') }
  const failedAgents = agents.filter(row => row.span.outcome ? row.span.outcome.tone === 'failed' : !row.ok).length
  const quietAgents = agents.filter(row => quietActivity(row, clockMs).quiet).length
  const recordedErrors = trace.spans.filter(span => spanFailed(span) && span.kind !== 'pipeline')
  const errorSpans = recordedErrors.length ? recordedErrors : trace.spans.filter(spanFailed)
  const errorTimes = Array.from({ length: errors }, (_, index) => errorSpans[index]?.endMs)
  const done = !isLive && !trace.spans.some(spanRunning)
  const shown = (row?: FlowWaterfallRow) => row && drawnRow(row, visible)
  const cardRow = shown(card ? byId.get(card.target) : undefined)
  const cardAgent = cardRow && (() => {
    for (let cursor: FlowWaterfallRow | undefined = cardRow; cursor; cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined) if (cursor.kind === 'pipeline') return shown(cursor)
    return undefined
  })()
  const moving = isLive || position !== null || playing
  const showCursor = moving || view === 'agents'
  const overviewMarks = useMemo(() => rows.filter(row => !row.parentId).flatMap(row => row.hasChildren ? row.segments : row.kind === 'pipeline' ? [] : [{ startMs: row.span.startMs, endMs: row.span.endMs, kind: row.ok ? 'tool' as const : 'failed' as const, tone: row.tone, id: row.id, count: 1, retry: false }]), [rows])
  const playback = (
    <PlaybackBar view={view} playing={playing} limit={limit} clockMs={clockMs} speed={speed} zoom={zoom} marks={overviewMarks}
      slider={slider} timeOutput={timeOutput} followLabel={position === null ? undefined : isLive ? 'Follow live' : 'Show full trace'}
      onTogglePlay={togglePlay} onRestart={() => { setPosition(0); setPlaying(false) }} onSpeed={setSpeed} onScrub={scrubTo}
      onFollow={() => { setPosition(null); setPlaying(false) }} onZoom={zoomBy} onFit={() => setZoom(null)} />
  )
  return (
    <section ref={root} data-flow-waterfall aria-label={label} className={`fw-root fw-root-${view} fw-fill-${agentFill}`} data-selection={selectedId ? '' : undefined}
      style={{ '--fw-name-w': `${nameWidth}px`, '--fw-pad': `${LANE_PAD}px`, '--fw-row-h': `${ROW_HEIGHT[view]}px`, '--fw-live': `var(${statusMeta('running').token})`, '--fw-failed': `var(${statusMeta('failed').token})`, '--fw-ok': `var(${statusMeta('done').token})`, '--fw-amber': `var(${statusMeta('needs-you').token})` } as CSSProperties}>
      <header className="fw-heading">
        <div className="fw-title-block">
          <div className="fw-title-line">
            <span className="fw-title-glyph" aria-hidden><TraceGlyph /></span>
            <h3 className="fw-title">{label}</h3>
            {description && <p className="fw-description" title={description}>{description}</p>}
            {/* The headline shares the title's line (one row less above the lanes); it says only what the stat strip cannot. */}
            {view === 'agents' && <p className="fw-headline" aria-live="polite">
              {agents.length} {agents.length === 1 ? 'agent' : 'agents'}{sharedDetail ? ` · ${agents.every(row => row.span.detail === sharedDetail) ? '' : 'mostly '}${sharedDetail}` : ''}{done && speedup >= 1.05 ? ` · ${speedup.toFixed(1)}x parallel` : ''}
            </p>}
            {failedAgents > 0 && <button type="button" className="fw-text-button fw-alert" aria-pressed={filter === '__errors'} onClick={() => applyFilter('__errors')}>{failedAgents} of {agents.length} failed</button>}
            {quietAgents > 0 && <button type="button" className="fw-text-button fw-quiet" aria-pressed={filter === "__quiet"} onClick={() => applyFilter("__quiet")}>{quietAgents} quiet</button>}
            {isLive && <span className="fw-state fw-state-live" data-motion="essential">Live</span>}
          </div>
          {/* One legend row: outcomes, then the bar-type key (round 24: stacked key bands read as clutter above the rows). */}
          <details className="fw-key" open={root.current ? root.current.clientWidth >= 600 : true}><summary>Key</summary><div className="fw-legends"><OutcomeLegend agents={agents} neutral={visible.some(row => row.kind === "pipeline" && !row.span.outcome)} selected={filter} onFilter={applyFilter} />{view === 'agents' && <KindLegend rows={rows} />}<MarkerLegend markers={markers} /></div></details>
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
          <dd className="fw-value" title={title}>{name === 'Errors' ? <button type="button" aria-pressed={filter === '__errors'} onClick={() => applyFilter('__errors')}>{value}</button> : value}</dd>
        </div>)}
      </dl>}
      {view === 'agents' && playback}
      <FlowBody rows={visible} byId={byId} totalRows={rows.length} view={view} maxHeight={rowsHeight} collapsed={collapsed} searching={Boolean(query.trim())} query={query} matchSpan={matchSpan}
        pauses={trace.pauses} errorTimes={errorTimes} cursorLine={isLive || position !== null || playing} sharedDetail={sharedDetail} sharedOutcome={sharedOutcome} expandedIds={view === 'agents' ? new Set([...openFamilies, ...openSteps]) : undefined} holdHeight={isLive} slowestId={slowest?.id ?? callouts.slowestId} costliestId={callouts.costliestId} criticalIds={criticalPath && view === 'spans' ? critical : undefined} activeId={activeId} selectedId={selection} focusId={cardAgent?.id ?? (view === 'agents' ? activeId : undefined)} clockMs={clockMs} window={win}
        trackPx={trackPx} showCursor={showCursor} markers={markers} fillByAgent={agentFill !== 'outcome'} zoomed={zoom !== null} renderIcon={renderIcon}
        emptyText={rows.length === 0 ? 'No spans yet. Waiting for trace events.' : `No matching steps for “${query}”.`}
        onToggle={toggle} onInspect={inspect} onLeave={leave} onPin={pin} onActivate={row => setActiveId(row.id)}
        onActiveChange={setActiveId} onScrub={scrubTo} onZoom={zoomBy} onPan={pan}
        nameWidth={nameWidth} onNameWidth={px => { resized.current = true; setNameWidth(Math.max(140, Math.min(560, px))) }} onTrack={setLaneElement}
        onExpandAll={rows.some(row => row.hasChildren) ? () => setCollapsed(new Set()) : undefined}
        onCollapseAll={() => setCollapsed(new Set(rows.filter(row => row.hasChildren).map(row => row.id)))} />
      {card && cardRow && <div className={`fw-card-anchor${card.above && card.top === undefined ? ' fw-card-above' : ''}`}
        onPointerEnter={() => clearTimeout(hideTimer.current)} onPointerLeave={card.pinned ? undefined : leave}>
        <SpanCard id={cardId} row={cardRow} agent={cardAgent} clockMs={clockMs} left={card.left} top={card.top ?? (card.above ? card.anchorTop - 8 : card.anchorBottom + 8)} pinned={card.pinned} onClose={closeCard} renderIcon={renderIcon} compact={view === 'agents'} />
      </div>}
      {view === 'spans' && playback}
    </section>
  )
}
