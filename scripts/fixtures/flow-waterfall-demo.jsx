// Demo routes for the trace inspector: reference-shaped fixtures, recorded Discovery runs and a synthetic load trace.
// Query: fixture=release|incident|discovery|run21c|load|otlp:<file under the data dir>, view=spans|agents, theme=dark|light, live=1, rate=N, n=N, width=px, markers=<JSON FlowMarker[]>, names=long (otlp worst-case labels), outcomes=1 (status as outcome), fill=outcome (outcome fill; agent hue is the default), desc=<goal line>.
import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import { FlowWaterfall } from '../../src/react/index.ts'
import { catalogPrice, otlpFlowTrace, parseOtlpJsonl } from '../../src/index.ts'
import '@tangle-network/brand/styles/tokens.css'
import '../../src/react/flow-waterfall.css'
import release from '../../docs/fixtures/trace-release.json'
import incident from '../../docs/fixtures/trace-incident.json'
import discovery from '../../docs/fixtures/discovery-waterfall.json'

const params = new URLSearchParams(location.search)
const theme = params.get('theme') ?? 'dark'
document.documentElement.dataset.theme = theme
document.documentElement.style.background = theme === 'dark' ? '#0e0e12' : '#f4f5f8'

/** Seeded load trace: one orchestrator, agents of ~50 steps each, alternating thinking and tool calls over two hours. */
function load(n) {
  let seed = 7
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const spans = [{ id: 'root', kind: 'pipeline', name: 'Orchestrator', detail: 'Opus 5.5', startMs: 0, endMs: 7_200_000, status: 'done' }]
  const agents = Math.max(1, Math.round(n / 50))
  for (let a = 0; a < agents && spans.length < n; a++) {
    const start = rand() * 5_400_000, id = `agent-${a}`
    let t = start + 2000
    const kids = []
    for (let i = 0; i < 48 && spans.length + kids.length + 1 < n; i++) {
      const model = i % 2 === 0, d = model ? 4000 + rand() * 30000 : 300 + rand() * 9000
      kids.push({ id: `${id}-${i}`, parentId: id, kind: model ? 'model' : 'tool', name: model ? `Think step ${i / 2 + 1}` : ['read', 'bash', 'grep', 'edit', 'web_search'][i % 5], detail: model ? 'Sonnet 5.5' : 'Sandbox', startMs: t, endMs: t + d, status: rand() < 0.02 ? 'failed' : 'done' })
      t += d + rand() * 3000
    }
    spans.push({ id, parentId: 'root', kind: 'pipeline', name: `Worker ${a + 1}`, detail: 'Sonnet 5.5', startMs: start, endMs: t, status: 'done' }, ...kids)
  }
  return { spans, totalMs: 7_200_000, promptTokens: 0, completionTokens: 0, toolCalls: spans.filter(s => s.kind === 'tool').length }
}

async function source(name) {
  if (name === 'incident') return incident
  if (name === 'discovery') return discovery
  if (name === 'load') return load(Number(params.get('n') ?? 5000))
  if (name === 'run21c') return (await fetch('/run-21c.json')).json()
  if (name.startsWith('otlp:')) {
    const started = performance.now()
    const { spans } = parseOtlpJsonl(await (await fetch(`/data/${name.slice(5)}`)).text())
    // List prices come from the Router's catalog, the price owner, when the page can reach it.
    const catalog = await fetch('https://router.tangle.tools/v1/models').then(r => r.json()).catch(() => null)
    const trace = otlpFlowTrace(spans, catalog ? { price: catalogPrice(catalog) } : {})
    window.__fwConvertMs = performance.now() - started
    // outcomes=1: each agent's recorded status as its outcome, so the legend and lane colors show on real runs.
    if (params.get('outcomes') === '1') trace.spans = trace.spans.map(span => span.kind !== 'pipeline' ? span
      : { ...span, outcome: span.status === 'failed' ? { tone: 'failed', label: 'Failed' } : span.status === 'running' ? { tone: 'warn', label: 'Running' } : { tone: 'ok', label: 'Finished' } })
    // names=long: worst-case proof only, agent names lengthened to the run page's longest labels.
    if (params.get('names') === 'long') {
      const parts = ['tower', 'FFT', 'RS', 'commit', 'evalarg', 'sumcheck', 'ligerito']
      trace.spans = trace.spans.map((span, i) => span.kind === 'pipeline' ? { ...span, name: `${span.name}+${parts.slice(0, 2 + i % 5).join('+')}` } : span)
    }
    return trace
  }
  return release
}

