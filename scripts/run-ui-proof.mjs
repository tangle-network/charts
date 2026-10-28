import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createServer } from 'node:http'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { paletteAudit, contrastAudit } from './run-ui-color.mjs'

const out = process.env.PROOF_OUT ?? '/tmp/charts-run-ui-proof'
mkdirSync(out, { recursive: true })
const result = await build({ stdin: { contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {FlowWaterfall} from '${process.env.PROOF_SOURCE_PREFIX ?? "."}/src/react/index.ts';
import {catalogPrice,otlpFlowTrace} from '${process.env.PROOF_SOURCE_PREFIX ?? "."}/src/index.ts';
import '@tangle-network/brand/styles/tokens.css'; import '${process.env.PROOF_SOURCE_PREFIX ?? "."}/src/react/flow-waterfall.css';
document.documentElement.className=new URLSearchParams(location.search).get('theme')??'dark';
const spans=Array.from({length:new URLSearchParams(location.search).has('many')?200:17},(_,i)=>({id:'agent-'+i,kind:'pipeline',name:'Worker '+i,startMs:i*1000,endMs:1200000,status:i===0||i===1?'running':i===2?'needs-you':i<9?'failed':'done',activityAt:[1000,2000,i===0?1199999:3000],outcome:{tone:i<2?'live':i===2?'warn':i<9?'failed':'ok',label:i<2?'Running':i===2?'Needs you':i<9?'Failed':'Done'},output:i<9?'Compiler rejected the build':undefined}));
if(new URLSearchParams(location.search).has('family')) {spans.forEach(span=>span.parentId='orch');spans.unshift({id:'orch',kind:'pipeline',name:'Orchestrator',startMs:0,endMs:1200000,status:'done',outcome:{tone:'ok',label:'Done'}})}
if(new URLSearchParams(location.search).has('cadence')) {spans[1].activityAt=[3000];spans[1].medianEventGapMs=600000}
if(new URLSearchParams(location.search).has('zero-cadence')) {spans[1].activityAt=[0,400000,800000];spans[1].medianEventGapMs=0}
if(new URLSearchParams(location.search).has('status-only'))spans.forEach(span=>delete span.outcome);
if(new URLSearchParams(location.search).has('no-activity'))spans.push({id:'no-clock',kind:'pipeline',name:'No clock',startMs:0,endMs:1200000,status:'running'});
if(new URLSearchParams(location.search).has('duplicate-cadence'))spans[1].activityAt=[0,0,400000];
spans.push({id:'gap',parentId:'agent-16',kind:'tool',name:'Not reported',startMs:Number.NaN,endMs:Number.NaN});
spans.push({id:'peer-model',parentId:'agent-9',kind:'model',name:'Turn 1',startMs:30000,endMs:350000,status:'done'},{id:'peer-tool',parentId:'agent-9',kind:'tool',name:'read',startMs:350000,endMs:700000,status:'done'});
spans.push({id:'model',parentId:'agent-0',kind:'model',name:'Turn 1',startMs:30000,endMs:350000,status:'done'});
for(let i=0;i<17;i++)spans.push({id:'error-'+i,parentId:'agent-'+(i%17),kind:'tool',name:'bash',startMs:i===0?350000:5000+i*1000,endMs:i===0?700000:6000+i*1000,status:'failed',output:'Compiler rejected the build'});
if(new URLSearchParams(location.search).has('grammar'))spans.push({id:'grammar-model',parentId:'agent-1',kind:'model',name:'Turn 2',startMs:30000,endMs:300000,status:'done'},{id:'grammar-tool',parentId:'agent-1',kind:'tool',name:'read',startMs:300000,endMs:500000,status:'done'});
const failureCase=new URLSearchParams(location.search).get('failure-proof');if(failureCase){spans[0].output='Owner final reply unrelated to tool failure';const failed=spans.find(span=>span.id==='error-0');delete failed.output;if(failureCase==='fact')failed.facts=[{label:'Failure',value:'Recorded subprocess exit 7'}];if(failureCase==='output')failed.output='Raw tool stdout before exit'}
if(new URLSearchParams(location.search).has('comparisons')){spans[0].costUsd=1000;for(const [i,name,cost,end]of[[1,'Collector',20,1200000],[2,'Verifier',10,600000]])Object.assign(spans[i],{parentId:'agent-0',name,costUsd:cost,endMs:end,status:'done',outcome:{tone:'ok',label:'Done'}})}
let trace={spans,totalMs:1200000,promptTokens:0,completionTokens:0,errors:17};
const totals=new URLSearchParams(location.search).get('totals');
const long=Number(new URLSearchParams(location.search).get('long'));if(long){const scale=long/trace.totalMs;for(const span of trace.spans){span.startMs*=scale;span.endMs*=scale;if(span.activityAt)span.activityAt=span.activityAt.map(at=>at*scale)}trace.totalMs=long;document.getElementById('root').style.padding='16px'}
if(totals==='missing'){delete trace.promptTokens;delete trace.completionTokens}
if(totals==='partial'){trace.promptTokens=3;delete trace.completionTokens}
if(totals==='zero'){trace.modelCalls=0;trace.toolCalls=0}
if(totals==='invalid'){trace.promptTokens=Number.NaN;trace.completionTokens=Infinity;trace.modelCalls=Number.NaN;trace.toolCalls=Infinity}
if(totals?.startsWith('otlp-'))trace=otlpFlowTrace([{trace_id:'totals',span_id:'call',name:'llm.call',kind:'LLM',start_time:'2026-01-01T00:00:00Z',end_time:'2026-01-01T00:00:01Z',attributes:{'gen_ai.request.model':'fixture/model',...(totals==='otlp-zero'?{'gen_ai.usage.input_tokens':0,'gen_ai.usage.output_tokens':0}:totals==='otlp-positive'?{'gen_ai.usage.input_tokens':3,'gen_ai.usage.output_tokens':5}:totals==='otlp-partial'?{'gen_ai.usage.input_tokens':3}:{})}}],{price:catalogPrice({data:[{id:'fixture/model',pricing:{prompt:'0.01',completion:'0.02'}}]})});
const compose=new URLSearchParams(location.search).has('compose');
function Feed(){const[paused,setPaused]=React.useState(false);return <aside data-feed data-paused={paused}><button onClick={()=>setPaused(!paused)}>Pause feed</button><div style={{height:192}}>Latest recorded event</div></aside>}
function App(){const[cursor,setCursor]=React.useState(null),[selected,setSelected]=React.useState(undefined);return <FlowWaterfall label="Seventeen agents" trace={trace} defaultView={new URLSearchParams(location.search).has('graph-default')?'graph':'agents'} live={new URLSearchParams(location.search).has('live')} agentFill={new URLSearchParams(location.search).get("fill")??"agent"} graph={compose?<article data-graph data-cursor={cursor??'full'} data-selected={selected??''}>Host graph</article>:undefined} latestEvents={compose?<Feed/>:undefined} onTimeChange={setCursor} onSelect={compose?span=>setSelected(span.id):undefined} selectedId={selected??(new URLSearchParams(location.search).has("selected")?"agent-0":undefined)}/>}
createRoot(document.getElementById('root')).render(<App/>);
`, resolveDir: process.cwd(), sourcefile: 'proof.jsx', loader: 'jsx' }, bundle: true, write: false, outdir: 'proof', format: 'esm', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } })
const files = Object.fromEntries(result.outputFiles.map(file => [file.path.split('/').pop(), file.text]))
const server = createServer((req, res) => {
  const name = req.url.split('?')[0].slice(1)
  res.setHeader('content-type', name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html')
  res.end(files[name] ?? '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/stdin.css"><style>body{margin:0;background:var(--bg-root)}</style><div id="root"></div><script type="module" src="/stdin.js"></script>')
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const browser = await chromium.launch({headless:true,args:['--no-sandbox']})
const checks=[]
const check=(name,actual,expected)=>{const pass=actual===expected;checks.push({name,pass,actual,expected});console.log(`${pass?'PASS':'FAIL'} ${name}: ${JSON.stringify(actual)}`)}
try {
  for(const theme of ['dark','light'])for(const width of [1280,390]){
    if(process.env.PALETTE_SEARCH==='1'&&width!==1280)continue
    const context=await browser.newContext({viewport:{width,height:1100},recordVideo:{dir:out,size:{width,height:1100}}})
    const page=await context.newPage()
    await page.goto(`http://127.0.0.1:${server.address().port}/?theme=${theme}`)
    await page.locator('[data-flow-waterfall]').waitFor()
    await page.waitForTimeout(1200)
    if(process.env.PALETTE_SEARCH==='1'){const solved=await page.evaluate(paletteAudit,{search:true});writeFileSync(`${out}/${theme}-search.json`,JSON.stringify(solved,null,2));console.log('BOUNDED PALETTE',theme,JSON.stringify({...solved,feasibleHueSamples:solved.feasibleHueSamples.length}));await context.close();continue}
    check(`${theme}/${width} name fits row`,await page.locator('.fw-name-text').first().evaluate(el=>{const a=el.getBoundingClientRect(),b=el.closest('.fw-row').getBoundingClientRect();return a.top>=b.top&&a.bottom<=b.bottom}),true)
    await page.screenshot({path:`${out}/${theme}-${width}.png`,fullPage:true})
    check(`${theme}/${width} error rug`,await page.locator('.fw-error-tick').count(),17)
    check(`${theme}/${width} error rug labels recorded ends`,await page.locator('.fw-error-tick').evaluateAll(nodes=>nodes.every(node=>node.title.startsWith('Recorded end of failed span at ')&&node.title.endsWith('failure instant not reported'))),true)
    check(`${theme}/${width} canonical failed status glyph`,await page.locator('.fw-row-state svg[data-run-status="failed"]').count()>0,true)
    check(`${theme}/${width} quiet keeps running explicit`,await page.locator('.fw-row[data-running] .fw-quiet').evaluateAll(nodes=>nodes.every(node=>node.getAttribute('aria-label')?.startsWith('Running; Quiet '))),true)
    check(`${theme}/${width} quiet is not waiting status`,await page.locator('.fw-quiet svg[data-run-status="waiting"]').count(),0)

    check(`${theme}/${width} quiet agent`,await page.locator('[data-activity="quiet"]').count()>0,true)
    check(`${theme}/${width} overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
    check(`${theme}/${width} filters`,await page.locator('.fw-legend button[aria-pressed]').count()>0,true)
    const colors=await page.evaluate(()=>{
      const color=el=>getComputedStyle(el).backgroundColor
      const legend=new Set([...document.querySelectorAll('.fw-legend .fw-swatch')].map(color))
      const drawn=new Set([...document.querySelectorAll('.fw-row .fw-agent-dot')].filter(el=>el.getBoundingClientRect().width).map(color))
      return drawn.size===legend.size&&[...drawn].every(value=>legend.has(value))
    })
    check(`${theme}/${width} outcome legend matches dots`,colors,true)
    if(process.env.PROOF_BASELINE==='1') {await context.close();renameSync(await page.video().path(),`${out}/${theme}-${width}.webm`);continue}
    check(`${theme}/${width} model label visibility`,await page.locator('[data-span-id=agent-0] .fw-seg-model .fw-seg-label').isVisible(),width>=600)
    check(`${theme}/${width} tool label visibility`,await page.locator('[data-span-id=agent-0] .fw-seg-failed .fw-seg-label').isVisible(),width>=600)
    const restContrast=await page.evaluate(contrastAudit)
    console.log('REST CONTRAST',theme,width,restContrast)
    check(`${theme}/${width} text contrast`,restContrast.failures.length,0)
    if(width===390) {
      check(`${theme}/${width} four ticks`,await page.locator('.fw-axis .fw-tick').count(),4)
      check(`${theme}/${width} 44px rows`,await page.locator('.fw-agent-row').first().evaluate(el=>el.getBoundingClientRect().height),44)
      await page.locator('.fw-key summary').click()
    }
    const palette=await page.evaluate(paletteAudit)
    console.log('PALETTE',theme,palette)
    check(`${theme}/${width} identity/status distance`,palette.min>=20,true)
    check(`${theme}/${width} identity lightness bounds`,palette.lightnessOk,true)
    check(`${theme}/${width} identity chroma .11`,palette.chromaOk,true)
    const firstRow=page.locator('[data-span-id="agent-0"]')
    await firstRow.locator('.fw-seg-failed').hover()
    await page.locator('.fw-card .fw-agent-dot').waitFor()
    const hoverContrast=await page.evaluate(contrastAudit)
    console.log('HOVER CONTRAST',theme,width,hoverContrast)
    check(`${theme}/${width} hover text contrast`,hoverContrast.failures.length,0)
    const rowColor=await firstRow.locator('.fw-agent-dot').evaluate(el=>getComputedStyle(el).backgroundColor)
    check(`${theme}/${width} inspector dot matches row`,await page.locator('.fw-card .fw-agent-dot').evaluate(el=>getComputedStyle(el).backgroundColor),rowColor)
    check(`${theme}/${width} failed segment glyph`,await firstRow.locator('.fw-seg-failed .fw-glyph').count(),1)
    await page.mouse.move(1,1)
    await page.locator('.fw-summary button').click()
    check(`${theme}/${width} error filter pressed`,await page.locator('.fw-summary button').getAttribute('aria-pressed'),'true')
    check(`${theme}/${width} error filter expands steps`,await page.locator('.fw-step[data-span-kind="failed"]').count()>0,true)
    await page.locator('.fw-summary button').click()
    await page.getByRole('button',{name:'Expand Worker 16',exact:true}).click()
    check(`${theme}/${width} unknown timing is dash`,await page.locator('[data-span-id=gap] .fw-invalid').textContent(),'—')
    const shade=await page.evaluate(()=>{
      const parent=document.querySelector('.fw-agent-row .fw-lane')
      const tones=['model','tool'].map(kind=>{const el=document.createElement('span');el.className='fw-seg fw-seg-'+kind;el.dataset.tone='3';parent.append(el);const value=getComputedStyle(el).backgroundColor;el.remove();return Number(value.match(/oklch\(([^ ]+)/)?.[1])})
      return Math.abs(tones[0]-tones[1])
    })
    check(`${theme}/${width} model/tool lightness gap`,shade>=.18,true)
    check(`${theme}/${width} one ambient period`,await page.evaluate(()=>new Set(document.getAnimations().filter(a=>a.effect?.getTiming().iterations===Infinity).map(a=>a.effect.getTiming().duration)).size),1)
    await page.emulateMedia({reducedMotion:'reduce'})
    await page.waitForTimeout(100)
    check(`${theme}/${width} reduced motion transforms`,await page.evaluate(()=>document.getAnimations().some(a=>a.playState==='running'&&a.effect?.getKeyframes().some(f=>'transform'in f||'translate'in f))),false)
    check(`${theme}/${width} essential opacity survives`,await page.evaluate(()=>document.getAnimations().some(a=>a.playState==='running'&&a.effect?.getKeyframes().some(f=>'opacity'in f))),true)
    await page.goto(`http://127.0.0.1:${server.address().port}/?theme=${theme}&family=1`)
    await page.locator('[data-span-id="family:Worker"]').waitFor()
    check(`${theme}/${width} mixed family keeps member outcomes`,await page.locator('[data-span-id="family:Worker"] .fw-agent-dot[data-outcome]').count(),4)
    check(`${theme}/${width} mixed family key colors`,await page.evaluate(()=>{const color=el=>getComputedStyle(el).backgroundColor;const key=new Set([...document.querySelectorAll('.fw-legend .fw-swatch')].map(color));const drawn=new Set([...document.querySelectorAll('.fw-row .fw-agent-dot')].map(color));return key.size===drawn.size&&[...drawn].every(value=>key.has(value))}),true)
    await page.getByRole('button',{name:'1 quiet',exact:true}).click()
    check(`${theme}/${width} quiet filter reveals agent`,await page.locator('[data-span-id="agent-1"][data-activity="quiet"]').count(),1)
    await page.goto(`http://127.0.0.1:${server.address().port}/?theme=${theme}&selected=1`)
    await page.locator('[data-selection]').waitFor()
    await page.waitForTimeout(1200)
    const selectedContrast=await page.evaluate(contrastAudit)
    console.log('SELECTED CONTRAST',theme,width,selectedContrast)
    check(`${theme}/${width} selected peer text contrast`,selectedContrast.failures.length,0)
    for(const [cadence,expected] of [['cadence',0],['zero-cadence',1]]) {
      await page.goto(`http://127.0.0.1:${server.address().port}/?theme=${theme}&${cadence}=1`)
      await page.locator('[data-flow-waterfall]').waitFor()
      check(`${theme}/${width}/${cadence} preserves producer gap`,await page.locator('[data-span-id="agent-1"][data-activity="quiet"]').count(),expected)
    }
    for(const fill of ['muted','outcome']) {
      await page.goto(`http://127.0.0.1:${server.address().port}/?theme=${theme}&fill=${fill}`)
      await page.locator('[data-flow-waterfall]').waitFor()
      await page.waitForTimeout(1200)
      const fillContrast=await page.evaluate(contrastAudit)
      console.log('FILL CONTRAST',theme,width,fill,fillContrast)
      check(`${theme}/${width}/${fill} text contrast`,fillContrast.failures.length,0)
    }
    await page.goto(`http://127.0.0.1:${server.address().port}/?theme=${theme}&status-only=1`)
    await page.locator('[data-flow-waterfall]').waitFor()
    check(`${theme}/${width} status-only failure dot`,await page.locator('[data-span-id="agent-3"] .fw-agent-dot[data-outcome="failed"]').count(),1)
    check(`${theme}/${width} status-only running dot`,await page.locator('[data-span-id="agent-0"] .fw-agent-dot[data-outcome="live"]').count(),1)
    if(width===390) {
      check(`${theme}/${width} phone failure label`,await page.locator('[data-span-id="agent-3"] .fw-row-state').isVisible(),true)
      check(`${theme}/${width} phone needs-you label`,await page.locator('[data-span-id="agent-2"] .fw-row-state').evaluateAll(nodes=>nodes[0]?.textContent??null),'Needs you')
      check(`${theme}/${width} key disclosure cue`,await page.locator('.fw-key summary svg').isVisible(),true)
    }
    for(const [query,id,expected] of [['no-activity','no-clock',0],['duplicate-cadence','agent-1',1]]) {
      await page.goto(`http://127.0.0.1:${server.address().port}/?theme=${theme}&${query}=1`)
      await page.locator('[data-flow-waterfall]').waitFor()
      check(`${theme}/${width}/${query} uses recorded activity`,await page.locator(`[data-span-id="${id}"][data-activity="quiet"]`).count(),expected)
    }
    for(const [totals,expected] of [['missing','—'],['zero','0'],['invalid','—'],['partial','—'],['otlp-missing','—'],['otlp-zero','0'],['otlp-partial','—'],['otlp-positive','8']]) {
      await page.goto(`http://127.0.0.1:${server.address().port}/?theme=${theme}&totals=${totals}`)
      await page.locator('.fw-summary').waitFor()
      const read=()=>page.locator('.fw-summary dt').evaluateAll(nodes=>Object.fromEntries(nodes.map(dt=>[dt.textContent,{value:dt.nextElementSibling.textContent,title:dt.nextElementSibling.title}])))
      let cells=await read()
      check(`${theme}/${width}/${totals} token total`,cells.Tokens.value,expected)
      if(expected==='—')check(`${theme}/${width}/${totals} unknown title`,/not reported/i.test(cells.Tokens.title),true)
      if(totals.startsWith('otlp-'))check(`${theme}/${width}/${totals} priced only from reported usage`,(cells['Cost · list price']?.value ?? cells.Cost?.value ?? '').includes(totals==='otlp-positive'?'$0.13':totals==='otlp-zero'?'$0.00':'—'),true)
      if(totals==='invalid'||totals==='zero')for(const key of ['Model calls','Tool calls'])check(`${theme}/${width}/${totals} ${key}`,cells[key].value,totals==='zero'?'0':'—')
      await page.getByRole('button',{name:'Restart',exact:true}).click()
      cells=await read()
      check(`${theme}/${width}/${totals} playback token total`,cells.Tokens.value,expected)
    }
    for(const [failure,expected] of [['missing','Failure detail not reported'],['fact','Failure: Recorded subprocess exit 7'],['output','Recorded output: Raw tool stdout before exit']]) {
      await page.goto(`http://127.0.0.1:${server.address().port}/?theme=${theme}&failure-proof=${failure}`)
      await page.locator('[data-span-id="agent-0"] .fw-seg-failed').hover()
      await page.locator('.fw-card-error').waitFor()
      const message=await page.locator('.fw-card-error').textContent()
      check(`${theme}/${width}/${failure} uses own failure evidence`,message,expected)
      check(`${theme}/${width}/${failure} never certifies owner output`,message.includes('Owner final reply'),false)
      await page.screenshot({path:`${out}/failure-${failure}-${theme}-${width}.png`,fullPage:true})
      if(failure==='output') {
        await page.getByRole('radio',{name:'Steps',exact:true}).click()
        await page.locator('[data-span-id="error-0"] .fw-bar').hover()
        check(`${theme}/${width} full card labels recorded output`,await page.locator('.fw-card-text .fw-card-label').last().textContent(),'Recorded output')
      }
    }
    await page.goto(`http://127.0.0.1:${server.address().port}/?theme=${theme}&comparisons=1`)
    await page.locator('[data-span-id="agent-1"]').waitFor()
    await page.waitForTimeout(1200)
    check(`${theme}/${width} parent excluded from leaf comparisons`,await page.locator('[data-span-id="agent-0"] .fw-badge').count(),0)
    check(`${theme}/${width} leaf comparison labels`,(await page.locator('[data-span-id="agent-1"] .fw-badge').allTextContents()).toString(),['Longest leaf','Costliest leaf'].toString())
    if(width>=600)check(`${theme}/${width} comparisons stay in label area`,await page.locator('[data-span-id="agent-1"] .fw-badge').evaluateAll(nodes=>nodes.every(node=>{const a=node.getBoundingClientRect(),label=node.closest('.fw-label');if(!label)return false;const b=label.getBoundingClientRect();return a.left>=b.left&&a.right<=b.right&&a.top>=b.top&&a.bottom<=b.bottom})),true)
    if(width===390){check(`${theme}/${width} explicit running label`,await page.locator('[data-span-id="agent-0"] .fw-row-state').evaluateAll(nodes=>nodes[0]?.textContent??null),'Running');check(`${theme}/${width} explicit done label`,await page.locator('[data-span-id="agent-2"] .fw-row-state').evaluateAll(nodes=>nodes[0]?.textContent??null),'Done')}
    await page.screenshot({path:`${out}/leaf-${theme}-${width}.png`,fullPage:true})
    await page.goto(`http://127.0.0.1:${server.address().port}/?theme=${theme}&compose=1`)
    await page.locator('[data-flow-waterfall]').waitFor()
    if(width===390){
      const geometry=await page.locator('[data-flow-waterfall]').evaluate(root=>{const row=root.querySelector('.fw-row').getBoundingClientRect(),feed=root.querySelector('[data-feed]').getBoundingClientRect(),body=root.querySelector('.fw-body').getBoundingClientRect();return {first:row.top-root.getBoundingClientRect().top,feedAfterRows:feed.top>=body.bottom}})
      console.log('PHONE COMPOSITION',theme,geometry)
      check(`${theme}/${width} first agent within300px`,geometry.first<300,true)
      check(`${theme}/${width} latest events after timeline`,geometry.feedAfterRows,true)
    }
    await page.emulateMedia({reducedMotion:'no-preference'})
    check(`${theme}/${width} running legend static`,await page.locator('.fw-legend [data-outcome="live"]').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).animationName==='none')),true)
    await page.screenshot({path:`${out}/composition-${theme}-${width}.png`,fullPage:true})
    check(`${theme}/${width} feed follows active view in DOM`,await page.locator('[data-feed]').evaluate(feed=>Boolean(feed.compareDocumentPosition(document.querySelector('.fw-body'))&Node.DOCUMENT_POSITION_PRECEDING)),true)
    const graphChoice=page.getByRole('radio',{name:'Graph',exact:true})
    check(`${theme}/${width} single three-view control`,await page.getByRole('radiogroup',{name:'Trace view',exact:true}).getByRole('radio').count(),3)
    if(await graphChoice.count()) {
      await page.getByRole('button',{name:'Pause feed',exact:true}).click()
      const slider=page.getByRole('slider',{name:'Playback position',exact:true})
      await slider.focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight')
      const position=await slider.inputValue()
      await page.getByRole('button',{name:'Expand Worker 3',exact:true}).click()
      await graphChoice.click()
      check(`${theme}/${width} supplied graph visible`,await page.locator('[data-graph]').isVisible(),true)
      check(`${theme}/${width} graph retains cursor`,await page.locator('[data-graph]').getAttribute('data-cursor'),position)
      check(`${theme}/${width} graph retains selection`,await page.locator('[data-graph]').getAttribute('data-selected'),'agent-3')
      check(`${theme}/${width} graph hides waterfall controls`,await page.locator('.fw-summary,.fw-key,.fw-playback,.fw-canvas').count(),0)
      check(`${theme}/${width} graph keeps feed state`,await page.locator('[data-feed]').getAttribute('data-paused'),'true')
      await page.getByRole('radio',{name:'Steps',exact:true}).click()
      check(`${theme}/${width} steps keeps feed state`,await page.locator('[data-feed]').getAttribute('data-paused'),'true')
      check(`${theme}/${width} steps retains cursor`,await page.getByRole('slider',{name:'Playback position',exact:true}).inputValue(),position)
      await page.getByRole('radio',{name:'Agents',exact:true}).click()
      check(`${theme}/${width} agents retains selection`,await page.locator('[data-span-id="agent-3"]').getAttribute('aria-selected'),'true')
      check(`${theme}/${width} agents keeps feed state`,await page.locator('[data-feed]').getAttribute('data-paused'),'true')
      await page.goto(`http://127.0.0.1:${server.address().port}/?theme=${theme}&compose=1&graph-default=1`)
      await page.locator('[data-graph]').waitFor()
      check(`${theme}/${width} default graph`,await page.getByRole('radio',{name:'Graph',exact:true}).getAttribute('aria-checked'),'true')
    }
    await page.goto(`http://127.0.0.1:${server.address().port}/?theme=${theme}&compose=1&many=1`)
    await page.locator('.fw-body').waitFor()
    await page.mouse.move(2,40);await page.mouse.wheel(0,2000);await page.waitForTimeout(300)
    check(`${theme}/${width} 200-agent feed reachable by native wheel`,await page.locator('[data-feed]').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight}),true)
    await page.getByRole('button',{name:'Pause feed',exact:true}).click()
    await page.getByRole('radio',{name:'Graph',exact:true}).click()
    check(`${theme}/${width} 200-agent graph retains reachable feed`,await page.locator('[data-feed]').getAttribute('data-paused'),'true')
    await page.goto(`http://127.0.0.1:${server.address().port}/?theme=${theme}&grammar=1`)
    await page.locator('.fw-summary').waitFor()
    await page.waitForTimeout(1200)
    if(width===390)await page.locator('.fw-key summary').click()
    check(`${theme}/${width} bar grammar explanation`,await page.locator('.fw-kind-rule').isVisible(),true)
    check(`${theme}/${width} kind key prefers actual colored family`,await page.locator('.fw-swatch-model').evaluate(el=>el.parentElement.dataset.example),'agent-1')
    check(`${theme}/${width} lifecycle not repeated in subtitle`,await page.locator('[data-span-id="agent-3"] .fw-subtitle').evaluate(el=>!el.textContent.includes('Failed')),true)
    check(`${theme}/${width} waiting key uses actual hatch`,await page.locator('.fw-swatch-wait').evaluate(el=>getComputedStyle(el).backgroundImage.includes('repeating-linear-gradient')),true)
    check(`${theme}/${width} kind key matches drawn model`,await page.evaluate(()=>{const swatch=document.querySelector('.fw-swatch-model'),owner=swatch.closest('[data-example]').dataset.example;return getComputedStyle(swatch).backgroundColor===getComputedStyle(document.querySelector('[data-span-id="'+owner+'"] .fw-seg-model')).backgroundColor}),true)
    if(width===390) {
      await page.screenshot({path:`${out}/grammar-key-${theme}-${width}.png`,fullPage:true})
      check(`${theme}/${width} open key fits card`,await page.locator('.fw-legends').evaluate(el=>{const box=el.getBoundingClientRect(),root=el.closest('[data-flow-waterfall]').getBoundingClientRect();return box.left>=root.left&&box.right<=root.right&&el.scrollWidth<=el.clientWidth}),true)
      await page.locator('.fw-key summary').click()
      const hierarchy=await page.locator('.fw-summary').evaluate(el=>{const children=[...el.children];const rest=children.slice(2).map(node=>node.getBoundingClientRect());return {height:el.getBoundingClientRect().height,hero:parseFloat(getComputedStyle(children[0].querySelector('dd')).fontSize),oneLine:rest.every(box=>Math.abs(box.top-rest[0].top)<1)}})
      check(`${theme}/${width} compact summary hierarchy`,hierarchy.hero,20)
      check(`${theme}/${width} secondary metrics one line`,hierarchy.oneLine,true)
      check(`${theme}/${width} summary under80px`,hierarchy.height<=80,true)
    }
    await page.screenshot({path:`${out}/grammar-${theme}-${width}.png`,fullPage:true})
    if(width===390)for(const duration of [1715993,84928112,431000]) {
      await page.goto(`http://127.0.0.1:${server.address().port}/?theme=${theme}&long=${duration}`)
      await page.locator('.fw-axis-track').waitFor({state:'visible'})
      await page.waitForFunction(()=>document.querySelectorAll('.fw-axis .fw-tick').length===4)
      const geometry=await page.locator('.fw-axis-track').evaluate(track=>{const area=track.getBoundingClientRect();const labels=[...track.querySelectorAll('.fw-tick')].map(el=>({text:el.textContent,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right}));return {labels,clear:labels.length===4&&labels.every((label,i)=>label.left>=area.left&&label.right<=area.right&&(i===0||label.left>=labels[i-1].right+4))}})
      console.log('PHONE AXIS',theme,duration,geometry)
      check(`${theme}/${width}/${duration} four unclipped separated ticks`,geometry.clear,true)
      check(`${theme}/${width}/${duration} endpoint duration`,geometry.labels.at(-1)?.text,duration===1715993?'28m 36s':duration===84928112?'23h 35m':'7m 11s')
      const chip=await page.locator('.fw-time').evaluate(el=>{const box=el.getBoundingClientRect(),parent=el.parentElement.getBoundingClientRect();return box.height<=parseFloat(getComputedStyle(el).lineHeight)+1&&box.left>=parent.left-1&&box.right<=parent.right+1})
      check(`${theme}/${width}/${duration} single-line time chip`,chip,true)
      await page.screenshot({path:`${out}/axis-${theme}-${duration}-${width}.png`,fullPage:true})
    }
    for(const footerWidth of width===1280?[1280,1440]:[390])for(const duration of [1715993,84928112,431000]) {
      await page.setViewportSize({width:footerWidth,height:1000})
      await page.goto(`http://127.0.0.1:${server.address().port}/?theme=${theme}&long=${duration}`)
      await page.getByRole('radio',{name:'Steps',exact:true}).click()
      const footer=await page.locator('.fw-playback').evaluate(el=>{const time=el.querySelector('.fw-time'),range=document.createRange();range.selectNodeContents(time);const text=range.getBoundingClientRect(),rail=el.querySelector('.fw-overview-marks').getBoundingClientRect(),area=el.getBoundingClientRect();return {text:{left:text.left,right:text.right,top:text.top,bottom:text.bottom},rail:{left:rail.left,right:rail.right,top:rail.top,bottom:rail.bottom},separate:text.right+4<=rail.left||text.left>=rail.right+4||text.bottom+1<=rail.top||text.top>=rail.bottom+1,contained:text.left>=area.left&&text.right<=area.right&&text.top>=area.top&&text.bottom<=area.bottom,oneLine:range.getClientRects().length===1}})
      console.log('PLAYBACK TEXT/RAIL',theme,footerWidth,duration,footer)
      check(`${theme}/${footerWidth}/${duration} playback time clear single line inside footer`,footer.separate&&footer.contained&&footer.oneLine,true)
      await page.locator('.fw-playback').screenshot({path:`${out}/playback-${theme}-${duration}-${footerWidth}.png`})
    }
    await page.setViewportSize({width,height:1000})
    await page.emulateMedia({reducedMotion:'no-preference'})
    await page.goto(`http://127.0.0.1:${server.address().port}/?theme=${theme}&live=1`)
    const liveBadge=page.locator('.fw-state-live')
    await liveBadge.waitFor()
    check(`${theme}/${width} normal Live badge host stays still`,await liveBadge.evaluate(el=>getComputedStyle(el).animationName),'none')
    await liveBadge.screenshot({path:`${out}/live-badge-normal-${theme}-${width}.png`})
    await page.emulateMedia({reducedMotion:'reduce'})
    await page.waitForTimeout(100)
    const badgeMotion=await liveBadge.evaluate(el=>{const host=getComputedStyle(el),dot=getComputedStyle(el,'::before');return {host:host.animationName,dot:dot.animationName,width:parseFloat(dot.width),height:parseFloat(dot.height),effects:el.getAnimations().map(a=>({name:a.animationName,pseudo:a.effect?.pseudoElement??null,duration:a.effect?.getComputedTiming().duration,iterations:a.effect?.getTiming().iterations}))}})
    console.log('ACTUAL LIVE BADGE MOTION',theme,width,badgeMotion)
    check(`${theme}/${width} reduced Live badge host stays still`,badgeMotion.host,'none')
    check(`${theme}/${width} reduced Live dot still breathes`,badgeMotion.dot,'tangle-breathe')
    check(`${theme}/${width} Live pulse is6px dot`,badgeMotion.width===6&&badgeMotion.height===6,true)
    await liveBadge.screenshot({path:`${out}/live-badge-reduced-${theme}-${width}.png`})
    await context.close()
    renameSync(await page.video().path(),`${out}/${theme}-${width}.webm`)
  }
}finally{await browser.close();server.close();writeFileSync(`${out}/checks.json`,JSON.stringify(checks,null,2))}
assert.equal(checks.filter(c=>!c.pass).length,0,'run UI browser checks failed')
