/** Real HTTP consumer of the packed topology entry; no source aliases. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const output = process.env.CHARTS_PROOF_DIR
assert.ok(output, 'Retain topology evidence outside the gate cache')
await mkdir(output, { recursive: true })
const server = spawn(process.execPath, ['scripts/charts-browser-smoke.mjs'], { stdio: ['ignore', 'pipe', 'pipe'] })
const logs = [], checks = []
server.stdout.on('data', bytes => logs.push(String(bytes)))
server.stderr.on('data', bytes => logs.push(String(bytes)))
let browser, currentPage
try {
  const deadline = Date.now() + 120000
  while (true) {
    try { if ((await fetch('http://127.0.0.1:46489')).ok) break } catch {}
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
    await page.goto(`http://127.0.0.1:46489/?id=topology&globals=agent-${theme}`)
    await ready()
    assert.deepEqual(await page.locator('[data-host-canary]').evaluate(el => ({ display: getComputedStyle(el).display, fontSize: getComputedStyle(el).fontSize })), { display: 'grid', fontSize: '17px' }, 'graph CSS preserves host utilities')
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
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto(`http://127.0.0.1:46489/?id=topology&large=1&globals=agent-${theme}`)
    await ready()
    const count = () => page.locator(width < 600 ? '.ag-phone-select' : '.react-flow__node-agent,.react-flow__node-liveAgent').count()
    assert.ok(await count() < 100, '130 agents render a bounded window')
    await page.getByRole('button', { name: 'Select last agent', exact: true }).click()
    const last = page.locator(width < 600 ? '[data-agent-id="agent-129"]' : '.react-flow__node[data-id="agent-129"]')
    await last.waitFor({ state: 'visible' })
    const motion = await last.locator('.ag-live-card').evaluate(card => ({
      arrival: card.getAnimations().map(animation => animation.animationName),
      pulse: card.querySelector('.ag-running-dot').getAnimations().map(animation => animation.animationName),
    }))
    assert.ok(motion.arrival.includes('tangle-intro-enter'), 'Brand arrival has a real animation effect')
    assert.ok(motion.pulse.includes('tangle-breathe'), 'running status pulses through Brand motion')
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
