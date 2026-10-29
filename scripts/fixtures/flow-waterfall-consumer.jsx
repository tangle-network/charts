// Packed-package consumer. Recorded data is injected from docs/fixtures by the server builder.
function FlowApp({ name }) {
 const [now, setNow] = useState(0)
 useEffect(() => {
  if (!['discovery-streaming-replay', 'live-names'].includes(name)) return
  const start = Date.now()
  const timer = setInterval(() => setNow(Math.min(recorded.totalMs, (Date.now() - start) * 20)), 100)
  return () => clearInterval(timer)
 }, [name])
 let trace = recorded, live
 if (name === 'healthy') trace = { ...healthy, spans: healthy.spans.map(s => s.kind === 'pipeline' ? { ...s, outcome: { tone: 'ok', label: 'Shipped' } } : s) }
 // Three agents whose calls carry tokens in, out and cached and a cost; named tools, a failed step and its retry, a restart.
 if (name === 'agent-metrics' || name === 'phone-names') {
  const steps = (parent, start, n, tool) => Array.from({ length: n }, (_, i) => {
   const at = start + i * 20000
   return [{ id:`${parent}-m${i}`,parentId:parent,kind:'model',name:'thinking',startMs:at,endMs:at+8000+i*500,status:'done',promptTokens:20000+i*1000,completionTokens:900,cachedTokens:15000,costUsd:0.06 },
    { id:`${parent}-t${i}`,parentId:parent,kind:'tool',name:`${tool[i % tool.length]} · step ${i}`,startMs:at+9000+i*500,endMs:at+15000,status:parent==='builder'&&i===2?'failed':'done' }]
  }).flat()
  trace = { totalMs:600000,promptTokens:0,completionTokens:0, spans:[
   { id:'lead',kind:'pipeline',name:'lead',detail:'opus-5.5',startMs:0,endMs:600000,status:'done',outcome:{tone:'ok',label:'Shipped'} },
   { id:'planner',parentId:'lead',kind:'pipeline',name:'planner',detail:'gpt-6.1',startMs:10000,endMs:250000,status:'done',outcome:{tone:'neutral',label:'Nothing shipped'} },
   { id:'builder',parentId:'lead',kind:'pipeline',name:name==='phone-names'?'peer-director-1-resume':'builder',detail:'opus-5.5',startMs:60000,endMs:560000,status:'done',outcome:{tone:'ok',label:'Shipped'},marks:[{at:300000,kind:'restart',label:'Restarted'}] },
   ...steps('lead', 2000, 3, ['bash']), ...steps('planner', 12000, 10, ['read', 'grep']), ...steps('builder', 62000, 12, ['bash', 'edit', 'read']),
   { id:'builder-retry',parentId:'builder',kind:'tool',name:'bash · step 2',startMs:540000,endMs:545000,status:'done',retryOf:'builder-t2' }] }
  if (name === 'phone-names') {
   trace.totalMs = 86400000
   Object.assign(trace.spans[0], { name:'proof-verification-running',status:'running',endMs:86400000,activityAt:[1000,2000,3000],medianEventGapMs:1000,outcome:{tone:'live',label:'Running'} })
   Object.assign(trace.spans[1], { name:'peer-director-2-proof-check',status:'failed',endMs:48431000,outcome:{tone:'failed',label:'Failed'} })
   Object.assign(trace.spans[2], { endMs:80531000,costUsd:102.70 })
  }
 }
 if (name === 'empty-flow-trace') trace = { spans: [], totalMs: 0, promptTokens: 0, completionTokens: 0, toolCalls: 0 }
 if (name === 'growing-live-trace' || name === 'live-names') { trace = { spans: [
  { id:'root',kind:'pipeline',name:now > 260000 ? 'Proof-verification-worker' : 'Orchestrator',startMs:0,endMs:60000,status:'running' },
  { id:'tool',parentId:'root',kind:'tool',name:'Waiting for tool result',startMs:500,endMs:60000,status:'running' }],
  totalMs:60000,promptTokens:0,completionTokens:0,toolCalls:1 }; live = true }
 if (name === 'invalid-times') trace = { spans: [
  { id:'invalid',kind:'tool',name:'Unordered capture',startMs:10,endMs:5,status:'done' },
  { id:'metadata',kind:'tool',name:'Metadata is not status',startMs:0,endMs:1000,meta:{status:'failed',ok:false} }],
  totalMs:1000,promptTokens:0,completionTokens:0,toolCalls:2 }
 if (name === 'duplicate-identities') trace = { spans:['x:2','x','x'].map((id,i)=>({id,kind:'tool',name:'Captured '+i,startMs:i,endMs:i+1,status:'done'})),totalMs:3,promptTokens:0,completionTokens:0,toolCalls:3 }
 if (name === 'discovery-streaming-replay') {
  trace = { ...recorded, totalMs:now, spans:recorded.spans.filter(s => s.startMs <= now).map(s => ({ ...s, endMs:Math.min(now,s.endMs),status:s.endMs > now ? 'running' : s.status })),
   promptTokens:now===recorded.totalMs?recorded.promptTokens:0,completionTokens:now===recorded.totalMs?recorded.completionTokens:0,
   toolCalls:recorded.spans.filter(s=>['tool','handoff'].includes(s.kind)&&s.startMs<=now).length,
   errors:recorded.spans.filter(s=>s.status==='failed'&&s.endMs<=now).length }; live=false
 }
 // A pause band and a restart mark, as a Discovery run records them (spawn journal: host guard pause, driver restart).
 if (name === 'healthy') trace = { ...trace, pauses:[{startMs:Math.round(trace.totalMs*.62),endMs:Math.round(trace.totalMs*.72),label:'Paused: host guard'}],
  spans:trace.spans.map((s,i)=>i===1?{...s,marks:[{at:Math.round((s.startMs+s.endMs)/2),kind:'restart',label:'Restarted'}]}:s) }
 const authority = new URLSearchParams(location.search).get('authority')
 if (authority) {
  const known = { 'Model calls':'731',Model:'canonical/model',Tokens:'8,000,000 total · split not recorded','Model latency':'p50 3 s · p90 11 s · p99 32 s','Tool calls':'9,004',Failures:'127 failed steps',Retries:'44 retries · 8 restarts','Ran for':'23 h 12 m',Cost:'$992.18 list' }
  const values = authority === 'long' ? { ...known, Cost:'≥$992,180.00 list (incomplete)' } : authority === 'unknown' ? Object.fromEntries(Object.keys(known).map(key => [key, 'Not recorded'])) : authority === 'zero' ? { Tokens:'0','Model calls':'0','Tool calls':'0',Failures:'0',Retries:'0',Cost:'$0.00' } : known
  trace = { ...trace, spans:trace.spans.filter(span => span.parentId !== 'builder' || ['builder-m0','builder-t2'].includes(span.id)).map(span => span.id === 'builder' ? { ...span,facts:[{label:"MODEL CALLS",value:"999"},...Object.entries(values).map(([label,value]) => ({ label,value }))] } : span) }
  const family = new URLSearchParams(location.search).get('family')
  if (family) trace = { ...trace, spans:trace.spans.map(span => {
   if (!['planner','builder'].includes(span.id)) return span
   const full = family === '1' || family === 'partial' && span.id === 'planner'
   return { ...span,name:span.id==='planner'?'Worker 1':'Worker 2',promptTokens:full?100:undefined,completionTokens:full?20:undefined,cachedTokens:full?50:undefined,costUsd:full?2:undefined,
    facts:[...(span.facts??[]),{label:'Tokens',value:full?'100 in · 20 out · 50 cached':'Not recorded'},{label:'Cost',value:full?'$2.00 list':'Not recorded'}] }
  }) }

 }
 return <main data-live-update={now}>{name==='discovery-streaming-replay'&&<p>Recorded Discovery replay ·20x; final totals arrive at settlement</p>}<FlowWaterfall trace={trace} live={live} maxHeight={1800}
  markers={name==='healthy'?[{at:Math.round(trace.totalMs/2),label:'Release v2',tone:'ok'},{at:Math.round(trace.totalMs/2)+50,label:'Release v3'},{at:trace.totalMs-50,label:'Release v4'}]:undefined}
  onSelect={span=>{window.__fwSelected=[...(window.__fwSelected??[]),span.id??span.name]}}
  onTimeChange={t=>{window.__fwTime=t}}
  defaultView={name==='live-names'||name==='host-marks'||name==='agent-metrics'||name==='phone-names'?'agents':undefined} selectedId={name==='agent-metrics'||name==='phone-names'?'builder':undefined}
  renderIcon={name==='host-marks'?(span=>span.kind==='pipeline'?<span data-host-mark style={{display:'inline-flex',width:16,height:16,borderRadius:8,background:'currentColor'}}/>:undefined):undefined} /></main>
}
