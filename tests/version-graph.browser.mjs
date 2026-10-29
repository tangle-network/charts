/** Actual HTTP and fresh-package version history, carrying Discovery's retained merge fixture. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
const output = process.env.CHARTS_PROOF_DIR
assert.ok(output, 'Retain version graph proof outside the checkout')
await mkdir(output, { recursive: true })
const server = spawn(process.execPath, ['scripts/charts-browser-smoke.mjs', ...process.argv.slice(2)], { stdio: ['ignore','pipe','pipe'] })
const logs = [], checks = []
server.stdout.on('data', bytes => logs.push(String(bytes))); server.stderr.on('data', bytes => logs.push(String(bytes)))
let browser, page
try {
 const deadline = Date.now() + 120000
 while (true) {
  try { if ((await fetch('http://127.0.0.1:46489')).ok) break } catch {}
  assert.ok(Date.now()<deadline && server.exitCode===null, logs.join(''))
  await new Promise(resolve=>setTimeout(resolve,250))
 }
 browser = await chromium.launch({ headless:true })
 for (const theme of ['light','dark']) for (const width of [1512,390]) {
  const began=Date.now(), context=await browser.newContext({viewport:{width,height:982},colorScheme:theme,recordVideo:{dir:output,size:{width,height:982}}})
  page=await context.newPage(); const errors=[]
  page.on('pageerror', error=>errors.push(error.message))
  await page.goto(`http://127.0.0.1:46489/?id=versions&globals=agent-${theme}`)
  const chart=page.locator('.tgc-version-graph')
  await chart.locator('button[data-node="e"]').waitFor()
  assert.deepEqual(await chart.locator('path').evaluateAll(paths=>paths.map(path=>`${path.dataset.from}>${path.dataset.to}`).sort()),['a>1','b>1','c>1','c>b','d>a','e>c','e>d'])
  const columns=await chart.locator('circle').evaluateAll(dots=>dots.map(dot=>Number(dot.getAttribute('cx'))))
  assert.equal(columns[0],columns[2]); assert.equal(columns[1],columns[4]); assert.ok(columns[3]>columns[1]&&columns[1]>columns[0])
  await chart.getByRole('button').first().focus(); await page.keyboard.press('Enter')
  assert.equal(await page.getByLabel('Selected commit').innerText(),'e')
  assert.match(await chart.innerText(),/pages v1 ★ picked by rule · not checked/)
  assert.notEqual(await chart.locator('.vg-chip.tone-neutral').first().evaluate(element => getComputedStyle(element).boxShadow), 'none', 'neutral recorded outcomes retain their visible boundary in the public stylesheet')
  await page.getByLabel('Lane',{exact:true}).selectOption('editor')
  assert.deepEqual(await chart.locator('button[data-node]').evaluateAll(rows=>rows.map(row=>row.dataset.node)),['d','a'])
  assert.deepEqual(await chart.locator('path').evaluateAll(paths=>paths.map(path=>`${path.dataset.from}>${path.dataset.to}`)),['d>a'])
  await page.getByLabel('Lane',{exact:true}).selectOption('writes')
  assert.deepEqual(await chart.locator('button[data-node]').evaluateAll(rows=>rows.map(row=>row.dataset.node)),['d','b','a','1'])
  await page.getByLabel('Lane',{exact:true}).selectOption('all')
  await page.screenshot({path:`${output}/versions-${width}-${theme}.png`})
  await page.getByRole('button',{name:'Load retained history',exact:true}).click()
  await chart.locator('[data-node="commit-0"]').waitFor()
  const title = chart.locator('[data-node="commit-0"] .vg-title')
  const bounds = await title.evaluate(node => ({clipped:node.scrollWidth>node.clientWidth,overflow:getComputedStyle(node).textOverflow,size:parseFloat(getComputedStyle(node).fontSize),title:node.title,text:node.textContent,right:node.closest('.vg-row').getBoundingClientRect().right,paneRight:node.closest('.vg-scroll').getBoundingClientRect().right}))
  assert.equal(bounds.title,bounds.text,'ellipsis retains the complete commit title')
  assert.ok(bounds.size>=13,'commit labels retain the readable type floor')
  assert.ok(bounds.right<=bounds.paneRight+1,'29 lanes and metadata fit inside the phone pane')
  if(width===390) {assert.equal(bounds.clipped,true);assert.equal(bounds.overflow,'ellipsis')}
  await page.screenshot({path:`${output}/versions-retained-${width}-${theme}.png`})
  assert.ok(await chart.locator('li').count()<100,'205 commits render a bounded row window')
  await chart.locator('[data-node="commit-0"]').focus(); await page.keyboard.press('End')
  await chart.locator('[data-node="commit-204"]').waitFor()
  await page.keyboard.press('Enter')
  assert.equal(await page.getByLabel('Selected commit').innerText(),'commit-204')
  await page.keyboard.press('Home'); await chart.locator('[data-node="commit-0"]').waitFor(); await page.keyboard.press('Enter')
  await page.getByRole('button',{name:'Receive new commit',exact:true}).click()
  const arrival = chart.locator('[data-node="new"]')
  await arrival.waitFor()
  const animations = await arrival.evaluate(element => element.getAnimations().map(animation => ({ state: animation.playState, duration: animation.effect.getTiming().duration, frames: animation.effect.getKeyframes().map(frame => frame.opacity) })))
  assert.ok(animations.some(animation => animation.state === 'running' && animation.duration > 0 && animation.frames[0] === '0' && animation.frames.at(-1) === '1'), 'new recorded commits use the existing Brand arrival motion')
  assert.equal(await page.getByLabel('Selected commit').innerText(),'commit-0','a live commit preserves reader selection')
  await page.getByRole('button',{name:'Select oldest',exact:true}).click()
  await chart.locator('[data-node="commit-204"]').waitFor()
  assert.ok(await chart.locator('li').count()<100)
  await chart.locator('[data-node="commit-204"]').focus(); await page.keyboard.press('Home')
  await arrival.waitFor()
  assert.equal(await arrival.evaluate(element => element.getAnimations().length), 0, 'virtual recycling alone cannot replay arrival')
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.reload()
  await page.getByRole('button',{name:'Receive new commit',exact:true}).click()
  await chart.locator('[data-node="new"]').waitFor()
  assert.equal(await chart.locator('[data-node="new"]').evaluate(element => element.getAnimations().length), 0, 'reduced motion preserves the new commit without animation')
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  assert.deepEqual(errors,[])
  await page.waitForTimeout(Math.max(0,10100-(Date.now()-began)))
  await context.close(); checks.push({theme,width,recordedEdges:7,windowedCommits:205,result:'PASS'})
 }
} catch(error) {
 if(page&&!page.isClosed()) {await page.screenshot({path:`${output}/failure.png`,fullPage:true});await writeFile(`${output}/failure.json`,JSON.stringify({error:String(error),text:await page.locator('body').innerText()},null,2))}
 throw error
} finally {await browser?.close();server.kill('SIGTERM');await writeFile(`${output}/consumer.log`,logs.join(''));await writeFile(`${output}/checks.json`,JSON.stringify(checks,null,2))}
