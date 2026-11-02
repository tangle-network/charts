// The observation panels: 100 agents × 288 five-minute windows of synthetic behavior (the README proof's worst case,
// `?rows=` and `?windows=` override it) or run e's real 43 rows from the storyboard (`?data=e`), the run's per-agent
// metrics with the producer's outliers, a climb with unmerged candidates, and live cards carrying the four new activities.
const CATS = ['exploring', 'reviewing', 'implementing', 'process_files', 'integrating', 'verifying', 'building', 'thinking', 'running', 'idle', 'looping', 'communicating', 'inbound']
function lcg(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) }
function syntheticRows(count, windows) {
  const random = lcg(2026), rows = [], events = []
  for (let r = 0; r < count; r++) {
    const from = Math.floor(random() * windows * 0.3), to = Math.min(windows, from + Math.floor(windows * (0.4 + random() * 0.6)))
    const cells = Array.from({ length: windows }, () => null)
    let w = from
    while (w < to) {
      const run = 2 + Math.floor(random() * 10), pick = random()
      const category = pick < 0.2 ? 'exploring' : pick < 0.28 ? 'reviewing' : pick < 0.46 ? 'implementing' : pick < 0.52 ? 'process_files' : pick < 0.56 ? 'integrating' : pick < 0.72 ? 'verifying' : pick < 0.8 ? 'building' : pick < 0.86 ? 'thinking' : pick < 0.92 ? 'running' : pick < 0.97 ? 'idle' : 'looping'
      for (let i = 0; i < run && w < to; i++, w++) cells[w] = category
      if (random() < 0.15 && w < to) { cells[w] = random() < 0.5 ? 'communicating' : 'inbound'; w++ }
    }
    rows.push({ id: 'agent-' + r, label: 'Agent ' + r + (r % 7 === 0 ? ' · lead' : ' · worker'), windows: cells })
    for (let e = 0; e < 3; e++) events.push({ rowId: 'agent-' + r, at: START + (from + random() * Math.max(1, to - from)) * WINDOW_MS, label: 'steer → agent-' + Math.floor(random() * count) })
  }
  return { rows, events }
}
const WINDOW_MS = 300000, START = Date.UTC(2026, 10, 1, 17, 0)
function short(id) { const i = id.indexOf(':'); return i < 0 ? 'root' : id.slice(i + 1) }
function treeOrder(nodes) { const byParent = {}; nodes.forEach(n => { (byParent[n.parent || ''] = byParent[n.parent || ''] || []).push(n) }); const out = []; (function walk(p) { (byParent[p] || []).sort((a, b) => a.start - b.start).forEach(n => { out.push(n); walk(n.id) }) })(''); return out }
const METRICS = [['calls_per_hour', 'tool calls per hour', null], ['fail_rate', 'failure rate', v => Math.round(v * 100) + ' %'], ['idle_min', 'idle minutes', null], ['streaks', 'failing streaks', null], ['spend_input', 'input tokens (journal, settled)', null]]
function Behavior() {
  const real = params.get('data') === 'e'
  const [selected, setSelected] = useState(null), [dot, setDot] = useState(null), [extra, setExtra] = useState(0)
  const [live] = useState(() => real ? { rows: treeOrder(runE.nodes).map(n => ({ id: short(n.id), label: short(n.id) + ' · ' + n.label, windows: n.windows })), events: runE.edges.filter(e => e.frm).map(e => ({ rowId: short(e.frm), at: e.at * 1000, label: e.kind + (e.to ? ' → ' + short(e.to) : '') })) }
    : syntheticRows(Number(params.get('rows') || 100), Number(params.get('windows') || 288)))
  const rows = extra ? live.rows.map(row => ({ ...row, windows: [...row.windows, ...Array.from({ length: extra }, (_, i) => CATS[(row.windows.length + i) % 11])] })) : live.rows
  const startedAt = real ? runE.t0 * 1000 : START, windowMs = real ? runE.window_s * 1000 : WINDOW_MS
  const markers = real ? runE.checks.map(c => ({ at: Date.parse(c.at), label: c.tag.split('/').pop(), verdict: c.solved ? 'pass' : 'fail' })) : [5, 11, 17, 22].map((h, i) => ({ at: START + h * 3600000, label: 'rc' + (i + 1), verdict: i === 3 ? 'pass' : i === 1 ? 'unknown' : 'fail' }))
  const calibration = real ? runE.calibration : Object.fromEntries(CATS.map(c => [c, { calibrated: c !== 'reviewing' && c !== 'process_files', auc: 0.9, n: 120 }]))
  const metrics = METRICS.map(([m, label, format]) => ({ id: m, label, ...(format ? { format } : {}), ...(m === 'fail_rate' ? { max: 1 } : {}), dots: (real ? runE.nodes : []).map(n => ({ id: short(n.id), label: short(n.id), value: n[m] == null ? null : n[m], outlier: n.z && n.z[m] != null && Math.abs(n.z[m]) >= 2.5, note: n.z && n.z[m] != null ? 'robust z ' + n.z[m] + ' (median/MAD of ' + runE.nodes.length + ' agents)' : undefined })) }))
  const climb = [[START, 1], [START + 4 * 3600000, 2], [START + 9 * 3600000, 2], [START + 15 * 3600000, 3]]
  const agents = [['testing', true], ['messaging', true], ['reviewing', true], ['looping', true], ['reviewing', false]].map(([activity, calibrated], i) => ({ id: 'live-' + i, label: 'Agent ' + i, status: 'running', activity, activityCalibrated: calibrated, turn: 'Recorded turn ' + i, model: 'glm-5.3', events: [{ id: 'e' + i, label: 'bash cargo test -p prover', at: Date.now() - 4000 }], startedAt: Date.now() - 600000, lastActivityAt: Date.now() - 4000, medianEventGapMs: 3000 }))
  return <main className="observation">
    <h1>{real ? 'Run ' + runE.run : rows.length + ' agents × ' + rows[0].windows.length + ' windows'}</h1>
    <button onClick={() => setExtra(n => n + 1)}>Append window</button>
    <output aria-label="Reader selection">{selected ? selected.rowId + ':' + selected.windowIndex : 'No selection'}</output>
    <BehaviorStrip label="Behavior per agent per window" rows={rows} windowMs={windowMs} startedAt={startedAt} markers={markers} events={live.events} calibration={calibration} selected={selected} onSelect={(rowId, windowIndex) => setSelected({ rowId, windowIndex })} live={extra > 0} renderRowLabel={real ? row => <><code>{row.id}</code> {row.label.slice(row.id.length + 3)}</> : undefined} />
    {real && <><h2>Anomalies against the run</h2><output aria-label="Dot selection">{dot ? dot.rowId + ':' + dot.dotId : 'No dot selected'}</output><DotStrip label="Per-agent metrics with outliers" rows={metrics} selected={dot} onSelect={(rowId, dotId) => setDot({ rowId, dotId })} /></>}
    <h2>Climb with unmerged candidates</h2>
    <Lines rows={14} axis={t => new Date(t).toISOString().slice(11, 16)} series={[{ name: 'Best so far', color: 'var(--chart-series-1)', interpolation: 'step', points: climb }]}
      marks={[{ kind: 'release', label: 'rc1', at: START + 4 * 3600000, verdict: 'pass' }, { kind: 'candidate', label: 'KEEP #2871', age: '3 h', at: START + 12 * 3600000 }, { kind: 'candidate', label: 'KEEP #2880', age: '40 min', at: START + 14.5 * 3600000 }]} />
    <h2>Live cards with the four new activities</h2>
    <AgentGraph className="topology-pane" live nodes={agents} edges={agents.slice(1).map(a => ({ from: "live-0", to: a.id, kind: "spawn" }))} now={Date.now()} />
  </main>
}
