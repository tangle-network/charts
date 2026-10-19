// Export the Magnetar play's climb and bar figure inputs from Discovery run records (run on drew-gtr-pro, node >= 18).
//   node docs/fixtures/export-magnetar-play.mjs /mnt/traces/discovery-runs '{"magnetar-rust-20261017c":102,"magnetar-rust-20261018b":5,"magnetar-rust-20261019b":0}' > docs/fixtures/magnetar-play.json
// Folds check and gate rows by (tag, kind, checker, verdict, progress) as data-contract A1 (scores v2) specifies.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const root = process.argv[2]
const published = JSON.parse(process.argv[3])
const RUNS = ['magnetar-rust-20261017c', 'magnetar-rust-20261018b', 'magnetar-rust-20261019b']
const STAGES = ['manifest', 'build', 'guests', 'keys', 'workloads', 'hidden']
const short = (run) => run.slice(-3)
const jsonl = (file) => fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []
const ms = (iso) => Date.parse(iso)
const hhmm = (t) => new Date(t).toISOString().slice(11, 16) + 'Z'
const mdhm = (t) => new Date(t).toISOString().slice(5, 16).replace('T', ' ') + 'Z'
const scoreOf = (row) => {
  if (row.score) return row.score
  const m = /^SCORE (\{.*\})$/m.exec(row.detail || '')
  return m ? JSON.parse(m[1]) : null
}
const verdictLine = (row) => ((row.detail || '').split('\n').find((l) => /^(SOLVED|NOT SOLVED|UNKNOWN)/.test(l)) || (row.detail || '').split('\n').at(-1) || '').slice(0, 240)
const progressOf = (score, solved) => solved ? 1 : score ? Math.round((score.reached - 1 + (score.partial ?? 0)) / score.of * 1000) / 1000 : null
const digest = (s) => s ? crypto.createHash('sha256').update(s).digest('hex').slice(0, 8) : null
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2 }

const runs = RUNS.map((run) => {
  const dir = path.join(root, run)
  const input = JSON.parse(fs.readFileSync(path.join(dir, 'run-input.json'), 'utf8'))
  const score = JSON.parse(fs.readFileSync(path.join(dir, 'scorecard.json'), 'utf8'))
  const ops = jsonl(path.join(dir, 'operator-checkpoints.jsonl'))
  return {
    run, dir, start: ms(score.timing.start), settled: score.timing.settledAt ? ms(score.timing.settledAt) : null,
    inputDigest: digest(input.acceptance?.play?.check?.script),
    checks: jsonl(path.join(dir, 'play-checks.jsonl')).map((r) => ({ ...r, kind: 'check' })),
    gates: jsonl(path.join(dir, 'tag-gate.jsonl')).map((r) => ({ ...r, kind: 'gate' })),
    rulings: ops.filter((r) => r.kind === 'ruler-amendment'),
    amendments: ops.filter((r) => r.kind === 'amendment-pr'),
    metricsFile: fs.existsSync(path.join(dir, 'magnetar-metrics.json')) ? { mtime: fs.statSync(path.join(dir, 'magnetar-metrics.json')).mtimeMs, data: JSON.parse(fs.readFileSync(path.join(dir, 'magnetar-metrics.json'), 'utf8')) } : null,
  }
})

// Checker digests in force over time per run: the run's input, every check row's checker, every amendment's new digest.
for (const r of runs) {
  r.digestEvents = [
    { at: r.start, digest: r.inputDigest },
    ...r.checks.filter((c) => c.checker?.sha256).map((c) => ({ at: ms(c.at), digest: c.checker.sha256.slice(0, 8) })),
    ...r.amendments.filter((a) => a.newDigest).map((a) => ({ at: ms(a.at), digest: a.newDigest.replace('sha256:', '').slice(0, 8) })),
  ].sort((a, b) => a.at - b.at)
  r.checkerAt = (t) => r.digestEvents.filter((e) => e.at <= t).at(-1)?.digest ?? r.inputDigest
}

