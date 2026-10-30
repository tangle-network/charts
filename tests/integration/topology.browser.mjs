/** Real HTTP consumer of the packed topology entry; no source aliases. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

async function proveCompactTopology(page, width, theme, output) {
  await page.goto(`${base}/?id=topology&compact=1&large=1&quiet=1&globals=agent-${theme}`)
  await page.locator(`.ag-topology[data-layout="${width < 600 ? 'list' : 'ready'}"]`).waitFor()
  await page.locator('.ag-agent-card[data-activity="quiet"]').getByText('Quiet 3d 14h',{exact:true}).waitFor()
  assert.equal(await page.locator('.ag-agent-card[data-activity="quiet"] .ag-running-dot').evaluate(element => element.getAnimations().some(animation => animation.animationName === 'tangle-breathe')), false, 'quiet recorded agents keep their pulse stopped')
  if (width > 600) {
    const root = await page.locator('.react-flow__node[data-id="agent-0"]').boundingBox()
    const team = await page.locator('.react-flow__node-agentFrame').boundingBox()
    assert.ok(root.x + root.width < team.x, 'the root is separate to the left of its team')
    assert.equal(await page.locator('.react-flow__viewport').evaluate(node => new DOMMatrixReadOnly(getComputedStyle(node).transform).a), 1)
    await page.getByRole('button', { name: 'Fit View', exact: true }).click()
    assert.equal(await page.locator('.react-flow__viewport').evaluate(node => new DOMMatrixReadOnly(getComputedStyle(node).transform).a), 1, 'fit never shrinks readable card text')
    const fittedRoot = await page.locator('.react-flow__node[data-id="agent-0"]').boundingBox(), viewport = await page.locator('.ag-graph-viewport').boundingBox()
    assert.ok(fittedRoot.y >= viewport.y && fittedRoot.y+fittedRoot.height <= viewport.y+viewport.height, 'fit keeps the root visible')
    const colors = await page.evaluate(() => ({frame:getComputedStyle(document.querySelector('.ag-team-frame')).backgroundColor, card:getComputedStyle(document.querySelector('.ag-agent-card')).backgroundColor}))
    assert.notEqual(colors.frame, colors.card, 'raised cards have a distinct surface from the team')
  }
  const cards = page.locator('.ag-agent-card')
  const appearance = await cards.first().evaluate(node => {const s=getComputedStyle(node); return {padding:s.padding,display:s.display,gap:s.gap,spacing:s.getPropertyValue('--spacing'),classes:node.className}})
  console.log('Compact card appearance',JSON.stringify({width,theme,...appearance}))
  assert.ok(parseFloat(appearance.padding) >= 8, 'packed cards retain their spacing without host resets')
  assert.ok(await cards.count() < 100, '130 topology agents render a bounded window')
  const sizes = await cards.evaluateAll(nodes => nodes.flatMap(node => [...node.querySelectorAll('span,p')].filter(child => child.textContent.trim()).map(child => parseFloat(getComputedStyle(child).fontSize))))
  assert.ok(sizes.length && sizes.every(size => size >= 13), `topology text floor: ${sizes}`)
  await page.screenshot({ path: `${output}/compact-tree-${width}-${theme}.png` })
  await page.getByRole('button', { name: 'Select last agent', exact: true }).click()
  const last = page.locator(width < 600 ? '[data-agent-id="agent-129"] .ag-agent-card' : '.react-flow__node[data-id="agent-129"] .ag-agent-card')
  await last.waitFor({state:'visible'})
  const identity = await last.locator('[data-agent-identity]').innerText()
  assert.equal(identity.match(/opencode/g)?.length, 1); assert.equal(identity.match(/glm-5.3/g)?.length, 1)
  assert.equal(await last.locator('[data-host-mark]').count(), 1, 'settled agents retain their mark')
  const tokens = await last.locator('[data-agent-tokens]').innerText(), before = await last.boundingBox()
  await page.waitForFunction(before => document.querySelector('[data-id="agent-129"] [data-agent-tokens], [data-agent-id="agent-129"] [data-agent-tokens]')?.textContent !== before, tokens)
  const after = await last.boundingBox()
  assert.ok(Math.abs(after.x-before.x)<1 && Math.abs(after.y-before.y)<1, 'live token updates preserve the selected card position')
  assert.equal(await page.getByLabel('Reader selection').textContent(), 'agent-129')
  const selectedColor = await last.evaluate(node=>getComputedStyle(node).backgroundColor)
  assert.notEqual(selectedColor, await page.locator('.ag-agent-card:not([data-selected])').first().evaluate(node=>getComputedStyle(node).backgroundColor), 'selected and raised cards have distinct surfaces')
  await page.screenshot({ path: `${output}/compact-selected-${width}-${theme}.png` })
  // Enter the shared inspector through real keyboard focus, outside the zoomed canvas.
  const owner = page.locator(width < 600 ? '[data-agent-id="agent-129"]' : '.react-flow__node[data-id="agent-129"]')
  await page.keyboard.press('Tab'); await owner.focus()
  const metrics = page.locator('[data-agent-metrics]'); await metrics.waitFor({ state: 'visible' })
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('[data-agent-metrics]')).opacity) >= .99)
  assert.match(await metrics.innerText(), /Agent 129/); assert.match(await metrics.innerText(), /Cost/)
  const metricBox = await metrics.boundingBox()
  assert.ok(metricBox.x >= 0 && metricBox.x + metricBox.width <= width + 1 && metricBox.y >= 0 && metricBox.y + metricBox.height <= 983, 'shared inspector stays in the viewport')
  assert.ok(await metrics.evaluate(element => parseFloat(getComputedStyle(element).fontSize)) >= 13, 'metrics keep their reading size outside the camera transform')
  await page.keyboard.press('Tab'); assert.equal(await metrics.evaluate(element => element === document.activeElement), true)
  await page.screenshot({ path: `${output}/shared-metrics-${width}-${theme}.png` })
  await page.keyboard.press('Escape'); await metrics.waitFor({ state: 'hidden' }); await page.waitForTimeout(350)
  assert.equal(await metrics.count(), 0, 'Escape stays closed after restoring the invoker')
  assert.equal(await owner.evaluate(element => element === document.activeElement), true)

  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
}

const output = process.env.CHARTS_PROOF_DIR
assert.ok(output, 'Retain topology evidence outside the gate cache')
await mkdir(output, { recursive: true })
const server = spawn(process.execPath, ['tests/fixtures/charts-browser-smoke.mjs', ...process.argv.slice(2)], { stdio: ['ignore', 'pipe', 'pipe'] })
const logs = [], checks = []
server.stdout.on('data', bytes => logs.push(String(bytes)))
server.stderr.on('data', bytes => logs.push(String(bytes)))
let base
let browser, currentPage
try {
  const deadline = Date.now() + 120000
  while (true) {
    const ready = logs.join('').split('\n').slice(0, -1).find(line => line.startsWith('{"consumer":'))
    if (ready) { base = JSON.parse(ready).url; break }
    assert.ok(Date.now() < deadline && server.exitCode === null, logs.join(''))
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  browser = await chromium.launch({ headless: true })
  for (const theme of ['light', 'dark']) for (const width of [1512, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 982 }, reducedMotion: 'reduce', recordVideo: { dir: output, size: { width, height: 982 } } })
    const page = await context.newPage(), errors = []
    currentPage = page
    page.on('pageerror', error => errors.push(error.message))
    const ready = () => page.locator(`.agent-graph[data-layout="${width < 600 ? 'list' : 'ready'}"]`).waitFor()
    await page.goto(`${base}/?id=topology&globals=agent-${theme}`)
    await ready()
    assert.deepEqual(await page.locator('[data-host-canary]').evaluate(el => ({ display: getComputedStyle(el).display, fontSize: getComputedStyle(el).fontSize })), { display: 'flex', fontSize: '17px' }, 'graph CSS preserves host utilities')
    assert.equal(await page.locator('.agent-graph').evaluate(el => getComputedStyle(el).display), 'flex', 'graph utilities apply to the scope root')
    const responsiveHost = await page.addStyleTag({content:'@layer utilities {.hidden {display:none} @media(min-width:600px){.sm\\:flex {display:flex}}}'})
    const graph = page.locator('.agent-graph')
    await graph.evaluate(node => node.classList.add('hidden'))
    assert.equal(await graph.evaluate(node=>getComputedStyle(node).display),'none','a caller layered hidden utility overrides component flex at its scope root')
    await graph.evaluate(node => node.classList.add('sm:flex'))
    assert.equal(await graph.evaluate(node=>getComputedStyle(node).display),width<600?'none':'flex','caller responsive utilities remain authoritative inside the component scope')
    await graph.evaluate(node => node.classList.remove('hidden','sm:flex')); await responsiveHost.evaluate(node=>node.remove())
    assert.match(await page.locator('.agent-graph').innerText(), /2 agents/)
    assert.ok(await page.locator('[data-host-mark]').count() > 0, 'host identity reaches the canonical renderer')
    await page.getByRole('button', { name: 'Select last agent', exact: true }).click()
    assert.equal(await page.getByLabel('Reader selection').textContent(), 'agent-1')
    await page.screenshot({ path: `${output}/recorded-tree-${width}-${theme}.png` })
    await page.getByRole('button', { name: 'Switch layout', exact: true }).click()
    const hubNode = page.locator('[data-agent-graph-node="agent-1"]')
    await page.getByRole('dialog').waitFor()
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await hubNode.focus()
    await page.keyboard.press('Enter')
    await page.getByRole('dialog').waitFor()
    assert.equal(await page.getByLabel('Reader selection').textContent(), 'agent-1')
    await page.screenshot({ path: `${output}/recorded-hub-${width}-${theme}.png` })
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    if (width < 600) {
      await page.goto(`${base}/?id=topology&shared-tool=1&quiet=1&globals=agent-${theme}`); await ready()
      await page.getByRole('button', { name: 'Switch layout', exact: true }).click()
      const copies = page.getByRole('button', { name: 'Read source', exact: true }); assert.equal(await copies.count(), 2)
      const earlier = copies.first(); await earlier.click()
      const details = page.getByRole('dialog', { name: 'Read source calls', exact: true }); await details.waitFor({ state: 'visible' })
      const card = await details.boundingBox(), invoker = await earlier.boundingBox()
      assert.ok(card.x >= 8 && card.x + card.width <= width - 8 && Math.min(Math.abs(card.y - invoker.y - invoker.height), Math.abs(invoker.y - card.y - card.height)) <= 8, 'the shared tool preview fits beside its actual earlier-row invoker')
      await page.getByRole('button', { name: 'Close', exact: true }).click(); assert.equal(await earlier.evaluate(element => element === document.activeElement), true)
      await page.keyboard.press('Enter'); await details.waitFor({ state: 'visible' }); await page.keyboard.press('Escape'); await details.waitFor({ state: 'hidden' })
      assert.equal(await earlier.evaluate(element => element === document.activeElement), true, 'Escape returns to the same tool occurrence')
      const chip = page.locator('.ag-chip').first(); await chip.click(); await page.getByRole('dialog').waitFor({ state: 'visible' })
      await page.getByRole('button', { name: 'Close', exact: true }).click(); assert.equal(await chip.evaluate(element => element === document.activeElement), true, 'Close returns to the header chip')
      await page.keyboard.press('Enter'); await page.getByRole('dialog').waitFor({ state: 'visible' }); await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' })
      assert.equal(await chip.evaluate(element => element === document.activeElement), true, 'Escape returns to the header chip')
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto(`${base}/?id=topology&large=1&globals=agent-${theme}`)
    await ready()
    const count = () => page.locator(width < 600 ? '.ag-phone-select' : '.react-flow__node-agent,.react-flow__node-liveAgent').count()
    assert.ok(await count() < 100, '130 agents render a bounded window')
    const running = page.locator('.ag-live-card[data-status="running"] .ag-running-dot').first()
    await running.waitFor({ state: 'visible' })
    const pulse = await running.evaluate(element => { const css = getComputedStyle(element); return { names: element.getAnimations().map(animation => animation.animationName), animation: css.animation, duration: css.getPropertyValue('--duration-ambient'), motion: css.getPropertyValue('--motion-ambient'), reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, quiet: element.closest('[data-activity]')?.getAttribute('data-activity') } })
    assert.ok(pulse.names.includes('tangle-breathe'), 'an actual running status pulses through Brand motion: ' + JSON.stringify(pulse))

    await page.getByRole('button', { name: 'Select last agent', exact: true }).click()
    const last = page.locator(width < 600 ? '[data-agent-id="agent-129"]' : '.react-flow__node[data-id="agent-129"]')
    await last.waitFor({ state: 'visible' })
    const arrival = await last.locator('.ag-live-card').evaluate(card => card.getAnimations().map(animation => animation.animationName))
    assert.ok(arrival.includes('tangle-intro-enter'), 'Brand arrival has a real animation effect')
    assert.equal(await last.locator('.ag-live-card').getAttribute('data-status'), 'stopped', 'the selected last agent retains its recorded terminal state')
    await last.focus()
    await page.keyboard.press('Enter')
    assert.equal(await page.getByLabel('Reader selection').textContent(), 'agent-129')
    const before = Number(await page.getByLabel('Stream update').textContent())
    await page.waitForTimeout(10000)
    assert.ok(Number(await page.getByLabel('Stream update').textContent()) >= before + 8, 'live updates continue')
    assert.equal(await page.getByLabel('Reader selection').textContent(), 'agent-129', 'selection survives updates')
    assert.ok(await count() < 100)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: `${output}/boundary-tree-${width}-${theme}.png` })
    if (width > 600) {
      await page.locator('.react-flow__controls-zoomin').click()
      await page.waitForFunction(() => new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.react-flow__viewport')).transform).a >= 1.199)
      const beforeZoom = await page.locator('.react-flow__viewport').evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).a)
      await page.getByRole('button', { name: 'Settle run', exact: true }).click()
      await page.locator('.react-flow__node-agent[data-id="agent-129"]').waitFor()
      const zooms = await page.evaluate(async () => {
        const values = []
        for (let frame = 0; frame < 12; frame++) {
          await new Promise(resolve => requestAnimationFrame(resolve))
          values.push(new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.react-flow__viewport')).transform).a)
        }
        return values
      })
      assert.ok(zooms.every(zoom => Math.abs(zoom - beforeZoom) < .001), `settling preserves reader zoom ${beforeZoom}; observed ${zooms}`)
      assert.equal(await page.getByLabel('Reader selection').textContent(), 'agent-129')
      const selectedBox = await last.boundingBox(), viewport = await page.locator('.ag-graph-viewport').boundingBox()
      assert.ok(selectedBox.x >= viewport.x - 1 && selectedBox.y >= viewport.y - 1 && selectedBox.x + selectedBox.width <= viewport.x + viewport.width + 1 && selectedBox.y + selectedBox.height <= viewport.y + viewport.height + 1, 'settling keeps the selected agent inside its viewport')
      await page.screenshot({ path: `${output}/settled-camera-${width}-${theme}.png` })
    }
    await proveCompactTopology(page, width, theme, output)
    assert.deepEqual(errors, [])
    const video = page.video()
    await context.close()
    await video.saveAs(`${output}/topology-${width}-${theme}.webm`)
    checks.push({ theme, width, recordedAgents: 2, boundaryAgents: 130, result: 'PASS' })
  }
} catch (error) {
  if (currentPage && !currentPage.isClosed()) {
    await currentPage.screenshot({ path: `${output}/failure.png`, fullPage: true })
    await writeFile(`${output}/failure.json`, JSON.stringify({ message: String(error), url: currentPage.url(), text: await currentPage.locator('body').innerText() }, null, 2))
  }
  throw error
} finally {
  await browser?.close()
  server.kill('SIGTERM')
  await writeFile(`${output}/consumer.log`, logs.join(''))
  await writeFile(`${output}/checks.json`, JSON.stringify(checks, null, 2))
}
