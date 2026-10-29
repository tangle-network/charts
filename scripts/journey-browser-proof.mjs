/** Actual HTTP packed-consumer proof for Discovery's shared overview timeline. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const output = process.env.CHARTS_PROOF_DIR
assert.ok(output, 'CHARTS_PROOF_DIR must retain the evidence outside the gate cache')
await mkdir(output, { recursive: true })
const server = spawn(process.execPath, ['scripts/charts-browser-smoke.mjs'], { stdio: ['ignore', 'pipe', 'pipe'] })
const logs = []
server.stdout.on('data', bytes => logs.push(String(bytes)))
server.stderr.on('data', bytes => logs.push(String(bytes)))
let browser
const checks = []
try {
  const deadline = Date.now() + 120000
  while (true) {
    try { if ((await fetch('http://127.0.0.1:46489')).ok) break } catch {}
    assert.ok(Date.now() < deadline && server.exitCode === null, logs.join(''))
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  browser = await chromium.launch({ headless: true })
  for (const theme of ['light', 'dark']) for (const width of [1512, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 982 }, colorScheme: theme, recordVideo: { dir: output, size: { width, height: 982 } } })
    const page = await context.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`http://127.0.0.1:46489/?id=journey&globals=agent-${theme}`)
    await page.locator('[data-lane="agent-0"]').waitFor()
    assert.ok(await page.locator('[data-lane]').count() < 40, '124 lanes render a bounded window')
    await page.getByRole('button', { name: 'Agent 0', exact: true }).click()
    await page.getByRole('button', { name: 'Agent 0', exact: true }).press('End')
    await page.getByRole('button', { name: 'Agent 123', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Agent 123', exact: true }).press('Enter')
    assert.equal(await page.getByRole('button', { name: 'Agent 123', exact: true }).getAttribute('aria-pressed'), 'true')
    await page.getByRole('button', { name: 'Agent 123', exact: true }).hover()
    await page.locator('.ov-tip').waitFor()
    const tooltip = await page.locator('.ov-tip').boundingBox(), plot = await page.locator('.ov-gantt').boundingBox()
    assert.ok(tooltip.y >= plot.y && tooltip.y + tooltip.height <= plot.y + plot.height, 'A late virtual row tooltip stays beside the visible row')
    await page.locator('.ov-gantt-scroll').evaluate(el => { el.scrollTop -= 20 })
    await page.locator('.ov-tip').waitFor({ state: 'hidden' })
    await page.getByRole('button', { name: 'Agent 123', exact: true }).press('Home')
    await page.getByRole('button', { name: 'Agent 0', exact: true }).waitFor()
    const before = await page.locator('[data-lane="agent-3"] [data-open] rect').getAttribute('width')
    await page.screenshot({ path: `${output}/journey-${width}-${theme}.png` })
    await page.waitForTimeout(10000)
    assert.notEqual(await page.locator('[data-lane="agent-3"] [data-open] rect').getAttribute('width'), before, 'An open lane extends without reload')
    assert.equal(await page.locator('[data-best] circle').count(), 1)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    assert.equal(await page.locator('[data-lane="agent-3"] [data-open] rect').evaluate(el => getComputedStyle(el).animationName), 'none')
    assert.notEqual(await page.locator('svg[role="group"] .ov-mark-deadline').evaluate(el => getComputedStyle(el).strokeDasharray), 'none')
    await page.goto(`http://127.0.0.1:46489/?id=journey&globals=agent-${theme}&ancestor=1`)
    await page.locator('.ov-axis').first().waitFor()
    assert.equal(await page.locator('.ov-axis').first().evaluate(el => getComputedStyle(el).fill), 'rgb(17, 109, 91)')
    assert.equal(await page.locator('.ov-mark-label').first().evaluate(el => getComputedStyle(el).fill), 'rgb(32, 67, 120)')
    assert.deepEqual(errors, [])
    const video = page.video()
    await context.close()
    await video.saveAs(`${output}/journey-${width}-${theme}.webm`)
    checks.push({ theme, width, result: 'PASS', agents: 124 })
  }
} finally {
  await browser?.close()
  server.kill('SIGTERM')
  await writeFile(`${output}/consumer.log`, logs.join(''))
  await writeFile(`${output}/checks.json`, JSON.stringify(checks, null, 2))
}
