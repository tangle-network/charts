// Serves the trace inspector demo routes from source: `node scripts/flow-waterfall-demo.mjs [port] [run-21c.json]`.
import { build } from 'esbuild'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'

const port = Number(process.argv[2] ?? 8791)
const run21c = process.argv[3]
const result = await build({
  entryPoints: ['scripts/fixtures/flow-waterfall-demo.jsx'], bundle: true, write: false, outdir: 'demo', format: 'esm',
  jsx: 'automatic', loader: { '.json': 'json' }, define: { 'process.env.NODE_ENV': '"production"' }, minify: true, target: 'es2022',
})
const files = Object.fromEntries(result.outputFiles.map(file => [file.path.replace(/.*\/demo\//, '/'), file.text]))
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<link rel="stylesheet" href="/flow-waterfall-demo.css"><style>body{margin:0;font-family:Inter,ui-sans-serif,system-ui,sans-serif}</style></head>' +
  '<body><div id="root"></div><script type="module" src="/flow-waterfall-demo.js"></script></body></html>'
createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname
  if (path === '/run-21c.json' && run21c) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(readFileSync(run21c)) }
  const body = path === '/' ? html : files[path]
  if (body === undefined) { res.writeHead(404); return res.end() }
  res.writeHead(200, { 'content-type': path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html' })
  res.end(body)
}).listen(port, '127.0.0.1', () => console.log(`flow-waterfall demo on http://127.0.0.1:${port}/`))
