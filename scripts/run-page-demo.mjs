/** Browser entry for the run page captures: each addition in its React and static forms, from the built package. */
import { createElement as h, Fragment } from 'react'
import { createRoot } from 'react-dom/client'
import { phaseWaterfall, renderFigure, smallMultiples, timeline, timeSeries } from '../dist/index.js'
import { FigureView, Gantt, Lines, Meter } from '../dist/react/index.js'
import magnetar from '../docs/fixtures/magnetar-play.json'

const min = 60_000
const t = Date.UTC(2026, 9, 15, 11, 0)
const clock = (ms) => new Date(ms).toISOString().slice(11, 16)
const span = (a, b) => `${clock(a)}–${clock(b)} (${Math.round((b - a) / min)} min)`

// A run that passed its check after its supervisor died and resumed: the shape the run page must show.
const score = [[t, 0], [t + 40 * min, 3], [t + 70 * min, 5], [t + 120 * min, 8], [t + 150 * min, 10]]
const marks = [
  { at: t + 78 * min, label: 'supervisor died', kind: 'died' },
  { at: t + 150 * min, label: 'first pass', kind: 'pass' },
  { at: t + 180 * min, label: 'deadline', kind: 'deadline' },
]
const bands = [
  { from: t + 78 * min, to: t + 138 * min, label: 'no trace', kind: 'missing' },
  { from: t + 150 * min, to: t + 180 * min, label: 'after first pass', kind: 'after-pass' },
]
const xMarks = marks.map((m) => ({ ...m, at: (m.at - t) / 3_600_000 }))
const xBands = bands.map((b) => ({ ...b, from: (b.from - t) / 3_600_000, to: (b.to - t) / 3_600_000 }))
const axes = { x: { label: 'hour', domain: [0, 3] }, y: { label: 'check score', unit: 'pts', domain: [0, 10] }, formatX: (x) => x.toFixed(1) }
const staticScore = timeSeries([{ id: 'run', label: 'jcs run', points: score.map(([ms, y]) => ({ x: (ms - t) / 3_600_000, y })) }], { ...axes, marks: xMarks, bands: xBands, id: 'score-marks' })

const lanes = [
  { id: 'driver', label: 'Driver', spans: [
    { start: t, end: t + 78 * min, state: 'work' },
    { start: t + 78 * min, end: t + 138 * min, state: 'untraced', note: 'supervisor down' },
    { start: t + 138 * min, end: null, state: 'work' },
  ] },
  { id: 'researcher', label: 'Researcher', spans: [{ start: t + 10 * min, end: t + 60 * min, state: 'work' }, { start: t + 60 * min, end: t + 78 * min, state: 'idle' }, { start: t + 140 * min, end: t + 160 * min, state: 'work' }] },
  { id: 'keeper', label: 'Keeper check', spans: [{ start: t + 145 * min, end: t + 150 * min, state: 'work', note: 'play check passed' }] },
]
const now = t + 165 * min
const staticTimeline = timeline(lanes, { measure: 'run activity', now, marks: marks.slice(0, 2), id: 'run-timeline' })

const arms = [
  { id: 'a', label: 'pi · sonnet', points: [0, 0.5, 1, 1.5, 2, 2.5, 3].map((x, i) => ({ x, y: [0, 2, 4, 5, 7, 8, 9][i] })) },
  { id: 'b', label: 'codex · gpt', points: [0, 0.5, 1].map((x, i) => ({ x, y: [0, 3, 4][i] })), end: { at: 1.2, kind: 'died' } },
  { id: 'c', label: 'claude · opus', missing: { why: 'infra failure', detail: 'sandbox never started' } },
  { id: 'd', label: 'opencode · glm', points: [0, 1, 2, 3].map((x, i) => ({ x, y: [0, 1, 3, 6][i] })) },
]
const multiples = smallMultiples(arms, { ...axes, shared: 'both', noun: 'arm', id: 'arms' })

