class MeterBoundary extends React.Component {
 state = { error: null }
 static getDerivedStateFromError(error) { return { error: error.message } }
 render() { return this.state.error ? <output>{this.state.error}</output> : this.props.children }
}
function MeterModes() {
 const [grown, setGrown] = useState(false)
 const hours = value => Number.isFinite(value) ? `${value} h` : '—'
 const section = (id, child) => <section data-meter-case={id} style={id === 'long' ? {maxWidth:180,marginLeft:'auto'} : undefined}><h2>{id}</h2>{child}</section>
 return <main><h1>Recorded Meter modes</h1><button onClick={() => setGrown(value => !value)}>Update recorded values</button>
  {section('used', <Meter used={4} total={10} />)}
  {section('parts', <Meter total={10} segments={[{label:'Work',value:3},{label:'Idle',value:2,pattern:'hatched'},{label:'Missing span',value:null}]} />)}
  {section('compare', <Meter compact total={grown ? 8 : 4} scaleMax={10} format={hours} segments={[{label:'Recorded work',value:grown ? 7 : 3},{label:'Open turn',value:1,pattern:'hatched',color:'var(--chart-accent)'}]} />)}
  {section('partial', <Meter compact total={4} scaleMax={10} segments={[{label:'Work',value:3},{label:'Absent trace',value:null}]} />)}
  {section('unknown-total', <Meter total={null} segments={[{label:'Recorded work',value:1},{label:'Absent trace',value:null}]} />)}
  {section('unknown-compact', <Meter compact total={null} scaleMax={10} segments={[{label:'Absent trace',value:null}]} />)}
  {section('zero', <Meter compact total={0} scaleMax={10} segments={[{label:'Work',value:0}]} />)}
  {section('zero-used', <Meter compact used={0} total={10} />)}
  {section('unknown-used', <Meter compact used={null} total={10} />)}
  {section('zero-whole', <Meter used={0} total={0} />)}
  {section('legacy-untraced', <Meter total={4} segments={[{label:'Missing interval',value:1,kind:'untraced'},{label:'Work',value:3}]} />)}
  {section('long', <Meter compact total={12} text="12 runs" segments={[{label:'A deliberately long recorded outcome abcdefghijklmnopqrstuvwxyz0123456789',value:9},{label:'Still running',value:3,pattern:'hatched'}]} />)}
  {section('clipped', <div data-meter-scroll style={{height:96,overflow:'auto',transform:'translateZ(0)'}}><div style={{height:240}}/><div style={{transform:'translateY(0)'}}><Meter compact total={4} scaleMax={10} segments={[{label:'Recorded work at the last visible row',value:3},{label:'Open turn',value:1,pattern:'hatched'}]} /></div></div>)}
  {section('steps', <Meter total={3} used={1} steps={[{label:'Manifest',state:'pass'},{label:'Offline build',state:'fail'},{label:'Hidden check',state:'unrun'}]} text="Build checks" />)}
  {section('invalid-axis', <MeterBoundary><Meter total={4} scaleMax={3} segments={[{label:'Work',value:4}]} /></MeterBoundary>)}
  {section('invalid-nonfinite-axis', <MeterBoundary><Meter total={4} scaleMax={Infinity} used={1} /></MeterBoundary>)}
  {section('over-total', <MeterBoundary><Meter total={4} segments={[{label:'Work',value:5}]} /></MeterBoundary>)}
 </main>
}
