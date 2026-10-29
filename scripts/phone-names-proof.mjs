/** Actual packed-package consumer: long names, status, bars and full metrics share a phone. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, createWriteStream, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const output = resolve(process.env.CHARTS_PROOF_DIR ?? '/tmp/charts-phone-names-proof')
mkdirSync(output, { recursive: true })
const server = spawn(process.execPath, ['scripts/charts-browser-smoke.mjs', ...process.argv.slice(2)], { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
const log = createWriteStream(`${output}/consumer.log`)
server.stdout.pipe(log); server.stderr.pipe(log)
const base = 'http://127.0.0.1:46489', checks = []
let browser
try {
  const deadline = Date.now() + 120_000
  while (true) {
    try { if ((await fetch(base)).ok) break } catch {}
    if (Date.now() > deadline || server.exitCode !== null) throw new Error('Packed consumer did not start; see consumer.log')
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  browser = await chromium.launch({ headless: true })
  for (const theme of ['light', 'dark']) for (const width of [390, 1512]) {
    const context = await browser.newContext({ viewport: { width, height: 982 }, hasTouch: width === 390, recordVideo: { dir: output, size: { width, height: 982 } } })
    const page = await context.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${base}/iframe.html?id=chatcontrols-flowwaterfall--phone-names&globals=agentTheme:agent-${theme}`)
    const row = page.locator('[data-span-id="builder"]')
    await row.waitFor()
    await row.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${output}/names-${theme}-${width}.png`, fullPage: true })
    const geometry = await row.evaluate(row => {
      const name = row.querySelector('.fw-name-text'), end = row.querySelector('.fw-end'), status = row.querySelector('.fw-row-state'), bar = row.querySelector('.fw-bar')
      const box = element => { const b = element.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right } }
      const text = box(name), numbers = box(end), state = box(status), lane = box(bar)
      return { name: name.textContent, whole: name.scrollWidth <= name.clientWidth, text, numbers, state, lane, row: box(row), status: status.textContent }
    })
    checks.push({ theme, width, geometry })
    assert.equal(geometry.name, 'peer-director-1-resume')
    assert.equal(geometry.whole, true, `distinctive agent suffix is truncated at ${width}: ${JSON.stringify(geometry)}`)
    assert.ok(geometry.text.bottom <= geometry.numbers.top + 1 || geometry.text.right <= geometry.numbers.left, 'name and duration/cost do not overlap')
    assert.ok(geometry.state.bottom <= geometry.lane.top + 1 || width > 599, 'status remains readable above the work bars')
    assert.equal(geometry.status, 'Done')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await row.locator('.fw-bar').click()
    const card = page.locator('.fw-card')
    await card.waitFor()
    const text = await card.innerText()
    for (const label of ['peer‑director‑1‑resume', 'Model', 'Ran for', 'Tokens', 'Model latency', 'Cost', 'Model calls', 'Tool calls', 'Failures', 'Retries']) assert.ok(text.includes(label), `full metrics retains ${label}`)
    await page.screenshot({ path: `${output}/metrics-${theme}-${width}.png`, fullPage: true })
    await page.keyboard.press('Escape')
    assert.equal(await card.count(), 0)
    assert.deepEqual(errors, [])
    await context.close()
  }
  console.log(JSON.stringify({ result: 'PASS', states: checks.length, checks, output }))
} finally {
  await browser?.close()
  if (server.exitCode === null) process.kill(-server.pid, 'SIGTERM')
  writeFileSync(`${output}/checks.json`, JSON.stringify(checks, null, 2))
  log.end()
}
