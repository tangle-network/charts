import { useEffect, useMemo, useRef, useState } from 'react'
import { type FlowWaterfallRow, spanRunning } from './flow-waterfall-model.js'

/** How one row moves this render: `enter` is its stagger delay in ms when it just arrived; `settle` when it just finished. */
export interface RowMotion { enter?: number; settle?: boolean }

const HOLD_MS = 700
const STAGGER_MS = 20
const STAGGER_CAP_MS = 200

/**
 * Grow, unfold and settle. Rows that arrived since the last change (a live span, an unfolded branch, the first paint) grow
 * from their start in a short stagger; a row that stops running settles. Motion is keyed to the row set, not to what is
 * mounted, so scrolling a virtualized tree never replays it; an entry expires after its animation so a remount stays still.
 */
export function useRowMotion(rows: readonly FlowWaterfallRow[]): ReadonlyMap<string, RowMotion> {
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
        active.current.set(row.id, { enter: Math.min(order++ * STAGGER_MS, STAGGER_CAP_MS), until: now + HOLD_MS + STAGGER_CAP_MS })
      } else if (running.current.has(row.id) && !isRunning) {
        active.current.set(row.id, { settle: true, until: now + HOLD_MS })
      }
    }
    known.current = new Set(rows.map(row => row.id))
    running.current = new Set(rows.filter(row => spanRunning(row.span)).map(row => row.id))
    return new Map(active.current)
    // `expiry` is a dependency only to re-run the pass once the held entries have played out.
  }, [rows, expiry])

  useEffect(() => {
    if (motion.size === 0) return
    const timer = setTimeout(() => setExpiry(value => value + 1), HOLD_MS + STAGGER_CAP_MS + 20)
    return () => clearTimeout(timer)
  }, [motion])

  return motion
}
