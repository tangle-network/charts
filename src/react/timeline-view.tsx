/** The static `timeline` in React, with lanes that fold by subtree. A parent lane's label is a toggle: a click, Enter
 * or Space folds its descendants away, and the folded lane's ticks and counts then total its subtree. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { timeline, type TimelineLane, type TimelineOptions } from '../timeline.js'
import { FigureView, type FigureViewProps } from './figure-view.js'

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
  const figure = useMemo(() => timeline(lanes, { ...options, collapsed }), [lanes, options, collapsed])
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
