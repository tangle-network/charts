/** One reading against its target band on one scale: how far a value sits from where it should be. Values, words and
 * colors belong to callers; the chart only places them. */
import { formatCompact, useWidth } from './live.js'

export interface GapBand { min: number; max: number }

export interface GapProps {
  value: number
  /** A bound, not a measurement: the true value is at most (upper) or at least (lower) `value`; drawn as an open arrow. */
  bound?: 'upper' | 'lower' | null
  target: GapBand
  stretch?: GapBand | null
  scale?: 'log' | 'linear'
  format?: (value: number) => string
  /** The value mark's color; the caller's state color. */
  tone?: string
  /** Hover text for each mark; defaults name the numbers. */
  titles?: { value?: string; target?: string; stretch?: string }
  label?: string
}

const HEIGHT = 24
const MID = HEIGHT / 2

export function Gap({ value, bound = null, target, stretch = null, scale = 'log', format = formatCompact, tone = 'var(--chart-live-accent, #8b7cf6)', titles = {}, label }: GapProps) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const log = scale === 'log' && value > 0 && target.min > 0
  const f = (v: number) => (log ? Math.log10(v) : v)
  const ends = [value, target.min, target.max, ...(stretch ? [stretch.min, stretch.max] : [])].map(f)
  const lo = Math.min(...ends)
  const hi = Math.max(...ends)
  const pad = Math.max((hi - lo) * 0.08, log ? 0.15 : Math.abs(hi) * 0.05 || 1)
  const x = (v: number) => (width ? ((f(v) - (lo - pad)) / (hi - lo + 2 * pad)) * width : 0)
  const band = (b: GapBand) => ({ x: x(b.min), w: Math.max(4, x(b.max) - x(b.min)) })
  const t = band(target)
  const s = stretch ? band(stretch) : null
  const near = value < target.min ? x(target.min) : value > target.max ? x(target.max) : x(value)
  const vx = x(value)
  const range = (b: GapBand) => (b.min === b.max ? `≈${format(b.min)}` : `${format(b.min)}–${format(b.max)}`)
  const decades = log && width ? Array.from({ length: Math.floor(hi + pad) - Math.ceil(lo - pad) + 1 }, (_, i) => Math.ceil(lo - pad) + i) : []
  // An open arrow points the way a bound leaves room: an upper bound's true value lies to its left.
  const arrow = bound === 'upper' ? `M${vx + 4},${MID - 6} L${vx - 4},${MID} L${vx + 4},${MID + 6}` : `M${vx - 4},${MID - 6} L${vx + 4},${MID} L${vx - 4},${MID + 6}`
  return (
    <div ref={ref} className="ov-gap" role="img" aria-label={label ?? `${bound === 'upper' ? '≤' : bound === 'lower' ? '≥' : ''}${format(value)} against ${range(target)}`}>
      {width > 0 && (
        <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} aria-hidden>
          <line className="ov-gap-track" x1={0} x2={width} y1={MID} y2={MID} />
          {decades.map((d) => <line key={d} className="ov-gap-tick" x1={x(10 ** d)} x2={x(10 ** d)} y1={MID - 4} y2={MID + 4} />)}
          {s && <rect className="ov-gap-stretch" x={s.x} y={MID - 8} width={s.w} height={16} rx={4}><title>{titles.stretch ?? `stretch ${range(stretch!)}`}</title></rect>}
          <rect className="ov-gap-target" x={t.x} y={MID - 8} width={t.w} height={16} rx={4}><title>{titles.target ?? `target ${range(target)}`}</title></rect>
          {Math.abs(near - vx) > 1 && <line className="ov-gap-span" x1={vx} x2={near} y1={MID} y2={MID} style={{ stroke: tone }} />}
          <g className="ov-gap-value">
            <title>{titles.value ?? `${bound === 'upper' ? '≤' : bound === 'lower' ? '≥' : ''}${format(value)}`}</title>
            {bound ? <path d={arrow} fill="none" stroke={tone} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /> : <circle cx={vx} cy={MID} r={5} fill={tone} />}
            <rect x={vx - 8} y={0} width={16} height={HEIGHT} fill="transparent" />
          </g>
        </svg>
      )}
    </div>
  )
}
