// Demo routes for the trace inspector: reference-shaped fixtures, recorded Discovery runs and a synthetic load trace.
// Query: fixture=release|incident|discovery|run21c|load, view=spans|agents, theme=dark|light, live=1, rate=N, n=N, width=px.
import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import { FlowWaterfall } from '../../src/react/index.ts'
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
  return release
}

/** Reveal a recorded trace as a stream: spans appear at their start and run until their end. */
function reveal(trace, now) {
  return { ...trace, totalMs: now,
    spans: trace.spans.filter(s => s.startMs <= now).map(s => s.endMs > now ? { ...s, endMs: now, status: 'running' } : s),
    toolCalls: trace.spans.filter(s => s.kind === 'tool' && s.startMs <= now).length,
    errors: trace.spans.filter(s => s.status === 'failed' && s.endMs <= now).length }
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
    <FlowWaterfall trace={shown} live={live && now < trace.totalMs} label={params.get('label') ?? 'Trace'}
      description={params.get('description') ?? undefined} defaultView={params.get('view') ?? 'spans'}
      defaultCollapsed={params.get('collapsed') === '1'} maxHeight={Number(params.get('height') ?? 640)} />
  </main>
}

const trace = await source(params.get('fixture') ?? 'release')
const t0 = performance.now()
createRoot(document.getElementById('root')).render(<App trace={trace} />)
requestAnimationFrame(() => requestAnimationFrame(() => { window.__fwFirstPaintMs = performance.now() - t0; document.body.dataset.ready = '1' }))
