import { describe, expect, it } from 'vitest'
import { behaviorPaint, categoryMinutes, moveCursor, rowLabel, STRIP_VIRTUAL_ROWS, stripWindow, timeTicks } from './behavior-strip.js'

const minute = 60_000, window5 = 5 * minute

describe('row windowing', () => {
  it('mounts every row at or under the virtual threshold', () => {
    expect(stripWindow(STRIP_VIRTUAL_ROWS, 400, 16, 40)).toEqual({ start: 0, end: STRIP_VIRTUAL_ROWS, virtual: false })
  })
  it('windows 100 rows to the visible rows plus overscan, clamped at both ends', () => {
    expect(stripWindow(100, 0, 16, 40)).toEqual({ start: 0, end: 48, virtual: true })
    expect(stripWindow(100, 50 * 16, 16, 40)).toEqual({ start: 46, end: 94, virtual: true })
    expect(stripWindow(100, 99 * 16, 16, 40)).toEqual({ start: 95, end: 100, virtual: true })
  })
})

describe('category minutes per row label', () => {
  const windows = [null, 'exploring', 'exploring', 'verifying', 'implementing', 'implementing', 'exploring', 'idle', null]
  it('counts minutes per category from the window length, most first, null windows excluded', () => {
    expect(categoryMinutes(windows, window5)).toEqual([['exploring', 15], ['implementing', 10], ['verifying', 5], ['idle', 5]])
    expect(categoryMinutes(['thinking', 'thinking', 'thinking'], 90_000)).toEqual([['thinking', 4.5]])
  })
  it('names the top three categories in minutes', () => {
    expect(rowLabel('s0:s3 prover', windows, window5)).toBe('s0:s3 prover: exploring 15 min, implementing 10 min, verifying 5 min')
    expect(rowLabel('s9', [null, null], window5)).toBe('s9: no recorded windows')
  })
})

describe('cursor keyboard moves', () => {
  it('moves one window with the arrows, to the ends with Home and End, and ignores other keys', () => {
    expect(moveCursor('ArrowRight', 4, 288)).toBe(5)
    expect(moveCursor('ArrowLeft', 4, 288)).toBe(3)
    expect(moveCursor('ArrowRight', 287, 288)).toBe(287)
    expect(moveCursor('ArrowLeft', 0, 288)).toBe(0)
    expect(moveCursor('Home', 200, 288)).toBe(0)
    expect(moveCursor('End', 0, 288)).toBe(287)
    expect(moveCursor('ArrowDown', 7, 288)).toBeNull()
    expect(moveCursor('End', 0, 0)).toBe(0)
  })
})

describe('paint', () => {
  it('keeps family hues and textures without a calibration table', () => {
    expect(behaviorPaint('reviewing')).toMatchObject({ family: 'reading', texture: 'hatch', uncalibrated: false })
    expect(behaviorPaint('looping')).toMatchObject({ family: 'serious', glyph: '↻', uncalibrated: false })
  })
  it('sends a category the table does not mark calibrated to neutral step 3 with the badge, textures kept', () => {
    const calibration = { exploring: { calibrated: true, auc: 0.91, n: 120 }, reviewing: { calibrated: false } }
    expect(behaviorPaint('exploring', calibration)).toMatchObject({ family: 'reading', uncalibrated: false })
    expect(behaviorPaint('reviewing', calibration)).toMatchObject({ family: 'neutral', step: 3, texture: 'hatch', uncalibrated: true })
    expect(behaviorPaint('looping', calibration)).toMatchObject({ family: 'neutral', step: 3, uncalibrated: true })
    expect(behaviorPaint('thinking', calibration)).toMatchObject({ family: 'neutral', step: 1, uncalibrated: false })
    expect(behaviorPaint('inbound', calibration)).toMatchObject({ family: 'event', uncalibrated: false })
  })
  it('draws an unknown category as neutral step 3 named by itself', () => {
    expect(behaviorPaint('dancing')).toMatchObject({ family: 'neutral', step: 3, label: 'dancing', uncalibrated: false })
  })
})

describe('clock ticks', () => {
  it('spaces labels at least the minimum apart in whole windows', () => {
    const start = Date.UTC(2026, 10, 1, 17, 0)
    expect(timeTicks(start, window5, 288, 3.5).map(t => t.index).slice(0, 3)).toEqual([0, 21, 42])
    expect(timeTicks(start, window5, 288, 3.5)[1]!.label).toBe('18:45Z')
    expect(timeTicks(start, window5, 4, 100)).toHaveLength(4)
  })
})
