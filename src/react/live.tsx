/** Reusable, em-scaled charts for live operational series. Values, labels and status colors belong to callers. */
import { useEffect, useState } from 'react'
import { type ChartBand, type ChartMark, eventsGap } from '../events.js'
import { hatchPath, type MarkerShape, markerPath } from '../svg.js'
import type { TimelineLane } from '../timeline.js'

// Defaults for consumers that do not pass a series color.
export const LIVE_SERIES = ['#8b7cf6', '#0ea5a0', '#c98500', '#e2508f', '#4a90e2'] as const
export const formatCompact = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
const formatShare = (value: number | null) => value === null || !Number.isFinite(value) ? '—' : `${Math.round(value * 100)}%`

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

/** A nice ceiling for an axis and its three gridline values. */
function ticksFor(max: number) {
  if (!(max > 0)) return { top: 1, ticks: [0, 0.5, 1] }
  const power = 10 ** Math.floor(Math.log10(max))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s * 4 >= max) ?? power * 10
  const top = Math.ceil(max / step) * step
  return { top, ticks: [0, top / 2, top] }
}

interface Tip {
  x: number
  y: number
  title: string
  lines: { label: string; value: string; color?: string }[]
}

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null
  return (
    <div className="ov-tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>
      <strong>{tip.title}</strong>
      {tip.lines.map((line) => (
        <span key={line.label} className="ov-tip-line">
          {line.color && <i style={{ background: line.color }} />}
          <span>{line.label}</span>
          <b>{line.value}</b>
        </span>
      ))}
    </div>
  )
}

/** Bars per day (or per any label: `tick` shortens it on the axis), stacked by series, on one axis; hovering a bar lists
 * every series' value for it, and `onOpen` makes a bar a link. */
export function DayBars({ days, series, format = formatCompact, rows = 13, missing = 'No runs started', tick = (day: string) => day.slice(5), onOpen }: { days: string[]; series: { name: string; color: string; values: (number | null)[] }[]; format?: (v: number) => string; rows?: number; missing?: string; tick?: (day: string) => string; onOpen?: (index: number) => void }) {
  const [ref, width, em] = useWidth<HTMLDivElement>()
  const height = Math.round(rows * em)
  const [tip, setTip] = useState<Tip | null>(null)
  const totals = days.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0))
  const { top, ticks } = ticksFor(Math.max(...totals))
  const left = Math.round(3.4 * em)
  const bottom = Math.round(1.8 * em)
  const plotW = Math.max(0, width - left - 8)
  const plotH = height - bottom - 8
  const slot = days.length ? plotW / days.length : 0
  const bar = Math.max(3, slot * 0.72)
  const labelEvery = Math.max(1, Math.ceil(days.length / Math.max(1, Math.floor(plotW / (4.5 * em)))))
  const labelGap = Math.ceil((4.5 * em) / Math.max(slot, 1))
  const y = (v: number) => 8 + plotH - (v / top) * plotH
  return (
    <div ref={ref} className="ov-plot" onMouseLeave={() => setTip(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`${series.map((s) => s.name).join(', ')} per day`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={width - 8} y1={y(t)} y2={y(t)} className="ov-gridline" />
              <text x={left - em * 0.4} y={y(t)} dominantBaseline="middle" className="ov-axis" textAnchor="end">{format(t)}</text>
            </g>
          ))}
          {days.map((day, i) => {
            let base = 0
            const x = left + i * slot + (slot - bar) / 2
            const showTip = () => setTip({
              x: Math.min(left + i * slot + slot + 8, width - em * 14),
              y: 8,
              title: `${day} · ${series.every((s) => s.values[i] === null) ? missing : format(totals[i] ?? 0)}`,
              lines: series.map((s) => ({ label: s.name, value: s.values[i] === null ? missing : format(s.values[i] ?? 0), color: s.color })),
            })
            return (
              <g key={day} role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined}
                aria-label={onOpen ? `Open ${day}` : undefined}
                onFocus={onOpen ? showTip : undefined} onBlur={onOpen ? () => setTip(null) : undefined}
                onKeyDown={onOpen ? (event) => {
                  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(i) }
                } : undefined}>
                {series.map((s) => {
                  const v = s.values[i] ?? 0
                  if (!v) return null
                  const y0 = y(base)
                  base += v
                  const y1 = y(base)
                  // A 2 px surface gap between stacked segments; a segment shorter than the gap still shows 1 px.
                  return <rect key={s.name} x={x} y={y1} width={bar} height={Math.max(2, y0 - y1 - 2)} rx={2} fill={s.color} />
                })}
                {(i === days.length - 1 || (i % labelEvery === 0 && i + labelGap <= days.length - 1)) && (
                  <text x={x + bar / 2} y={height - em * 0.35} className="ov-axis" textAnchor="middle">{tick(day)}</text>
                )}
                <rect
                  x={left + i * slot}
                  y={8}
                  width={slot}
                  height={plotH}
                  fill="transparent"
                  style={onOpen ? { cursor: 'pointer' } : undefined}
                  onClick={onOpen ? () => onOpen(i) : undefined}
                  onMouseEnter={showTip}
                />
              </g>
            )
          })}
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  )
}

