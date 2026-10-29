/** Packed consumer: a stationary hover survives live snapshots, and names size by content. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, createWriteStream, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const output = resolve(process.env.CHARTS_PROOF_DIR ?? '/tmp/charts-live-names-proof')
mkdirSync(output, { recursive: true })
const server = spawn(process.execPath, ['scripts/charts-browser-smoke.mjs', ...process.argv.slice(2)], { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
const log = createWriteStream(`${output}/consumer.log`), checks = []
server.stdout.pipe(log); server.stderr.pipe(log)
const base = 'http://127.0.0.1:46489'
let browser
try {
  const deadline = Date.now() + 120_000
  while (true) {
    try { if ((await fetch(base)).ok) break } catch {}
    if (Date.now() > deadline || server.exitCode !== null) throw new Error('Packed consumer did not start; see consumer.log')
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  browser = await chromium.launch({ headless: true })
  for (const theme of ['light', 'dark']) for (const width of [1512, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 982 }, recordVideo: { dir: output, size: { width, height: 982 } } })
    const page = await context.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${base}/iframe.html?id=chatcontrols-flowwaterfall--live-names&globals=agentTheme:agent-${theme}`)
    const row = page.locator('[data-span-id="root"]'), bar = row.locator('.fw-bar'), card = page.locator('.fw-card')
    await bar.waitFor()
    await page.evaluate(() => document.fonts.ready)
    const column = () => row.locator('.fw-label').evaluate(el => el.getBoundingClientRect().width)
    const resize = page.locator('.fw-resize')
    const preferred = async () => Number(await resize.getAttribute('aria-valuenow'))
    const initial = await column(), initialPreferred = await preferred(), samples = [], check = { theme, width, initial, initialPreferred, samples }
    checks.push(check)
    const target = await bar.boundingBox()
    await page.mouse.move(target.x + 6, target.y + target.height / 2)
    await card.waitFor()
    const start = Date.now()
    do {
      await page.waitForTimeout(250)
      const current = await column(), update = Number(await page.locator('main').getAttribute('data-live-update'))
      samples.push({ elapsed: Date.now() - start, column: current, update })
      assert.ok(Math.abs(current - initial) <= 1, `live snapshot moves the name column: ${initial} → ${current}`)
      assert.equal(await card.isVisible(), true, 'stationary pointer retains its metric card through live snapshots')
    } while (Date.now() - start < 10_000)
    assert.ok(samples.at(-1).update > samples[0].update + 180000, 'the ten-second proof received fresh snapshots throughout')
    await page.screenshot({ path: `${output}/live-${theme}-${width}.png`, fullPage: true })
    await row.locator('.fw-name-text').filter({ hasText: 'Proof-verification-worker' }).waitFor()
    const renamed = await column()
    if (width > 390) {
      check.renamedPreferred = await preferred()
      assert.ok(check.renamedPreferred > initialPreferred + 20, `a longer incoming identity sizes its preferred column: ${initialPreferred} → ${check.renamedPreferred}`)
      await resize.focus()
      await page.keyboard.press('ArrowRight')
      const manual = await preferred()
      assert.equal(manual, check.renamedPreferred + 16, 'keyboard resizing changes the preferred column within the responsive cap')
      await page.waitForTimeout(1200)
      assert.equal(await preferred(), manual, 'subsequent snapshots respect manual sizing')
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    assert.deepEqual(errors, [])
    check.renamed = renamed
    await context.close()
  }
  console.log(JSON.stringify({ result: 'PASS', states: checks.length, output }))
} finally {
  await browser?.close()
  if (server.exitCode === null) process.kill(-server.pid, 'SIGTERM')
  writeFileSync(`${output}/checks.json`, JSON.stringify(checks, null, 2))
  log.end()
}
