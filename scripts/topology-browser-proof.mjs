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
let browser
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
    page.on('pageerror', error => errors.push(error.message))
    const ready = () => page.locator(`.agent-graph[data-layout="${width < 600 ? 'list' : 'ready'}"]`).waitFor()
    await page.goto(`http://127.0.0.1:46489/?id=topology&globals=agent-${theme}`)
    await ready()
    assert.match(await page.locator('.agent-graph').innerText(), /2 agents/)
    assert.ok(await page.locator('[data-host-mark]').count() > 0, 'host identity reaches the canonical renderer')
    await page.getByRole('button', { name: 'Select last agent', exact: true }).click()
    assert.equal(await page.getByLabel('Reader selection').textContent(), 'agent-1')
    await page.screenshot({ path: `${output}/recorded-tree-${width}-${theme}.png` })
    await page.getByRole('button', { name: 'Switch layout', exact: true }).click()
    const hubNode = page.locator('[data-agent-graph-node="agent-1"]')
    await hubNode.click()
    await page.getByRole('dialog').waitFor()
    assert.equal(await page.getByLabel('Reader selection').textContent(), 'agent-1')
    await page.screenshot({ path: `${output}/recorded-hub-${width}-${theme}.png` })
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await page.goto(`http://127.0.0.1:46489/?id=topology&large=1&globals=agent-${theme}`)
    await ready()
    const count = () => page.locator(width < 600 ? '.ag-phone-select' : '.react-flow__node-agent,.react-flow__node-liveAgent').count()
    assert.ok(await count() < 100, '130 agents render a bounded window')
    await page.getByRole('button', { name: 'Select last agent', exact: true }).click()
    const last = page.locator(width < 600 ? '[data-agent-id="agent-129"]' : '.react-flow__node[data-id="agent-129"]')
    await last.waitFor({ state: 'visible' })
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
    assert.deepEqual(errors, [])
    const video = page.video()
    await context.close()
    await video.saveAs(`${output}/topology-${width}-${theme}.webm`)
    checks.push({ theme, width, recordedAgents: 2, boundaryAgents: 130, result: 'PASS' })
  }
} finally {
  await browser?.close()
  server.kill('SIGTERM')
  await writeFile(`${output}/consumer.log`, logs.join(''))
  await writeFile(`${output}/checks.json`, JSON.stringify(checks, null, 2))
}