/** Ranked horizontal bars with the value and an optional note on each row; past `limit` rows the rest are counted. */
export function HBars({ rows, format = formatCompact, color = LIVE_SERIES[0], max, limit = 8 }: { rows: { label: string; value: number; note?: string; color?: string; href?: string }[]; format?: (v: number) => string; color?: string; max?: number; limit?: number }) {
  const top = max ?? Math.max(1, ...rows.map((row) => row.value))
  if (!rows.length) return <p className="ov-empty">Nothing recorded.</p>
  const rest = rows.slice(limit)
  return (
    <ol className="ov-hbars">
      {rows.slice(0, limit).map((row) => {
        const content = (
          <>
            <span className="ov-hbar-label" title={row.label}>{row.label}</span>
            <span className="ov-hbar-track">
              <span style={{ width: `${Math.max(1, (row.value / top) * 100)}%`, background: row.color ?? color }} />
            </span>
            <span className="ov-hbar-value">{format(row.value)}</span>
            {row.note && <span className="ov-hbar-note">{row.note}</span>}
          </>
        )
        return <li key={row.label}>{row.href ? <a href={row.href}>{content}</a> : <div>{content}</div>}</li>
      })}
      {rest.length > 0 && <li className="ov-hbars-more">+{rest.length} more · {format(rest.reduce((a, row) => a + row.value, 0))}</li>}
    </ol>
  )
}