// Rows with a tag, each with kind, checker, verdict, progress, score.
const rows = []
for (const r of runs) {
  for (const c of r.checks) {
    if (!c.tag) continue
    const s = scoreOf(c)
    const verdict = c.solved ? 'solved' : c.known === false ? 'undecided' : 'not-solved'
    rows.push({ run: r.run, tag: c.tag.split('/').pop(), commit: c.commit, kind: 'check', at: ms(c.at), checker: c.checker?.sha256?.slice(0, 8) ?? r.checkerAt(ms(c.at)), checkerBasis: c.checker?.sha256 ? 'row' : 'time', verdict, score: s, progress: progressOf(s, c.solved), line: verdictLine(c), detail: c.detail || '' })
  }
  for (const g of r.gates) {
    const s = scoreOf(g)
    const verdict = { pass: 'contract-held', fail: 'contract-failed', unknown: 'undecided', superseded: 'superseded' }[g.verdict]
    rows.push({ run: r.run, tag: g.tag.split('/').pop(), commit: g.commit, kind: 'gate', at: ms(g.at), checker: r.checkerAt(ms(g.at)), checkerBasis: 'time', verdict, score: s, progress: verdict === 'superseded' || verdict === 'undecided' ? null : progressOf(s, false), line: verdictLine(g), detail: g.detail || '' })
  }
}

// Checker labels by first appearance across the play's runs; the current checker is the newest run's input digest.
const firstSeen = new Map()
for (const r of runs) for (const e of r.digestEvents) if (e.digest && (!firstSeen.has(e.digest) || firstSeen.get(e.digest) > e.at)) firstSeen.set(e.digest, e.at)
const order = [...firstSeen].sort((a, b) => a[1] - b[1]).map(([d]) => d)
const current = runs.at(-1).inputDigest
const recency = [current, ...[...order].reverse().filter((d) => d !== current)]
const rulingFor = new Map()
for (const r of runs) for (const ruling of r.rulings.filter((x) => x.verdict === 'upheld')) {
  const pr = r.amendments.find((a) => a.dispute === ruling.dispute && a.newDigest)
  const next = pr ? pr.newDigest.replace('sha256:', '').slice(0, 8) : r.checks.find((c) => ms(c.at) > ms(ruling.at) && c.checker?.sha256 && c.checker.sha256.slice(0, 8) !== r.checkerAt(ms(ruling.at)))?.checker.sha256.slice(0, 8)
  if (next && !rulingFor.has(next)) rulingFor.set(next, { ...ruling, run: r.run })
}
const checkers = order.map((d, i) => {
  const ruling = rulingFor.get(d)
  const pressedBy = runs.find((r) => r.inputDigest === d && !ruling)
  const origin = ruling ? `${ruling.by} ${ruling.dispute.startsWith('operator') ? 'amendment' : 'upheld'} ${mdhm(ms(ruling.at))}` : pressedBy ? `${short(pressedBy.run)} as pressed` : 'first seen'
  return { digest: d, label: `v${i + 1}`, origin, colorIndex: recency.indexOf(d), current: d === current }
})
const checkerOf = new Map(checkers.map((c) => [c.digest, c]))

