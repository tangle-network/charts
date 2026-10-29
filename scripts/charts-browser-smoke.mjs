// Ported from tangle-network/brand scripts/charts-browser-smoke.mjs; packed consumer, not repository source imports.

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
const supplied = process.argv[2]
const packed = supplied ? resolve(supplied) : join(dir, JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', dir], { cwd: root, encoding: 'utf8' }))[0].filename)
writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', packed], { cwd: dir, stdio: 'inherit' })
let peerRequire = createRequire(join(dir, 'package.json'))
const reactVersion = process.env.CHARTS_REACT_VERSION ?? '19'
if (reactVersion) {
 execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', 'react@' + reactVersion, 'react-dom@' + reactVersion, '@types/react@' + reactVersion, '@xyflow/react@12', 'elkjs@0.12'], { cwd: dir, stdio: 'inherit' })
 peerRequire = createRequire(join(dir, 'package.json'))
 writeFileSync(join(dir, 'types.tsx'), `import {Sparkline, StackedBarChart, FlowWaterfall} from '@tangle-network/charts/react'; import type {FlowTrace} from '@tangle-network/charts'; const glyph=<Sparkline label="History" values={[0,null,2]}/>; const chart=<StackedBarChart label="Units" series={[{id:'a',label:'A',color:'currentColor'}]} buckets={[{id:'one',label:'One',total:1,segments:[{seriesId:'a',value:1}]}]} maxValue={1} selectedBucketId={null} onSelectionChange={() => {}} formatValue={String}/>; const trace:FlowTrace={spans:[],totalMs:0,promptTokens:0,completionTokens:0,toolCalls:0}; const flow=<FlowWaterfall trace={trace}/>; void flow; void glyph; void chart;`)
 writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022','DOM','DOM.Iterable'],jsx:'react-jsx',strict:true,skipLibCheck:false,noEmit:true,types:[]},files:['types.tsx']}))
 const manifestPath=require.resolve('typescript/package.json')
 const manifest=JSON.parse(readFileSync(manifestPath,'utf8'))
 execFileSync(process.execPath,[join(dirname(manifestPath),manifest.bin.tsc),'-p','tsconfig.json'],{cwd:dir,stdio:'inherit'})
}
const flowApp = readFileSync(join(root,'scripts/fixtures/flow-waterfall-consumer.jsx'),'utf8')
const topologyApp = readFileSync(join(root,'scripts/fixtures/agent-graph-consumer.jsx'),'utf8')
const recorded = JSON.parse(readFileSync(join(root,'docs/fixtures/discovery-waterfall.json'),'utf8'))
const healthy = JSON.parse(readFileSync(join(root,'docs/fixtures/healthy-flow.json'),'utf8'))
const app = `
import React, { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { Sparkline, StackedBarChart, FlowWaterfall, Gantt, Meter } from '@tangle-network/charts/react'
import { AgentGraph } from '@tangle-network/charts/react/agent-graph'
function App() {
 const [selectedBucketId, onSelectionChange] = useState(null)
 return <main><h1>Recorded usage</h1><p>Hover, focus, or tap a day to inspect its actual stack.</p><Sparkline values={[2, 0, null, 8, 5]} label="Delta" format={String} /><section className="panel"><StackedBarChart label="Daily spend" maxValue={52} selectedBucketId={selectedBucketId} onSelectionChange={onSelectionChange} formatValue={v => '$' + v.toFixed(2)} series={[{id:'inference',label:'Inference',color:'#5746c3'},{id:'compute',label:'Compute',color:'#2f70aa'}]} buckets={[{id:'sep6',label:'Sep 6',total:52,segments:[{seriesId:'inference',value:42},{seriesId:'compute',value:10}]},{id:'sep7',label:'Sep 7',total:21.6,segments:[{seriesId:'inference',value:16.8},{seriesId:'compute',value:4.8}]},{id:'sep8',label:'Sep 8',total:5.6,segments:[{seriesId:'inference',value:2.8},{seriesId:'compute',value:2.8}]}]} /></section></main>
}
const recorded = ${JSON.stringify(recorded)}, healthy = ${JSON.stringify(healthy)}
${flowApp}
${topologyApp}
import { ENDING_COLORS } from '@tangle-network/charts'
function Journey() {
 const [selectedId, onSelect] = useState(), [now, setNow] = useState(Date.now())
 const start = useState(() => Date.now() - 60000)[0]
 useEffect(() => { const clock = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(clock) }, [])
 return <main style={params.has('ancestor')?{'--chart-live-muted':'rgb(17, 109, 91)','--chart-live-fg':'rgb(32, 67, 120)'}:undefined}><Meter total={3} used={1} steps={[{label:"Manifest",state:"pass"},{label:"Offline build",state:"fail"},{label:"Hidden test",state:"unrun"}]} text="Best checked release"/><Gantt lanes={Array.from({length:Number(params.get('agents')||124)},(_,i)=>({id:'agent-'+i,label:'Agent '+i,count:i===0?190:i,countLabel:'commits',spans:[{start:start+i*100,end:i%3===0?null:start+30000,state:i===0?'lead':i===2?'failed':i===4?'idle':i%3===0?'running':'shipped',endLabel:Math.round((now-start)/1000)+'s · ≥$12,345.67 list · — billed'},...(i===0?[{start,end:start+30000,state:'shipped',endLabel:'30s · ≥$12,345.67 list · — billed'}]:[])]}))} selectedId={selectedId} onSelect={onSelect} maxHeight={420} now={now} marks={[...Array.from({length:20},(_,i)=>({kind:'release',label:'rc'+(i+1),at:start+10000+i*2000})),{kind:'deadline',label:'Cutoff',at:start+55000}]} bestMark="rc2" colors={{running:ENDING_COLORS.live,shipped:ENDING_COLORS.solved,failed:ENDING_COLORS.died,idle:ENDING_COLORS.cancelled,lead:ENDING_COLORS.cancelled}} axis={t=>new Date(t).toISOString().slice(11,19)} span={(a,b)=>Math.round((b-a)/1000)+'s'}/></main>
}
const params = new URLSearchParams(location.search)
const name = (params.get('id') ?? '').replace('chatcontrols-flowwaterfall--','')
document.documentElement.dataset.theme=params.get('globals')?.includes('agent-light')?'light':'dark'
createRoot(document.getElementById('root')).render(name === 'topology' ? <Topology/> : name === 'journey' ? <Journey/> : name ? <FlowApp name={name}/> : <App />)
`
writeFileSync(join(dir, 'app.jsx'), app)
await build({entryPoints:[join(dir,'app.jsx')],bundle:true,outfile:join(dir,'app.js'),jsx:'automatic',alias:{react:dirname(peerRequire.resolve('react/package.json')),'react-dom':dirname(peerRequire.resolve('react-dom/package.json'))}})
// The trace paints Brand roles only, so the page loads Brand's tokens as every host does.
const tokens = readFileSync(require.resolve('@tangle-network/brand/styles/tokens.css'),'utf8') + readFileSync(peerRequire.resolve('@tangle-network/charts/figure.css'),'utf8') + readFileSync(peerRequire.resolve('@tangle-network/charts/react/flow-waterfall.css'),'utf8') + readFileSync(peerRequire.resolve('@tangle-network/charts/react/live.css'),'utf8') + `
:root { --foreground:230 20% 12%;--muted-foreground:230 10% 40%;--background:0 0% 100%;--border:230 15% 85%;--secondary:230 15% 95%;--primary:250 65% 45%;--accent:205 70% 40%;--warning-strong:35 85% 35%;--success:145 65% 30%;--destructive:0 70% 45%;--chart-accent:hsl(var(--primary)); }
:root[data-theme=dark] { --foreground:230 20% 95%;--muted-foreground:230 10% 70%;--background:240 20% 10%;--border:240 15% 25%;--secondary:240 15% 18%;--primary:250 75% 75%;--accent:205 85% 65%;--warning-strong:35 95% 65%;--success:145 60% 65%;--destructive:0 80% 70%; }
`
const html = `<!doctype html><html lang="en" data-theme="light"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Packed chart consumer</title><style>${tokens}
body{margin:0;background:hsl(var(--background));color:hsl(var(--foreground));font:16px/1.5 Arial,sans-serif}
main{max-width:1000px;margin:16px auto;padding:16px;min-width:0;box-sizing:border-box}h1{font-size:26px}.panel{background:var(--md3-surface-container-lowest,#fff);padding:24px;border-radius:12px;border:1px solid var(--md3-outline-variant,#ddd);transform:translateX(12px);contain:paint}
[data-chart-tooltip]{box-shadow:0 4px 16px #0002}table{border-collapse:collapse;width:100%;text-align:left}th,td{padding:8px;border-bottom:1px solid #8884}details{margin-top:16px}
</style><div id="root"></div><script type="module" src="/app.js"></script></html>`
const graphCss = '@layer utilities {.flex{display:grid}.text-xs{font-size:17px}}' + readFileSync(peerRequire.resolve('@tangle-network/charts/react/agent-graph.css'),'utf8') + '.topology-pane{height:680px}';
const server=createServer((req,res)=>{res.setHeader('Content-Type', req.url==='/app.js'?'text/javascript':'text/html');res.end(req.url==='/app.js'?readFileSync(join(dir,'app.js')):req.url.includes('id=topology')?html.replace('</style>',graphCss+'</style>'):html)})
server.listen(Number(process.env.PORT || 46489),'127.0.0.1',()=>console.log(JSON.stringify({consumer:dir,tarball:packed,react:JSON.parse(readFileSync(peerRequire.resolve('react/package.json'),'utf8')).version,url:'http://127.0.0.1:'+server.address().port})))
