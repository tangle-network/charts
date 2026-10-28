import { useEffect, useMemo, useRef, useState } from 'react'
import { type FlowWaterfallRow, spanRunning } from './flow-waterfall-model.js'

export interface RowMotion { enter?: number; settle?: boolean }

const milliseconds = (style: CSSStyleDeclaration | undefined, token: string) => {
  const value = style?.getPropertyValue(token).trim() ?? ''
  return (parseFloat(value) || 0) * (value.endsWith('ms') ? 1 : 1000)
}

export function useRowMotion(rows: readonly FlowWaterfallRow[], element: HTMLElement | null): ReadonlyMap<string, RowMotion> {
  const style = element ? getComputedStyle(element) : undefined
  const hold = milliseconds(style, '--duration-arrive') + milliseconds(style, '--duration-stream')
  const stagger = milliseconds(style, '--stagger-step')
  const cap = stagger * 4
  const known = useRef<Set<string> | null>(null)
  const running = useRef(new Set<string>())
  const active = useRef(new Map<string, RowMotion & { until: number }>())
  const [expiry, setExpiry] = useState(0)

  const motion = useMemo(() => {
    const now = Date.now()
    for (const [id, entry] of active.current) if (entry.until <= now) active.current.delete(id)
    const previous = known.current
    let order = 0
    for (const row of rows) {
      const isRunning = spanRunning(row.span)
      if (!previous || !previous.has(row.id)) {
        active.current.set(row.id, { enter: Math.min(order++ * stagger, cap), until: now + hold + cap })
      } else if (running.current.has(row.id) && !isRunning) {
        active.current.set(row.id, { settle: true, until: now + hold })
      }
    }
    known.current = new Set(rows.map(row => row.id))
    running.current = new Set(rows.filter(row => spanRunning(row.span)).map(row => row.id))
    return new Map(active.current)

  }, [rows, expiry, element])

  useEffect(() => {
    if (motion.size === 0) return
    const timer = setTimeout(() => setExpiry(value => value + 1), hold + cap)
    return () => clearTimeout(timer)
  }, [motion, hold, cap])

  return motion
}