// Columns: one per tag with at least one row, in first-row time order, grouped by run. A run with no SCORE rows is
// compressed to 0.3 of a column per tag; a run with no rows gets one empty, wider column.
const columns = []
const groups = []
for (const r of runs) {
  const own = rows.filter((x) => x.run === r.run)
  const tags = [...new Set(own.map((x) => x.tag))].map((tag) => ({ tag, first: Math.min(...own.filter((x) => x.tag === tag).map((x) => x.at)) }))
    .sort((a, b) => a.first - b.first || Number(a.tag.slice(2)) - Number(b.tag.slice(2)))
  const scored = own.some((x) => x.score)
  const startAt = columns.length
  if (!tags.length) columns.push({ at: columns.length, label: '', weight: 2, run: r.run, tag: null, first: r.start })
  for (const t of tags) columns.push({ at: columns.length, label: t.tag, weight: scored ? 1 : 0.3, run: r.run, tag: t.tag, first: t.first })
  const gateVerdicts = (tag) => own.filter((x) => x.kind === 'gate' && x.tag === tag).map((x) => x.verdict)
  // Withheld: a failed or undecided gate and no held one. Superseded: every gate row was superseded.
  const withheld = tags.filter((t) => { const v = gateVerdicts(t.tag); return v.some((x) => x === 'contract-failed' || x === 'undecided') && !v.includes('contract-held') }).length
  const superseded = tags.filter((t) => { const v = gateVerdicts(t.tag); return v.length && v.every((x) => x === 'superseded') }).length
  const [t0, t1] = own.length ? [Math.min(...own.map((x) => x.at)), Math.max(...own.map((x) => x.at))] : [r.start, r.start]
  const span = own.length ? `${mdhm(t0)}–${new Date(t0).toISOString().slice(0, 10) === new Date(t1).toISOString().slice(0, 10) ? hhmm(t1) : mdhm(t1)}` : `started ${mdhm(r.start)}`
  const ending = r.settled ? (r.run.endsWith('18b') ? 'stalled, cancelled' : 'settled') : 'live'
  const label = !tags.length ? `${short(r.run)} · 0 tags · ${ending}`
    : !scored ? `${short(r.run)} · ${tags.length} of ${published[r.run] ?? '?'} tags checked by ${checkerOf.get(own[0].checker)?.label}, no score line · ${own.filter((x) => x.verdict === 'not-solved').length} not solved · ${ending}`
    : `${short(r.run)} · ${span} · ${published[r.run] ?? 0} published, ${withheld} withheld, ${superseded} superseded · ${ending}`
  groups.push({ from: startAt, to: columns.length - 1, label, kind: 'group' })
}
const colOf = (run, tag) => columns.find((c) => c.run === run && c.tag === tag)

// Gaps over 2 h between consecutive columns of one run; rulings placed by time between the columns around them.
const marks = []
for (let i = 1; i < columns.length; i++) {
  const a = columns[i - 1], b = columns[i]
  if (a.run === b.run && b.first - a.first > 2 * 3600e3) marks.push({ at: (a.at + b.at) / 2, label: `${((b.first - a.first) / 3600e3).toFixed(1)} h`, kind: 'event', source: 'gap' })
}
for (const r of runs) for (const ruling of r.rulings) {
  const t = ms(ruling.at), own = columns.filter((c) => c.run === r.run && c.tag)
  const before = own.filter((c) => c.first <= t).at(-1), after = own.find((c) => c.first > t)
  const at = before && after ? before.at + (t - before.first) / (after.first - before.first) * (after.at - before.at) : (before ?? after).at + (before ? 0.5 : -0.5)
  const upheld = ruling.verdict === 'upheld'
  const to = upheld ? [...rulingFor].find(([, v]) => v.at === ruling.at)?.[0] : null
  marks.push({ at: Math.round(at * 1000) / 1000, label: upheld ? `${checkerOf.get(to)?.label ?? 'new check'} · ${ruling.by} ${ruling.dispute.startsWith('operator') ? 'amendment' : 'upheld'} ${hhmm(t)}` : `check stands · ${ruling.by} ${hhmm(t)}`, kind: 'ruling' })
}

