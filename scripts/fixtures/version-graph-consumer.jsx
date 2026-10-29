// The original Discovery version-graph fixture, projected to the public chart model.
const versionNodes = [
 {id:'e',lane:'main',kind:'integrate',parents:['c','d'],title:'integrate editor: report.md',chips:[{label:'pages v2',tone:'accent'},{label:'held-out 1/3 · judge81.3 (incomplete)',tone:'info'},{label:'regression vs pages v1',tone:'neutral'}]},
 {id:'d',lane:'editor',kind:'write',parents:['a'],title:'editor: report.md'},
 {id:'c',lane:'main',kind:'integrate',parents:['1','b'],title:'integrate finance: model.md',chips:[{label:'pages v1 ★ picked by rule · not checked',tone:'neutral'}]},
 {id:'b',lane:'finance',kind:'profile',parents:['1'],title:'root: spawn finance'},
 {id:'a',lane:'editor',kind:'write',parents:['1'],title:'editor: draft.md'},
 {id:'1',lane:'main',kind:'write',parents:[],title:'seed'},
].map(node=>({...node,at:'2026-10-07T03:00:00Z'}))
function Versions() {
 const [selected,onSelect]=useState(null), [filter,setFilter]=useState('all'), [large,setLarge]=useState(false), [extra,setExtra]=useState(false)
 const nodes=large?Array.from({length:205},(_,i)=>({id:'commit-'+i,lane:'lane-'+i%29,parents:i<204?['commit-'+(i+1)]:[],kind:'write',title:'Recorded commit '+i+' with full retained ancestry and release notes for Discovery',detail:'root',chips:[{label:'4d',tone:'muted'}],at:'2026-10-07T03:00:00Z'})):versionNodes
 const model={lanes:[{id:'main',label:'main'},{id:'editor',label:'editor'},{id:'finance',label:'finance'}],nodes:extra?[{id:'new',lane:'main',parents:[nodes[0].id],kind:'write',title:'New recorded commit',at:'2026-10-07T03:01:00Z'},...nodes]:nodes}
 return <main><h1>Recorded versions</h1>
  <label>Lane <select aria-label="Lane" value={filter} onChange={event=>setFilter(event.target.value)}><option value="all">All lanes</option><option value="editor">Editor</option><option value="writes">Hide merges</option></select></label>
  <button onClick={()=>{setLarge(true);setExtra(false);onSelect(null)}}>Load retained history</button>
  <button onClick={()=>onSelect('commit-204')}>Select oldest</button>
  <button onClick={()=>setExtra(true)}>Receive new commit</button>
  <output aria-label="Selected commit">{selected??'None'}</output>
  <VersionGraph model={model} label="Recorded versions" selected={selected} onSelect={onSelect} shown={node=>filter==='all'||filter==='editor'&&node.lane==='editor'||filter==='writes'&&node.kind!=='integrate'}/>
 </main>
}
