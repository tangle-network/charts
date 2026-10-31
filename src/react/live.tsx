/** Reusable, em-scaled charts for live operational series. Values, labels and status colors belong to callers. */
import { useState } from 'react'
import { formatCompact } from '../format.js'
import { useWidth, Tooltip, EventList, type Tip } from './live-presentation.js'
export { useWidth } from './live-presentation.js'
import { type ChartBand, type ChartMark, drawMarks, eventsGap } from '../events.js'
import { hatchPath, type MarkerShape, markerPath } from '../svg.js'

// Defaults for consumers that do not pass a series color.
export const LIVE_SERIES = ['var(--chart-series-1)', 'var(--chart-series-2)', 'var(--chart-series-3)', 'var(--chart-series-4)', 'var(--chart-series-5)'] as const
export { formatCompact } from '../format.js'
const formatShare = (value: number | null) => value === null || !Number.isFinite(value) ? '—' : `${Math.round(value * 100)}%`

/** A nice ceiling for an axis and its three gridline values. */
function ticksFor(max: number) {
  if (!(max > 0)) return { top: 1, ticks: [0, 0.5, 1] }
  const power = 10 ** Math.floor(Math.log10(max))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s * 4 >= max) ?? power * 10
  const top = Math.ceil(max / step) * step
  return { top, ticks: [0, top / 2, top] }
}

function Grid({ ticks, left, right, em, y }: { ticks: { value: number; label: string }[]; left: number; right: number; em: number; y: (value: number) => number }) {
  return ticks.map(t => <g key={t.value}>
    <line x1={left} x2={right} y1={y(t.value)} y2={y(t.value)} className="ov-gridline" />
    <text x={left - em * .4} y={y(t.value)} dominantBaseline="middle" className="ov-axis" textAnchor="end">{t.label}</text>
  </g>)
}

/** Bars per day (or per any label: `tick` shortens it on the axis), stacked by series, on one axis; hovering a bar lists
 * every series' value for it, and `onOpen` makes a bar a link. */
