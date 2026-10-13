
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join, dirname } from 'node:path'
import { createServer } from 'node:http'
const require = createRequire(import.meta.url)
const root = process.cwd()
const dir = mkdtempSync(join(tmpdir(), 'charts-browser-'))
const linesFixture = process.argv.includes("--lines")
const supplied = process.argv.slice(2).find(argument => !argument.startsWith("--"))
const packed = supplied ? resolve(supplied) : join(dir, JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', dir], { cwd: root, encoding: 'utf8' }))[0].filename)
writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', packed], { cwd: dir, stdio: 'inherit' })
let peerRequire = require
if (process.env.CHARTS_REACT_VERSION) {
 execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', 'react@' + process.env.CHARTS_REACT_VERSION, 'react-dom@' + process.env.CHARTS_REACT_VERSION, '@types/react@' + process.env.CHARTS_REACT_VERSION], { cwd: dir, stdio: 'inherit' })
 peerRequire = createRequire(join(dir, 'package.json'))
 writeFileSync(join(dir, 'types.tsx'), `import {Sparkline, StackedBarChart} from '@tangle-network/charts/react'; const glyph=<Sparkline label="History" values={[0,null,2]}/>; const chart=<StackedBarChart label="Units" series={[{id:'a',label:'A',color:'currentColor'}]} buckets={[{id:'one',label:'One',total:1,segments:[{seriesId:'a',value:1}]}]} maxValue={1} selectedBucketId={null} onSelectionChange={() => {}} formatValue={String}/>; void glyph; void chart;`)
 writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022','DOM','DOM.Iterable'],jsx:'react-jsx',strict:true,skipLibCheck:false,noEmit:true,types:[]},files:['types.tsx']}))
 const manifestPath=require.resolve('typescript/package.json')
 const manifest=JSON.parse(readFileSync(manifestPath,'utf8'))
 execFileSync(process.execPath,[join(dirname(manifestPath),manifest.bin.tsc),'-p','tsconfig.json'],{cwd:dir,stdio:'inherit'})
}
const legacyApp = `
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Sparkline, StackedBarChart } from '@tangle-network/charts/react'
function App() {
 const [selectedBucketId, onSelectionChange] = useState(null)
 return <main><h1>Recorded usage</h1><p>Hover, focus, or tap a day to inspect its actual stack.</p><Sparkline values={[2, 0, null, 8, 5]} label="Delta" format={String} /><section className="panel"><StackedBarChart label="Daily spend" maxValue={52} selectedBucketId={selectedBucketId} onSelectionChange={onSelectionChange} formatValue={v => '$' + v.toFixed(2)} series={[{id:'inference',label:'Inference',color:'#5746c3'},{id:'compute',label:'Compute',color:'#2f70aa'}]} buckets={[{id:'sep6',label:'Sep 6',total:52,segments:[{seriesId:'inference',value:42},{seriesId:'compute',value:10}]},{id:'sep7',label:'Sep 7',total:21.6,segments:[{seriesId:'inference',value:16.8},{seriesId:'compute',value:4.8}]},{id:'sep8',label:'Sep 8',total:5.6,segments:[{seriesId:'inference',value:2.8},{seriesId:'compute',value:2.8}]}]} /></section></main>
}
createRoot(document.getElementById('root')).render(<App />)
`
const linesApp = readFileSync(join(root, 'examples/recorded-history.tsx'), 'utf8')
const app = linesFixture ? linesApp : legacyApp
const appPath = join(dir, linesFixture ? 'app.tsx' : 'app.jsx')
writeFileSync(appPath, app)
await build({
 entryPoints: [appPath], bundle: true, outfile: join(dir, 'app.js'), jsx: 'automatic',
 loader: { '.woff': 'file', '.woff2': 'file' }, assetNames: 'assets/[name]-[hash]',
 alias: {
  '@fontsource/inter': dirname(require.resolve('@fontsource/inter/package.json')),
  '@tangle-network/brand': require.resolve('@tangle-network/brand'),
  react: dirname(peerRequire.resolve('react/package.json')),
  'react-dom': dirname(peerRequire.resolve('react-dom/package.json')),
 },
})
const tokens = ['tokens.css', 'ladders.css', 'system.css'].map(file => readFileSync(require.resolve('@tangle-network/brand/styles/'+file),'utf8')).join('\n')
const html = `<!doctype html><html lang="en" data-theme="light"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${linesFixture ? 'Recorded scores · Tangle Charts' : 'Packed chart consumer'}</title><style>${tokens}
body{margin:0;background:var(--md3-surface,#f7f7fc);color:var(--md3-on-surface,#20202b);font:16px/1.5 Arial,sans-serif}
main{max-width:920px;margin:32px auto;padding:16px}h1{font-size:26px}.panel{background:var(--md3-surface-container-lowest,#fff);padding:24px;border-radius:12px;border:1px solid var(--md3-outline-variant,#ddd);transform:translateX(12px);contain:paint}
[data-chart-tooltip]{box-shadow:0 4px 16px #0002}table{border-collapse:collapse;width:100%;text-align:left}th,td{padding:8px;border-bottom:1px solid #8884}details{margin-top:16px}

${linesFixture ? readFileSync(join(root, 'examples/recorded-history.css'), 'utf8') : ''}
</style><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script></html>`
const server = createServer((req, res) => {
 const route = req.url || '/'
 if (/^\/assets\/[a-zA-Z0-9_.-]+\.woff2?$/.test(route)) {
  try {
   res.setHeader('Content-Type', route.endsWith('.woff2') ? 'font/woff2' : 'font/woff')
   res.end(readFileSync(join(dir, route.slice(1))))
  } catch { res.writeHead(404); res.end('Not found') }
  return
 }
 res.setHeader('Content-Type', route === '/app.js' ? 'text/javascript' : route === '/app.css' ? 'text/css' : 'text/html')
 res.end(route === '/app.js' ? readFileSync(join(dir, 'app.js'))
  : route === '/app.css' ? (linesFixture ? readFileSync(join(dir, 'app.css')) : '') : html)
})
server.listen(Number(process.env.PORT || 46489),'127.0.0.1',()=>console.log(JSON.stringify({consumer:dir,tarball:packed,url:'http://127.0.0.1:'+server.address().port})))
