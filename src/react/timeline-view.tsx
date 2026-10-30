/** The static `timeline` in React, with lanes that fold by subtree. A parent lane's label is a toggle: a click, Enter
 * or Space folds its descendants away, and the folded lane's ticks and counts then total its subtree. */
import { type FocusEvent, type SyntheticEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { prepareTimeline, timeline, type TimelineLane, type TimelineOptions, type PreparedTimeline } from '../timeline.js'
import { FigureView, type FigureViewProps } from './figure-view.js'
import type { ChartMark } from '../events.js'
import { EventList, Tooltip, type Tip, useWidth } from './live-presentation.js'

export interface TimelineViewProps {
  lanes: TimelineLane[]
  options: Omit<TimelineOptions, 'collapsed'>
  /** Lane ids folded on first render, such as every lead on a large team. */
  defaultCollapsed?: string[]
  presentation?: FigureViewProps['presentation']
}

export function TimelineView({ lanes, options, defaultCollapsed = [], presentation }: TimelineViewProps) {
  const [collapsed, setCollapsed] = useState<string[]>(defaultCollapsed)
  const box = useRef<HTMLDivElement>(null)
  // The plot is markup, so a fold replaces the toggle; focus returns to the toggle with the same lane id.
  const refocus = useRef<string | null>(null)
  // Drawn at the container's width, so a wide page keeps lane labels and ticks at their set size.
  const figure = useMemo(() => (width: number) => timeline(lanes, { ...options, collapsed, width }), [lanes, options, collapsed])
  useEffect(() => {
    const id = refocus.current
    refocus.current = null
    if (id === null || !box.current) return
    const toggle = Array.from(box.current.querySelectorAll<SVGElement>('[data-toggle]')).find((element) => element.getAttribute('data-toggle') === id)
    toggle?.focus()
  }, [figure])
  const fold = (target: EventTarget, keyboard: boolean) => {
    const id = target instanceof Element ? target.closest('[data-toggle]')?.getAttribute('data-toggle') : null
    if (!id) return false
    if (keyboard) refocus.current = id
    setCollapsed((list) => list.includes(id) ? list.filter((other) => other !== id) : [...list, id])
    return true
  }
  return (
    <div ref={box} className="tgc-timeline-view" onClick={(event) => fold(event.target, false)}
      onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && fold(event.target, true)) event.preventDefault() }}>
      <FigureView figure={figure} presentation={presentation} />
    </div>
  )
}


const NO_MARKS: ChartMark[] = [], NO_DATA = ['missing', 'untraced']

/** Gantt/useLaneActions size exception: one controller preserves native lane/mark identity across live SVG and viewport updates. */
export function Gantt({ rows, lanes: laneInput, colors, axis, span, marks = NO_MARKS, now, hatch = NO_DATA, selectedId, onSelect, bestMark, maxHeight }: { selectedId?: string; onSelect?: (id: string) => void; bestMark?: string; maxHeight?: number; rows?: { label: string; start: number; end: number; state: string; note?: string }[]; lanes?: TimelineLane[]; colors: Record<string, string>; axis: (t: number) => string; span: (start: number, end: number) => string; marks?: ChartMark[]; now?: number; hatch?: string[] }) {
  const [ref, width, em] = useWidth<HTMLDivElement>(), scroller = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0), [tip, setTip] = useState<Tip | null>(null)
  const model = useMemo(() => {
    const lanes: TimelineLane[] = laneInput ?? (rows ?? []).map((row, i) => ({ id: `${row.label}-${i}`, label: row.label, spans: [{ start: row.start, end: row.end, state: row.state, note: row.note }] }))
    const prepared = prepareTimeline(lanes, { measure: 'Agent activity', formatTime: axis, now, hatch, marks }, { gantt: true, legacy: !laneInput, span })
    if ('refused' in prepared) {
      if (laneInput && lanes.some(lane => lane.spans.length)) throw new RangeError(prepared.refused)
      return null
    }
    return { ...prepared, lanes }
  }, [laneInput, rows, axis, span, now, hatch, marks])
  const view = { em, scrollTop, maxHeight, selectedId, selectable: Boolean(onSelect), colors, bestMark }, plot = model?.plot(width, view)
  const { hover, key, captureFocus } = useLaneActions(model, plot, scroller, setScrollTop, setTip, { span, now, colors, em, onSelect })
  if (!model || !model.lanes.some(lane => lane.spans.length)) return <p className="ov-empty">No agent has started.</p>
  const header = maxHeight ? model.plot(width, { ...view, header: true }) : null
  return <div ref={ref} className="ov-plot ov-gantt tgc-figure tgc-figure-chart" data-featured={bestMark ? true : undefined} onMouseLeave={() => setTip(null)} onMouseMove={hover} onFocus={captureFocus} onKeyDown={key}
    onClick={event => { const row = event.target instanceof Element ? event.target.closest('[data-lane-index]') : null; if (row) onSelect?.(row.getAttribute('data-lane')!) }}>
    {header && width > 0 && <svg width={width} height={header.height} aria-label="Releases and time axis" dangerouslySetInnerHTML={{ __html: header.body }} />}
    <div ref={scroller} className="ov-gantt-scroll" style={{ maxHeight, overflow: maxHeight ? 'auto' : undefined }} onScroll={event => { if (event.currentTarget.scrollTop !== scrollTop) { setScrollTop(event.currentTarget.scrollTop); setTip(null) } }}>
      {width > 0 && plot && <svg width={width} height={plot.height} role={onSelect ? 'group' : 'img'} aria-label={`${model.rowIds.length} ${laneInput ? 'lanes' : 'agents'} over time`} dangerouslySetInnerHTML={{ __html: plot.body }} />}
    </div>
    <Tooltip tip={tip} /><EventList marks={marks} bands={[]} format={axis} />
  </div>
}