const channel = [
  { name: 'pi · sonnet', color: 'var(--chart-accent)', points: score },
  { name: 'codex · gpt', color: 'var(--chart-accent)', dash: 'dash', marker: 'square', points: score.map(([x, y]) => [x, Math.max(0, y - 2)]) },
  { name: 'opencode · glm', color: 'var(--chart-accent)', dash: 'dot', marker: 'triangle', points: score.map(([x, y]) => [x, y / 2]) },
]
const staticChannel = timeSeries(channel.map((s, i) => ({ id: String(i), label: s.name, points: s.points.map(([ms, y]) => ({ x: (ms - t) / 3_600_000, y })) })), { ...axes, id: 'channels' })

// The focused play page's figures from real Magnetar records: the climb and the bar panels share one release axis.
const stages = ['manifest', 'build', 'guests', 'keys', 'workloads', 'hidden']
const climb = timeSeries(magnetar.climb.rows, { ...magnetar.climb.options, formatY: (p) => (p >= 1 ? 'SOLVED' : `${stages[Math.floor(p * 6 + 1e-9)]} stage`) })
const si = (v) => (v >= 1e6 ? `${+(v / 1e6).toPrecision(3)}M` : v >= 1e3 ? `${+(v / 1e3).toPrecision(3)}k` : String(+v.toPrecision(3)))
const bar = smallMultiples(magnetar.bar.panels.map((panel) => ({ ...panel, format: si })), magnetar.bar.options)

const fig = (figure) => (figure.refused ? figure.refused : renderFigure(figure, 1, { presentation: 'chart' }))
const panel = (title, child) => h('div', { className: 'panel' }, h('h3', null, title), child)
const html = (markup) => h('div', { dangerouslySetInnerHTML: { __html: markup } })

const sections = {
  'marks-bands': [
    panel('React Lines with marks and bands', h(Lines, { series: [{ name: 'check score', color: 'var(--chart-accent)', points: score }], marks, bands, axis: clock, rows: 14 })),
    panel('Static timeSeries with marks and bands', html(fig(staticScore))),
  ],
  lanes: [
    panel('React Gantt lanes, open span to now', h(Gantt, { lanes, now, marks: marks.slice(0, 2), axis: clock, span, colors: { work: 'var(--chart-accent)', idle: 'var(--chart-muted)' } })),
    panel('Static timeline', html(fig(staticTimeline))),
  ],
  segments: [
    panel('React Meter segments', h(Fragment, null,
      h(Meter, { total: 3 * 3_600_000, format: (v) => `${(v / 3_600_000).toFixed(2)} h`, segments: [{ label: 'agent work', value: 0.29 * 3_600_000 }, { label: 'idle', value: 1.05 * 3_600_000, color: 'var(--chart-muted)' }, { label: 'tokens cached', value: null }] }),
      h('div', { style: { height: 16 } }),
      h(Meter, { total: null, segments: [{ label: 'agent work', value: 1 }] }))),
    panel('Static phaseWaterfall, hatched unaccounted', html(fig(phaseWaterfall([{ id: 'work', label: 'Agent work', ms: 0.29 * 3_600_000 }, { id: 'idle', label: 'Idle', ms: 1.05 * 3_600_000, kind: 'unaccounted' }], { measure: 'wall time', totalMs: 2.2 * 3_600_000, id: 'wall' })))),
  ],
  'small-multiples': [
    panel('React FigureView of smallMultiples', h(FigureView, { figure: multiples, presentation: 'report' })),
    panel('Static smallMultiples', html(fig(multiples))),
  ],
  'figure-view': [
    panel('FigureView, wide container', h(FigureView, { figure: staticTimeline })),
    panel('FigureView, 358 px container', h('div', { style: { maxWidth: 358 } }, h(FigureView, { figure: staticTimeline }))),
  ],
  'play-climb': [
    panel('Static timeSeries: Magnetar check progress by release, coloured by checker', html(fig(climb))),
  ],
  'play-bar': [
    panel(`Static smallMultiples: against the paper's bar (${magnetar.bar.condition}; ${magnetar.bar.checkCondition})`, html(fig(bar))),
  ],
  'second-channel': [
    panel('React Lines, dash and marker channel', h(Lines, { series: channel, axis: clock, rows: 14 })),
    panel('Static timeSeries, dash and marker channel', html(fig(staticChannel))),
  ],
}

for (const [id, children] of Object.entries(sections)) {
  createRoot(document.getElementById(id)).render(h(Fragment, null, ...children))
}
