/**
 * A canvas of many dots (thousands of runs or agents) that pans and zooms at 60 fps: unit dots in group rectangles
 * (`unitDotLayout`) or a semantic map's x/y. Colours are palette indexes, so a lens change repaints without a new
 * layout; the caller owns hover and selection and draws its own legend and details.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export interface DotMapRect {
  x0: number
  y0: number
  x1: number
  y1: number
  label: string
  /** Shown after the label, such as the group's count. */
  note?: string
}

export interface DotMapLabel {
  x: number
  y: number
  text: string
}

export interface DotMapProps {
  /** x and y of every point in layout units, interleaved. */
  positions: Float32Array
  /** Each point's radius in layout units, or one radius for all. */
  radii: Float32Array | number
  /** Each point's palette index. */
  colors: Uint8Array
  /** CSS colours (custom properties allowed) by palette index. */
  palette: readonly string[]
  /** The box the positions are laid out in: [x0, y0, x1, y1]. The map fits it on first draw and on reset. */
  extent: readonly [number, number, number, number]
  /** Group rectangles drawn under the points, labelled at their top left. */
  rects?: readonly DotMapRect[]
  /** Labels drawn over the points, such as cluster names at their centroids. */
  labels?: readonly DotMapLabel[]
  /** 1 dims a point (filtered out); dimmed points draw first and faint. */
  dimmed?: Uint8Array | null
  selected?: number | null
  /** Radius floor in screen pixels, so a dense semantic map stays visible zoomed out. Default 1.2. */
  minPixelRadius?: number
  onHover?: (index: number | null) => void
  onSelect?: (index: number | null) => void
  /** Text for a point's hover card. */
  describe?: (index: number) => string
  height?: number
  ariaLabel: string
}

/** The categorical lens colours, in slot order, then "other": the palette a DotMap lens indexes. */
export const DOT_MAP_CATEGORIES: readonly string[] = Object.freeze(['var(--chart-category-1)', 'var(--chart-category-2)', 'var(--chart-category-3)', 'var(--chart-category-other)'])

interface View {
  scale: number
  tx: number
  ty: number
}

/** Resolves CSS colours (including custom properties and light-dark()) to what the page computes, for the canvas. */
function resolveColors(host: HTMLElement, palette: readonly string[]): string[] {
  const probe = document.createElement('span')
  probe.style.display = 'none'
  host.appendChild(probe)
  const out = palette.map((color) => {
    probe.style.color = ''
    probe.style.color = color
    return getComputedStyle(probe).color || color
  })
  probe.remove()
  return out
}

/** A uniform grid over the layout, for hit tests in constant time per pointer move. */
function gridIndex(positions: Float32Array, extent: readonly [number, number, number, number], cell: number) {
  const [x0, y0, x1, y1] = extent
  const cols = Math.max(1, Math.ceil((x1 - x0) / cell))
  const rows = Math.max(1, Math.ceil((y1 - y0) / cell))
  const cells = new Map<number, number[]>()
  for (let i = 0; i < positions.length / 2; i++) {
    const c = Math.min(cols - 1, Math.max(0, Math.floor((positions[i * 2]! - x0) / cell)))
    const r = Math.min(rows - 1, Math.max(0, Math.floor((positions[i * 2 + 1]! - y0) / cell)))
    const key = r * cols + c
    const list = cells.get(key)
    if (list) list.push(i)
    else cells.set(key, [i])
  }
  return { cols, rows, cell, cells, x0, y0 }
}