type LaneModel = PreparedTimeline & { lanes: TimelineLane[] }
function useLaneActions(model: LaneModel | null, plot: ReturnType<LaneModel['plot']> | undefined, scroller: React.RefObject<HTMLDivElement | null>, setScrollTop: (value: number) => void, setTip: (tip: Tip | null) => void, { span, now, colors, em, onSelect }: { onSelect?: (id: string) => void; span: (start: number, end: number) => string; now?: number; colors: Record<string, string>; em: number }) {
  const focus = useRef<{ id: string; mark: boolean; restoring?: boolean; reveal?: boolean } | null>(null)
  useLayoutEffect(() => {
    const root = scroller.current?.parentElement
    if (!focus.current || !root || (document.activeElement !== document.body && !root.contains(document.activeElement))) return
    const row = [...root.querySelectorAll<SVGGElement>(focus.current.mark ? '[data-mark-id]' : '[data-lane]')].find(row => row.getAttribute(focus.current!.mark ? 'data-mark-id' : 'data-lane') === focus.current!.id)
    if (row && row !== document.activeElement) { focus.current.restoring = true; row.focus({ preventScroll: true }); focus.current.restoring = false }
  }, [plot?.body])
  const hover = (event: SyntheticEvent<HTMLDivElement>) => {
    if (!model) return
    const target = event.target instanceof Element ? event.target : null, row = target?.closest<SVGGElement>('[data-lane-index]')
    const lane = model.lanes.find(lane => lane.id === row?.dataset.lane)
    if (!row || !lane) return
    const index = target?.closest<SVGElement>('[data-span-index]')?.dataset.spanIndex
    const shown = index === undefined ? lane.spans : [lane.spans[Number(index)]!], point = target!.getBoundingClientRect(), root = event.currentTarget.getBoundingClientRect()
    setTip({ x: point.right - root.left + 8, y: point.top - root.top - em, title: lane.label, lines: shown.flatMap(s => [{ label: s.end === null ? `${s.state} (open)` : s.state, value: span(s.start, s.end ?? now!), color: colors[s.state] ?? colors.unknown }, ...(s.note ? [{ label: s.note, value: '' }] : []), ...(s.endLabel ? [{ label: 'Duration / cost', value: s.endLabel }] : [])]) })
  }
  const key = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!model) return
    const row = event.target instanceof Element ? event.target.closest<SVGGElement>('[data-lane-index]') : null
    if (!row) return
    const i = Number(row.dataset.laneIndex), next = ({ ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: model.rowIds.length - 1 } as Record<string, number>)[event.key]
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect?.(row.dataset.lane!) }
    if (next === undefined || !plot) return
    event.preventDefault()
    const at = Math.max(0, Math.min(model.rowIds.length - 1, next)), position = at === 0 ? 0 : plot.top + (at - 1) * plot.rowHeight
    focus.current = { id: model.rowIds[at]!, mark: false, reveal: true }
    if (scroller.current) {
      scroller.current.scrollTop = position
      ;[...scroller.current.querySelectorAll<SVGGElement>('[data-lane-index]')].find(row => Number(row.dataset.laneIndex) === at)?.focus({ preventScroll: true })
    }
    setScrollTop(scroller.current?.scrollTop ?? Math.max(0, position))
    if (at === i) { hover(event); focus.current.reveal = false }
  }
  const captureFocus = (event: FocusEvent<HTMLDivElement>) => {
    if (focus.current?.restoring && !focus.current.reveal) return
    const node = event.target.closest('[data-lane], [data-mark-id]')
    if (node) focus.current = { id: node.getAttribute('data-lane') ?? node.getAttribute('data-mark-id')!, mark: node.hasAttribute('data-mark-id') }
    hover(event)
  }
  return { hover, key, captureFocus }
}