export function DayBars({ days, series, format = formatCompact, rows = 13, missing = 'No runs started', interval = 'day', tick = (day: string) => day.slice(5), onOpen }: { days: string[]; series: { name: string; color: string; values: (number | null)[] }[]; format?: (v: number) => string; rows?: number; missing?: string; interval?: string; tick?: (day: string) => string; onOpen?: (index: number) => void }) {
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
        <svg width={width} height={height} role="img" aria-label={`${series.map((s) => s.name).join(', ')} per ${interval}`}>
          <Grid ticks={ticks.map(value => ({ value, label: format(value) }))} left={left} right={width - 8} em={em} y={y} />
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
export function HBars({ rows, format = formatCompact, color = LIVE_SERIES[0], max, limit = 8 }: { rows: { label: string; value: number; note?: string; color?: string; href?: string; title?: string }[]; format?: (v: number) => string; color?: string; max?: number; limit?: number }) {
  const top = max ?? Math.max(1, ...rows.map((row) => row.value))
  if (!rows.length) return <p className="ov-empty">Nothing recorded.</p>
  const rest = rows.slice(limit)
  return (
    <ol className="ov-hbars">
      {rows.slice(0, limit).map((row) => {
        // Every bar answers a hover with its label and value, or the host's own title.
        const title = row.title ?? `${row.label}: ${format(row.value)}`
        const content = (
          <>
            <span className="ov-hbar-label">{row.label}</span>
            <span className="ov-hbar-track">
              <span style={{ width: '100%', transform: `scaleX(${Math.max(0, Math.min(1, row.value / top))})`, background: row.color ?? color }} />
            </span>
            <span className="ov-hbar-value">{format(row.value)}</span>
            {row.note && <span className="ov-hbar-note">{row.note}</span>}
          </>
        )
        return <li key={row.label}>{row.href ? <a href={row.href} title={title}>{content}</a> : <div title={title}>{content}</div>}</li>
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
          <Grid ticks={ticks.map(value => ({ value, label: formatCompact(value) }))} left={left} right={width - 8} em={em} y={y} />
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

/** Recorded values and unscored observations share a time axis. Missing values occupy a labelled strip, never zero. */
export function Lines({ series, format = formatCompact, rows = 13, axis, marks = [], bands = [], ticks: namedTicks, strip }: {
  series: LineSeries[]; format?: (v: number) => string; rows?: number; axis?: (t: number) => string
  marks?: ChartMark[]; bands?: ChartBand[]; ticks?: { value: number; label: string }[]
  strip?: { label: string; series?: string; points: { at: number; id: string; label: string; href?: string }[] }
}) {
  const [ref, width, em] = useWidth<HTMLDivElement>()
  const [cursor, setCursor] = useState<{ at: number; key?: string } | null>(null)
  const gap = eventsGap(marks, bands)
  if (gap) throw new RangeError(gap)
  const all = series.flatMap(s => s.points), missing = strip?.points ?? []
  if (!all.length && !missing.length) return <p className="ov-empty">No history yet.</p>
  const times = [...all.map(p => p[0]), ...missing.map(p => p.at), ...marks.map(m => m.at), ...bands.flatMap(b => [b.from, b.to])]
  const t0 = Math.min(...times), t1 = Math.max(...times), automatic = ticksFor(Math.max(...all.map(p => p[1])))
  const ticks = !all.length ? [] : namedTicks?.length ? namedTicks : automatic.ticks.map(value => ({ value, label: format(value) }))
  const top = namedTicks?.length ? Math.max(1, ...ticks.map(t => t.value), ...all.map(p => p[1])) : automatic.top
  const left = Math.round(Math.min(width * .48, Math.max(3.4, ...[...ticks.map(t => t.label), ...(missing.length ? [strip!.label] : [])].map(label => label.length * .56 + .8)) * em))
  const height = Math.round((all.length ? rows : 5) * em), plotW = Math.max(0, width - left - 10)
  const plotH = all.length ? Math.max(0, height - Math.round((missing.length ? 4.6 : 1.8) * em) - 8) : 0
  const stripY = height - em * 2.4, x = (t: number) => left + (t1 > t0 ? (t - t0) / (t1 - t0) * plotW : 0)
  const y = (v: number) => 8 + plotH - v / top * plotH
  const key = (name: string, id: string) => JSON.stringify([name, id])
  const points = series.flatMap(s => s.points.flatMap((p, i) => s.dots || s.marker && (s.points.length <= 30 || i === s.points.length - 1) ? [{
    key: key(s.name, s.id?.(p[0], i) ?? `${p[0]}:${i}`), at: p[0], value: p[1] as number | null, label: s.label?.(p[0], i) ?? s.name,
    color: s.color, href: s.href?.(p[0], i), highlight: s.highlight?.(p[0], i), marker: s.dots ? undefined : s.marker,
  }] : []))
  points.push(...missing.map(p => ({ ...p, key: key(strip!.series ?? strip!.label, p.id), value: null, href: p.href, color: 'var(--chart-live-muted, var(--text-muted))', highlight: false, marker: undefined })))
  const focused = points.find(p => p.key === cursor?.key), hover = focused?.at ?? cursor?.at ?? null
  const nearest = (s: LineSeries) => s.points.reduce((best, p, i) => Math.abs(p[0] - hover!) < Math.abs(s.points[best]![0] - hover!) ? i : best, 0)
  const day = (t: number) => new Date(t).toISOString().slice(5, 16).replace('T', ' ')
  const readout = focused ? [{ label: focused.label, value: focused.value === null ? strip!.label : format(focused.value), color: focused.color }] : hover === null ? [] : series.filter(s => s.points.length).map(s => {
    const i = nearest(s), p = s.points[i]!
    return { label: s.label?.(p[0], i) ?? s.name, value: format(p[1]), color: s.color }
  })
  return (
    <div ref={ref} className="ov-plot" onMouseLeave={() => setCursor(current => current?.key ? current : null)} onMouseMove={event => {
      const px = event.clientX - event.currentTarget.getBoundingClientRect().left
      setCursor(current => current?.key ? current : px >= left ? { at: t0 + (px - left) / Math.max(1, plotW) * (t1 - t0) } : null)
    }}>
      {width > 0 && <svg width={width} height={height} role={points.some(p => p.href) ? 'group' : 'img'} aria-label={series.map(s => s.name).join(', ') || strip?.label}>
        <Grid ticks={ticks} left={left} right={width - 10} em={em} y={y} />
        {(t0 === t1 ? [t0] : [t0, (t0 + t1) / 2, t1]).map((t, i) => <text key={i} x={x(t)} y={height - em * .35} className="ov-axis" textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}>{axis ? axis(t) : day(t).slice(0, 5)}</text>)}
        {missing.length > 0 && <Grid ticks={[{ value: 0, label: strip!.label }]} left={left} right={width - 10} em={em} y={() => stripY} />}
        {bands.map((band, i) => <Band key={`band-${i}`} band={band} x={x(band.from)} y={8} width={x(band.to) - x(band.from)} height={plotH} />)}
        {series.filter(s => !s.dots).map(s => <polyline key={s.name} data-series={s.name} data-dash={s.dash ?? 'solid'} fill="none" stroke={s.color} strokeWidth={Math.max(2, em / 8)} strokeLinejoin="round" strokeLinecap={s.dash === 'dot' ? 'round' : undefined} strokeDasharray={dashArray(s.dash, em)} points={s.points.flatMap((p, i) => s.interpolation === 'step' && i ? [[p[0], s.points[i - 1]![1]], p] : [p]).map(p => `${x(p[0]!)},${y(p[1]!)}`).join(' ')} />)}
        {points.map(p => {
          const label = `${p.label}: ${p.value === null ? strip!.label : format(p.value)}`, cy = p.value === null ? stripY : y(p.value)
          return <a key={p.key} href={p.href} aria-label={p.href ? label : undefined} onFocus={() => setCursor({ at: p.at, key: p.key })} onBlur={() => setCursor(null)}
            onMouseEnter={event => { if (!event.currentTarget.closest('svg')?.contains(document.activeElement)) setCursor({ at: p.at, key: p.key }) }}
            onMouseLeave={event => { if (!event.currentTarget.closest('svg')?.contains(document.activeElement)) setCursor(null) }}>
            {p.marker ? <path d={markerPath(p.marker, x(p.at), cy, Math.max(3, em / 5))} fill={p.color} /> :
              <circle className="ov-line-point" data-unscored={p.value === null || undefined} data-highlight={p.highlight || undefined} cx={x(p.at)} cy={cy} r={p.highlight ? 6 : Math.max(3, em / 5)} fill={p.highlight || p.value === null ? 'var(--chart-live-surface, var(--bg-card))' : p.color} stroke={p.highlight || p.value === null ? p.color : 'var(--chart-live-surface, var(--bg-card))'} strokeWidth={p.highlight ? 2.5 : 1.5} strokeDasharray={p.value === null ? '2 2' : undefined}><title>{label}</title></circle>}
          </a>
        })}
        {[...marks].sort((a, b) => a.at - b.at).map((mark, i) => <Mark key={`mark-${i}`} mark={mark} x={x(mark.at)} top={8} bottom={8 + plotH} row={i % 3} em={em} flip={x(mark.at) > left + plotW * .62} />)}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={8} y2={missing.length ? stripY : 8 + plotH} className="ov-crosshair" />}
        {hover !== null && !cursor?.key && series.filter(s => s.points.length).map(s => {
          const p = s.points[nearest(s)]!
          return <circle key={s.name} cx={x(p[0])} cy={y(p[1])} r={Math.max(4, em / 4)} fill={s.color} stroke="var(--chart-live-surface, var(--bg-card))" strokeWidth={2} pointerEvents="none" />
        })}
      </svg>}
      {hover !== null && <Tooltip tip={{ x: Math.min(x(hover) + 10, width - em * 14), y: 8, title: axis ? axis(hover) : day(hover), lines: readout }} />}
      {series.length > 1 && series.some(s => s.dash || s.marker) && <ul className="ov-key" aria-label="Series">
        {series.map(s => <li key={s.name}>
          <svg width={em * 2} height={em} aria-hidden="true">
            <line x1={0} x2={em * 2} y1={em / 2} y2={em / 2} stroke={s.color} strokeWidth={Math.max(2, em / 8)} strokeDasharray={dashArray(s.dash, em)} strokeLinecap={s.dash === 'dot' ? 'round' : undefined} />
            {s.marker && <path d={markerPath(s.marker, em, em / 2, Math.max(3, em / 5))} fill={s.color} />}
          </svg>{s.name}
        </li>)}
      </ul>}
      <EventList marks={marks} bands={bands} format={axis ?? day} />
    </div>
  )
}

/** A line series. `dash` and `marker` are a second channel, so arms stay distinct without colour. */
export interface LineSeries {
  name: string
  color: string
  points: [number, number][]
  dots?: boolean
  label?: (t: number, index?: number) => string
  id?: (t: number, index: number) => string
  href?: (t: number, index: number) => string | undefined
  highlight?: (t: number, index: number) => boolean
  interpolation?: 'linear' | 'step'
  dash?: 'solid' | 'dash' | 'dot'
  marker?: MarkerShape
}

const dashArray = (dash: LineSeries['dash'], em: number) => dash === 'dash' ? `${Math.round(em * .55)} ${Math.round(em * .3)}` : dash === 'dot' ? `0.1 ${Math.round(em * .35)}` : undefined

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

/** A vertical event rule with its label; kinds differ by stroke pattern, the died cross and the release, steer, ruling
 * and wake head shapes as well as colour, and a recorded verdict colours the rule. */
function Mark({ mark, x, top, bottom, row, em, flip }: { mark: ChartMark; x: number; top: number; bottom: number; row: number; em: number; flip: boolean }) {
  const room = Math.max(240, em * 6)
  return <g dangerouslySetInnerHTML={{ __html: drawMarks([mark], () => x, top, bottom, flip ? x - room : x, flip ? x : x + room, () => '', top + em * (.9 + row) - 12, { live: true, rows: 1 }) }} />
}

/** One part of a whole. A null value is listed as not recorded and takes no width; `untraced` parts are hatched. */
export interface MeterSegment {
  label: string
  value: number | null
  color?: string
  kind?: 'measured' | 'untraced'
  pattern?: 'hatched'
}

// Brand chart tokens for segments without a caller colour.
const SEGMENT_TONES = ['var(--chart-accent)', 'var(--chart-tier-c)', 'var(--chart-muted)'] as const

/** Recorded parts use `total`; `scaleMax` only extends their comparative axis. Compact rows keep a focusable readout. */
export function Meter({ used, total, format = formatCompact, tone, text, segments, steps, untraced = 'untraced', compact = false, scaleMax }: { steps?: { label: string; state: 'pass' | 'fail' | 'undecided' | 'unrun' }[]; used?: number | null | undefined; total: number | null | undefined; format?: (v: number) => string; tone?: string; text?: string; segments?: MeterSegment[]; untraced?: string; compact?: boolean; scaleMax?: number }) {
  const [hover, setHover] = useState(false), [focus, setFocus] = useState(false)
  if (steps) {
    const current = steps.findIndex(step => step.state !== 'pass')
    return <ol className="ov-meter-steps" aria-label={text ?? 'Check steps'}>{steps.map((step, i) => <li key={i} data-state={step.state} aria-current={i === current ? 'step' : undefined}><div className="ov-step-head"><strong>{i + 1}</strong><small className="ov-step-state">{step.state === 'pass' ? 'Pass' : step.state === 'fail' ? 'Stuck' : 'Unchecked'}</small></div><span>{step.label}</span></li>)}</ol>
  }
  const whole = total != null && Number.isFinite(total) && total >= 0 ? total : null
  if (scaleMax !== undefined && (!Number.isFinite(scaleMax) || scaleMax <= 0 || (whole !== null && scaleMax < whole))) throw new RangeError('scaleMax must be finite, positive and at least the recorded total.')
  const share = used != null && whole ? Math.min(1, used / whole) : null
  const input: MeterSegment[] = segments ?? [{ label: 'Used', value: used != null && Number.isFinite(used) ? used : null, color: tone ?? (share !== null && share > .9 ? 'var(--chart-live-danger, var(--surface-danger-text))' : share !== null && share > .7 ? 'var(--chart-live-warning, var(--surface-warning-text))' : LIVE_SERIES[0]) }]
  for (const segment of segments ?? []) {
    if (segment.value !== null && (!Number.isFinite(segment.value) || segment.value < 0)) throw new RangeError(`${segment.label}: a segment value must be a nonnegative finite number or null.`)
  }
  const known = input.reduce((sum, part) => sum + (part.value ?? 0), 0), remainder = whole === null ? 0 : whole - known
  if (segments && whole !== null && known > whole * (1 + 1e-9)) throw new RangeError(`Segments sum to ${known}, more than the total ${whole}.`)
  const parts = [...input, ...(segments && remainder > (whole ?? 0) * 1e-9 ? [{ label: untraced, value: remainder, kind: 'untraced' } as MeterSegment] : [])].map((part, i) => ({ ...part, color: part.color ?? SEGMENT_TONES[i % SEGMENT_TONES.length], hatched: part.kind === 'untraced' || part.pattern === 'hatched', valueText: part.value === null ? 'not recorded' : `${format(part.value)}${whole ? ` · ${formatShare(part.value / whole)}` : ''}` }))
  const summary = (segments ? whole === null ? 'total not recorded' : `${format(known)} of ${format(whole)} accounted · ${formatShare(whole ? known / whole : null)}` : `${format(used ?? NaN)} of ${format(total ?? NaN)} · ${formatShare(share)}`) + (scaleMax === undefined ? '' : ` · scale maximum ${format(scaleMax)}`)
  const readout = [text, summary, ...parts.map(part => `${part.label}: ${part.valueText}`)].filter(Boolean).join(' · ')
  let offset = 0
  return (
    <div className="ov-meter ov-plot" data-segmented={segments ? 'true' : undefined} data-compact={compact ? 'true' : undefined} role={compact ? 'img' : undefined} aria-label={compact ? readout : undefined} tabIndex={compact ? 0 : undefined}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} onKeyDown={event => { if (event.key === 'Escape') { setHover(false); setFocus(false) } }}>
      <span className={`ov-meter-track${segments && whole === null ? ' ov-hatched' : ''}`} data-hatched={segments && whole === null ? 'true' : undefined} aria-hidden="true">
        {parts.map((part, i) => {
          const fraction = whole === null || !whole ? 0 : Math.max(0, Math.min(part.value ?? 0, whole) / (scaleMax ?? whole)), start = offset
          offset += fraction
          return <span key={i} data-segment={part.label} data-hatched={part.hatched ? 'true' : undefined} className={part.hatched ? 'ov-hatched' : undefined}
            style={{ clipPath: `inset(0 ${Math.max(0, 1 - start - fraction) * 100}% 0 ${start * 100}% round ${segments ? 0 : 3}px)`, backgroundColor: part.kind === 'untraced' ? undefined : part.color }} />
        })}
      </span>
      {segments && <ul className="ov-meter-key">
        {parts.map((part, i) => <li key={i} data-segment={part.label}>
          <i className={part.hatched || part.value === null ? 'ov-hatched' : undefined} style={part.kind === 'untraced' || part.value === null ? undefined : { backgroundColor: part.color }} aria-hidden="true" />
          <span>{part.label}</span><b>{part.valueText}</b>
        </li>)}
      </ul>}
      <span className="ov-meter-text">{text ?? (compact ? format((segments ? whole : used) ?? NaN) : summary)}</span>
      {compact && <Tooltip tip={hover || focus ? { x: 0, y: 0, title: [text, summary].filter(Boolean).join(' · '), lines: parts.map(part => ({ label: part.label, value: part.valueText, color: part.color })) } : null} />}
    </div>
  )
}

/** A small line of one series for a row in a list (one hue; the row's label carries identity). `max` sets the top of
 * the scale (any positive value; the default 1 suits shares). With `label`, the line is an image with that name and
 * hovering it reads the nearest point through `format` and `time`. */
export function Spark({ points, max = 1, color = LIVE_SERIES[0], label, format = formatCompact, time }: { points: [number, number][]; max?: number; color?: string; label?: string; format?: (v: number) => string; time?: (t: number) => string }) {
  const [hover, setHover] = useState<number | null>(null)
  if (points.length < 2) return <span className="ov-spark-empty">collecting</span>
  const t0 = points[0]![0]
  const t1 = points.at(-1)![0]
  const w = 160
  const h = 32
  const domain = max > 0 && Number.isFinite(max) ? max : 1
  const px = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * w
  const py = (v: number) => h - 2 - (Math.min(domain, v) / domain) * (h - 4)
  const d = points.map((p) => `${px(p[0])},${py(p[1])}`).join(' ')
  const hovered = hover === null ? null : points[hover]!
  const reading = hovered ? `${time ? `${time(hovered[0])} · ` : ''}${format(hovered[1])}` : null
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="ov-spark" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}
      onMouseLeave={label ? () => setHover(null) : undefined}
      onMouseMove={label ? (event) => {
        const box = event.currentTarget.getBoundingClientRect()
        const t = t0 + ((event.clientX - box.left) / Math.max(1, box.width)) * (t1 - t0)
        setHover(points.reduce((best, p, i) => Math.abs(p[0] - t) < Math.abs(points[best]![0] - t) ? i : best, 0))
      } : undefined}>
      {label && <title>{reading ?? label}</title>}
      <polyline fill="none" stroke={color} strokeWidth={1.6} points={d} />
      {hovered && <circle cx={px(hovered[0])} cy={py(hovered[1])} r={3} fill={color} stroke="var(--chart-live-surface, var(--bg-card))" strokeWidth={1.5} />}
    </svg>
  )
}

/** Recorded instants on one time axis, such as process restarts or deploys: a tick per event in `[from, to]`, with
 * `ticks` evenly spaced axis labels under it. Hovering a tick names its time through `time`. The strip keeps its type
 * size at any width, and `label` names it for assistive tech. */
export function Events({ at, from, to, label, color = LIVE_SERIES[0], ticks = 7, axis = (t) => new Date(t).toLocaleDateString(undefined, { weekday: 'short' }), time = (t) => new Date(t).toLocaleString() }: { at: number[]; from: number; to: number; label: string; color?: string; ticks?: number; axis?: (t: number) => string; time?: (t: number) => string }) {
  const [ref, width, em] = useWidth<HTMLDivElement>()
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) throw new RangeError('Events needs a window with to after from.')
  const shown = at.filter((t) => Number.isFinite(t) && t >= from && t <= to).sort((a, b) => a - b)
  const strip = Math.round(2.2 * em)
  const height = strip + Math.round(1.5 * em)
  const pad = 6
  const x = (t: number) => pad + ((t - from) / (to - from)) * Math.max(0, width - 2 * pad)
  const steps = Math.max(1, Math.round(ticks))
  return (
    <div ref={ref} className="ov-plot">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`${label}: ${shown.length} in the window`}>
          <line x1={pad} x2={width - pad} y1={strip / 2} y2={strip / 2} className="ov-gridline" />
          {shown.map((t, i) => (
            <g key={`${t}-${i}`} data-event={t}>
              <title>{time(t)}</title>
              <rect x={x(t) - 6} y={0} width={12} height={strip} fill="transparent" />
              <line x1={x(t)} x2={x(t)} y1={4} y2={strip - 4} stroke={color} strokeWidth={2} strokeLinecap="round" />
            </g>
          ))}
          {Array.from({ length: steps + 1 }, (_, i) => {
            const t = from + (i / steps) * (to - from)
            return <text key={i} x={x(t)} y={height - em * 0.35} className="ov-axis" textAnchor={i === 0 ? 'start' : i === steps ? 'end' : 'middle'}>{axis(t)}</text>
          })}
        </svg>
      )}
    </div>
  )
}

/** Live lanes use the same prepared span plot as static timelines. */
export { Gantt } from './timeline-view.js'
