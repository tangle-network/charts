import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatSpanDuration } from './flow-waterfall-model.js'
import type { ViewWindow } from './flow-waterfall-time.js'

export interface TraceClockInput {
  root: RefObject<HTMLElement | null>
  slider: RefObject<HTMLInputElement | null>
  timeOutput: RefObject<HTMLOutputElement | null>
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
  onPlaybackEnd: (positionMs: number) => void
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
  const { root, slider, timeOutput, observedTotal, live, startedAt, snapshot, playing, speed, position, onPlaybackEnd, view, trackPx } = input
  const [clockMs, setClockMs] = useState(position ?? observedTotal)
  const receivedAt = useRef(Date.now())
  const playhead = useRef(position ?? observedTotal)
  const geometry = useRef({ t: NaN, startMs: NaN, endMs: NaN })
  const latest = useRef(input)
  latest.current = input

  useEffect(() => { receivedAt.current = Date.now() }, [snapshot])
  const liveNow = () => {
    const { observedTotal: total, startedAt: origin, live: isLive } = latest.current
    if (!isLive) return total
    return Math.max(total, origin === undefined ? total + Date.now() - receivedAt.current : Date.now() - origin)
  }

  const paint = (t: number, limit = liveNow(), force = false) => {
    const element = root.current
    if (!element) return
    const { startMs, endMs } = latest.current.view(t)
    const k = Math.max(1e-9, latest.current.trackPx / Math.max(1, endMs - startMs))
    const previous = geometry.current, distance = Math.max(Math.abs(t - previous.t), Math.abs(startMs - previous.startMs), Math.abs(endMs - previous.endMs)) * k
    if (force || !latest.current.live || latest.current.playing || latest.current.position !== null || !Number.isFinite(distance) || distance >= .25) {
      element.style.setProperty('--fw-t', String(t)); element.style.setProperty('--fw-v0', String(startMs)); element.style.setProperty('--fw-k', String(k))
      geometry.current = { t, startMs, endMs }
    }
    if (slider.current) { slider.current.max = String(Math.max(1, limit, t)); slider.current.value = String(t) }
    if (timeOutput.current) timeOutput.current.textContent = formatSpanDuration(t)
  }

  useLayoutEffect(() => {
    if (position !== null) playhead.current = position
    const moving = live || playing
    if (!moving) {
      const t = position ?? observedTotal
      paint(t, undefined, true)
      setClockMs(t)
      return
    }
    paint(playing ? playhead.current : position ?? liveNow(), undefined, true)
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
      if (now - lastText >= TEXT_INTERVAL_MS) { lastText = now; setClockMs(t) }
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
    // Snapshots, zoom and resize repaint immediately; subpixel live drift does not invalidate every recorded mark.
  }, [live, playing, position, observedTotal, snapshot, view, trackPx])

  return { clockMs, limitMs: liveNow, positionMs: () => playhead.current }
}