// Climb rows: one per (run, checker), points folded by (tag, kind, verdict, progress).
// A superseded gate never ran: it records a release state, not a verdict, so its mark carries none and no value.
const VERDICT = { solved: 'pass', 'contract-held': 'pass', 'not-solved': 'fail', 'contract-failed': 'fail', undecided: 'unknown' }
const series = []
for (const r of runs) for (const c of checkers) {
  const own = rows.filter((x) => x.run === r.run && x.checker === c.digest)
  if (!own.length) continue
  const folded = new Map()
  for (const x of own) {
    const key = [x.tag, x.kind, x.verdict, x.progress].join('|')
    const f = folded.get(key) ?? { ...x, count: 0, firstAt: x.at, lastAt: x.at }
    f.count++; f.firstAt = Math.min(f.firstAt, x.at); f.lastAt = Math.max(f.lastAt, x.at)
    if (x.at >= f.lastAt) { f.line = x.line; f.score = x.score ?? f.score }
    folded.set(key, f)
  }
  // Within a column, valued marks come first so a verdict without a value does not break the checker's line.
  const points = [...folded.values()].sort((a, b) => colOf(r.run, a.tag).at - colOf(r.run, b.tag).at || Number(a.progress === null) - Number(b.progress === null) || a.firstAt - b.firstAt).map((f) => {
    const w = f.score?.workloads
    return {
      x: colOf(r.run, f.tag).at, y: f.progress, verdict: VERDICT[f.verdict], marker: f.kind === 'gate' ? 'diamond' : 'circle',
      ...(f.verdict === 'solved' ? { glyph: 'check' } : {}),
      ...(w && f.score.stage === 'workloads' ? { label: `${w.passed}/${w.total}` } : {}),
      count: f.count, firstAt: f.firstAt, lastAt: f.lastAt,
      annotation: `${f.kind} ${f.verdict.replace('-', ' ')}${f.checkerBasis === 'time' ? ' (checker by time)' : ''}: ${f.line}`.slice(0, 240),
    }
  })
  series.push({ id: `${short(r.run)}-${c.label}`, label: `${c.label} · ${c.origin}${c.current ? ' (current)' : ''}`, colorIndex: c.colorIndex, points })
}
series.sort((a, b) => a.colorIndex - b.colorIndex || a.id.localeCompare(b.id))

// Bar panels: one point per (tag, commit) from the gate row's SCORE, else the latest scored check row; security bits
// from magnetar.json in the check's cached build of that commit.
// The check builds each commit once; any row of that commit names the build directory ("cached at <dir>").
const buildOf = new Map()
for (const x of rows) { const m = /cached at ([^\s)]+)/.exec(x.detail); if (m && x.commit && !buildOf.has(x.commit)) buildOf.set(x.commit, m[1]) }
const bitsOf = (x) => {
  const file = buildOf.has(x.commit) && path.join(buildOf.get(x.commit), 'src', 'magnetar.json')
  return file && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).security_bits ?? null : null
}
const releases = new Map()
// An undecided gate (the prover timed out) measured only the workloads it finished: it is not a release's value.
for (const x of rows.filter((x) => x.verdict !== 'undecided' && (x.score?.proofBytes !== undefined || x.score?.verifyMs !== undefined))) {
  const key = `${x.run}|${x.tag}|${x.commit}`
  const prev = releases.get(key)
  if (!prev || (x.kind === 'gate' && prev.kind !== 'gate') || (x.kind === prev.kind && x.at > prev.at)) releases.set(key, { ...x, bits: bitsOf(x) ?? prev?.bits ?? null })
  else if (prev.bits === null) prev.bits = bitsOf(x)
}
const barPoint = (x, value) => {
  const comparable = x.bits === null ? null : x.bits >= 120
  const verdict = VERDICT[x.verdict]
  return {
    x: colOf(x.run, x.tag).at, y: value, verdict, comparable, marker: x.kind === 'gate' ? 'diamond' : 'circle',
    ...(verdict === 'fail' && comparable ? { glyph: 'cross' } : {}),
    annotation: `${x.tag} ${x.commit.slice(0, 8)} · ${x.bits === null ? 'security bits unknown' : `declares ${x.bits}-bit security`} (magnetar.json in the check's build) · ${x.kind} ${x.verdict.replace('-', ' ')} under ${checkerOf.get(x.checker)?.label}`,
  }
}
const ordered = [...releases.values()].sort((a, b) => colOf(a.run, a.tag).at - colOf(b.run, b.tag).at || a.at - b.at)
const metrics = runs.find((r) => r.metricsFile)
const solvedAtMtime = metrics && rows.filter((x) => x.run === metrics.run && x.verdict === 'solved').sort((a, b) => Math.abs(a.at - metrics.metricsFile.mtime) - Math.abs(b.at - metrics.metricsFile.mtime))[0]
const workloads = metrics ? Object.values(metrics.metricsFile.data.workloads) : []
const fromFile = (field, note) => solvedAtMtime ? [{
  ...barPoint({ ...solvedAtMtime, bits: metrics.metricsFile.data.security_bits }, median(workloads.map((w) => w[field]))),
  annotation: `${solvedAtMtime.tag} solved ${hhmm(solvedAtMtime.at)} under ${checkerOf.get(solvedAtMtime.checker)?.label} · median of ${workloads.length} workloads, ${Math.min(...workloads.map((w) => w[field]))}–${Math.max(...workloads.map((w) => w[field]))} · declares ${metrics.metricsFile.data.security_bits}-bit security · ${note}`,
}] : []
const panels = [
  { id: 'rate', label: 'Proving rate (higher is better)', unit: 'c/s', scale: 'log', domain: [5e4, 3e7], points: fromFile('rate_cps', 'a rate is recorded only on a solved check'), targets: [{ from: 7.2e6, to: 8.7e6, label: 'paper 7.2–8.7 M', kind: 'target' }, { from: 9.5e6, to: 12.8e6, label: 'opt 9.5–12.8 M', kind: 'stretch' }] },
  { id: 'proof', label: 'Proof size (lower is better)', unit: 'B', scale: 'log', domain: [5e3, 2e6], points: ordered.filter((x) => x.score.proofBytes !== undefined).map((x) => barPoint(x, x.score.proofBytes)), targets: [{ from: 613376, to: 613376, label: 'paper ≈599 KiB', kind: 'target' }] },
  { id: 'verify', label: 'Verify time (lower is better)', unit: 'ms', scale: 'log', domain: [5, 600], points: ordered.filter((x) => x.score.verifyMs !== undefined).map((x) => barPoint(x, x.score.verifyMs)), targets: [{ from: 11, to: 13, label: 'paper 11–13 ms', kind: 'target' }, { from: 8, to: 11, label: 'opt 8–11 ms', kind: 'stretch' }] },
  { id: 'rss', label: 'Peak memory (lower is better)', unit: 'KiB', scale: 'log', domain: [1e3, 2e7], points: fromFile('rss_kib', 'recorded only on a solved check'), targets: [{ from: 6291456, to: 6291456, label: 'paper ≈6 GiB', kind: 'target' }, { from: 4194304, to: 4194304, label: '4.0 GiB', kind: 'stretch' }] },
]