/** A histogram of counts per bin; each bar's tooltip names its range and count. */
export function Histogram({ bins, format = formatCompact, color = LIVE_SERIES[0], unit, rows = 12 }: { bins: { lo: number; hi: number; n: number }[]; format?: (v: number) => string; color?: string; unit: string; rows?: number }) {
  const [ref, width, em] = useWidth<HTMLDivElement>()
  const height = Math.round(rows * em)
  const [tip, setTip] = useState<Tip | null>(null)
  // Trim empty bins at both ends so the shape fills the plot.
  const first = bins.findIndex((b) => b.n > 0)
  const last = bins.length - 1 - [...bins].reverse().findIndex((b) => b.n > 0)
  const shown = first < 0 ? [] : bins.slice(first, last + 1)
  const { top, ticks } = ticksFor(Math.max(...shown.map((b) => b.n), 1))
  const left = Math.round(3 * em)
  const bottom = Math.round(1.8 * em)
  const plotW = Math.max(0, width - left - 8)
  const plotH = height - bottom - 8
  const slot = shown.length ? plotW / shown.length : 0
  const y = (v: number) => 8 + plotH - (v / top) * plotH
  if (!shown.length) return <p className="ov-empty">Nothing recorded.</p>
  return (
    <div ref={ref} className="ov-plot" onMouseLeave={() => setTip(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`Distribution of ${unit}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={width - 8} y1={y(t)} y2={y(t)} className="ov-gridline" />
              <text x={left - em * 0.4} y={y(t)} dominantBaseline="middle" className="ov-axis" textAnchor="end">{formatCompact(t)}</text>
            </g>
          ))}
          {shown.map((bin, i) => (
            <g key={i}>
              <rect x={left + i * slot + 2} y={y(bin.n)} width={Math.max(3, slot - 4)} height={Math.max(bin.n ? 2 : 0, 8 + plotH - y(bin.n))} rx={2} fill={color} />
              {(i % Math.max(1, Math.ceil(shown.length / 6)) === 0 || i === shown.length - 1) && (
                <text x={left + i * slot + slot / 2} y={height - em * 0.35} className="ov-axis" textAnchor="middle">{format(bin.lo)}</text>
              )}
              <rect
                x={left + i * slot}
                y={8}
                width={slot}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setTip({ x: Math.min(left + i * slot + slot + 6, width - em * 14), y: 8, title: `${format(bin.lo)} to ${format(bin.hi)} ${unit}`, lines: [{ label: 'count', value: String(bin.n) }] })}
              />
            </g>
          ))}
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  )
}

/** Lines over time on one axis (at most four series); the crosshair readout lists each series at the nearest time. A
 * `dots` series draws its points as marks (checkpoints) instead of a line; `axis` labels the time axis (default MM-DD). */
export function Lines({ series, format = formatCompact, rows = 13, axis, marks = [], bands = [] }: { series: LineSeries[]; format?: (v: number) => string; rows?: number; axis?: (t: number) => string; marks?: ChartMark[]; bands?: ChartBand[] }) {
  const [ref, width, em] = useWidth<HTMLDivElement>()
  const height = Math.round(rows * em)
  const [hover, setHover] = useState<number | null>(null)
  const gap = eventsGap(marks, bands)
  if (gap) throw new RangeError(gap)
  const all = series.flatMap((s) => s.points)
  if (!all.length) return <p className="ov-empty">No history yet.</p>
  // Marks and bands widen the time axis, so a deadline after the last point stays visible.
  const times = [...all.map((p) => p[0]), ...marks.map((m) => m.at), ...bands.flatMap((b) => [b.from, b.to])]
  const t0 = Math.min(...times)
  const t1 = Math.max(...times)
  const { top, ticks } = ticksFor(Math.max(...all.map((p) => p[1])))
  const left = Math.round(3.4 * em)
  const bottom = Math.round(1.8 * em)
  const plotW = Math.max(0, width - left - 10)
  const plotH = height - bottom - 8
  const x = (t: number) => left + (t1 > t0 ? ((t - t0) / (t1 - t0)) * plotW : 0)
  const y = (v: number) => 8 + plotH - (v / top) * plotH
  const nearest = (points: [number, number][], t: number) => points.reduce((best, p) => (Math.abs(p[0] - t) < Math.abs(best[0] - t) ? p : best), points[0]!)
  const day = (t: number) => new Date(t).toISOString().slice(5, 16).replace('T', ' ')
  return (
    <div
      ref={ref}
      className="ov-plot"
      onMouseMove={(event) => {
        const box = event.currentTarget.getBoundingClientRect()
        const px = event.clientX - box.left
        setHover(px >= left ? t0 + ((px - left) / Math.max(1, plotW)) * (t1 - t0) : null)
      }}
      onMouseLeave={() => setHover(null)}
    >
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={series.map((s) => s.name).join(', ')}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={width - 10} y1={y(t)} y2={y(t)} className="ov-gridline" />
              <text x={left - em * 0.4} y={y(t)} dominantBaseline="middle" className="ov-axis" textAnchor="end">{format(t)}</text>
            </g>
          ))}
          {[t0, (t0 + t1) / 2, t1].map((t, i) => (
            <text key={i} x={x(t)} y={height - em * 0.35} className="ov-axis" textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}>{axis ? axis(t) : day(t).slice(0, 5)}</text>
          ))}
          {bands.map((band, i) => (
            <Band key={`band-${i}`} band={band} x={x(band.from)} y={8} width={x(band.to) - x(band.from)} height={plotH} />
          ))}
          {series.map((s) =>
            s.dots ? (
              <g key={s.name}>
                {s.points.map((p) => (
                  <circle key={p[0]} cx={x(p[0])} cy={y(p[1])} r={Math.max(3, em / 5)} fill={s.color} stroke="var(--chart-live-surface, #fff)" strokeWidth={1.5} />
                ))}
              </g>
            ) : (
              <g key={s.name} data-series={s.name} data-dash={s.dash ?? 'solid'} data-marker={s.marker}>
                <polyline fill="none" stroke={s.color} strokeWidth={Math.max(2, em / 8)} strokeLinejoin="round" strokeLinecap={s.dash === 'dot' ? 'round' : undefined} strokeDasharray={dashArray(s.dash, em)} points={s.points.map((p) => `${x(p[0])},${y(p[1])}`).join(' ')} />
                {s.marker && (s.points.length <= 30 ? s.points : s.points.slice(-1)).map((p) => (
                  <path key={p[0]} d={markerPath(s.marker!, x(p[0]), y(p[1]), Math.max(3, em / 5))} fill={s.color} stroke="var(--chart-live-surface, var(--chart-canvas))" strokeWidth={1.5} />
                ))}
              </g>
            ),
          )}
          {[...marks].sort((a, b) => a.at - b.at).map((mark, i) => (
            <Mark key={`mark-${i}`} mark={mark} x={x(mark.at)} top={8} bottom={8 + plotH} row={i % 3} em={em} flip={x(mark.at) > left + plotW * 0.62} />
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={8} y2={8 + plotH} className="ov-crosshair" />}
          {hover !== null &&
            series.map((s) => {
              const p = s.points.length ? nearest(s.points, hover) : null
              return p ? <circle key={s.name} cx={x(p[0])} cy={y(p[1])} r={Math.max(4, em / 4)} fill={s.color} stroke="var(--chart-live-surface, #fff)" strokeWidth={2} /> : null
            })}
        </svg>
      )}
      {hover !== null && (
        <Tooltip
          tip={{
            x: Math.min(x(hover) + 10, width - em * 14),
            y: 8,
            title: day(hover),
            lines: series.filter((s) => s.points.length).map((s) => {
              const p = nearest(s.points, hover)
              return { label: s.label ? s.label(p[0]) : s.name, value: format(p[1]), color: s.color }
            }),
          }}
        />
      )}
      {series.length > 1 && series.some((s) => s.dash || s.marker) && (
        <ul className="ov-key" aria-label="Series">
          {series.map((s) => (
            <li key={s.name}>
              <svg width={em * 2} height={em} aria-hidden="true">
                <line x1={0} x2={em * 2} y1={em / 2} y2={em / 2} stroke={s.color} strokeWidth={Math.max(2, em / 8)} strokeDasharray={dashArray(s.dash, em)} strokeLinecap={s.dash === 'dot' ? 'round' : undefined} />
                {s.marker && <path d={markerPath(s.marker, em, em / 2, Math.max(3, em / 5))} fill={s.color} />}
              </svg>
              {s.name}
            </li>
          ))}
        </ul>
      )}
      <EventList marks={marks} bands={bands} format={axis ?? ((t) => day(t))} />
    </div>
  )
}

/** A line series. `dash` and `marker` are a second channel, so arms stay distinct without colour. */
export interface LineSeries {
  name: string
  color: string
  points: [number, number][]
  dots?: boolean
  label?: (t: number) => string
  dash?: 'solid' | 'dash' | 'dot'
  marker?: MarkerShape
}

function dashArray(dash: LineSeries['dash'], em: number) {
  return dash === 'dash' ? `${Math.round(em * 0.55)} ${Math.round(em * 0.3)}` : dash === 'dot' ? `0.1 ${Math.round(em * 0.35)}` : undefined
}

/** A shaded span under the data; a `missing` span is hatched because it has no data. */
function Band({ band, x, y, width, height }: { band: ChartBand; x: number; y: number; width: number; height: number }) {
  return (
    <g data-band={band.kind} data-hatched={band.kind === 'missing' ? 'true' : undefined}>
      <title>{band.label}</title>
      <rect x={x} y={y} width={Math.max(0, width)} height={height} className={band.kind === 'missing' ? 'ov-hatch-bg' : `ov-band ov-band-${band.kind}`} />
      {band.kind === 'missing' && <path d={hatchPath(x, y, width, height)} className="ov-hatch" />}
    </g>
  )
}

/** A vertical event rule with its label; kinds differ by stroke pattern and the died cross as well as colour. */
function Mark({ mark, x, top, bottom, row, em, flip }: { mark: ChartMark; x: number; top: number; bottom: number; row: number; em: number; flip: boolean }) {
  const s = Math.max(3, em / 4)
  return (
    <g data-mark={mark.kind}>
      <title>{mark.label}</title>
      <line x1={x} x2={x} y1={top} y2={bottom} className={`ov-mark ov-mark-${mark.kind}`} />
      {mark.kind === 'died' && <path d={`M${x - s} ${bottom - 2 * s}L${x + s} ${bottom}M${x - s} ${bottom}L${x + s} ${bottom - 2 * s}`} className="ov-mark ov-mark-died" />}
      <text x={flip ? x - em * 0.3 : x + em * 0.3} y={top + em * (0.9 + row)} textAnchor={flip ? 'end' : 'start'} className="ov-mark-label">{mark.label}</text>
    </g>
  )
}

/** Every mark and band as text, in time order: the table form of the events drawn on the plot. */
function EventList({ marks, bands, format }: { marks: ChartMark[]; bands: ChartBand[]; format: (t: number) => string }) {
  if (!marks.length && !bands.length) return null
  const items = [
    ...marks.map((m) => ({ at: m.at, kind: m.kind, text: `${m.label} · ${format(m.at)}` })),
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

/** One part of a whole. A null value is listed as not recorded and takes no width; `untraced` parts are hatched. */
export interface MeterSegment {
  label: string
  value: number | null
  color?: string
  kind?: 'measured' | 'untraced'
}

// Brand chart tokens for segments without a caller colour.
const SEGMENT_TONES = ['var(--chart-accent)', 'var(--chart-tier-c)', 'var(--chart-muted)'] as const

/** A used-of-total meter with its numbers. With `segments` it is a part-of-whole bar: the remainder of `total` that no
 * segment accounts for is drawn hatched and labelled `untraced`, and a missing total hatches the whole track. */
export function Meter({ used, total, format = formatCompact, tone, text, segments, untraced = 'untraced' }: { used?: number | null | undefined; total: number | null | undefined; format?: (v: number) => string; tone?: string; text?: string; segments?: MeterSegment[]; untraced?: string }) {
  if (segments) return <SegmentMeter segments={segments} total={total} format={format} text={text} untraced={untraced} />
  const share = used !== null && used !== undefined && total ? Math.min(1, used / total) : null
  return (
    <div className="ov-meter">
      <span className="ov-meter-track">
        <span style={{ width: `${(share ?? 0) * 100}%`, background: tone ?? (share !== null && share > 0.9 ? 'var(--chart-live-danger, #d85050)' : share !== null && share > 0.7 ? 'var(--chart-live-warning, #c98500)' : LIVE_SERIES[0]) }} />
      </span>
      <span className="ov-meter-text">
        {text ?? `${format(used ?? NaN)} of ${format(total ?? NaN)} · ${formatShare(share)}`}
      </span>
    </div>
  )
}

function SegmentMeter({ segments, total, format, text, untraced }: { segments: MeterSegment[]; total: number | null | undefined; format: (v: number) => string; text?: string; untraced: string }) {
  for (const segment of segments) {
    if (segment.value !== null && (!Number.isFinite(segment.value) || segment.value < 0)) throw new RangeError(`${segment.label}: a segment value must be a nonnegative finite number or null.`)
  }
  const known = segments.reduce((sum, segment) => sum + (segment.value ?? 0), 0)
  const whole = total !== null && total !== undefined && Number.isFinite(total) && total > 0 ? total : null
  if (whole !== null && known > whole * (1 + 1e-9)) throw new RangeError(`Segments sum to ${known}, more than the total ${whole}.`)
  const remainder = whole === null ? 0 : whole - known
  const parts = [
    ...segments.map((segment, i) => ({ ...segment, color: segment.color ?? SEGMENT_TONES[i % SEGMENT_TONES.length], remainder: false })),
    ...(remainder > whole! * 1e-9 ? [{ label: untraced, value: remainder, kind: 'untraced' as const, color: undefined, remainder: true }] : []),
  ]
  const share = (value: number) => (whole === null ? null : value / whole)
  return (
    <div className="ov-meter" data-segmented="true">
      <span className={`ov-meter-track${whole === null ? ' ov-hatched' : ''}`} data-hatched={whole === null ? 'true' : undefined} aria-hidden="true">
        {whole !== null && parts.filter((part) => part.value !== null && part.value > 0).map((part) => (
          <span key={part.label} data-segment={part.label} data-hatched={part.kind === 'untraced' ? 'true' : undefined}
            className={part.kind === 'untraced' ? 'ov-hatched' : undefined}
            style={{ width: `${(part.value! / whole) * 100}%`, background: part.kind === 'untraced' ? undefined : part.color }} />
        ))}
      </span>
      <ul className="ov-meter-key">
        {parts.map((part) => (
          <li key={part.label} data-segment={part.label}>
            <i className={part.kind === 'untraced' || part.value === null ? 'ov-hatched' : undefined} style={part.kind === 'untraced' || part.value === null ? undefined : { background: part.color }} aria-hidden="true" />
            <span>{part.label}</span>
            <b>{part.value === null ? 'not recorded' : `${format(part.value)}${whole === null ? '' : ` · ${formatShare(share(part.value))}`}`}</b>
          </li>
        ))}
      </ul>
      <span className="ov-meter-text">{text ?? (whole === null ? 'total not recorded' : `${format(known)} of ${format(whole)} accounted · ${formatShare(known / whole)}`)}</span>
    </div>
  )
}

/** A small line of one series for a row in a list (one hue; the row's label carries identity). */
export function Spark({ points, max = 1, color = LIVE_SERIES[0] }: { points: [number, number][]; max?: number; color?: string }) {
  if (points.length < 2) return <span className="ov-spark-empty">collecting</span>
  const t0 = points[0]![0]
  const t1 = points.at(-1)![0]
  const w = 160
  const h = 32
  const domain = Math.max(1, max)
  const d = points.map((p) => `${((p[0] - t0) / Math.max(1, t1 - t0)) * w},${h - 2 - (Math.min(domain, p[1]) / domain) * (h - 4)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="ov-spark" aria-hidden="true">
      <polyline fill="none" stroke={color} strokeWidth={1.6} points={d} />
    </svg>
  )
}

/** One bar per row on a shared time axis (who worked when): each row's bar spans its start to its end, coloured by its
 * state; hovering a span names it, its state and its span. Times are epoch ms; `axis` labels the time axis.
 * `lanes` give a row several spans (the same shape as the static `timeline`); a span with `end: null` is open and runs
 * to `now`. `marks` draw recorded events across every lane, and states in `hatch` are drawn hatched (no data). */
export function Gantt({ rows, lanes: laneInput, colors, axis, span, marks = [], now, hatch = ['missing', 'untraced'] }: { rows?: { label: string; start: number; end: number; state: string; note?: string }[]; lanes?: TimelineLane[]; colors: Record<string, string>; axis: (t: number) => string; span: (start: number, end: number) => string; marks?: ChartMark[]; now?: number; hatch?: string[] }) {
  const [ref, width, em] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<Tip | null>(null)
  const lanes: TimelineLane[] = laneInput ?? (rows ?? []).map((row, i) => ({ id: `${row.label}-${i}`, label: row.label, spans: [{ start: row.start, end: row.end, state: row.state, note: row.note }] }))
  const gap = eventsGap(marks)
  if (gap) throw new RangeError(gap)
  if (now !== undefined && !Number.isFinite(now)) throw new RangeError('now must be a finite time.')
  // Lanes are validated; the original single-span `rows` keep their lenient drawing so existing pages never throw.
  if (laneInput) for (const lane of lanes) for (const s of lane.spans) {
    if (!Number.isFinite(s.start) || (s.end !== null && (!Number.isFinite(s.end) || s.end < s.start))) throw new RangeError(`${lane.label}: span times must be finite and end at or after their start.`)
    if (s.end === null && (now === undefined || now < s.start)) throw new RangeError(`${lane.label}: an open span needs a now at or after its start.`)
  }
  const spans = lanes.flatMap((lane) => lane.spans)
  if (!spans.length) return <p className="ov-empty">No agent has started.</p>
  const ends = (s: { end: number | null }) => s.end ?? now!
  const rowH = Math.round(1.25 * em)
  const labelW = Math.min(Math.round(13 * em), Math.round(width * 0.32))
  const top = marks.length ? 4 + Math.round(Math.min(3, marks.length) * em + 0.3 * em) : 4
  const bottom = Math.round(1.8 * em)
  const height = top + lanes.length * rowH + bottom
  const times = [...spans.flatMap((s) => [s.start, ends(s)]), ...marks.map((m) => m.at), ...(now === undefined ? [] : [now])]
  const t0 = Math.min(...times)
  const t1 = Math.max(...times, t0 + 60_000)
  const plotW = Math.max(0, width - labelW - 10)
  const x = (t: number) => labelW + ((t - t0) / (t1 - t0)) * plotW
  const fallback = colors.unknown ?? 'var(--chart-live-faint, var(--chart-muted))'
  const hatched = new Set(hatch)
  const plotBottom = top + lanes.length * rowH
  return (
    <div ref={ref} className="ov-plot" onMouseLeave={() => setTip(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`${lanes.length} ${laneInput ? 'lanes' : 'agents'} over time`}>
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={labelW + f * plotW} x2={labelW + f * plotW} y1={top} y2={plotBottom} className="ov-gridline" />
              <text x={labelW + f * plotW} y={height - em * 0.35} className="ov-axis" textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}>{axis(t0 + f * (t1 - t0))}</text>
            </g>
          ))}
          {lanes.map((lane, i) => {
            const y = top + i * rowH
            return (
              <g key={lane.id} data-lane={lane.id}>
                {/* The whole row names every span on hover, as single-span rows always did. */}
                <rect x={0} y={y} width={width} height={rowH} fill="transparent"
                  onMouseEnter={() => setTip({ x: Math.min(x(ends(lane.spans.at(-1) ?? { end: t1 })) + 8, width - em * 16), y: Math.max(0, y - em), title: lane.label, lines: lane.spans.flatMap((s) => [{ label: s.end === null ? `${s.state} (open)` : s.state, value: span(s.start, ends(s)), color: hatched.has(s.state) ? undefined : colors[s.state] ?? fallback }, ...(s.note ? [{ label: s.note, value: '' }] : [])]) })} />
                <text x={labelW - em * 0.5} y={y + rowH / 2} dominantBaseline="middle" textAnchor="end" className="ov-axis ov-gantt-label">
                  {lane.label.length > 26 ? `${lane.label.slice(0, 25)}…` : lane.label}
                </text>
                {lane.spans.map((s, j) => {
                  const color = colors[s.state] ?? fallback
                  const bx = x(s.start), bw = Math.max(2, x(ends(s)) - bx), by = y + rowH * 0.18, bh = rowH * 0.64
                  const open = s.end === null
                  return (
                    <g key={j} data-state={s.state} data-open={open ? 'true' : undefined} data-hatched={hatched.has(s.state) ? 'true' : undefined}
                      onMouseEnter={() => setTip({ x: Math.min(bx + bw + 8, width - em * 16), y: Math.max(0, y - em), title: lane.label, lines: [{ label: open ? `${s.state} (open)` : s.state, value: span(s.start, ends(s)), color: hatched.has(s.state) ? undefined : color }, ...(s.note ? [{ label: s.note, value: '' }] : [])] })}>
                      {hatched.has(s.state) ? (
                        <>
                          <rect x={bx} y={by} width={bw} height={bh} className="ov-hatch-bg" />
                          <path d={hatchPath(bx, by, bw, bh, 4)} className="ov-hatch" />
                        </>
                      ) : (
                        <rect x={bx} y={by} width={bw} height={bh} rx={2} fill={color} className={open ? 'ov-gantt-open' : undefined} />
                      )}
                    </g>
                  )
                })}
              </g>
            )
          })}
          {now !== undefined && <line x1={x(now)} x2={x(now)} y1={top} y2={plotBottom} className="ov-now" data-now="true" />}
          {[...marks].sort((a, b) => a.at - b.at).map((mark, i) => (
            <Mark key={`mark-${i}`} mark={mark} x={x(mark.at)} top={4} bottom={plotBottom} row={i % 3} em={em} flip={x(mark.at) > labelW + plotW * 0.62} />
          ))}
        </svg>
      )}
      <Tooltip tip={tip} />
      <EventList marks={marks} bands={[]} format={axis} />
    </div>
  )
}
