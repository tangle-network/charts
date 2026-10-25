import type { CSSProperties, RefObject } from 'react'
import { FailGlyph, FitGlyph, PauseGlyph, PlayGlyph, RestartGlyph, ZoomInGlyph, ZoomOutGlyph } from './flow-waterfall-icons.js'
import { type FlowSegment, formatSpanDuration, toneKey } from './flow-waterfall-model.js'
import type { FlowView } from './flow-waterfall-row.js'
import type { ViewWindow } from './flow-waterfall-time.js'

const SPEEDS = [0.5, 1, 1.5, 2, 4]

export interface PlaybackBarProps {
  view: FlowView
  playing: boolean
  limit: number
  clockMs: number
  speed: number
  zoom: ViewWindow | null
  /** Whole-trace activity drawn under the scrub track. */
  marks: FlowSegment[]
  slider: RefObject<HTMLInputElement | null>
  timeOutput: RefObject<HTMLOutputElement | null>
  /** Shown while scrubbed away from the trace end. */
  followLabel?: string
  onTogglePlay: () => void
  onRestart: () => void
  onSpeed: (speed: number) => void
  onScrub: (ms: number) => void
  onFollow: () => void
  onZoom: (factor: number) => void
  onFit: () => void
}

/** Play, restart, speed, a scrub track over the trace's own activity, zoom and the legend. */
export function PlaybackBar({ view, playing, limit, clockMs, speed, zoom, marks, slider, timeOutput, followLabel,
  onTogglePlay, onRestart, onSpeed, onScrub, onFollow, onZoom, onFit }: PlaybackBarProps) {
  return (
    <footer className="fw-playback">
      <button type="button" className="fw-round-button" aria-label={playing ? 'Pause' : 'Play'} disabled={limit === 0} onClick={onTogglePlay}>
        {playing ? <PauseGlyph /> : <PlayGlyph />}
      </button>
      <button type="button" className="fw-icon-button" aria-label="Restart" title="Replay from the start" disabled={limit === 0}
        onClick={onRestart}><RestartGlyph /></button>
      {view === 'agents'
        ? <div className="fw-segmented" role="radiogroup" aria-label="Playback speed">
          {[1, 2, 4].map(value => <button key={value} type="button" role="radio" aria-checked={speed === value} onClick={() => onSpeed(value)}>{value}x</button>)}
        </div>
        : <label className="fw-speed"><span className="fw-sr-only">Playback speed</span>
          <select aria-label="Playback speed" value={speed} onChange={event => onSpeed(Number(event.target.value))}>
            {SPEEDS.map(value => <option key={value} value={value}>{value}x</option>)}
          </select>
        </label>}
      <div className="fw-overview">
        <div className="fw-overview-marks" aria-hidden>
          {marks.map((mark, i) => <span key={i} className={`fw-ov fw-seg-${mark.kind}`} data-tone={toneKey(mark.tone)}
            style={{ left: `${mark.startMs / Math.max(1, limit) * 100}%`, width: `${Math.max(0.15, (Math.min(mark.endMs, limit) - mark.startMs) / Math.max(1, limit) * 100)}%` }} />)}
          {zoom && <span className="fw-brush" style={{ left: `${zoom.startMs / limit * 100}%`, width: `${(zoom.endMs - zoom.startMs) / limit * 100}%` }} />}
        </div>
        <input ref={slider} aria-label="Playback position" type="range" min={0} max={Math.max(1, limit)} step="any" defaultValue={clockMs}
          disabled={limit === 0} className="fw-slider" style={{ '--fw-progress': `${clockMs / Math.max(1, limit) * 100}%` } as CSSProperties}
          onChange={event => onScrub(Number(event.target.value))} />
      </div>
      <output ref={timeOutput} className="fw-time" aria-label="Playback time">{formatSpanDuration(clockMs)}</output>
      {followLabel && <button type="button" className="fw-text-button" onClick={onFollow}>{followLabel}</button>}
      <div className="fw-zoom" role="group" aria-label="Zoom">
        <button type="button" className="fw-icon-button" aria-label="Zoom out" disabled={!zoom} onClick={() => onZoom(2)}><ZoomOutGlyph /></button>
        <button type="button" className="fw-icon-button" aria-label="Zoom in" disabled={limit === 0} onClick={() => onZoom(0.5)}><ZoomInGlyph /></button>
        <button type="button" className="fw-icon-button" aria-label="Fit the whole trace" disabled={!zoom} onClick={onFit}><FitGlyph /></button>
      </div>
      <ul className="fw-legend" aria-label="Span types">
        <li><span className="fw-swatch fw-swatch-model" aria-hidden />{view === 'agents' ? 'Thinking' : 'Model call'}</li>
        <li><span className="fw-swatch fw-swatch-tool" aria-hidden />Tool call</li>
        <li><span className="fw-swatch fw-swatch-waiting" aria-hidden />Waiting</li>
        <li><span className="fw-swatch fw-swatch-handoff" aria-hidden />Handoff</li>
        <li><span className="fw-swatch fw-swatch-failed" aria-hidden><FailGlyph /></span>Failed</li>
      </ul>
    </footer>
  )
}
