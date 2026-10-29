// Actual packed-package HTTP consumer: counts, unknowns, keyboard windows and live rendering.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
const out = resolve(process.env.COUNT_HEATMAP_EVIDENCE ?? '/tmp/count-heatmap-proof')
await mkdir(out,{recursive:true})
const child=spawn(process.execPath,['scripts/charts-browser-smoke.mjs',...process.argv.slice(2)],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','inherit']})
let output='', url=''
await new Promise((done,reject)=>{child.stdout.on('data',data=>{output+=data;const row=output.trim().split('\n').findLast(line=>line.startsWith('{')&&line.includes('"url":'));if(row){url=JSON.parse(row).url;done()}});child.on('exit',code=>reject(new Error(`consumer exited ${code}: ${output}`)))})
const browser=await chromium.launch({headless:true}), checks=[]
try {
 for(const theme of ['light','dark'])for(const width of [1512,390]){
  const context=await browser.newContext({viewport:{width,height:900},colorScheme:theme,recordVideo:{dir:out,size:{width,height:900}}}),page=await context.newPage(),errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  try{
   await page.goto(`${url}/?id=analytics-counts&globals=theme:agent-${theme}`)
   const table=page.getByRole('table',{name:'Tool calls'})
   await table.waitFor()
   assert.equal(await table.getAttribute('aria-rowcount'),'141')
   assert.ok(await table.getByRole('row').count()<=23,'140 rows remain windowed')
   assert.match(await table.getByRole('row').nth(1).innerText(),/—/,'missing cells stay unknown')
   assert.match(await table.getByRole('row').nth(2).innerText(),/\b0\b/,'recorded zero is visible')
   const first=table.getByRole('button',{name:'Agent 0',exact:true})
   await first.focus()
   for(let i=0;i<120;i++)await page.keyboard.press('ArrowDown')
   assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Agent 120')
   await page.keyboard.press('Enter')
   assert.equal(await page.locator('output').innerText(),'agent-120')
   assert.ok(await table.getByRole('row').count()<=23)
   const old=await table.locator('[data-heat-row="120"][data-heat-column="1"]').innerText()
   const track=page.locator('.ov-hbar-track > span').first()
   const before=await track.evaluate(node=>getComputedStyle(node).transform)
   await page.getByRole('button',{name:'Append counts'}).click()
   await page.waitForFunction(old=>document.querySelector('[data-heat-row="120"][data-heat-column="1"]').textContent!==old,old)
   const during=await track.evaluate(node=>getComputedStyle(node).transitionDuration)
   assert.notEqual(during,'0s','Brand stream motion applies')
   await page.waitForTimeout(650)
   assert.notEqual(await track.evaluate(node=>getComputedStyle(node).transform),before)
   assert.match(await page.locator('.ov-hbar-track > span').nth(1).getAttribute('style'),/scaleX\(0\)/)
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
   await page.screenshot({path:`${out}/${theme}-${width}.png`,fullPage:true})
   await page.emulateMedia({reducedMotion:'reduce'})
   assert.equal(await track.evaluate(node=>getComputedStyle(node).transitionDuration),'0s')
   assert.deepEqual(errors,[])
   checks.push({theme,width,result:'PASS',rows:140,mountedRows:await table.getByRole('row').count(),selected:'agent-120',before:old,after:await table.locator('[data-heat-row="120"][data-heat-column="1"]').innerText(),motion:during})
  } finally {await context.close()}
 }
 await writeFile(`${out}/checks.json`,JSON.stringify(checks,null,2)+'\n')
}finally{await browser.close();child.kill('SIGTERM')}
console.log(JSON.stringify({result:'PASS',out,checks}))
