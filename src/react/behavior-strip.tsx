/**
 * Rows of agents, columns of time windows, one canvas: what every agent was doing in each window of a run, release markers
 * across the rows and message ticks on them. Three hues read as reading, writing and verifying, textures tell sub-classes apart,
 * looping takes the serious colour, thinking, running and uncalibrated classes the neutral ladder; rows past 40 are windowed.
 */
import { type CSSProperties, type KeyboardEvent, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { resolveColors } from './dot-map.js'
import { type Tip, Tooltip, useWidth } from './live-presentation.js'

/** Hues read as reading, writing and verifying; `neutral` is a ladder step, `serious` the status colour reserved for looping, `event` a tick. */
export type BehaviorFamily = 'reading' | 'writing' | 'verifying' | 'neutral' | 'serious' | 'event'
/** Textures tell sub-classes of one family apart; `outline` is a dashed box with no fill. */
export type BehaviorTexture = 'solid' | 'hatch' | 'dots' | 'outline'
export interface BehaviorCategoryStyle { family: BehaviorFamily; texture: BehaviorTexture; label: string; step?: 1 | 2 | 3; glyph?: string }
export interface BehaviorCalibration { calibrated: boolean; auc?: number | null; ci?: readonly number[] | null; n?: number }
export interface BehaviorPaint extends BehaviorCategoryStyle { category: string; uncalibrated: boolean }
export interface BehaviorStripRow { id: string; label: string; windows: readonly (string | null)[] }
/** A release: a dashed rule across every row, named with its verdict. */
export interface BehaviorStripMarker { at: number; label: string; verdict?: 'pass' | 'fail' | 'unknown' }
/** A message an agent sent: a tick on its row. */
export interface BehaviorStripEvent { rowId: string; at: number; label?: string }
/** `startedAt` is epoch ms of window 0. A category `calibration` does not mark calibrated draws in the neutral ladder with the badge; omit the
 * table to assert nothing. `live` appends new windows at a fixed cell width, so earlier cells never move. */
export interface BehaviorStripProps {
  label: string; rows: readonly BehaviorStripRow[]; windowMs: number; startedAt: number; markers?: readonly BehaviorStripMarker[]; events?: readonly BehaviorStripEvent[]
  calibration?: Readonly<Record<string, BehaviorCalibration>>; selected?: { rowId: string; windowIndex: number } | null; onSelect?: (rowId: string, windowIndex: number) => void
  renderRowLabel?: (row: BehaviorStripRow) => ReactNode; live?: boolean
}

/** The storyboard's categories; an unknown category draws as neutral step 3 named by itself. */
export const BEHAVIOR_CATEGORIES: Readonly<Record<string, BehaviorCategoryStyle>> = {
  exploring: { family: 'reading', texture: 'solid', label: 'exploring (reads, search, knowledge)' },
  reviewing: { family: 'reading', texture: 'hatch', label: 'reviewing another agent' },
  implementing: { family: 'writing', texture: 'solid', label: 'implementing (code edits)' },
  process_files: { family: 'writing', texture: 'hatch', label: 'writing process files, not code' },
  integrating: { family: 'writing', texture: 'dots', label: 'integrating (commit, push, tag)' },
  verifying: { family: 'verifying', texture: 'solid', label: 'verifying (tests, probes, timing)' },
  building: { family: 'verifying', texture: 'hatch', label: 'building (cargo build / check)' },
  thinking: { family: 'neutral', texture: 'solid', step: 1, label: 'thinking / narrating' },
  running: { family: 'neutral', texture: 'solid', step: 2, label: 'running other commands' },
  idle: { family: 'neutral', texture: 'outline', label: 'idle ≥ 10 min' },
  looping: { family: 'serious', texture: 'solid', glyph: '↻', label: 'looping on a failing command (≥3 fails)' },
  communicating: { family: 'event', texture: 'solid', glyph: '|', label: 'communicating (steer, spawn, record, report)' },
  inbound: { family: 'event', texture: 'solid', glyph: '▾', label: 'message received (brief or steer)' },
}
/** How a category is painted: with a `calibration` table, a hue-family category it does not mark calibrated goes to neutral step 3 with the badge. */
export function behaviorPaint(category: string, calibration?: Readonly<Record<string, BehaviorCalibration>>): BehaviorPaint {
  const style = BEHAVIOR_CATEGORIES[category] ?? { family: 'neutral' as const, texture: 'solid' as const, step: 3 as const, label: category }
  const uncalibrated = calibration !== undefined && style.family !== 'event' && style.family !== 'neutral' && calibration[category]?.calibrated !== true
  return { ...style, category, uncalibrated, ...(uncalibrated ? { family: 'neutral' as const, step: 3 as const } : {}) }
}
/** Rows above this count are windowed: only the rows near the scroll position are mounted and drawn. */
export const STRIP_VIRTUAL_ROWS = 40
/** The rows a scroll position shows, with `overscan` rows either side. */
export function stripWindow(rowCount: number, scrollTop: number, rowHeight: number, visibleRows: number, overscan = 4): { start: number; end: number; virtual: boolean } {
  if (rowCount <= STRIP_VIRTUAL_ROWS) return { start: 0, end: rowCount, virtual: false }
  const start = Math.max(0, Math.min(rowCount - 1, Math.floor(scrollTop / rowHeight) - overscan))
  return { start, end: Math.min(rowCount, start + visibleRows + 2 * overscan), virtual: true }
}
/** Minutes per category over a row's windows, most first; null windows (not alive) count nothing. */
export function categoryMinutes(windows: readonly (string | null)[], windowMs: number): Array<[string, number]> {
  const counts = new Map<string, number>()
  for (const category of windows) if (category) counts.set(category, (counts.get(category) ?? 0) + 1)
  return [...counts].map(([category, n]): [string, number] => [category, Math.round((n * windowMs) / 6000) / 10]).sort((a, b) => b[1] - a[1])
}
/** A row's accessible name: its label, then its top three categories in minutes. */
export function rowLabel(label: string, windows: readonly (string | null)[], windowMs: number): string {
  const top = categoryMinutes(windows, windowMs).slice(0, 3).map(([category, minutes]) => `${category} ${minutes} min`)
  return `${label}: ${top.join(', ') || 'no recorded windows'}`
}
/** Where a key moves the window cursor, or null for a key the cursor ignores. */
export function moveCursor(key: string, cursor: number, windowCount: number): number | null {
  const last = Math.max(0, windowCount - 1)
  return key === 'ArrowRight' ? Math.min(last, cursor + 1) : key === 'ArrowLeft' ? Math.max(0, cursor - 1) : key === 'Home' ? 0 : key === 'End' ? last : null
}
/** Clock labels along the strip: the fewest whole-window steps whose labels are at least `minPx` apart. */
export function timeTicks(startedAt: number, windowMs: number, windowCount: number, cellWidth: number, minPx = 72): Array<{ index: number; label: string }> {
  const step = Math.max(1, Math.ceil(minPx / Math.max(cellWidth, 0.01))), ticks = []
  for (let index = 0; index < windowCount; index += step) ticks.push({ index, label: clock(startedAt + index * windowMs) })
  return ticks
}

const ROW = 16, HEAD = 28, [INK, MUTED, SURFACE, HOVER, FAINT] = [7, 8, 9, 10, 11]
const ROLES = [...['reading', 'writing', 'verifying', 'serious', 'neutral-1', 'neutral-2', 'neutral-3'].map(slot => `var(--tgc-behavior-${slot})`), 'var(--chart-live-fg, var(--text-primary))', 'var(--chart-live-muted, var(--text-muted))', 'var(--chart-live-surface, var(--bg-card))', 'var(--chart-live-hover, var(--bg-hover))', 'var(--chart-live-faint, var(--text-dim))']
const clock = (t: number) => `${new Date(t).toISOString().slice(11, 16)}Z`
/** The role a paint fills with: its family's hue, or its neutral step; events use the ink. */
const roleOf = (paint: BehaviorPaint) => paint.family === 'neutral' ? 3 + (paint.step ?? 3) : paint.family === 'event' ? INK : ['reading', 'writing', 'verifying', 'serious'].indexOf(paint.family)

/** A 4 px tile of hatch lines or dots in one colour, in CSS pixels whatever the device ratio. */
function texturePattern(ctx: CanvasRenderingContext2D, color: string, texture: 'hatch' | 'dots', dpr: number): CanvasPattern | null {
  const size = 4, tile = document.createElement('canvas'), t = tile.getContext('2d')
  tile.width = tile.height = size * dpr
  if (!t) return null
  t.scale(dpr, dpr)
  t.strokeStyle = t.fillStyle = color
  t.beginPath()
  if (texture === 'hatch') { for (const [x0, y0, x1, y1] of [[0, size, size, 0], [-1, 1, 1, -1], [size - 1, size + 1, size + 1, size - 1]]) { t.moveTo(x0!, y0!); t.lineTo(x1!, y1!) } t.stroke() }
  else { t.arc(size / 2, size / 2, 1, 0, Math.PI * 2); t.fill() }
  const pattern = ctx.createPattern(tile, 'repeat')
  pattern?.setTransform(new DOMMatrix().scale(1 / dpr))
  return pattern
}

export function BehaviorStrip({ label, rows, windowMs, startedAt, markers = [], events = [], calibration, selected, onSelect, renderRowLabel, live = false }: BehaviorStripProps) {
  const [measure, width] = useWidth<HTMLDivElement>()
  const box = useRef<HTMLDivElement>(null), pane = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null)
  const top = useRef(0), frame = useRef(0), frozen = useRef(0), colors = useRef({ key: '', list: [] as string[] }), patterns = useRef(new Map<string, CanvasPattern | null>())
  const [start, setStart] = useState(0), [cursor, setCursor] = useState<{ row: number; window: number } | null>(null), [target, setTarget] = useState<number | null>(null), [tip, setTip] = useState<Tip | null>(null)
  const labelW = width > 0 && width < 600 ? 120 : 208, plotW = Math.max(0, width - labelW)
  const nwin = useMemo(() => rows.reduce((max, row) => Math.max(max, row.windows.length), 0), [rows])
  if (live && !frozen.current && plotW && nwin) frozen.current = Math.max(1, plotW / nwin)
  const cw = live && frozen.current ? frozen.current : Math.max(1, plotW / Math.max(1, nwin)), shown = Math.min(rows.length, STRIP_VIRTUAL_ROWS), paneH = shown * ROW
  const paints = useMemo(() => new Map<string, BehaviorPaint>(), [calibration])
  const paintOf = (category: string) => paints.get(category) ?? paints.set(category, behaviorPaint(category, calibration)).get(category)!
  const indexOf = useMemo(() => new Map(rows.map((row, i) => [row.id, i])), [rows])
  const eventsByRow = useMemo(() => { const map = new Map<number, BehaviorStripEvent[]>(); for (const event of events) { const i = indexOf.get(event.rowId); if (i !== undefined) (map.get(i) ?? map.set(i, []).get(i)!).push(event) } return map }, [events, indexOf])
  const used = useMemo(() => { const present = new Set(rows.flatMap(row => row.windows.filter((c): c is string => !!c))); return [...Object.keys(BEHAVIOR_CATEGORIES).filter(c => present.has(c)), ...[...present].filter(c => !(c in BEHAVIOR_CATEGORIES))] }, [rows])
  const at = (t: number) => Math.round(((t - startedAt) / windowMs) * cw) + 0.5

  const draw = useCallback(() => {
    frame.current = 0
    const element = canvas.current, host = box.current, ctx = element?.getContext('2d')
    if (!element || !host || !ctx || !plotW) return
    const started = performance.now(), dpr = window.devicePixelRatio || 1, height = HEAD + paneH, key = `${plotW}:${dpr}`
    if (element.width !== Math.round(plotW * dpr) || element.height !== Math.round(height * dpr)) { element.width = Math.round(plotW * dpr); element.height = Math.round(height * dpr) }
    if (colors.current.key !== key) { colors.current = { key, list: resolveColors(host, ROLES) }; patterns.current.clear() }
    const c = colors.current.list, scroll = top.current, { start: first, end } = stripWindow(rows.length, scroll, ROW, shown), rowY = (r: number) => HEAD + r * ROW - scroll
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, plotW, height)
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
    ctx.lineWidth = 1
    for (const tick of timeTicks(startedAt, windowMs, nwin, cw)) {
      const x = Math.round(tick.index * cw) + 0.5
      ctx.strokeStyle = c[FAINT]!; ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.moveTo(x, HEAD - 4); ctx.lineTo(x, height); ctx.stroke(); ctx.globalAlpha = 1
      ctx.fillStyle = c[MUTED]!; ctx.fillText(tick.label, x + 2, HEAD - 7)
    }
    const selectedRow = selected ? indexOf.get(selected.rowId) : undefined
    ctx.save(); ctx.beginPath(); ctx.rect(0, HEAD, plotW, paneH); ctx.clip()
    if (selectedRow !== undefined) { ctx.fillStyle = c[HOVER]!; ctx.fillRect(0, rowY(selectedRow), plotW, ROW) }
    // One path per paint, so thousands of cells fill in a handful of calls; a glyph travels with its cell.
    const groups = new Map<string, { paint: BehaviorPaint; path: Path2D; glyphs: Array<[number, number, string]> }>(), ticks = new Path2D(), w = Math.max(1, cw - (cw > 3 ? 1 : 0))
    for (let r = first; r < end; r++) {
      const y = rowY(r), windows = rows[r]!.windows
      for (let i = 0; i < windows.length; i++) {
        const category = windows[i]
        if (!category) continue
        const paint = paintOf(category)
        if (paint.family === 'event') { const x = Math.round(i * cw + cw / 2) + 0.5; ticks.moveTo(x, y + 2); ticks.lineTo(x, y + ROW - 2); continue }
        const id = `${paint.family}:${paint.step ?? 0}:${paint.texture}`, group = groups.get(id) ?? groups.set(id, { paint, path: new Path2D(), glyphs: [] }).get(id)!
        group.path.rect(i * cw, y + 1, w, ROW - 2)
        if (paint.glyph && cw >= 7) group.glyphs.push([i * cw + cw / 2, y + ROW - 4, paint.glyph])
      }
      for (const event of eventsByRow.get(r) ?? []) { ticks.moveTo(at(event.at), y + 1); ticks.lineTo(at(event.at), y + ROW - 1) }
    }
    for (const { paint, path, glyphs } of groups.values()) {
      const color = c[roleOf(paint)]!
      if (paint.texture === 'outline') { ctx.setLineDash([2, 2]); ctx.strokeStyle = c[FAINT]!; ctx.stroke(path); ctx.setLineDash([]) }
      else if (paint.texture === 'solid') { ctx.fillStyle = color; ctx.fill(path) }
      else {
        const pattern = patterns.current.get(`${paint.texture}:${color}`) ?? patterns.current.set(`${paint.texture}:${color}`, texturePattern(ctx, color, paint.texture, dpr)).get(`${paint.texture}:${color}`)!
        ctx.globalAlpha = 0.22; ctx.fillStyle = color; ctx.fill(path); ctx.globalAlpha = 1
        if (pattern) { ctx.fillStyle = pattern; ctx.fill(path) }
      }
      if (glyphs.length) { ctx.fillStyle = c[SURFACE]!; ctx.textAlign = 'center'; for (const [x, y, glyph] of glyphs) ctx.fillText(glyph, x, y); ctx.textAlign = 'start' }
    }
    ctx.strokeStyle = c[INK]!; ctx.globalAlpha = 0.7; ctx.stroke(ticks); ctx.globalAlpha = 1; ctx.lineWidth = 1.5
    if (selectedRow !== undefined) ctx.strokeRect(selected!.windowIndex * cw + 0.5, rowY(selectedRow) + 0.5, w, ROW - 1)
    if (cursor) { ctx.setLineDash([2, 1]); ctx.strokeRect(cursor.window * cw + 0.5, rowY(cursor.row) + 0.5, w, ROW - 1) }
    ctx.restore()
    // Releases: a dashed rule through the header and every row, named with the verdict in the text role.
    ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.strokeStyle = c[MUTED]!; ctx.fillStyle = c[INK]!
    for (const marker of markers) {
      const x = at(marker.at), text = marker.verdict ? `${marker.label} · ${marker.verdict}` : marker.label, tw = ctx.measureText(text).width
      if (x < 0 || x > plotW) continue
      ctx.beginPath(); ctx.moveTo(x, 2); ctx.lineTo(x, height); ctx.stroke()
      ctx.fillText(text, x + 3 + tw > plotW ? x - 3 - tw : x + 3, 11)
    }
    ctx.setLineDash([])
    element.dataset.frameMs = (performance.now() - started).toFixed(2)
  }, [rows, nwin, cw, plotW, paneH, shown, startedAt, windowMs, markers, eventsByRow, indexOf, selected, cursor, paints])
  const schedule = useCallback(() => { if (!frame.current) frame.current = requestAnimationFrame(draw) }, [draw])
  useEffect(() => schedule(), [schedule])
  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  useLayoutEffect(() => { if (target !== null) { pane.current?.querySelector<HTMLElement>(`[data-strip-row="${target}"]`)?.focus({ preventScroll: true }); setTarget(null) } }, [target, start])

  const describe = (r: number, i: number): Tip => {
    const row = rows[r]!, category = row.windows[i], from = startedAt + i * windowMs, paint = category ? paintOf(category) : null, inWindow = (t: number) => t >= from && t < from + windowMs
    const lines: Tip['lines'] = [{ label: 'behavior', value: paint ? `${paint.label}${paint.uncalibrated ? ' · uncalibrated' : ''}` : 'not alive', color: paint ? ROLES[roleOf(paint)] : undefined }]
    for (const event of eventsByRow.get(r) ?? []) if (inWindow(event.at)) lines.push({ label: 'message', value: event.label ?? clock(event.at) })
    for (const marker of markers) if (inWindow(marker.at)) lines.push({ label: 'release', value: marker.verdict ? `${marker.label} · ${marker.verdict}` : marker.label })
    return { x: Math.min(labelW + (i + 1) * cw + 8, width - 240), y: HEAD + (r + 1) * ROW - (pane.current?.scrollTop ?? 0), title: `${row.label} · ${clock(from)}–${clock(from + windowMs)}`, lines }
  }
  const hit = (point: { clientX: number; clientY: number }) => {
    const bounds = pane.current!.getBoundingClientRect(), x = point.clientX - bounds.left - labelW, r = Math.floor((point.clientY - bounds.top + pane.current!.scrollTop) / ROW), i = Math.floor(x / cw)
    return x < 0 || r < 0 || r >= rows.length || i < 0 || i >= nwin ? null : { row: r, window: i }
  }
  const move = (event: KeyboardEvent<HTMLDivElement>, r: number) => {
    const element = pane.current!, column = cursor?.row === r ? cursor.window : 0, next = moveCursor(event.key, column, nwin), to = event.key === 'ArrowDown' ? r + 1 : event.key === 'ArrowUp' ? r - 1 : null
    if (next !== null) { setCursor({ row: r, window: next }); setTip(describe(r, next)) }
    else if (event.key === 'Enter' || event.key === ' ') onSelect?.(rows[r]!.id, column)
    else if (to !== null) {
      const row = Math.max(0, Math.min(rows.length - 1, to))
      element.scrollTop = Math.max(Math.min(element.scrollTop, row * ROW), (row + 1) * ROW - element.clientHeight)
      top.current = element.scrollTop
      setStart(stripWindow(rows.length, top.current, ROW, shown).start)
      setTarget(row)
    } else return
    event.preventDefault()
  }
  const window_ = stripWindow(rows.length, top.current, ROW, shown)
  return (
    <div ref={node => { box.current = node; measure(node) }} className="tgc-behavior-strip" role="grid" aria-label={label} aria-rowcount={rows.length + 1} aria-colcount={nwin + 1} data-live={live || undefined} data-windows={nwin} style={{ '--tgc-behavior-label': `${labelW}px` } as CSSProperties}>
      <div className="tgc-behavior-head" role="row" aria-rowindex={1}><span role="columnheader">Agent</span><span role="columnheader" className="tgc-behavior-axis-name">{clock(startedAt)} onward in {Math.round(windowMs / 6000) / 10} min windows</span></div>
      <div ref={pane} className="tgc-behavior-scroll" role="rowgroup" style={{ height: paneH }}
        onScroll={event => { top.current = event.currentTarget.scrollTop; const next = stripWindow(rows.length, top.current, ROW, shown).start; if (next !== start) setStart(next); schedule() }}
        onPointerMove={event => { const hover = hit(event); setTip(hover ? describe(hover.row, hover.window) : null) }} onPointerLeave={() => { if (!cursor) setTip(null) }}
        onClick={event => { const hover = hit(event); if (hover) onSelect?.(rows[hover.row]!.id, hover.window) }}>
        <div role="presentation" style={{ height: rows.length * ROW, position: 'relative' }}><div role="presentation" style={{ position: 'absolute', top: window_.start * ROW, width: '100%' }}>
          {rows.slice(window_.start, window_.end).map((row, index) => <div key={row.id} role="row" aria-rowindex={window_.start + index + 2} aria-label={rowLabel(row.label, row.windows, windowMs)} aria-selected={selected?.rowId === row.id || undefined} className="tgc-behavior-row" tabIndex={0} data-strip-row={window_.start + index}
            onKeyDown={event => move(event, window_.start + index)} onFocus={() => { const r = window_.start + index, i = cursor?.window ?? 0; setCursor({ row: r, window: i }); setTip(describe(r, i)) }} onBlur={() => { setCursor(null); setTip(null) }}>
            <span role="rowheader" className="tgc-behavior-label" title={row.label}>{renderRowLabel?.(row) ?? row.label}</span>
          </div>)}
        </div></div>
      </div>
      <canvas ref={canvas} aria-hidden="true" className="tgc-behavior-canvas" style={{ left: labelW, width: plotW, height: HEAD + paneH }} />
      <Tooltip tip={tip} />
      <ul className="tgc-behavior-key ov-key" aria-label="Key">
        {used.map(category => { const paint = paintOf(category); return <li key={category}><i data-texture={paint.family === 'event' ? 'tick' : paint.texture} style={{ '--tgc-swatch': ROLES[roleOf(paint)] } as CSSProperties} aria-hidden="true" />{paint.label}{paint.uncalibrated && <small className="tgc-behavior-badge">uncalibrated</small>}</li> })}
        {markers.length > 0 && <li><i data-texture="rule" aria-hidden="true" />release · verdict</li>}
        {events.length > 0 && <li><i data-texture="tick" aria-hidden="true" />message sent</li>}
        <li className="tgc-behavior-count">{rows.length} agents · {nwin} windows</li>
      </ul>
    </div>
  )
}