export function DotMap({ positions, radii, colors, palette, extent, rects, labels, dimmed, selected, minPixelRadius = 1.2, onHover, onSelect, describe, height = 560, ariaLabel }: DotMapProps) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ width: 0, height })
  const view = useRef<View>({ scale: 1, tx: 0, ty: 0 })
  const fitted = useRef<string>('')
  const frame = useRef(0)
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null)
  const colorsResolved = useRef<string[]>([])
  const count = positions.length / 2
  const maxRadius = useMemo(() => (typeof radii === 'number' ? radii : radii.reduce((max, r) => (r > max ? r : max), 0)), [radii])
  const index = useMemo(() => gridIndex(positions, extent, Math.max(maxRadius * 2, (extent[2] - extent[0]) / 200)), [positions, extent, maxRadius])

  useEffect(() => {
    if (!box.current) return
    const observer = new ResizeObserver(([entry]) => setSize({ width: Math.floor(entry!.contentRect.width), height }))
    observer.observe(box.current)
    return () => observer.disconnect()
  }, [height])

  const fit = useCallback(() => {
    const [x0, y0, x1, y1] = extent
    const pad = 8
    const scale = Math.min((size.width - pad * 2) / Math.max(1e-9, x1 - x0), (size.height - pad * 2) / Math.max(1e-9, y1 - y0))
    view.current = { scale, tx: pad - x0 * scale + (size.width - pad * 2 - (x1 - x0) * scale) / 2, ty: pad - y0 * scale + (size.height - pad * 2 - (y1 - y0) * scale) / 2 }
  }, [extent, size])

  const draw = useCallback(() => {
    frame.current = 0
    const element = canvas.current
    if (!element || !size.width) return
    const started = performance.now()
    const dpr = window.devicePixelRatio || 1
    if (element.width !== Math.round(size.width * dpr) || element.height !== Math.round(size.height * dpr)) {
      element.width = Math.round(size.width * dpr)
      element.height = Math.round(size.height * dpr)
    }
    const ctx = element.getContext('2d')
    if (!ctx) return
    if (!colorsResolved.current.length && box.current) colorsResolved.current = resolveColors(box.current, palette)
    const { scale, tx, ty } = view.current
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.width, size.height)
    const style = box.current ? getComputedStyle(box.current) : null
    const ink = style?.color || '#888'
    if (rects?.length) {
      ctx.lineWidth = 1
      ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
      for (const rect of rects) {
        if (rect.x1 <= rect.x0) continue
        const x = rect.x0 * scale + tx, y = rect.y0 * scale + ty, w = (rect.x1 - rect.x0) * scale, h = (rect.y1 - rect.y0) * scale
        if (x > size.width || y > size.height || x + w < 0 || y + h < 0) continue
        ctx.globalAlpha = 0.35
        ctx.strokeStyle = ink
        ctx.strokeRect(x + 0.5, y + 0.5, w, h)
        if (w > 36) {
          ctx.globalAlpha = 0.8
          ctx.fillStyle = ink
          const text = rect.note ? `${rect.label} · ${rect.note}` : rect.label
          ctx.save()
          ctx.beginPath()
          ctx.rect(x, y, w - 4, 16)
          ctx.clip()
          ctx.fillText(text, x + 4, y + 12)
          ctx.restore()
        }
      }
      ctx.globalAlpha = 1
    }
    // One path per colour: thousands of arcs fill in a handful of calls.
    const paths = new Map<number, Path2D>()
    const faint = new Path2D()
    const r0 = typeof radii === 'number' ? radii : 0
    for (let i = 0; i < count; i++) {
      const x = positions[i * 2]! * scale + tx
      const y = positions[i * 2 + 1]! * scale + ty
      if (x < -8 || y < -8 || x > size.width + 8 || y > size.height + 8) continue
      const r = Math.max(minPixelRadius, (typeof radii === 'number' ? r0 : radii[i]!) * scale)
      const path = dimmed?.[i] ? faint : (paths.get(colors[i]!) ?? paths.set(colors[i]!, new Path2D()).get(colors[i]!)!)
      path.moveTo(x + r, y)
      path.arc(x, y, r, 0, Math.PI * 2)
    }
    ctx.globalAlpha = 0.18
    ctx.fillStyle = ink
    ctx.fill(faint)
    ctx.globalAlpha = 0.92
    for (const [color, path] of paths) {
      ctx.fillStyle = colorsResolved.current[color] ?? ink
      ctx.fill(path)
    }
    ctx.globalAlpha = 1
    if (selected !== null && selected !== undefined && selected < count) {
      const x = positions[selected * 2]! * scale + tx, y = positions[selected * 2 + 1]! * scale + ty
      const r = Math.max(4, (typeof radii === 'number' ? r0 : radii[selected]!) * scale + 3)
      ctx.lineWidth = 2
      ctx.strokeStyle = ink
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.stroke()
    }
    if (labels?.length) {
      ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.lineWidth = 3
      const surface = style?.getPropertyValue('--dot-map-surface').trim() || style?.backgroundColor || '#161616'
      const taken: Array<[number, number, number, number]> = []
      for (const label of labels) {
        const x = label.x * scale + tx, y = label.y * scale + ty
        if (x < 0 || y < 0 || x > size.width || y > size.height) continue
        const w = ctx.measureText(label.text).width
        const box4: [number, number, number, number] = [x - w / 2 - 2, y - 10, x + w / 2 + 2, y + 4]
        // Labels never overlap: a later (smaller) cluster's label is left to its hover.
        if (taken.some(([a, b, c, d]) => box4[0] < c && box4[2] > a && box4[1] < d && box4[3] > b)) continue
        taken.push(box4)
        ctx.strokeStyle = surface
        ctx.strokeText(label.text, x, y)
        ctx.fillStyle = ink
        ctx.fillText(label.text, x, y)
      }
      ctx.textAlign = 'start'
    }
    element.dataset.frameMs = (performance.now() - started).toFixed(2)
  }, [size, positions, radii, colors, palette, rects, labels, dimmed, selected, count, minPixelRadius])

  const schedule = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(draw)
  }, [draw])

  useEffect(() => {
    colorsResolved.current = []
  }, [palette])
  useEffect(() => {
    if (!size.width) return
    const key = `${extent.join(',')}:${size.width}x${size.height}`
    if (fitted.current !== key) {
      fit()
      fitted.current = key
    }
    schedule()
  }, [size, extent, fit, schedule])
  useEffect(() => schedule(), [schedule])
  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  const pick = useCallback(
    (clientX: number, clientY: number): number | null => {
      const element = canvas.current
      if (!element) return null
      const bounds = element.getBoundingClientRect()
      const { scale, tx, ty } = view.current
      const lx = (clientX - bounds.left - tx) / scale
      const ly = (clientY - bounds.top - ty) / scale
      const c = Math.floor((lx - index.x0) / index.cell)
      const r = Math.floor((ly - index.y0) / index.cell)
      let best: number | null = null
      let bestD = Infinity
      const reach = Math.max(1, Math.ceil(6 / (scale * index.cell)))
      for (let dr = -reach; dr <= reach; dr++)
        for (let dc = -reach; dc <= reach; dc++) {
          if (c + dc < 0 || r + dr < 0 || c + dc >= index.cols || r + dr >= index.rows) continue
          for (const i of index.cells.get((r + dr) * index.cols + (c + dc)) ?? []) {
            const dx = positions[i * 2]! - lx, dy = positions[i * 2 + 1]! - ly
            const d = dx * dx + dy * dy
            const hit = Math.max(6 / scale, typeof radii === 'number' ? radii : radii[i]!)
            if (d < bestD && d <= hit * hit) {
              bestD = d
              best = i
            }
          }
        }
      return best
    },
    [index, positions, radii],
  )

  // Wheel zooms about the pointer; drag pans; a click selects; double-click or 0 resets.
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const bounds = element.getBoundingClientRect()
      const px = event.clientX - bounds.left, py = event.clientY - bounds.top
      const factor = Math.exp(-event.deltaY * 0.0015)
      const v = view.current
      const scale = Math.min(v.scale * 400, Math.max(v.scale * 0.0025, v.scale * factor))
      view.current = { scale, tx: px - ((px - v.tx) / v.scale) * scale, ty: py - ((py - v.ty) / v.scale) * scale }
      schedule()
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [schedule])

  const hovered = hover ? (describe?.(hover.index) ?? null) : null
  return (
    <div ref={box} className="tgc-dot-map" style={{ position: 'relative', height }} data-points={count}>
      <canvas
        ref={canvas}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        style={{ width: '100%', height, display: 'block', touchAction: 'none', cursor: hover ? 'pointer' : 'grab' }}
        onPointerDown={(event) => {
          drag.current = { x: event.clientX, y: event.clientY, moved: false }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          const d = drag.current
          if (d) {
            const dx = event.clientX - d.x, dy = event.clientY - d.y
            if (d.moved || Math.abs(dx) + Math.abs(dy) > 3) {
              d.moved = true
              view.current = { ...view.current, tx: view.current.tx + dx, ty: view.current.ty + dy }
              d.x = event.clientX
              d.y = event.clientY
              schedule()
              return
            }
          }
          const i = pick(event.clientX, event.clientY)
          const bounds = event.currentTarget.getBoundingClientRect()
          setHover(i === null ? null : { index: i, x: event.clientX - bounds.left, y: event.clientY - bounds.top })
          onHover?.(i)
        }}
        onPointerUp={(event) => {
          const d = drag.current
          drag.current = null
          if (d && !d.moved) onSelect?.(pick(event.clientX, event.clientY))
        }}
        onPointerLeave={() => {
          setHover(null)
          onHover?.(null)
        }}
        onDoubleClick={() => {
          fit()
          schedule()
        }}
        onKeyDown={(event) => {
          const v = view.current
          const zoom = (factor: number) => {
            const cx = size.width / 2, cy = size.height / 2
            view.current = { scale: v.scale * factor, tx: cx - ((cx - v.tx) / v.scale) * v.scale * factor, ty: cy - ((cy - v.ty) / v.scale) * v.scale * factor }
          }
          if (event.key === '+' || event.key === '=') zoom(1.4)
          else if (event.key === '-') zoom(1 / 1.4)
          else if (event.key === '0') fit()
          else if (event.key === 'ArrowLeft') view.current = { ...v, tx: v.tx + 60 }
          else if (event.key === 'ArrowRight') view.current = { ...v, tx: v.tx - 60 }
          else if (event.key === 'ArrowUp') view.current = { ...v, ty: v.ty + 60 }
          else if (event.key === 'ArrowDown') view.current = { ...v, ty: v.ty - 60 }
          else return
          event.preventDefault()
          schedule()
        }}
      />
      {hover && hovered && (
        <div className="tgc-dot-map-tip" role="tooltip" style={{ position: 'absolute', left: Math.min(hover.x + 12, Math.max(0, size.width - 300)), top: hover.y + 12, pointerEvents: 'none' }}>
          {hovered}
        </div>
      )}
    </div>
  )
}
