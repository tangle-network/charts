// Packed-package HTTP consumer: BehaviorStrip at 100 rows × 288 windows (windowing, keyboard cursor, hover, legend,
// live append) and run e's real rows with the DotStrip, in both themes at 1512 and 390, then fps at idle and under wheel scrolling.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
const out = resolve(process.env.BEHAVIOR_STRIP_EVIDENCE ?? '/tmp/behavior-strip-proof')
await mkdir(out, { recursive: true })
const child = spawn(process.execPath, ['tests/fixtures/charts-browser-smoke.mjs', ...process.argv.slice(2)], { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'] })
let output = '', url = ''
await new Promise((done, reject) => { child.stdout.on('data', data => { output += data; const row = output.trim().split('\n').findLast(line => line.startsWith('{') && line.includes('"url":')); if (row) { url = JSON.parse(row).url; done() } }); child.on('exit', code => reject(new Error(`consumer exited ${code}: ${output}`))) })
const browser = await chromium.launch({ headless: true }), checks = []
const stats = frames => { const sorted = [...frames].sort((a, b) => a - b), mean = frames.reduce((a, b) => a + b, 0) / frames.length; return { frames: frames.length, fps: Math.round(1000 / mean * 10) / 10, p95FrameMs: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 10) / 10, framesOver50Ms: frames.filter(f => f > 50).length } }
try {
  for (const theme of ['light', 'dark']) for (const width of [1512, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, recordVideo: { dir: out, size: { width, height: 900 } } }), page = await context.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await page.goto(`${url}/?id=behavior&globals=theme:agent-${theme}`)
      const grid = page.getByRole('grid', { name: 'Behavior per agent per window' })
      await grid.waitFor()
      await page.waitForFunction(() => document.querySelector('.tgc-behavior-canvas')?.hasAttribute('data-frame-ms'))
      assert.equal(await grid.getAttribute('aria-rowcount'), '101')
      assert.equal(await grid.getAttribute('aria-colcount'), '289')
      assert.ok(await grid.getByRole('row').count() <= 49, '100 rows stay windowed')
      assert.match(await grid.getByRole('row').nth(1).getAttribute('aria-label'), /^Agent 0 · lead: \w+ [\d.]+ min, \w+ [\d.]+ min, \w+ [\d.]+ min$/, 'a row names its top three categories in minutes')
      const key = page.getByRole('list', { name: 'Key' }).first()
      assert.ok(await key.getByRole('listitem').count() >= 12, 'the key names every category, releases and messages')
      assert.equal(await key.locator('.tgc-behavior-badge').count(), 2, 'uncalibrated categories carry the badge')
      const canvas = grid.locator('.tgc-behavior-canvas'), box = await canvas.boundingBox()
      await page.mouse.move(box.x + box.width * 0.6, box.y + 28 + 8 * 16 + 8)
      await page.getByRole('tooltip').waitFor()
      assert.match(await page.getByRole('tooltip').innerText(), /Agent 8 · worker · \d\d:\d\dZ–\d\d:\d\dZ\s+behavior/, 'hover names the agent, the window clock and the behavior')
      await page.mouse.move(0, 0)
      const first = grid.getByRole('row').nth(1)
      await first.focus()
      for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight')
      assert.match(await page.getByRole('tooltip').innerText(), /17:25Z–17:30Z/, 'the cursor moved five windows')
      await page.keyboard.press('End')
      assert.match(await page.getByRole('tooltip').innerText(), /16:55Z–17:00Z/, 'End reaches window 287')
      await page.keyboard.press('Home')
      for (let i = 0; i < 60; i++) await page.keyboard.press('ArrowDown')
      assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-strip-row')), '60', 'row focus crosses the window boundary')
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('Enter')
      assert.equal(await page.getByRole('status', { name: 'Reader selection' }).innerText(), 'agent-60:1')
      assert.ok(await grid.getByRole('row').count() <= 49)
      await page.getByRole('button', { name: 'Append window' }).click()
      await page.waitForFunction(() => document.querySelector('.tgc-behavior-strip')?.getAttribute('data-windows') === '289')
      assert.equal(await grid.getAttribute('data-live'), 'true')
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      await page.screenshot({ path: `${out}/synthetic-${theme}-${width}.png`, fullPage: true })
      await page.goto(`${url}/?id=behavior&data=e&globals=theme:agent-${theme}`)
      await page.waitForFunction(() => document.querySelector('.tgc-behavior-canvas')?.hasAttribute('data-frame-ms'))
      assert.equal(await page.getByRole('grid').first().getAttribute('aria-rowcount'), '44', 'run e has 43 agents')
      assert.equal(await page.getByRole('list', { name: 'Key' }).first().locator('.tgc-behavior-badge').count(), 3, 'run e: reviewing, integrating and looping are uncalibrated under dl-ui-behavior-windows@1; exploring, implementing and verifying keep their hues')
      const dots = page.getByRole('group', { name: 'Per-agent metrics with outliers' })
      assert.equal(await dots.locator('[data-outlier]').count(), 13, "run e's 13 producer-marked outliers")
      await dots.locator('[data-outlier]').first().focus()
      assert.match(await page.getByRole('tooltip').innerText(), /outlier\s+robust z/)
      await page.keyboard.press('Enter')
      assert.match(await page.getByRole('status', { name: 'Dot selection' }).innerText(), /^calls_per_hour:/)
      assert.equal(await page.locator('[data-mark="candidate"]').count(), 2, 'two unmerged candidates')
      assert.match(await page.locator('.ov-events').innerText(), /KEEP #2871 · 3 h/)
      assert.equal(await page.locator('.ag-live-activity').count(), 5)
      assert.equal(await page.locator('.ag-live-activity[data-serious]').count(), 1)
      assert.equal(await page.locator('.ag-live-activity[data-calibrated="false"] .ag-live-badge').innerText(), 'uncalibrated')
      await page.screenshot({ path: `${out}/run-e-${theme}-${width}.png`, fullPage: true })
      assert.deepEqual(errors, [])
      checks.push({ theme, width, result: 'PASS', rows: 100, mountedRows: await grid.getByRole('row').count() })
    } finally { await context.close() }
  }
  // fps at 100 rows × 288 windows, 1512 light: three seconds idle, then three seconds of wheel scrolling over the strip.
  const context = await browser.newContext({ viewport: { width: 1512, height: 900 }, colorScheme: 'light', recordVideo: { dir: out, size: { width: 1512, height: 900 } } }), page = await context.newPage()
  try {
    await page.goto(`${url}/?id=behavior&globals=theme:agent-light`)
    await page.waitForFunction(() => document.querySelector('.tgc-behavior-canvas')?.hasAttribute('data-frame-ms'))
    const sample = () => page.evaluate(() => new Promise(done => { const frames = [], draws = [], tops = []; let last = performance.now(); const until = last + 3000; const canvas = document.querySelector('.tgc-behavior-canvas'), pane = document.querySelector('.tgc-behavior-scroll'); const step = now => { frames.push(now - last); last = now; draws.push(Number(canvas.dataset.frameMs)); tops.push(pane.scrollTop); if (now < until) requestAnimationFrame(step); else done({ frames: frames.slice(1), draws, scrollRange: [Math.min(...tops), Math.max(...tops)] }) }; requestAnimationFrame(step) }))
    const idle = await sample()
    const pane = page.locator('.tgc-behavior-scroll'), paneBox = await pane.boundingBox()
    await page.mouse.move(paneBox.x + paneBox.width / 2, paneBox.y + paneBox.height / 2)
    const scrolling = sample()
    let direction = 1
    for (let i = 0; i < 90; i++) { await page.mouse.wheel(0, 40 * direction); if (i % 22 === 21) direction = -direction; await page.waitForTimeout(25) }
    const scrolled = await scrolling
    const drawMs = draws => { const sorted = [...new Set(draws)].sort((a, b) => a - b); return sorted[Math.floor(sorted.length * 0.95)] }
    checks.push({ measure: 'fps', rows: 100, windows: 288, idle: { ...stats(idle.frames), drawP95Ms: drawMs(idle.draws) }, scrolling: { ...stats(scrolled.frames), drawP95Ms: drawMs(scrolled.draws), scrollRange: scrolled.scrollRange, redraws: new Set(scrolled.draws).size } })
    assert.ok(scrolled.scrollRange[1] - scrolled.scrollRange[0] >= 640, 'the wheel scrolled the strip at least one pane height')
  } finally { await context.close() }
  await writeFile(`${out}/checks.json`, JSON.stringify(checks, null, 2) + '\n')
} finally { await browser.close(); child.kill('SIGTERM') }
console.log(JSON.stringify({ result: 'PASS', out, checks }))
