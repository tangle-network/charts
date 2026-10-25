/** Packed-package HTTP/browser integration; no intercepted requests or mocked components. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, createWriteStream, writeFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const output = resolve(process.env.CHARTS_PROOF_DIR ?? '/tmp/charts-flow-waterfall-proof')
mkdirSync(output, { recursive: true })
// Verify the exact built public boundary consumed by hosts without Tailwind.
if (process.argv.includes('--package-only')) {
  const { FlowWaterfall } = await import('@tangle-network/charts/react')
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const trace = JSON.parse(readFileSync('docs/fixtures/discovery-waterfall.json', 'utf8'))
  const html = renderToStaticMarkup(createElement(FlowWaterfall, { trace }))
  // Rows are virtualized: the tree reports all 53 rows and renders the first screenful.
  assert.ok(html.includes('aria-rowcount="53"'))
  assert.ok((html.match(/data-span-id=/g) ?? []).length > 10)
  // The exact token total rides in the summary's title; the slowest badge is checked in the browser, where its row scrolls in.
  assert.ok(html.includes('754,448 tokens'))
  const stylesheet = readFileSync(fileURLToPath(import.meta.resolve('@tangle-network/charts/react/flow-waterfall.css')), 'utf8')
  assert.equal(stylesheet, readFileSync('src/react/flow-waterfall.css', 'utf8'))
  console.log(JSON.stringify({ publicExport: 'PASS', standaloneStylesheet: 'PASS', standardStylesheet: 'PASS', rowCount: 53 }))
  process.exit(0)
}
const base = process.env.CHARTS_FIXTURE_URL ?? 'http://127.0.0.1:46489'
const checks = {}
let server, browser, context
const log = createWriteStream(`${output}/consumer.log`)
try {
  if (!process.env.CHARTS_FIXTURE_URL) {
    server = spawn(process.execPath, ['scripts/charts-browser-smoke.mjs'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
    server.stdout.pipe(log); server.stderr.pipe(log)
  }
  const deadline = Date.now() + 120_000
  while (true) {
    try { if ((await fetch(`${base}/iframe.html`)).ok) break } catch {}
    if (Date.now() > deadline || server?.exitCode != null) throw new Error('Packed consumer did not become ready; see consumer.log')
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  browser = await chromium.launch({ headless: true, slowMo: process.argv.includes('--record') ? 180 : 0, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) })
  if (process.argv.includes('--record')) {
    const warmup = await browser.newPage()
    await warmup.goto(`${base}/iframe.html?id=chatcontrols-flowwaterfall--healthy&viewMode=story`)
    await warmup.locator('[data-flow-waterfall]').waitFor({ timeout: 60_000 })
    await warmup.close()
  }
  context = await browser.newContext({ viewport: { width: 1100, height: 900 }, hasTouch: true, recordVideo: { dir: output, size: { width: 1100, height: 900 } } })
  const page = await context.newPage()
  const failures = []
  const networkFailures = []
  page.on('requestfailed', request => networkFailures.push({ url: request.url(), error: request.failure()?.errorText }))
  page.on('response', response => { if (response.status() >= 400) networkFailures.push({ url: response.url(), status: response.status() }) })
  page.on('pageerror', error => failures.push(error.message))
  const story = async (name, theme = 'agent-dark') => {
    await page.goto(`${base}/iframe.html?id=chatcontrols-flowwaterfall--${name}&viewMode=story&globals=agentTheme:${theme}`)
    try { await page.locator('[data-flow-waterfall]').waitFor({ timeout: 60_000 }) }
    catch (error) {
      writeFileSync(`${output}/preview-failure.json`, JSON.stringify({ story: name, pageErrors: failures, networkFailures, body: await page.locator('body').innerText() }, null, 2))
      await page.screenshot({ path: `${output}/preview-failure.png`, fullPage: true })
      throw error
    }
  }
  // Retained brand packed-fixture interactions: pointer, keyboard, touch and top-layer clipping.
  for (const [name, width, theme] of [['desktop-light',1100,'light'],['desktop-dark',1100,'dark'],['phone-light',390,'light']]) {
    await page.setViewportSize({ width, height:760 })
    await page.emulateMedia({ reducedMotion:'reduce' })
    await page.goto(base)
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
    const second = page.getByRole('button').nth(1)
    const bounds = await second.boundingBox()
    const point = { x:bounds.x+bounds.width/2, y:bounds.y+bounds.height/2 }
    await page.mouse.move(point.x,point.y)
    const tooltip = page.locator('[data-chart-tooltip]')
    await tooltip.waitFor({ state:'visible' })
    assert.equal(await tooltip.evaluate(el => el.matches(':popover-open')), true)
    assert.match(await tooltip.innerText(), /Inference: \$16.80/)
    const tip = await tooltip.boundingBox()
    assert.ok(Math.abs(tip.x-point.x-14)<2 && Math.abs(tip.y-point.y-14)<2)
    assert.ok(tip.x>=0 && tip.x+tip.width<=width && tip.y+tip.height<=760)
    assert.equal(await page.locator('[data-selection]').count(),1)
    assert.ok((await page.locator('[data-selection]').boundingBox()).height<100)
    await page.screenshot({ path:`${output}/stacked-${name}.png`,fullPage:true })
    await second.focus()
    await page.keyboard.press('Enter')
    assert.match(await page.getByRole('status').innerText(), /^Sep 7/)
    assert.equal(await tooltip.count(),0)
    await page.keyboard.press('Escape')
    assert.match(await page.getByRole('status').innerText(), /Hover, tap/)
    if (width===390) {
      await second.tap()
      assert.match(await page.getByRole('status').innerText(), /^Sep 7/)
      assert.equal(await tooltip.count(),0)
    }
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
    await page.getByText('View data',{exact:true}).click()
    assert.equal(await page.getByRole('table').count(),1)
  }
  checks.retainedStackedInteractions = 'PASS'
  await page.setViewportSize({ width:1100,height:900 })
  await story('healthy')
  assert.match(await page.locator('[data-slowest]').innerText(), /sandbox_run_command/)
  // An agent's outcome colors its lane and joins the legend with a count.
  assert.equal((await page.locator('.fw-legend').innerText()).replace(/\s+/g, ' ').trim(), 'Shipped 1')
  assert.equal(await page.locator('[data-span-kind="pipeline"][data-outcome="ok"]').count(), 1)
  checks.outcomes = 'PASS'
  // Three markers: two collide mid-trace, so one label shows and both lines stay; the last flips left at the edge.
  assert.equal(await page.locator('.fw-marker').count(), 3)
  assert.equal(await page.locator('.fw-marker-label').count(), 2)
  assert.equal(await page.locator('.fw-marker-label-left').innerText(), 'Release v4')
  const marker = await page.locator('.fw-marker').first().evaluate(el => {
    const lane = el.parentElement.getBoundingClientRect(), box = el.getBoundingClientRect(), label = el.querySelector('.fw-marker-label').getBoundingClientRect()
    return { at: (box.left - lane.left) / lane.width, height: box.height, label: label.width, color: getComputedStyle(el).borderLeftColor }
  })
  assert.ok(marker.at > 0.3 && marker.at < 0.7, `marker at ${marker.at}`)
  assert.ok(marker.height > 100 && marker.label > 40)
  assert.equal(await page.locator('.fw-marker-label').first().innerText(), 'Release v2')
  checks.markers = 'PASS'
  // Pinning a bar hands its span to onSelect.
  await page.locator('.fw-bar').first().click()
  assert.equal((await page.evaluate(() => window.__fwSelected ?? [])).length, 1)
  await page.keyboard.press('Escape')
  checks.onSelect = 'PASS'
  // The event track: one dot per marker; a click moves the cursor there and reports the time; N steps to the next.
  assert.equal(await page.locator('.fw-event').count(), 3)
  await page.locator('.fw-event').first().click()
  const jumped = await page.evaluate(() => window.__fwTime)
  assert.ok(typeof jumped === 'number' && jumped > 0, `onTimeChange got ${jumped}`)
  await page.locator('[data-flow-waterfall] [role="treegrid"]').focus()
  await page.keyboard.press('n')
  await page.waitForFunction(previous => window.__fwTime > previous, jumped, { timeout: 5000 })
  checks.eventTrack = 'PASS'
  await page.screenshot({ path: `${output}/healthy-desktop-dark.png`, fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: `${output}/healthy-phone-dark.png`, fullPage: true })
  await page.setViewportSize({ width: 1100, height: 900 })
  await story('recorded-discovery')
  const root = page.locator('[data-flow-waterfall]')
  assert.equal(await root.locator('[data-span-id]').count(), 53)
  await page.screenshot({ path: `${output}/recorded-desktop-dark.png`, fullPage: true })
  await page.keyboard.press('Control+f')
  // Focus moves on the next animation frame, which a loaded host can delay; wait for it rather than sample once.
  await page.waitForFunction(() => document.activeElement?.matches('input[type="search"]'), null, { timeout: 5000 })
  await page.getByRole('searchbox', { name: 'Search trace' }).fill('no-such-trace-step')
  await page.getByRole('status').filter({ hasText: 'No matching steps' }).waitFor({ timeout: 3000 })
  checks.search = 'PASS'
  checks.searchEmpty = 'PASS'
  if (process.argv.includes('--search-only')) { console.log('Search integration PASS'); process.exitCode = 0 }
  else {
    await page.screenshot({ path: `${output}/search-empty.png`, fullPage: true })
    await page.getByRole('searchbox', { name: 'Search trace' }).press('Escape')
    await page.getByRole('button', { name: 'Collapse all', exact: true }).click()
    assert.equal(await root.locator('[data-span-id]').count(), 1)
    await page.screenshot({ path: `${output}/nested-collapsed.png`, fullPage: true })
    // Search reveals a match inside a collapsed nested worker, with its ancestry.
    await page.getByRole('searchbox', { name: 'Search trace' }).fill('Echo worker')
    assert.equal(await root.locator('[data-span-id]').count(), 2)
    await page.getByRole('searchbox', { name: 'Search trace' }).press('Escape')
    assert.equal(await root.locator('[data-span-id]').count(), 1)
    await page.getByRole('button', { name: 'Expand all', exact: true }).click()
    assert.equal(await root.locator('[data-span-id]').count(), 53)
    checks.nesting = 'PASS'
    checks.collapseExpand = 'PASS'
    const terms = await root.locator('dt').allTextContents()
    assert.deepEqual(terms, ['Duration', 'Cost', 'Tokens', 'LLM calls', 'Tool calls', 'Errors'])
    assert.deepEqual(await root.locator('dd').allTextContents(), ['7m 11s', '—', '754.4k', '—', '35', '3'])
    assert.equal(await root.locator('dd').nth(2).getAttribute('title'), '754,448 tokens')
    checks.summary = 'PASS'
    // Each kind is painted distinctly: a fill colour, or a pattern (hatched waiting) in background-image.
    const kinds = await root.locator('.fw-bar').evaluateAll(elements => Object.fromEntries(elements.map(element => {
      const style = getComputedStyle(element)
      const paint = style.backgroundImage !== 'none' ? style.backgroundImage : style.backgroundColor
      return [element.closest('[data-span-kind]').dataset.spanKind, paint]
    })))
    assert.equal(Object.keys(kinds).length, 6)
    assert.equal(new Set(Object.values(kinds)).size, 6)
    assert.ok(!Object.values(kinds).includes('rgba(0, 0, 0, 0)'))
    checks.colors = 'PASS'
    assert.equal(await root.locator('[data-slowest]').count(), 1)
    assert.match(await root.locator('[data-slowest]').innerText(), /bash/)
    checks.slowest = 'PASS'
    assert.deepEqual(await page.getByLabel('Playback speed').locator('option').allTextContents(), ['0.5x', '1x', '1.5x', '2x', '4x'])
    await page.getByRole('button', { name: 'Restart', exact: true }).click()
    await page.getByLabel('Playback speed').selectOption('4')
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await page.waitForFunction(() => Number(document.querySelector('input[type=range]').value) > 600)
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    const paused = await page.getByLabel('Playback position').inputValue()
    await page.waitForTimeout(180)
    assert.equal(await page.getByLabel('Playback position').inputValue(), paused)
    // A real range keyboard interaction must pause and clip the rendered bar.
    const slider = page.getByLabel('Playback position')
    await slider.focus()
    await page.keyboard.press('Home')
    assert.equal(Number(await slider.inputValue()),0)
    assert.equal(await root.locator('.fw-bar').first().evaluate(el=>el.getBoundingClientRect().width),0)
    await page.keyboard.press('ArrowRight')
    const scrubbed = Number(await slider.inputValue())
    assert.ok(scrubbed>0)
    assert.equal(await page.getByRole('button',{name:'Play',exact:true}).count(),1)
    const barAndTrack = await root.locator('[data-waterfall-track]').first().evaluate(el=>({bar:el.querySelector('.fw-bar').getBoundingClientRect().width,track:el.getBoundingClientRect().width}))
    assert.ok(barAndTrack.bar>0 && barAndTrack.bar<barAndTrack.track)
    await page.waitForTimeout(180)
    assert.equal(Number(await slider.inputValue()),scrubbed)
    await page.getByRole('button', { name: 'Show full trace', exact: true }).click()
    checks.playback = 'PASS'
    await story('recorded-discovery', 'agent-light')
    await page.screenshot({ path: `${output}/recorded-desktop-light.png`, fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: `${output}/recorded-phone-light.png`, fullPage: true })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Only the timeline may scroll horizontally')
    await page.getByRole('treegrid', { name: 'Trace timeline', exact: true }).locator('[role=row][tabindex="0"]').focus()
    await page.keyboard.press('ArrowRight')
    await story('recorded-discovery')
    await page.screenshot({ path: `${output}/recorded-phone-dark.png`, fullPage: true })
    await page.setViewportSize({ width: 1100, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await story('growing-live-trace')
    const duration = await page.locator('dd').first().innerText()
    await page.waitForFunction(previous => document.querySelector('dd').textContent !== previous, duration)
    await page.screenshot({ path: `${output}/live-growing.png`, fullPage: true })
    const rowDuration = await page.locator('[data-span-id="tool"] .fw-duration').innerText()
    await page.waitForFunction(previous => document.querySelector('[data-span-id="tool"] .fw-duration').textContent !== previous, rowDuration)
    // Sample the real browser clock and the rendered range input while live ticks continue.
    const livePlaybackRates = []
    for (const selected of [0.5, 1, 1.5, 2, 4]) {
      await page.getByRole('button', { name: 'Restart', exact: true }).click()
      await page.getByLabel('Playback speed').selectOption(String(selected))
      await page.getByRole('button', { name: 'Play', exact: true }).click()
      const sample = await page.evaluate(async () => {
        const position = () => document.querySelector('input[aria-label="Playback position"]')
        const read = () => ({ at: performance.now(), position: Number(position().value), limit: Number(position().max) })
        const start = read()
        await new Promise(resolve => setTimeout(resolve, 2000))
        return { start, end: read() }
      })
      await page.getByRole('button', { name: 'Pause', exact: true }).click()
      const wallMs = sample.end.at - sample.start.at
      const advanceMs = sample.end.position - sample.start.position
      livePlaybackRates.push({ selected, observed: advanceMs / wallMs, wallMs, advanceMs, limitGrowthMs: sample.end.limit - sample.start.limit })
    }
    writeFileSync(`${output}/live-playback-rates.json`, JSON.stringify(livePlaybackRates, null, 2))
    console.log(JSON.stringify({ livePlaybackRates }))
    for (const sample of livePlaybackRates) {
      assert.ok(sample.limitGrowthMs > 1500, 'The sampled trace must keep growing during playback')
      assert.ok(Math.abs(sample.observed - sample.selected) <= sample.selected * 0.15,
        `${sample.selected}x live playback measured ${sample.observed.toFixed(3)}x; allowed ±15%`)
    }
    await page.getByRole('button',{name:'Follow live',exact:true}).click()
    assert.equal(await page.getByRole('button',{name:'Follow live',exact:true}).count(),0)
    const following = await page.getByLabel('Playback position').evaluate(el=>({value:Number(el.value),max:Number(el.max)}))
    assert.equal(following.value,following.max)
    await page.waitForFunction(previous=>Number(document.querySelector('input[type=range]').max)>previous,following.max)
    assert.equal(await page.getByLabel('Playback position').evaluate(el=>Number(el.value)===Number(el.max)),true)
    await story('discovery-streaming-replay')
    await page.waitForFunction(() => document.querySelectorAll('[data-span-id]').length > 5)
    const count = await page.locator('[data-span-id]').count()
    await page.waitForFunction(previous => document.querySelectorAll('[data-span-id]').length > previous, count)
    checks.streaming = 'PASS'
    await story('empty-flow-trace')
    await page.getByRole('status').filter({ hasText: 'No spans yet' }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Play', exact: true }).isDisabled(), true)
    await story('invalid-times')
    assert.equal(await page.locator('[data-span-id="invalid"] [data-waterfall-track]').innerText(), '—')
    assert.equal(await page.locator('[data-span-id="metadata"]').getAttribute('data-span-kind'), 'tool')
    assert.equal(await page.locator('.fw-title').innerText(), 'Trace waterfall')
    checks.unorderedAndExplicitStatus = 'PASS'
    await story('duplicate-identities')
    const ids = await page.locator('[data-span-id]').evaluateAll(elements=>elements.map(el=>el.dataset.spanId))
    assert.equal(ids.length,3)
    assert.equal(new Set(ids).size,3)
    checks.uniqueCapturedIdentities = 'PASS'
    assert.deepEqual(failures, [])
  }
  writeFileSync(`${output}/checks.json`, JSON.stringify({ checks, passed: Object.keys(checks).length, target: 12 }, null, 2))
  console.log(JSON.stringify({ checks, passed: Object.keys(checks).length, target: 12, output }))
} finally {
  await context?.close()
  await browser?.close()
  if (server?.pid) { try { process.kill(-server.pid, 'SIGTERM') } catch {} }
  log.end()
}
