
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
const linesApp = `
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Lines } from '@tangle-network/charts/react'
import '@tangle-network/charts/react/live.css'
function App() {
 const [kind, setKind] = useState('recorded')
 const [recent, setRecent] = useState(false)
 const [selectedPoint, setSelectedPoint] = useState(null)
 const [opened, setOpened] = useState(null)
 const [dark, setDark] = useState(false)
 const colors = ['#c2afff','#ffcbac']
 let points = [[1,5.2],[2,5.9],[3,null],[4,6.4],[5,7.1],[6,8.1]]
 let domain = [4.8,9]
 let refs = [{value:5.8,label:'Baseline'},{value:8,label:'Target'}]
 let value = v => v.toFixed(2) + ' units'
 let name = 'Observed A'
 if(kind === 'empty') points = []
 if(kind === 'unavailable') points = [[1,null],[2,null],[3,null]]
 if(kind === 'single') { points = [[1,0]]; domain = [0,1]; refs = [] }
 if(kind === 'flat') { points = [[1,0.6],[2,0.6],[3,0.6]]; domain = [0,1]; refs = [] }
 if(kind === 'negative') { points = [[1,-4],[2,-2],[3,0]]; domain = [-5,1]; refs = [{value:-3,label:'Baseline'}] }
 if(kind === 'large') { points = [[1,1e12],[2,1.4e12],[3,1.7e12]]; domain=[1e12,1.8e12]; refs=[]; value=v=>v.toLocaleString('en-US')+' units' }
 if(kind === 'long') name = 'A deliberately long recorded series label that remains fully available in the legend and readout'
 const series = [{name,color:colors[0],points}, ...(kind === 'recorded' || kind === 'long' ? [{name:'Observed B',color:colors[1],points:[[1,5.5],[3,6],[5,6.5],[6,7.4]]}] : [])]
 const changeKind = e => { setKind(e.target.value); setRecent(false); setSelectedPoint(null); setOpened(null) }
 return <main><header><div><h1>Recorded histories</h1><p>Chart interaction fixture. These values are behavior examples, not benchmark results.</p></div><button onClick={()=>{document.documentElement.dataset.theme=dark?'light':'dark';setDark(!dark)}}>{dark?'Light':'Dark'} theme</button></header><nav aria-label="Fixture controls"><label>Data <select aria-label="Fixture data" value={kind} onChange={changeKind}>{['recorded','empty','unavailable','single','flat','negative','large','long'].map(item=><option key={item} value={item}>{item}</option>)}</select></label><button aria-pressed={!recent} onClick={()=>setRecent(false)}>Full history</button><button aria-pressed={recent} onClick={()=>setRecent(true)}>Recent records</button><button onClick={()=>setSelectedPoint({seriesIndex:0,pointIndex:1})}>Select earlier result</button><button onClick={()=>setSelectedPoint(null)}>Clear selected result</button></nav><section className="panel"><Lines label="Recorded fixture values" series={series} xLabel="Chronological record" yLabel="Recorded value · units" xFormat={x=>'Record '+x} axis={x=>String(x)} format={value} yDomain={domain} xDomain={recent?[4,6]:undefined} references={refs} curve="step" markers endLabels rows={17} selectedPoint={selectedPoint} onSelect={point=>{setSelectedPoint(point);setOpened(point)}} /></section><output aria-label="Opened point">{opened?'Opened series '+opened.seriesIndex+', original point '+opened.pointIndex+', record '+opened.x:'No point opened'}</output></main>
}
createRoot(document.getElementById('root')).render(<App />)
`
const app = linesFixture ? linesApp : legacyApp
writeFileSync(join(dir, 'app.jsx'), app)
await build({entryPoints:[join(dir,'app.jsx')],bundle:true,outfile:join(dir,'app.js'),jsx:'automatic',alias:{react:dirname(peerRequire.resolve('react/package.json')),'react-dom':dirname(peerRequire.resolve('react-dom/package.json'))}})
const tokens = ['tokens.css', 'ladders.css', 'system.css'].map(file => readFileSync(require.resolve('@tangle-network/brand/styles/'+file),'utf8')).join('\n')
const html = `<!doctype html><html lang="en" data-theme="light"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Packed chart consumer</title><style>${tokens}
body{margin:0;background:var(--md3-surface,#f7f7fc);color:var(--md3-on-surface,#20202b);font:16px/1.5 Arial,sans-serif}
main{max-width:920px;margin:32px auto;padding:16px}h1{font-size:26px}.panel{background:var(--md3-surface-container-lowest,#fff);padding:24px;border-radius:12px;border:1px solid var(--md3-outline-variant,#ddd);transform:translateX(12px);contain:paint}
[data-chart-tooltip]{box-shadow:0 4px 16px #0002}table{border-collapse:collapse;width:100%;text-align:left}th,td{padding:8px;border-bottom:1px solid #8884}details{margin-top:16px}

header{display:flex;justify-content:space-between;gap:20px;align-items:start}header p{max-width:650px;color:var(--md3-on-surface-variant,#666)}nav{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:20px 0}button,select{font:inherit;min-height:44px;background:var(--md3-surface-container-lowest,#fff);color:inherit;border:1px solid var(--md3-outline-variant,#aaa);border-radius:6px;padding:8px 12px}button[aria-pressed=true]{background:#5942a6;color:white}button:focus-visible,select:focus-visible{outline:2px solid #8b7cf6;outline-offset:3px}.panel{transform:none;contain:initial;border-radius:12px;background:#142338;color:#edf0fc;--chart-live-fg:#edf0fc;--chart-live-muted:#c5cde0;--chart-live-faint:#8593ad;--chart-live-border:#43516a;--chart-live-surface:#142338;--chart-live-raised:#20324b;--chart-live-hover:#2d4161}output{display:block;margin-top:14px}header h1{margin-top:0}@media(max-width:480px){main{margin:12px auto;padding:12px}.panel{padding:12px}header{display:block}}
</style><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script></html>`
const server=createServer((req,res)=>{res.setHeader('Content-Type', req.url==='/app.js'?'text/javascript':req.url==='/app.css'?'text/css':'text/html');res.end(req.url==='/app.js'?readFileSync(join(dir,'app.js')):req.url==='/app.css'?(linesFixture?readFileSync(join(dir,'app.css')):''):html)})
server.listen(Number(process.env.PORT || 46489),'127.0.0.1',()=>console.log(JSON.stringify({consumer:dir,tarball:packed,url:'http://127.0.0.1:'+server.address().port})))