const domain = [-0.5, columns.length - 0.5]
const out = {
  source: {
    exportedAt: new Date().toISOString(),
    host: 'drew-gtr-pro', root, runs: RUNS,
    files: ['play-checks.jsonl', 'tag-gate.jsonl', 'operator-checkpoints.jsonl', 'run-input.json', 'scorecard.json', 'magnetar-metrics.json', '~/.cache/disco/play-checks/<build>/src/magnetar.json'],
    rows: rows.length, published, publishedSource: 'GitHub tangle-discovery/magnetar-rust tags, 2026-10-19',
    method: 'Check and gate rows with a tag, folded by (tag, kind, checker, verdict, progress); progress = (reached - 1 + partial) / of, 1 for a solve, null without a SCORE line. Gate rows take the checker in force at their time. Checkers are labelled vN by first appearance; colour 0 is the newest run\'s input check.',
    checkers,
  },
  climb: {
    rows: series,
    options: {
      id: 'magnetar-climb',
      x: { label: 'release', domain, categories: columns.map(({ at, label, weight }) => ({ at, label, ...(weight !== 1 ? { weight } : {}) })) },
      y: { label: 'check progress', unit: '', domain: [0, 1], ticks: [...STAGES.map((s, i) => ({ at: Math.round(i / 6 * 1000) / 1000, label: s })), { at: 1, label: 'SOLVED' }], strip: 'no score' },
      marks, bands: groups,
    },
  },
  bar: {
    panels,
    options: { id: 'magnetar-bar', shared: 'x', columns: 2, connect: false, noun: 'metric', x: { label: 'release', domain, categories: columns.map(({ at, label, weight }) => ({ at, label, ...(weight !== 1 ? { weight } : {}) })) }, y: { label: 'value against the paper', unit: 'value', domain: [1, 2] } },
    condition: 'paper: 2^22-cycle executions, 12 performance cores of an M4 Max MacBook Pro, 120-bit (ePrint 2026/2423, Tables 2, 3 and 8)',
    checkCondition: 'check: 2^12 = 4,096 cycles per workload, one jailed run on the Lab host',
  },
}
process.stdout.write(JSON.stringify(out, null, 1) + '\n')
