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
  assert.equal((await page.getByRole('list', { name: 'Outcomes', exact: true }).innerText()).replace(/\s+/g, ' ').trim(), 'Shipped 1')
  // Agent fill (the default) keeps each agent's hue on its bar and puts the outcome on its dot.
  assert.equal(await page.locator('[data-span-kind="pipeline"] .fw-agent-dot[data-outcome="ok"]').count(), 1)
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
  // A pause is a band behind the rows and a strip on the axis that says its length and reason; a restart is a notch on its bar.
  assert.equal(await page.locator('.fw-gridlayer .fw-pause').count(), 1)
  assert.match(await page.locator('.fw-axis-track .fw-pause-mark').getAttribute('title'), /^Paused: host guard \d+(\.\d)? (s|min|h)$/)
  assert.ok((await page.locator('.fw-pause').evaluate(el => el.getBoundingClientRect().width)) > 8)
  // No pause text sits on the axis, so every hour tick stays readable.
  assert.equal(await page.locator('.fw-axis-track .fw-pause-label').count(), 0)
  assert.equal(await page.locator('.fw-mark[data-mark="restart"]').count(), 1)
  checks.pauseAndRestart = 'PASS'
  // Pinning a bar hands its span to onSelect.
  await page.locator('.fw-bar').first().click()
  assert.equal((await page.evaluate(() => window.__fwSelected ?? [])).length, 1)
  // A second click on the pinned bar closes its card: a re-click is never a no-op.
  await page.locator('.fw-bar').first().click()
  assert.equal(await page.locator('.fw-card').count(), 0)
  // In the agent view a click on an agent's name selects it too, not only its bar.
  await page.getByRole('radio', { name: 'Agents' }).click()
  // The shown view is a state, not a dead control.
  assert.equal(await page.getByRole('radio', { name: 'Agents' }).isDisabled(), true)
  // ...and still reads as the selected option, not as a greyed-out control.
  assert.equal(await page.getByRole('radio', { name: 'Agents' }).evaluate(el => getComputedStyle(el).opacity), '1')
  await page.locator('.fw-view-agents .fw-row:not(.fw-sticky-row) .fw-name-text').first().click()
  assert.equal((await page.evaluate(() => window.__fwSelected ?? [])).length, 2)
  // Agent bars state their duration at the bar end, as step bars do.
  assert.match(await page.locator('.fw-view-agents .fw-row:not(.fw-sticky-row) .fw-duration').first().innerText(), /\d/)
  // The agent timeline keeps play, speed and the axis above its 40 px lanes.
  const order = await page.evaluate(() => {
    const top = selector => document.querySelector(selector).getBoundingClientRect().top
    return { playback: top('.fw-playback'), axis: top('.fw-axis'), row: top('.fw-view-agents .fw-row'), rowHeight: document.querySelector('.fw-view-agents .fw-row').getBoundingClientRect().height }
  })
  assert.ok(order.playback < order.axis && order.axis < order.row && order.rowHeight === 40, JSON.stringify(order))
  // Every bar, segment and end label sits on the 4 px grid inside its row (disco-ui-review REVIEW-7 #7).
  await page.waitForFunction(() => !document.querySelector('.fw-row.fw-enter'), null, { timeout: 3000 })
  const offGrid = await page.evaluate(() => [...document.querySelectorAll('.fw-row :is(.fw-bar, .fw-seg, .fw-end)')]
    .map(mark => mark.getBoundingClientRect().top - mark.closest('.fw-row').getBoundingClientRect().top)
    .filter(offset => Math.abs(offset - Math.round(offset / 4) * 4) > 0.5))
  assert.deepEqual(offGrid, [])
  // The card floats beside the row it describes, just above or below it without covering it, never docked away from the pointer
  // (Drew 10-26: "the chart hover doesn't exist either it just shows on bottom left").
  const beside = await page.evaluate(() => {
    const card = document.querySelector('.fw-card')?.getBoundingClientRect()
    const row = document.querySelector('.fw-view-agents .fw-row[aria-selected="true"]')?.getBoundingClientRect()
    if (!card || !row) return null
    const gap = card.top >= row.bottom - 2 ? card.top - row.bottom : row.top - card.bottom
    return { gap: Math.round(gap), clear: card.top >= row.bottom - 2 || card.bottom <= row.top + 2 }
  })
  assert.ok(beside && beside.clear && beside.gap < 48, `card not beside its row: ${JSON.stringify(beside)}`)
  // A pinned card highlights its row without dimming the run (peers dim only for a host selectedId); Escape clears it.
  assert.equal(await page.locator('.fw-view-agents .fw-row[aria-selected="true"]').count(), 1)
  assert.equal(await page.locator('[data-flow-waterfall][data-selection]').count(), 0)
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('.fw-view-agents .fw-row[aria-selected="true"]').count(), 0)
  await page.getByRole('radio', { name: 'Steps' }).click()
  checks.onSelect = 'PASS'
  // The event track: one dot per marker; a click moves the cursor there and reports the time; N steps to the next.
  assert.equal(await page.locator('.fw-event').count(), 3)
  // v2 and v3 are 50 ms apart, so at full-trace zoom v3's dot lies on v2's; click the visible one, and N reaches v4.
  await page.getByRole('button', { name: 'Jump to Release v3' }).click()
  const jumped = await page.evaluate(() => window.__fwTime)
  // The jump says where it went: the event's label stays up on the axis and its dot reads pressed.
  assert.equal((await page.locator('.fw-event-label').innerText()).trim(), 'Release v3')
  assert.equal(await page.getByRole('button', { name: 'Jump to Release v3' }).getAttribute('aria-pressed'), 'true')
  assert.ok(typeof jumped === 'number' && jumped > 0, `onTimeChange got ${jumped}`)
  await page.locator('[data-flow-waterfall] [role="treegrid"]').focus()
  await page.keyboard.press('n')
  await page.waitForFunction(previous => window.__fwTime > previous, jumped, { timeout: 5000 })
  checks.eventTrack = 'PASS'
  await page.screenshot({ path: `${output}/healthy-desktop-dark.png`, fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: `${output}/healthy-phone-dark.png`, fullPage: true })
  await page.setViewportSize({ width: 1100, height: 900 })
  // A host's brand mark (renderIcon) sits on the agent row's second line, inside the row, never spilling into the next.
  await story('host-marks')
  await page.locator('[data-host-mark]').first().waitFor({ timeout: 10_000 })
  const hostMarks = await page.evaluate(() => [...document.querySelectorAll('.fw-view-agents .fw-row')].flatMap(row => {
    const box = row.getBoundingClientRect(), mark = row.querySelector('[data-host-mark]')?.getBoundingClientRect()
    return mark ? [{ top: mark.top - box.top, bottom: box.bottom - mark.bottom }] : []
  }))
  assert.ok(hostMarks.length > 0 && hostMarks.every(m => m.top >= 0 && m.bottom >= 0), `host marks overflow their rows: ${JSON.stringify(hostMarks)}`)
  await page.screenshot({ path: `${output}/host-marks.png` })
  // An agent row says it failed in its subtitle; no extra alert glyph, and no event label over the rows.
  assert.equal(await page.locator('.fw-view-agents .fw-alert').count(), 0)
  assert.equal(await page.locator('.fw-view-agents ~ * .fw-marker-label, .fw-marker-label').count(), 0)
  // The agents view's playhead block applies: its thin 4 px track (the knob rules sit beside it; a thumb's style is not readable).
  const track = await page.locator('.fw-slider').evaluate(el => getComputedStyle(el).backgroundSize)
  assert.match(track, /4px/, `playhead track ${track}`)
  // Names keep proportional hyphens: tabular figures are for numeric cells only.
  assert.ok(!(await page.locator('.fw-name-text').first().evaluate(el => getComputedStyle(el).fontFeatureSettings)).includes('tnum'))
  // Every top-level agent row keeps the chevron gutter, so names start at one x whether or not the row opens.
  const nameXs = await page.evaluate(() => [...new Set([...document.querySelectorAll('.fw-view-agents .fw-row:not(.fw-step) .fw-label')]
    .filter(label => getComputedStyle(label).getPropertyValue('--depth').trim() === '0').map(label => Math.round(label.querySelector('.fw-names').getBoundingClientRect().left)))])
  assert.equal(nameXs.length, 1, `agent names start at ${JSON.stringify(nameXs)}`)
  // One header band: the bar-type key shares the legend row in the header; model and tool segments differ in color.
  assert.equal(await page.locator('.fw-heading .fw-kinds').count(), 1)
  const kinds = await page.evaluate(() => ['.fw-seg-model', '.fw-seg-tool'].map(sel => document.querySelector(`.fw-view-agents ${sel}`)).filter(Boolean).map(el => getComputedStyle(el).backgroundColor))
  assert.ok(kinds.length < 2 || kinds[0] !== kinds[1], `model and tool segments share a color: ${kinds}`)
  // In-bar step labels show each part whole or not at all (round 28: "b…" and labels painting past bar ends), and hold 4.5:1 ink.
  const labels = await page.evaluate(() => {
    const canvas = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
    const rgb = css => { canvas.clearRect(0, 0, 1, 1); canvas.fillStyle = css; canvas.fillRect(0, 0, 1, 1); return [...canvas.getImageData(0, 0, 1, 1).data.slice(0, 3)] }
    const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }
    const out = { cut: [], ellipsis: 0, low: [], shown: 0 }
    for (const label of document.querySelectorAll('.fw-view-agents .fw-seg-label')) {
      if (getComputedStyle(label).display === 'none') continue
      const box = label.getBoundingClientRect(), seg = label.closest('.fw-seg')
      const visible = [...label.children].filter(part => part.getBoundingClientRect().top < box.top + 8)
      for (const part of visible) {
        const r = part.getBoundingClientRect()
        if (r.right > box.right + 0.5 || r.right > seg.getBoundingClientRect().right) out.cut.push(`${seg.innerText.slice(0, 30)} ${Math.round(r.right - box.right)}px`)
        if (getComputedStyle(part).textOverflow === 'ellipsis') out.ellipsis++
      }
      if (visible.some(part => part.textContent)) {
        out.shown++
        const contrast = ratio(rgb(getComputedStyle(label).color), rgb(getComputedStyle(seg).backgroundColor))
        if (contrast < 4.5) out.low.push(`${label.innerText.slice(0, 20)} ${contrast.toFixed(2)}`)
      }
    }
    return out
  })
  assert.ok(labels.shown > 0, 'no in-bar step label shows')
  assert.deepEqual(labels.cut, [], `step label parts cut or past their step: ${JSON.stringify(labels.cut.slice(0, 5))}`)
  assert.equal(labels.ellipsis, 0, 'a step label part ellipsizes')
  assert.deepEqual(labels.low, [], `step label ink under 4.5:1: ${JSON.stringify(labels.low.slice(0, 5))}`)
  // Kind reads by lightness for every hue: model and tool steps of one agent differ by >= 0.18 OKLab L, and model is the step
  // further from the surface (critique P0 #4).
  const kindSteps = await page.evaluate(() => {
    const canvas = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
    const L = css => {
      canvas.clearRect(0, 0, 1, 1); canvas.fillStyle = css; canvas.fillRect(0, 0, 1, 1)
      const [r, g, b] = [...canvas.getImageData(0, 0, 1, 1).data.slice(0, 3)].map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 })
      const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
      return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
    }
    const root = document.querySelector('.fw-root.fw-fill-agent')
    if (!root) return []
    const surface = L(getComputedStyle(root).getPropertyValue('--fw-surface') || getComputedStyle(root).backgroundColor)
    const byTone = new Map()
    for (const seg of root.querySelectorAll('.fw-view-agents :is(.fw-seg-model, .fw-seg-tool)')) {
      const tone = seg.dataset.tone, kind = seg.classList.contains('fw-seg-model') ? 'model' : 'tool'
      byTone.set(tone, { ...byTone.get(tone), [kind]: L(getComputedStyle(seg).backgroundColor) })
    }
    return [...byTone].filter(([, k]) => k.model !== undefined && k.tool !== undefined)
      .map(([tone, k]) => ({ tone, dL: Math.abs(k.model - k.tool), modelStronger: Math.abs(k.model - surface) > Math.abs(k.tool - surface) }))
  })
  assert.ok(kindSteps.length > 0 && kindSteps.every(k => k.dL >= 0.18 && k.modelStronger), `kind lightness step: ${JSON.stringify(kindSteps)}`)
  // Every filled agent dot is an outcome the legend shows (critique gate A2): the set of drawn dot colours is within the legend's.
  const dots = await page.evaluate(() => {
    const fill = el => getComputedStyle(el).backgroundColor
    const legend = new Set([...document.querySelectorAll('.fw-legend .fw-swatch')].map(fill))
    const drawn = [...document.querySelectorAll('.fw-view-agents .fw-agent-dot')].map(fill).filter(c => c !== 'rgba(0, 0, 0, 0)')
    return { legend: [...legend], stray: [...new Set(drawn.filter(c => !legend.has(c)))] }
  })
  assert.deepEqual(dots.stray, [], `agent dots in colours the legend lacks: ${JSON.stringify(dots)}`)
  checks.hostMarks = 'PASS'
  // Every end label (duration, cost, Slowest/Costliest) stays inside its lane, on the surface, at 1100 px and on a phone.
  for (const width of [1100, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.waitForTimeout(200)
    const ends = await page.evaluate(() => [...document.querySelectorAll('.fw-view-agents .fw-end')].map(end => {
      const lane = end.closest('.fw-lane').getBoundingClientRect(), box = end.getBoundingClientRect()
      return { over: Math.round(box.right - lane.right), opaque: getComputedStyle(end).backgroundColor !== 'rgba(0, 0, 0, 0)', text: end.innerText }
    }))
    assert.ok(ends.length > 0 && ends.every(end => end.over <= 0 && end.opaque), `end labels cut or see-through at ${width}: ${JSON.stringify(ends.filter(end => end.over > 0 || !end.opaque))}`)
  }
  await page.setViewportSize({ width: 1100, height: 900 })
  checks.endLabelsFit = 'PASS'
  // The card tables what the agent recorded, each value with its unit, and opens at the pointer beside the row.
  for (const theme of ['agent-light', 'agent-dark']) {
    await story('agent-metrics', theme)
    await page.waitForFunction(() => !document.querySelector('.fw-row.fw-enter'), null, { timeout: 3000 })
    const segment = await page.locator('[data-span-id="builder"] .fw-seg').nth(4).boundingBox()
    const pointer = { x: segment.x + segment.width / 2, y: segment.y + segment.height / 2 }
    await page.mouse.move(pointer.x, pointer.y)
    await page.locator('.fw-card-table').waitFor()
    const table = await page.locator('.fw-card-table > div').evaluateAll(rows => Object.fromEntries(rows.map(row => [row.querySelector('dt').textContent, row.querySelector('dd').textContent])))
    assert.deepEqual(Object.keys(table), ['Model', 'Ran for', 'Tokens', 'Model latency', 'Cost', 'Model calls', 'Tool calls', 'Failures', 'Retries'], JSON.stringify(table))
    assert.match(table.Tokens, /^[\d.]+K in[\d.]+K out[\d.]+K cached$/)
    assert.match(table['Model latency'], /^[\d.]+s median[\d.]+s p95$/)
    assert.match(table.Cost, /^\$\d+\.\d\d$/)
    assert.equal(table['Tool calls'], '13bash5edit4read4')
    assert.equal(table.Failures, '1 failed step')
    assert.equal(table.Retries, '1 step retried · 1 restart')
    const placed = await page.evaluate(() => {
      const card = document.querySelector('.fw-card').getBoundingClientRect(), row = document.querySelector('[data-span-id="builder"]').getBoundingClientRect()
      return { left: card.left, top: card.top, bottom: card.bottom, clear: card.top >= row.bottom - 2 || card.bottom <= row.top + 2, inView: card.top >= 0 && card.bottom <= innerHeight }
    })
    assert.ok(Math.abs(placed.left - (pointer.x - 24)) < 2 && placed.clear && placed.inView, `card not at the pointer beside its row: ${JSON.stringify({ pointer, placed })}`)
    // The host's selection recedes its peers' marks, never their names: they keep the muted ink at full opacity.
    const peer = await page.locator('[data-span-id="planner"]').evaluate(row => ({ name: getComputedStyle(row.querySelector('.fw-label')).opacity, bar: Number(getComputedStyle(row.querySelector('.fw-bar')).opacity) }))
    assert.ok(peer.name === '1' && peer.bar < 0.5, `peer row ${JSON.stringify(peer)}`)
    await page.screenshot({ path: `${output}/agent-metrics-card-${theme}.png` })
    await page.mouse.move(1, 1)
  }
  checks.metricsCard = 'PASS'
  // On a phone each agent is a name strip over its bar: name, duration and bars never overlap, and nothing leaves the page.
  await page.setViewportSize({ width: 390, height: 844 })
  for (const theme of ['agent-light', 'agent-dark']) {
    await story('agent-metrics', theme)
    await page.waitForFunction(() => !document.querySelector('.fw-row.fw-enter'), null, { timeout: 3000 })
    const clashes = await page.evaluate(() => [...document.querySelectorAll('.fw-view-agents .fw-row:not(.fw-sticky-row)')].flatMap(row => {
      const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5
      const name = row.querySelector('.fw-names').getBoundingClientRect(), end = row.querySelector('.fw-end').getBoundingClientRect()
      const marks = [...row.querySelectorAll('.fw-bar, .fw-seg')].map(mark => mark.getBoundingClientRect()).filter(box => box.width > 0)
      return [...(hit(name, end) ? ['name x end'] : []), ...(marks.some(mark => hit(mark, name)) ? ['name x bar'] : []), ...(marks.some(mark => hit(mark, end)) ? ['end x bar'] : [])].map(clash => `${row.dataset.spanId}: ${clash}`)
    }))
    assert.deepEqual(clashes, [])
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.screenshot({ path: `${output}/agent-metrics-phone-${theme}.png`, fullPage: true })
  }
  await page.setViewportSize({ width: 1100, height: 900 })
  checks.phoneLanes = 'PASS'
  await page.emulateMedia({ reducedMotion: 'no-preference' })
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
    // Unfold: the rows that just appeared move, then rest; scrolling the virtualized tree never replays it.
    assert.ok(await root.locator('.fw-row.fw-enter').count() > 0)
    await page.waitForFunction(() => !document.querySelector('.fw-row.fw-enter'), null, { timeout: 3000 })
    await root.locator('.fw-scroller').evaluate(element => { element.scrollTop = element.scrollHeight })
    await page.waitForTimeout(100)
    assert.equal(await root.locator('.fw-row.fw-enter').count(), 0)
    await root.locator('.fw-scroller').evaluate(element => { element.scrollTop = 0 })
    checks.motion = 'PASS'
    checks.nesting = 'PASS'
    checks.collapseExpand = 'PASS'
    const summary = root.locator('.fw-summary'), terms = await summary.locator('dt').allTextContents()
    // Missing prices remain explicit and explain why no total can be reported.
    assert.deepEqual(terms, ['Duration', 'Cost', 'Tokens', 'Model calls', 'Tool calls', 'Errors'])
    assert.deepEqual(await summary.locator('dd').allTextContents(), ['7m 11s', '—', '754.4k', '—', '35', '3'])
    assert.match(await summary.locator('dd').nth(1).getAttribute('title'), /^No cost source/); assert.equal(await summary.locator('dd').nth(2).getAttribute('title'), '754,448 tokens')
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
    const fit = await page.evaluate(() => ({ body: document.querySelector('.fw-scroller').clientHeight, rows: document.querySelector('.fw-canvas').offsetHeight }))
    assert.ok(fit.body <= fit.rows + 1, `A live body leaves ${fit.body - fit.rows} px empty below its rows`)
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
        // Start the sample once the range input has moved: it updates on the next animation frame, which a loaded host
        // delays, and sampling before it counted that delay as playback (a 0.5x run measured 0.87x).
        const initial = Number(position().value)
        const deadline = performance.now() + 3000
        while (Number(position().value) === initial && performance.now() < deadline) await new Promise(resolve => requestAnimationFrame(resolve))
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
    // Following live jumps the cursor to the end on the next frame, not synchronously with the click (a 00:13Z gate read it
    // first and saw 8,787 of 76,635), so wait for the position to reach the end.
    await page.waitForFunction(() => { const el = document.querySelector('input[type=range]'); return Number(el.value) === Number(el.max) }, null, { timeout: 5000 })
    const following = await page.getByLabel('Playback position').evaluate(el=>({value:Number(el.value),max:Number(el.max)}))
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
