import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ViewWindow } from './flow-waterfall-time.js'

export interface TraceClockInput {
  root: RefObject<HTMLElement | null>
  slider: RefObject<HTMLInputElement | null>
  /** Observed trace end; live traces advance past it until the next snapshot. */
  observedTotal: number
  live: boolean
  startedAt?: number
  /** Snapshot identity; a new snapshot re-anchors live time. */
  snapshot: unknown
  playing: boolean
  speed: number
  /** Null follows the trace end (live) or shows it whole (recorded). */
  position: number | null
  onPlaybackEnd: (positionMs: number | null) => void
  onTimeChange?: (positionMs: number) => void
  /** The visible window for a clock value; null zoom fits the trace. */
  view: (clockMs: number) => ViewWindow
  /** Timeline width in px available to bars. */
  trackPx: number
}

export interface TraceClock {
  /** Clock value at React's cadence (10 Hz while moving), for labels and totals. */
  clockMs: number
  /** Latest live end, read synchronously by playback and scrub handlers. */
  limitMs: () => number
  /** Playback position at frame cadence, for pause. */
  positionMs: () => number
}

const TEXT_INTERVAL_MS = 100

/** Drives the trace clock. Bars, the cursor and the axis read CSS variables written here every frame,
 * so live growth and playback cost no React render per frame; text updates at 10 Hz. */
export function useTraceClock(input: TraceClockInput): TraceClock {
  const { root, slider, observedTotal, live, snapshot, playing, position, view, trackPx } = input
  const [clockMs, setClockMs] = useState(position ?? observedTotal)
  const receivedAt = useRef(Date.now())
  const playhead = useRef(position ?? observedTotal)
  const geometry = useRef<Partial<Record<'--fw-t' | '--fw-v0' | '--fw-k', number>>>({})
  const latest = useRef(input)
  latest.current = input

  useEffect(() => { receivedAt.current = Date.now() }, [snapshot])
  const liveNow = () => {
    const { observedTotal: total, startedAt: origin, live: isLive } = latest.current
    if (!isLive) return total
    return Math.max(total, origin === undefined ? total + Date.now() - receivedAt.current : Date.now() - origin)
  }

  const paint = (t: number, limit = liveNow()) => {
    if (!root.current) return
    const { startMs, endMs } = latest.current.view(t)
    const k = Math.max(1e-9, latest.current.trackPx / Math.max(1, endMs - startMs))
    const following = latest.current.live && !latest.current.playing && latest.current.position === null
    for (const [name, value, scale] of [['--fw-t', t, k], ['--fw-v0', startMs, k], ['--fw-k', k, endMs - startMs]] as const) {
      const distance = Math.abs(value - (geometry.current[name] ?? NaN)) * scale
      if (following && Number.isFinite(distance) && distance < .25) continue
      root.current.style.setProperty(name, String(value)); geometry.current[name] = value
    }
    if (slider.current) { slider.current.max = String(Math.max(1, limit, t)); slider.current.value = String(t) }
  }

  useLayoutEffect(() => {
    if (position === clockMs) return
    if (position === null && playing) latest.current.onPlaybackEnd(null)
    playhead.current = position ?? (live ? liveNow() : observedTotal)
    paint(playhead.current); setClockMs(playhead.current)
  }, [position])
  useLayoutEffect(() => {
    if (!live && !playing) {
      const t = position ?? observedTotal
      paint(t)
      setClockMs(t)
      return
    }
    paint(playing ? playhead.current : position ?? liveNow())
    let frame = 0
    let last = performance.now()
    let lastText = 0
    const step = (now: number) => {
      const delta = now - last
      last = now
      let t: number
      const limit = liveNow()
      if (playing) {
        playhead.current = Math.min(limit, playhead.current + delta * latest.current.speed)
        t = playhead.current
        if (t >= limit && !latest.current.live) {
          paint(t, limit)
          setClockMs(t)
          latest.current.onPlaybackEnd(t)
          return
        }
      } else t = latest.current.position ?? limit
      paint(t, limit)
      if (now - lastText >= TEXT_INTERVAL_MS) { lastText = now; setClockMs(t); if (latest.current.playing) latest.current.onTimeChange?.(t) }
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
    // Fixed marks update with data; following live only repaints perceptible geometry drift.
  }, [live, playing, observedTotal, view, trackPx])

  return { clockMs, limitMs: liveNow, positionMs: () => playhead.current }
}
