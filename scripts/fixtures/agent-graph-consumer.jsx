// Recorded agents exercise the format boundary; the explicit 130-agent case
// exercises windowing, selection and updates beyond the initial viewport.
function Topology() {
 const [selectedId, onSelect] = useState(null), [layout, setLayout] = useState('tree')
 const [tick, setTick] = useState(0)
 const [settled, setSettled] = useState(false)
 useEffect(() => { if (settled) return; const timer = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(timer) }, [settled])
 const boundary = params.has('large'), compact = params.has('compact')
 const nodes = boundary ? Array.from({ length: 130 }, (_, i) => ({
   id: 'agent-' + i, label: 'Agent ' + i, status: i === 1 ? 'failed' : settled ? 'succeeded' : i === 2 ? 'needs-you' : i % 3 === 0 ? 'running' : 'succeeded',
   turn: 'Recorded boundary task ' + tick, costUsd: i === 3 ? null : i / 100, tokens: i * 1000 + tick * 1000, model: 'glm-5.3', harness: 'opencode',
   events: [{ id: 'event-' + i, label: 'Read source ' + tick, at: Date.now() }],
 })) : recorded.spans.filter(span => span.kind === 'pipeline').map(span => ({
   id: span.id, label: span.name, status: span.status === 'done' ? 'succeeded' : 'unknown',
   turn: 'Imported from discovery-waterfall.json',
 }))
 const edges = boundary ? nodes.slice(1).map(node => ({ from: nodes[0].id, to: node.id, kind: 'spawn' }))
   : recorded.spans.filter(span => span.kind === 'pipeline' && span.parentId).map(span => ({ from: span.parentId, to: span.id, kind: 'spawn' }))
 return <main>
   <aside data-host-canary className="flex text-xs">Host controls</aside>
   <h1>Recorded agent topology</h1>
   <button onClick={() => setLayout(layout === 'tree' ? 'hub' : 'tree')}>Switch layout</button>
   <button onClick={() => onSelect(nodes.at(-1).id)}>Select last agent</button>
   <button onClick={() => setSettled(true)}>Settle run</button>
   <output aria-label="Reader selection">{selectedId ?? 'No selection'}</output>
   <output aria-label="Stream update">{tick}</output>
   <AgentGraph nodes={nodes} edges={edges} layout={layout} direction={compact ? 'LR' : 'TB'} live={!compact && !settled} now={Date.now()}
     selectedId={selectedId} onSelect={onSelect} tools={[]} calls={[]}
     className="topology-pane" renderAgentMark={node => <span data-host-mark={node.id}>A</span>} />
 </main>
}
