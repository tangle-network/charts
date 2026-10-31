import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { type ChartBand, type ChartMark, markName } from '../events.js'

/** The rendered width and font size of an element, so an SVG chart draws at its real size and its geometry follows
 * the page's type. */
export function useWidth<T extends HTMLElement>() {
  // A callback ref: a chart that first renders its empty message (no element) starts measuring when its plot mounts.
  const [element, ref] = useState<T | null>(null)
  const [size, setSize] = useState({ width: 0, em: 16 })
  useEffect(() => {
    if (!element) return
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: Math.floor(entry!.contentRect.width), em: parseFloat(getComputedStyle(element).fontSize) || 16 }),
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])
  return [ref, size.width, size.em] as const
}


export interface Tip {
  x: number; y: number; scrollTop?: number
  title: string
  lines: { label: string; value: string; color?: string }[]
}

export function Tooltip({ tip }: { tip: Tip | null }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const node = ref.current, parent = node?.parentElement, view = node?.ownerDocument.defaultView
    if (!tip || !node || !parent || !view) return
    const place = () => {
      const box = parent.getBoundingClientRect()
      node.style.transform = `translate(${Math.max(8, Math.min(box.left + tip.x, view.innerWidth - node.offsetWidth - 8))}px, ${Math.max(8, Math.min(box.top + tip.y, view.innerHeight - node.offsetHeight - 8))}px)`
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(node); observer.observe(parent)
    view.addEventListener('scroll', place, true); view.addEventListener('resize', place)
    return () => { observer.disconnect(); view.removeEventListener('scroll', place, true); view.removeEventListener('resize', place) }
  }, [tip])
  if (!tip) return null
  return (
    <div ref={node => { ref.current = node; node?.showPopover?.() }} className="ov-tip" role="tooltip" popover="manual">
      <strong>{tip.title}</strong>
      {tip.lines.map((line, i) => (
        <span key={`${line.label}:${i}`} className="ov-tip-line">
          <span>{line.color && <i style={{ background: line.color }} />}{line.label}</span>
          <b>{line.value}</b>
        </span>
      ))}
    </div>
  )
}


export function EventList({ marks, bands, format }: { marks: ChartMark[]; bands: ChartBand[]; format: (t: number) => string }) {
  if (!marks.length && !bands.length) return null
  const items = [
    ...marks.map((m) => ({ at: m.at, kind: m.kind, text: `${markName(m)} · ${format(m.at)}${m.verdict ? ` · ${m.verdict}` : ''}` })),
    ...bands.map((b) => ({ at: b.from, kind: b.kind, text: `${b.label} · ${format(b.from)} to ${format(b.to)}${b.kind === 'missing' ? ' · no data' : ''}` })),
  ].sort((a, b) => a.at - b.at)
  return (
    <ul className="ov-events" aria-label="Recorded events">
      {items.map((item, i) => (
        <li key={i} data-kind={item.kind}>
          <i className={`ov-event-swatch ov-event-${item.kind}`} aria-hidden="true" />
          {item.text}
        </li>
      ))}
    </ul>
  )
}

