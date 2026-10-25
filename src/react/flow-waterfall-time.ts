/** Time-axis geometry for the trace inspector: clock-aligned steps, labels and the zoom window. */

const STEPS = [
  1, 2, 5, 10, 20, 50, 100, 200, 500,
  1_000, 2_000, 5_000, 10_000, 15_000, 30_000,
  60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000,
  3_600_000, 7_200_000, 10_800_000, 21_600_000, 43_200_000, 86_400_000,
]

/** The smallest clock-aligned step that keeps labels at least `minGapPx` apart. */
export function clockStepMs(msPerPx: number, minGapPx = 72): number {
  const want = msPerPx * minGapPx
  return STEPS.find(step => step >= want) ?? Math.ceil(want / 86_400_000) * 86_400_000
}

/** Tick positions covering [startMs, endMs]. */
export function clockTicks(startMs: number, endMs: number, widthPx: number, minGapPx = 72): number[] {
  if (!(widthPx > 0) || !(endMs > startMs)) return [0]
  const step = clockStepMs((endMs - startMs) / widthPx, minGapPx)
  const ticks: number[] = []
  for (let t = Math.ceil(startMs / step) * step; t <= endMs && ticks.length < 400; t += step) ticks.push(t)
  return ticks
}

/** 0s, 500ms, 20s, 1m 30s, 2h, 1h 15m: an axis label at the step's own precision. */
export function formatClock(ms: number): string {
  if (ms === 0) return '0s'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${+(ms / 1000).toFixed(1)}s`
  if (ms < 3_600_000) {
    const m = Math.floor(ms / 60_000), s = Math.round((ms % 60_000) / 1000)
    return s ? `${m}m ${s}s` : `${m}m`
  }
  const h = Math.floor(ms / 3_600_000), m = Math.round((ms % 3_600_000) / 60_000)
  return m ? `${h}h ${m}m` : `${h}h`
}

export interface ViewWindow { startMs: number; endMs: number }

/** Zoom about an anchor time; the window never inverts, never narrows below 50 ms and never leaves [0, limit]. */
export function zoomWindow(view: ViewWindow, factor: number, anchorMs: number, limitMs: number): ViewWindow {
  const span = view.endMs - view.startMs
  const next = Math.min(Math.max(50, span * factor), Math.max(limitMs, 50))
  const ratio = span > 0 ? (anchorMs - view.startMs) / span : 0.5
  return clampWindow({ startMs: anchorMs - ratio * next, endMs: anchorMs - ratio * next + next }, limitMs)
}

export function clampWindow(view: ViewWindow, limitMs: number): ViewWindow {
  const span = view.endMs - view.startMs
  let start = Math.max(0, view.startMs)
  if (start + span > limitMs) start = Math.max(0, limitMs - span)
  return { startMs: start, endMs: start + span }
}
