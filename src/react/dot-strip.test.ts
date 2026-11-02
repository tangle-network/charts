import { describe, expect, it } from 'vitest'
import { dotStripRows } from './dot-strip.js'

describe('DotStrip outlier marking', () => {
  const rows = [{
    id: 'calls_per_hour', label: 'tool calls per hour', dots: [
      { id: 's0', label: 's0', value: 346.3, outlier: false },
      { id: 's2:s7', label: 's2:s7', value: 1268.5, outlier: true, note: 'robust z 8.25' },
      { id: 's1', label: 's1', value: null, outlier: true },
      { id: 's4', label: 's4', value: 0 },
    ],
  }]
  it('marks only a recorded value the producer flagged, never a null and never by magnitude', () => {
    const [row] = dotStripRows(rows)
    expect(row!.dots.map(dot => dot.outlier)).toEqual([false, true, false, false])
    expect(row!.outliers).toBe(1)
    expect(row!.unknown).toBe(1)
    expect(row!.dots[2]!.x).toBeNull()
  })
  it('places dots on 0..max from the largest recorded value and names each for assistive tech', () => {
    const [row] = dotStripRows(rows)
    expect(row!.max).toBe(1268.5)
    expect(row!.maxLabel).toBe('max 1.3K')
    expect(row!.dots[1]!.x).toBe(1)
    expect(row!.dots[3]!.x).toBe(0)
    expect(row!.dots[1]!.name).toBe('s2:s7 tool calls per hour 1.3K, outlier')
    expect(row!.dots[2]!.name).toBe('s1 tool calls per hour not recorded')
  })
  it('honours a producer max and format, and says when every entity is unknown', () => {
    const [rate, empty] = dotStripRows([
      { id: 'fail_rate', label: 'failure rate', max: 1, format: value => `${Math.round(value * 100)} %`, dots: [{ id: 'a', label: 'a', value: 0.25, outlier: true }] },
      { id: 'streaks', label: 'failing streaks', dots: [{ id: 'a', label: 'a', value: null }] },
    ])
    expect(rate!.dots[0]!.x).toBe(0.25)
    expect(rate!.maxLabel).toBe('max 100 %')
    expect(empty!.maxLabel).toBe('unknown on every entity')
    expect(empty!.dots.every(dot => dot.x === null)).toBe(true)
  })
})
