// Live proof relay: `traces watch <session> --format jsonl --spans` → Server-Sent Events of OTLP spans.
// `TRACES_BIN=traces node scripts/flow-waterfall-live-relay.mjs <session-id|run-dir> [port] [host]`
// GET /events streams {span, emittedAt} (a new client first receives every span so far); GET /time returns the clock.
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createInterface } from 'node:readline'

const [ref, port = '8795', host = '127.0.0.1'] = process.argv.slice(2)
if (!ref) throw new Error('usage: flow-waterfall-live-relay.mjs <session-id|run-dir> [port] [host]')
const bin = (process.env.TRACES_BIN ?? 'traces').split(' ')
const watch = spawn(bin[0], [...bin.slice(1), 'watch', ref, '--format', 'jsonl', '--spans'], { stdio: ['ignore', 'pipe', 'inherit'] })
const spans = new Map()
const clients = new Set()
createInterface({ input: watch.stdout }).on('line', line => {
  let event
  try { event = JSON.parse(line) } catch { return }
  if (event.event !== 'span') return
  const message = { span: event.span, emittedAt: Date.now() }
  spans.set(event.span.span_id, message)
  const data = `data: ${JSON.stringify(message)}\n\n`
  for (const client of clients) client.write(data)
})
watch.on('exit', code => { console.error(`traces watch exited ${code}`); process.exit(code ?? 1) })
createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname
  res.setHeader('access-control-allow-origin', '*')
  if (path === '/time') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ now: Date.now() })) }
  if (path !== '/events') { res.writeHead(404); return res.end() }
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' })
  for (const message of spans.values()) res.write(`data: ${JSON.stringify({ ...message, backlog: true })}\n\n`)
  clients.add(res)
  req.on('close', () => clients.delete(res))
}).listen(Number(port), host, () => console.log(`live relay for ${ref} on http://${host}:${port}/events`))
