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
const featurePeers=JSON.parse(execFileSync('tar',['-xOf',packed,'package/package.json'],{encoding:'utf8'})).peerDependencies
execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', packed, '@tangle-network/brand@'+featurePeers['@tangle-network/brand']], { cwd: dir, stdio: 'inherit' })
let peerRequire = createRequire(join(dir, 'package.json'))
const reactVersion = process.env.CHARTS_REACT_VERSION ?? '19'
if (reactVersion) {
 execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', 'react@' + reactVersion, 'react-dom@' + reactVersion, '@types/react@' + reactVersion, '@xyflow/react@'+featurePeers['@xyflow/react'], 'elkjs@'+featurePeers.elkjs, '@tangle-network/ui@'+featurePeers['@tangle-network/ui']], { cwd: dir, stdio: 'inherit' })
 peerRequire = createRequire(join(dir, 'package.json'))
 writeFileSync(join(dir, 'types.tsx'), `import {Sparkline, StackedBarChart, FlowWaterfall, Lines} from '@tangle-network/charts/react'; import type {FlowTrace} from '@tangle-network/charts'; const glyph=<Sparkline label="History" values={[0,null,2]}/>; const chart=<StackedBarChart label="Units" series={[{id:'a',label:'A',color:'currentColor'}]} buckets={[{id:'one',label:'One',total:1,segments:[{seriesId:'a',value:1}]}]} maxValue={1} selectedBucketId={null} onSelectionChange={() => {}} formatValue={String}/>; const trace:FlowTrace={spans:[],totalMs:0,promptTokens:0,completionTokens:0,toolCalls:0}; const flow=<FlowWaterfall trace={trace}/>; const label:NonNullable<Parameters<typeof Lines>[0]["series"][number]["label"]>=t=>String(t); label(1); const lines=<Lines series={[{name:"Recorded",color:"currentColor",points:[[1,2]],label}]}/>; void lines; void flow; void glyph; void chart;`)
 writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022','DOM','DOM.Iterable'],jsx:'react-jsx',strict:true,skipLibCheck:false,noEmit:true,types:[]},files:['types.tsx']}))
 const manifestPath=require.resolve('typescript/package.json')
 const manifest=JSON.parse(readFileSync(manifestPath,'utf8'))
 execFileSync(process.execPath,[join(dirname(manifestPath),manifest.bin.tsc),'-p','tsconfig.json'],{cwd:dir,stdio:'inherit'})
}
const flowApp = readFileSync(join(root,'scripts/fixtures/flow-waterfall-consumer.jsx'),'utf8')
const versionApp = readFileSync(join(root,'scripts/fixtures/version-graph-consumer.jsx'),'utf8') + "\nversionNodes[0].title += ' \u2014 recorded source identity with a long unbroken suffix abcdefghijklmnopqrstuvwxyz0123456789';\n"
const topologyApp = readFileSync(join(root,'scripts/fixtures/agent-graph-consumer.jsx'),'utf8')
const recorded = JSON.parse(readFileSync(join(root,'docs/fixtures/discovery-waterfall.json'),'utf8'))
const healthy = JSON.parse(readFileSync(join(root,'docs/fixtures/healthy-flow.json'),'utf8'))
const app = `
import React, { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { Sparkline, StackedBarChart, FlowWaterfall, Gantt, Meter, VersionGraph, CountHeatmap, HBars, DayBars, TimelineView, Gap, DotMap, Lines } from '@tangle-network/charts/react'
import { AgentGraph } from '@tangle-network/charts/react/agent-graph'
function App() {
 const [selectedBucketId, onSelectionChange] = useState(null)
 return <main><h1>Recorded usage</h1><p>Hover, focus, or tap a day to inspect its actual stack.</p><Sparkline values={[2, 0, null, 8, 5]} label="Delta" format={String} /><section className="panel"><StackedBarChart label="Daily spend" maxValue={52} selectedBucketId={selectedBucketId} onSelectionChange={onSelectionChange} formatValue={v => '$' + v.toFixed(2)} series={[{id:'inference',label:'Inference',color:'#5746c3'},{id:'compute',label:'Compute',color:'#2f70aa'}]} buckets={[{id:'sep6',label:'Sep 6',total:52,segments:[{seriesId:'inference',value:42},{seriesId:'compute',value:10}]},{id:'sep7',label:'Sep 7',total:21.6,segments:[{seriesId:'inference',value:16.8},{seriesId:'compute',value:4.8}]},{id:'sep8',label:'Sep 8',total:5.6,segments:[{seriesId:'inference',value:2.8},{seriesId:'compute',value:2.8}]}]} /></section></main>
}
const recorded = ${JSON.stringify(recorded)}, healthy = ${JSON.stringify(healthy)}
${flowApp}
${topologyApp}
${versionApp}
import { ENDING_COLORS } from '@tangle-network/charts'
function Journey() {
 const [selectedId, onSelect] = useState(), [now, setNow] = useState(Date.now())
 const start = useState(() => Date.now() - 60000)[0]
 useEffect(() => { const clock = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(clock) }, [])
 return <main style={params.has('ancestor')?{'--chart-live-muted':'rgb(17, 109, 91)','--chart-live-fg':'rgb(32, 67, 120)'}:undefined}><Meter total={3} used={1} steps={[{label:"Manifest",state:"pass"},{label:"Offline build",state:"fail"},{label:"Hidden test",state:"unrun"}]} text="Best checked release"/><Gantt lanes={Array.from({length:Number(params.get('agents')||124)},(_,i)=>({id:'agent-'+i,label:'Agent '+i,count:i===0?190:i,countLabel:'commits',spans:[{start:start+Math.min(i,123)*100,end:i%3===0?null:start+30000,state:i===0?'lead':i===2?'failed':i===4?'idle':i%3===0?'running':'shipped',endLabel:Math.round((now-start)/1000)+'s · ≥$12,345.67 list · — billed'},...(i===0?[{start,end:start+30000,state:'shipped',endLabel:'30s · ≥$12,345.67 list · — billed'}]:[])]}))} selectedId={selectedId} onSelect={onSelect} maxHeight={420} now={now} marks={[...Array.from({length:20},(_,i)=>({kind:'release',label:'rc'+(i+1),at:start+10000+i*200,verdict:i%2?'pass':'unknown'})),{kind:'release',label:'repeat',at:start+5000},{kind:'release',label:'repeat',at:start+45000,verdict:'fail'},{kind:'deadline',label:'Cutoff',at:start+55000}]} bestMark="rc18" colors={{running:ENDING_COLORS.live,shipped:ENDING_COLORS.solved,failed:ENDING_COLORS.died,idle:ENDING_COLORS.cancelled,lead:ENDING_COLORS.cancelled}} axis={t=>new Date(t).toISOString().slice(11,19)} span={(a,b)=>Math.round((b-a)/1000)+'s'}/></main>
}
function AnalyticsCounts() {
 const [extra,setExtra]=useState(0),[selected,onSelectRow]=useState('')
 const columns=['read','write','shell','fetch','check','search'].map(id=>({id,label:id}))
 const rows=Array.from({length:140},(_,i)=>({id:'agent-'+i,label:'Agent '+i,total:i===0?null:i===1?0:(i+extra)*columns.length,cells:Object.fromEntries(columns.map((c,j)=>[c.id,i===0?null:{value:i===1?0:i+extra,failures:j===0&&i===2?2:0}]))}))
 return <main><h1>Recorded tool calls</h1><button onClick={()=>setExtra(n=>n+100)}>Append counts</button><output>{selected}</output><CountHeatmap label="Tool calls" columns={columns} rows={rows} onSelectRow={onSelectRow}/><DayBars interval="4 h" days={["2026-10-29T00:00:00Z"]} series={[{name:"Recorded calls",color:"#8b7cf6",values:[210]}]}/><HBars rows={[{label:'Recorded',value:10+extra},{label:'Zero',value:0}]} max={110}/></main>
}
function ProgressLines() {
 const [extra,setExtra]=useState(false),[scored,setScored]=useState(false),[only,setOnly]=useState(false)
 const start=Date.parse('2026-10-28T00:00:00Z'), values=extra?[1,2,1,3]:[1,2,1]
 const points=only?[]:values.map((v,i)=>[start+Math.max(0,i-1)*3600000,v])
 if(scored&&!only)points.push([start-3600000,2])
 const ids=values.map((_,i)=>'rc'+(i+1));if(scored)ids.push('rc5')
 const href=id=>'?id=progress-lines&release='+id+'&globals='+encodeURIComponent(params.get('globals')||'')
 let best=0
 return <main><button onClick={()=>setExtra(true)}>Append release</button><button onClick={()=>setScored(true)}>Score release</button><button onClick={()=>setOnly(true)}>Unscored only</button><output>{params.get('release')||'No release selected'}</output>
 <Lines rows={22} ticks={[{value:1,label:'1 · Manifest'},{value:2,label:'2 · Offline build'},{value:3,label:'3 · Hidden test set'}]}
  axis={t=>new Date(t).toISOString().slice(11,16)} strip={{label:'No stage score',series:'Checked releases',points:scored&&!only?[]:[{id:'rc5',label:'rc5',at:start-3600000,href:href('rc5')}]}} series={only?[]:[
   {name:'Best so far',color:'var(--chart-series-1)',interpolation:'step',points:points.map(([t,v])=>[t,best=Math.max(best,v)])},
   {name:'Checked releases',color:'var(--chart-series-2)',dots:true,points,id:(t,i)=>ids[i],label:(t,i)=>ids[i??0],href:(t,i)=>href(ids[i]),highlight:(t,i)=>i=== (extra?3:1)}]}/></main>
}
function RecordedTimeline() {
 const start=Date.parse('2026-10-28T00:00:00Z')
 return <main><TimelineView options={{measure:'Recorded work',now:start+60000}} lanes={[{id:'lead',label:'Recorded lead',spans:[{start,end:null,state:'running'}],ticks:[{at:start+1000,outcome:'ok'}]},{id:'worker',parent:'lead',label:'Recorded worker',spans:[{start:start+1000,end:start+2000,state:'missing'}],ticks:[{at:start+2000,outcome:'oom'}]}]}/></main>
}
function PaletteContracts() {
 return <main><span data-semantic-reference style={{color:'var(--status-running)',background:'var(--bg-elevated)',borderTop:'1px solid var(--border-default)'}}>Brand reference</span><span data-tip-text-reference style={{color:'var(--text-primary)'}}>Recorded color contract</span><Gap value={5} target={{min:8,max:10}} stretch={{min:12,max:14}} scale="linear"/><DotMap positions={new Float32Array([.5,.5])} radii={.1} colors={new Uint8Array([0])} palette={['var(--chart-category-1)']} extent={[0,0,1,1]} height={160} describe={()=>'Recorded dot'} ariaLabel="Recorded points"/></main>
}
const params = new URLSearchParams(location.search)
const name = (params.get('id') ?? '').replace('chatcontrols-flowwaterfall--','')
document.documentElement.dataset.theme=params.get('globals')?.includes('agent-light')?'light':'dark'
createRoot(document.getElementById('root')).render(name === 'progress-lines' ? <ProgressLines/> : name === 'palette-contracts' ? <PaletteContracts/> : name === 'timeline-tree' ? <RecordedTimeline/> : name === 'analytics-counts' ? <AnalyticsCounts/> : name === 'versions' ? <Versions/> : name === 'topology' ? <Topology/> : name === 'journey' ? <Journey/> : name ? <FlowApp name={name}/> : <App />)
`
writeFileSync(join(dir, 'app.jsx'), app)
await build({entryPoints:[join(dir,'app.jsx')],bundle:true,outfile:join(dir,'app.js'),jsx:'automatic',alias:{react:dirname(peerRequire.resolve('react/package.json')),'react-dom':dirname(peerRequire.resolve('react-dom/package.json'))}})
// The trace paints Brand roles only, so the page loads Brand's tokens as every host does.
const brandTokens = readFileSync(peerRequire.resolve('@tangle-network/brand/styles/tokens.css'),'utf8')
const tokens = brandTokens + readFileSync(peerRequire.resolve('@tangle-network/charts/react/flow-waterfall.css'),'utf8') + `
:root { --chart-live-fg:hsl(var(--foreground));--chart-live-muted:hsl(var(--muted-foreground));--chart-live-faint:hsl(var(--muted-foreground));--chart-live-bg:hsl(var(--background));--chart-live-hover:hsl(var(--secondary)); --foreground:230 20% 12%;--muted-foreground:230 10% 40%;--background:0 0% 100%;--border:230 15% 85%;--secondary:230 15% 95%;--primary:250 65% 45%;--accent:205 70% 40%;--warning-strong:35 85% 35%;--success:145 65% 30%;--destructive:0 70% 45%;--chart-accent:hsl(var(--primary)); }
:root[data-theme=dark] { --foreground:230 20% 95%;--muted-foreground:230 10% 70%;--background:240 20% 10%;--border:240 15% 25%;--secondary:240 15% 18%;--primary:250 75% 75%;--accent:205 85% 65%;--warning-strong:35 95% 65%;--success:145 60% 65%;--destructive:0 80% 70%; }
`
const html = `<!doctype html><html lang="en" data-theme="light"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Packed chart consumer</title><style>${tokens}
body{margin:0;background:hsl(var(--background));color:hsl(var(--foreground));font:16px/1.5 Arial,sans-serif}
main{max-width:1000px;margin:16px auto;padding:16px;min-width:0;box-sizing:border-box}h1{font-size:26px}.panel{background:var(--md3-surface-container-lowest,#fff);padding:24px;border-radius:12px;border:1px solid var(--md3-outline-variant,#ddd);transform:translateX(12px);contain:paint}
[data-chart-tooltip]{box-shadow:0 4px 16px #0002}table{border-collapse:collapse;width:100%;text-align:left}th,td{padding:8px;border-bottom:1px solid #8884}details{margin-top:16px}
</style><div id="root"></div><script type="module" src="/app.js"></script></html>`
const graphCss = '@layer utilities {.flex{display:flex}.text-xs{font-size:17px}}' + readFileSync(peerRequire.resolve('@tangle-network/charts/react/agent-graph.css'),'utf8') + '.topology-pane{height:680px}';
const styles = {'/live.css':peerRequire.resolve('@tangle-network/charts/react/live.css'),'/figure.css':peerRequire.resolve('@tangle-network/charts/figure.css')};
const server=createServer(async(req,res)=>{
 if(req.url==='/formatter-proof.json') {
  const api=await import(peerRequire.resolve('@tangle-network/charts'))
  const rows=[1e-20,1e-10,1.2].map((price,i)=>({id:'recorded-cost-'+i,label:'Recorded cost '+i,rank:null,attempts:10,solved:5,rate:.5,estimate:'bootstrap',interval:{lower:.2,upper:.8,level:.95,method:'task-cluster-bootstrap'},tiers:null,cost:{perSolvedUsd:price,basis:'receipts',receipts:10},medianWallMs:1000,onFront:null}))
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({figure:api.costFrontier(rows,{measure:'solve rate'}),formatted:[0,1e-20,1e-10,.0032,1.2,-1,NaN,Infinity].map(value=>api.formatCost(value))}));return
 }
 res.setHeader('Content-Type', styles[req.url]?'text/css':req.url==='/app.js'?'text/javascript':'text/html');res.end(styles[req.url]?readFileSync(styles[req.url]):req.url==='/app.js'?readFileSync(join(dir,'app.js')):(req.url.includes('id=topology')?html.replace('</style>',graphCss+'</style>'):req.url.includes('id=palette-contracts')?html.replace(tokens,brandTokens):html).replace('<style>','<link rel="stylesheet" href="/live.css"><style>'))})
server.listen(Number(process.env.PORT ?? 0),'127.0.0.1',()=>console.log(JSON.stringify({consumer:dir,tarball:packed,react:JSON.parse(readFileSync(peerRequire.resolve('react/package.json'),'utf8')).version,url:'http://127.0.0.1:'+server.address().port})))
