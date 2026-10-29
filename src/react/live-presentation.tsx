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
  x: number
  y: number
  title: string
  lines: { label: string; value: string; color?: string }[]
}

export function Tooltip({ tip }: { tip: Tip | null }) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  useLayoutEffect(() => {
    const node = ref.current, parent = node?.parentElement
    if (!tip || !node || !parent) return
    const place = () => {
      const next = { left: Math.max(0, Math.min(tip.x, parent.clientWidth - node.offsetWidth)), top: Math.max(0, Math.min(tip.y, parent.clientHeight - node.offsetHeight)) }
      setPosition(old => old.left === next.left && old.top === next.top ? old : next)
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(node); observer.observe(parent)
    return () => observer.disconnect()
  }, [tip])
  if (!tip) return null
  return (
    <div ref={ref} className="ov-tip" role="tooltip" style={position}>
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

