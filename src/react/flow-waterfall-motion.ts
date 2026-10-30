import { useEffect, useMemo, useRef, useState } from 'react'
import { spanRunning } from './flow-waterfall-model.js'
import { tokenMilliseconds } from './agent-graph/run-ui-state.js'
import type { FlowSpan } from '../flow-trace.js'

export interface RowMotion { enter?: number; settle?: boolean }

export function useRowMotion(rows: readonly { id: string; span?: FlowSpan }[], element: HTMLElement | null): ReadonlyMap<string, RowMotion> {
  const hold = element ? tokenMilliseconds('--duration-arrive', element) + tokenMilliseconds('--duration-stream', element) : 0
  const stagger = element ? tokenMilliseconds('--stagger-step', element) : 0
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
      const isRunning = !!row.span && spanRunning(row.span)
      if (!previous || !previous.has(row.id)) {
        active.current.set(row.id, { enter: Math.min(order++ * stagger, cap), until: now + hold + cap })
      } else if (running.current.has(row.id) && !isRunning) {
        active.current.set(row.id, { settle: true, until: now + hold })
      }
    }
    known.current = new Set(rows.map(row => row.id))
    running.current = new Set(rows.filter(row => row.span && spanRunning(row.span)).map(row => row.id))
    return new Map(active.current)

  }, [rows, expiry, element])

  useEffect(() => {
    if (motion.size === 0) return
    const timer = setTimeout(() => setExpiry(value => value + 1), hold + cap)
    return () => clearTimeout(timer)
  }, [motion, hold, cap])

  return motion
}
