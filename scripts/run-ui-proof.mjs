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
import '@tangle-network/brand/styles/tokens.css'; import '${process.env.PROOF_SOURCE_PREFIX ?? "."}/src/react/flow-waterfall.css';
document.documentElement.className=new URLSearchParams(location.search).get('theme')??'dark';
const spans=Array.from({length:17},(_,i)=>({id:'agent-'+i,kind:'pipeline',name:'Worker '+i,startMs:i*1000,endMs:1200000,status:i===0||i===1?'running':i===2?'needs-you':i<9?'failed':'done',activityAt:[1000,2000,i===0?1199999:3000],outcome:{tone:i<2?'live':i===2?'warn':i<9?'failed':'ok',label:i<2?'Running':i===2?'Needs you':i<9?'Failed':'Done'},output:i<9?'Compiler rejected the build':undefined}));
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
createRoot(document.getElementById('root')).render(<FlowWaterfall label="Seventeen agents" trace={{spans,totalMs:1200000,promptTokens:0,completionTokens:0,errors:17}} defaultView="agents" live={false} agentFill={new URLSearchParams(location.search).get("fill")??"agent"} selectedId={new URLSearchParams(location.search).has("selected")?"agent-0":undefined}/>);
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
    const context=await browser.newContext({viewport:{width,height:1100},recordVideo:{dir:out,size:{width,height:1100}}})
    const page=await context.newPage()
    await page.goto(`http://127.0.0.1:${server.address().port}/?theme=${theme}`)
    await page.locator('[data-flow-waterfall]').waitFor()
    await page.waitForTimeout(1200)
    check(`${theme}/${width} name fits row`,await page.locator('.fw-name-text').first().evaluate(el=>{const a=el.getBoundingClientRect(),b=el.closest('.fw-row').getBoundingClientRect();return a.top>=b.top&&a.bottom<=b.bottom}),true)
    await page.screenshot({path:`${out}/${theme}-${width}.png`,fullPage:true})
    check(`${theme}/${width} error rug`,await page.locator('.fw-error-tick').count(),17)
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
    await context.close()
    renameSync(await page.video().path(),`${out}/${theme}-${width}.webm`)
  }
}finally{await browser.close();server.close();writeFileSync(`${out}/checks.json`,JSON.stringify(checks,null,2))}
assert.equal(checks.filter(c=>!c.pass).length,0,'run UI browser checks failed')