/** Reveal a recorded trace as a stream: spans appear at their start and run until their end. */
/** The trace as it stood at `now`: spans that began, and run totals summed from the calls that finished by then. */
function reveal(trace, now) {
  const done = trace.spans.filter(s => s.kind === 'model' && s.endMs <= now)
  const sum = key => done.reduce((total, s) => total + (s[key] ?? 0), 0)
  const priced = done.filter(s => s.costUsd !== undefined)
  return { ...trace, totalMs: now,
    spans: trace.spans.filter(s => s.startMs <= now).map(s => s.endMs > now ? { ...s, endMs: now, status: 'running' } : s),
    promptTokens: sum('promptTokens'), completionTokens: sum('completionTokens'), modelCalls: done.length,
    costUsd: priced.length ? priced.reduce((total, s) => total + s.costUsd, 0) : undefined,
    costCoverage: trace.costCoverage ? { priced: priced.length, total: done.length } : undefined,
    toolCalls: trace.spans.filter(s => s.kind === 'tool' && s.startMs <= now).length,
    errors: trace.spans.filter(s => s.status === 'failed' && s.endMs <= now).length }
}

/** Live: OTLP span deltas from the relay, appended as they arrive; every span's event-to-pixel time is recorded. */
function LiveApp({ relay }) {
  const [trace, setTrace] = useState(null)
  useEffect(() => {
    const spans = new Map()
    const pending = []
    let offset = 0
    let frame = 0
    window.__fwLatency = []
    const t0 = Date.now()
    fetch(`${relay}/time`).then(r => r.json()).then(({ now }) => { offset = now - (t0 + Date.now()) / 2 })
    const source = new EventSource(`${relay}/events`)
    source.onmessage = message => {
      const { span, emittedAt, backlog } = JSON.parse(message.data)
      spans.set(span.span_id, span)
      if (!backlog) pending.push({ end: Date.parse(span.end_time), emittedAt, name: span.name })
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        setTrace(otlpFlowTrace([...spans.values()], { live: true }))
        const batch = pending.splice(0)
        // Measured after the commit paints: the frame after the state change.
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const pixel = Date.now() + offset
          for (const item of batch) window.__fwLatency.push({ name: item.name, eventToPixelMs: pixel - item.end, eventToRelayMs: item.emittedAt - item.end, relayToPixelMs: pixel - item.emittedAt })
        }))
      })
    }
    return () => source.close()
  }, [])
  if (!trace) return <p style={{ color: '#888', padding: 24 }}>Waiting for spans…</p>
  return <main style={{ width: params.get('width') ? `${params.get('width')}px` : 'auto', maxWidth: '100%', margin: '0 auto', padding: 24 }}>
    <FlowWaterfall agentFill={params.get('fill') === 'agent' ? 'agent' : 'outcome'} trace={trace} live label={params.get('label') ?? 'Live session'}
      defaultView={params.get('view') ?? 'spans'} maxHeight={Number(params.get('height') ?? 640)} />
  </main>
}

function App({ trace }) {
  const live = params.get('live') === '1'
  const rate = Number(params.get('rate') ?? 1)
  const [now, setNow] = useState(live ? 0 : trace.totalMs)
  useEffect(() => {
    if (!live) return
    const start = performance.now()
    const timer = setInterval(() => {
      const next = Math.min(trace.totalMs, (performance.now() - start) * rate)
      setNow(next)
      if (next >= trace.totalMs) clearInterval(timer)
    }, 250)
    return () => clearInterval(timer)
  }, [])
  const shown = live && now < trace.totalMs ? reveal(trace, now) : trace
  return <main style={{ width: params.get('width') ? `${params.get('width')}px` : 'auto', maxWidth: '100%', margin: '0 auto', padding: Number(params.get('pad') ?? 24) }}>
    <FlowWaterfall agentFill={params.get('fill') === 'outcome' ? 'outcome' : 'agent'} trace={shown} live={live && now < trace.totalMs} label={params.get('label') ?? 'Trace'}
      description={params.get('desc') ?? undefined}
      defaultView={params.get('view') ?? 'spans'}
      defaultCollapsed={params.get('collapsed') === '1'} maxHeight={Number(params.get('height') ?? 640)}
      markers={params.get('markers') ? JSON.parse(params.get('markers')) : undefined}
      onSelect={span => { window.__fwSelected = [...(window.__fwSelected ?? []), span.id ?? span.name] }} />
  </main>
}

const t0 = performance.now()
if (params.get('relay')) createRoot(document.getElementById('root')).render(<LiveApp relay={params.get('relay')} />)
else createRoot(document.getElementById('root')).render(<App trace={await source(params.get('fixture') ?? 'release')} />)
requestAnimationFrame(() => requestAnimationFrame(() => { window.__fwFirstPaintMs = performance.now() - t0; document.body.dataset.ready = '1' }))
