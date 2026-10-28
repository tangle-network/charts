import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createServer } from 'node:http'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const out = process.env.PROOF_OUT ?? '/tmp/charts-run-ui-proof'
mkdirSync(out, { recursive: true })
const result = await build({ stdin: { contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {FlowWaterfall} from './src/react/index.ts';
import '@tangle-network/brand/styles/tokens.css'; import './src/react/flow-waterfall.css';
document.documentElement.className=new URLSearchParams(location.search).get('theme')??'dark';
const spans=Array.from({length:17},(_,i)=>({id:'agent-'+i,kind:'pipeline',name:'Worker '+i,startMs:i*1000,endMs:1200000,status:i===0||i===1?'running':i===2?'needs-you':i<9?'failed':'done',activityAt:[1000,2000,i===0?1199999:3000],outcome:{tone:i<2?'live':i===2?'warn':i<9?'failed':'ok',label:i<2?'Running':i===2?'Needs you':i<9?'Failed':'Done'},output:i<9?'Compiler rejected the build':undefined}));
for(let i=0;i<17;i++)spans.push({id:'error-'+i,parentId:'agent-'+(i%17),kind:'tool',name:'bash',startMs:5000+i*1000,endMs:6000+i*1000,status:'failed',output:'Compiler rejected the build'});
createRoot(document.getElementById('root')).render(<FlowWaterfall label="Seventeen agents" trace={{spans,totalMs:1200000,promptTokens:0,completionTokens:0,errors:17}} defaultView="agents" live={false}/>);
`, resolveDir: process.cwd(), sourcefile: 'proof.jsx', loader: 'jsx' }, bundle: true, write: false, outdir: 'proof', format: 'esm', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } })
const files = Object.fromEntries(result.outputFiles.map(file => [file.path.split('/').pop(), file.text]))
const server = createServer((req, res) => {
  const name = req.url.split('?')[0].slice(1)
  res.setHeader('content-type', name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html')
  res.end(files[name] ?? '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/stdin.css"><style>body{margin:0;background:var(--bg-canvas)}</style><div id="root"></div><script type="module" src="/stdin.js"></script>')
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
    await page.screenshot({path:`${out}/${theme}-${width}.png`,fullPage:true})
    check(`${theme}/${width} error rug`,await page.locator('.fw-error-tick').count(),17)
    check(`${theme}/${width} quiet agent`,await page.locator('[data-activity="quiet"]').count()>0,true)
    check(`${theme}/${width} overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
    check(`${theme}/${width} filters`,await page.locator('.fw-legend button[aria-pressed]').count()>0,true)
    const colors=await page.evaluate(()=>{
      const color=el=>getComputedStyle(el).backgroundColor
      const legend=new Set([...document.querySelectorAll('.fw-legend .fw-swatch')].map(color))
      return [...document.querySelectorAll('.fw-row .fw-agent-dot')].filter(el=>el.getBoundingClientRect().width).every(el=>legend.has(color(el)))
    })
    check(`${theme}/${width} outcome legend matches dots`,colors,true)
    await page.emulateMedia({reducedMotion:'reduce'})
    await page.waitForTimeout(100)
    check(`${theme}/${width} reduced motion transforms`,await page.evaluate(()=>document.getAnimations().some(a=>a.playState==='running'&&a.effect?.getKeyframes().some(f=>'transform'in f||'translate'in f))),false)
    await context.close()
  }
}finally{await browser.close();server.close();writeFileSync(`${out}/checks.json`,JSON.stringify(checks,null,2))}
assert.equal(checks.filter(c=>!c.pass).length,0,'run UI browser checks failed')
