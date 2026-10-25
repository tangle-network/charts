// Packed-package consumer. Recorded data is injected from docs/fixtures by the server builder.
function FlowApp({ name }) {
 const [now, setNow] = useState(0)
 useEffect(() => {
  if (name !== 'discovery-streaming-replay') return
  const start = Date.now()
  const timer = setInterval(() => setNow(Math.min(recorded.totalMs, (Date.now() - start) * 20)), 100)
  return () => clearInterval(timer)
 }, [name])
 let trace = recorded, live
 if (name === 'healthy') trace = { ...healthy, spans: healthy.spans.map(s => s.kind === 'pipeline' ? { ...s, outcome: { tone: 'ok', label: 'Shipped' } } : s) }
 if (name === 'empty-flow-trace') trace = { spans: [], totalMs: 0, promptTokens: 0, completionTokens: 0, toolCalls: 0 }
 if (name === 'growing-live-trace') { trace = { spans: [
  { id:'root',kind:'pipeline',name:'Orchestrator',startMs:0,endMs:60000,status:'running' },
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
 return <main>{name==='discovery-streaming-replay'&&<p>Recorded Discovery replay ·20x; final totals arrive at settlement</p>}<FlowWaterfall trace={trace} live={live} maxHeight={1800}
  markers={name==='healthy'?[{at:Math.round(trace.totalMs/2),label:'Release v2',tone:'ok'},{at:Math.round(trace.totalMs/2)+50,label:'Release v3'},{at:trace.totalMs-50,label:'Release v4'}]:undefined}
  onSelect={span=>{window.__fwSelected=[...(window.__fwSelected??[]),span.id??span.name]}} /></main>
}
