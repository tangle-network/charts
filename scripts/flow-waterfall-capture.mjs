// Browser evidence for the trace inspector: reference-matched frames, hover cards, measured fps and first paint,
// and an uncut interaction recording. `node scripts/flow-waterfall-capture.mjs <out-dir> [run-21c.json]`
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, renameSync, readdirSync } from 'node:fs'

const out = process.argv[2] ?? '/tmp/flow-waterfall-capture'
const run21c = process.argv[3]
const port = 8000 + Math.floor(Math.random() * 900)
mkdirSync(out, { recursive: true })
const only = process.env.FW_ONLY
const server = spawn(process.execPath, ['scripts/flow-waterfall-demo.mjs', String(port), ...(run21c ? [run21c] : [])], { stdio: ['ignore', 'pipe', 'inherit'] })
await new Promise((resolve, reject) => { server.stdout.on('data', resolve); server.on('exit', reject) })
const base = `http://127.0.0.1:${port}/`
const report = { frames: [], perf: {}, words: {} }
const browser = await chromium.launch()
const errors = []
const open = async (query, viewport = { width: 1185, height: 1016 }, video) => {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, ...(video ? { recordVideo: { dir: out, size: viewport } } : {}) })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(`${query}: ${error.message}`))
  page.on('console', message => { if (message.type() === 'error') errors.push(`${query}: ${message.text()}`) })
  await page.goto(`${base}?${query}`)
  await page.locator('body[data-ready="1"]').waitFor({ state: 'attached', timeout: 30_000 })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(300)
  return { page, context }
}
const shot = async (page, name) => {
  const path = `${out}/${name}.png`
  await page.locator('[data-flow-waterfall]').screenshot({ path, animations: 'disabled' })
  report.frames.push(name)
  // Words on screen (Drew 2026-10-25: cut taglines, helper text and secondary labels); counted from rendered text.
  report.words[name] = (await page.locator('[data-flow-waterfall]').innerText()).split(/\s+/).filter(Boolean).length
}
const seek = async (page, fraction) => {
  const slider = page.getByLabel('Playback position')
  const max = Number(await slider.getAttribute('max'))
  await slider.fill(String(max * fraction))
  await page.waitForTimeout(150)
}

try {
  // Historical proof: every OTLP-JSONL span file in FW_DATA_DIR, through the one adapter, in both views.
  if (process.env.FW_DATA_DIR) {
    report.otlp = []
    for (const file of readdirSync(process.env.FW_DATA_DIR).filter(name => name.endsWith('.otlp.jsonl')).sort()) {
      const name = file.replace('.otlp.jsonl', '')
      for (const view of ['agents', 'spans']) {
        const { page, context } = await open(`fixture=otlp:${file}&view=${view}&theme=dark&width=1440&label=${encodeURIComponent(name)}&height=720`, { width: 1512, height: 945 })
        const facts = await page.evaluate(() => ({ convertMs: window.__fwConvertMs, firstPaintMs: window.__fwFirstPaintMs,
          rows: document.querySelector('[role="treegrid"]')?.getAttribute('aria-rowcount') }))
        await shot(page, `otlp-${name}-${view}`)
        report.otlp.push({ file, view, ...facts })
        await context.close()
      }
    }
  }
  // Live proof: 60 s of a running session through the relay, recorded, with every span's event-to-pixel time.
  if (process.env.FW_LIVE_RELAY) {
    const seconds = Number(process.env.FW_LIVE_SECONDS ?? 60)
    const context = await browser.newContext({ viewport: { width: 1512, height: 945 }, deviceScaleFactor: 1, recordVideo: { dir: out, size: { width: 1512, height: 945 } } })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(`live: ${error.message}`))
    await page.goto(`${base}?relay=${encodeURIComponent(process.env.FW_LIVE_RELAY)}&theme=dark&width=1440&height=720&label=${encodeURIComponent(process.env.FW_LIVE_LABEL ?? 'Live session')}`)
    await page.locator('[data-flow-waterfall]').waitFor({ timeout: 60_000 })
    await page.screenshot({ path: `${out}/live-start.png` })
    await page.waitForTimeout(seconds * 500)
    await page.getByRole('radio', { name: 'Agents' }).click()
    await page.waitForTimeout(seconds * 500)
    await page.screenshot({ path: `${out}/live-end.png` })
    const samples = await page.evaluate(() => window.__fwLatency)
    await context.close()
    const video = readdirSync(out).find(name => name.endsWith('.webm') && !name.startsWith('interaction') && !name.startsWith('live'))
    if (video) renameSync(`${out}/${video}`, `${out}/live-60s.webm`)
    const q = (values, p) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] }
    const pixel = samples.map(sample => sample.eventToPixelMs)
    report.live = { seconds, spans: samples.length,
      eventToPixelMs: { p50: q(pixel, 0.5), p95: q(pixel, 0.95), max: Math.max(...pixel) },
      eventToRelayMs: { p50: q(samples.map(x => x.eventToRelayMs), 0.5), p95: q(samples.map(x => x.eventToRelayMs), 0.95) },
      relayToPixelMs: { p50: q(samples.map(x => x.relayToPixelMs), 0.5), p95: q(samples.map(x => x.relayToPixelMs), 0.95) },
      samples }
    console.log(JSON.stringify({ live: { ...report.live, samples: undefined } }))
  }
  // Fit: the agent view sized only by its container, 320 to 2560 px, and across a live resize; no page scroll sideways.
  if (only === 'fit') {
    const measure = page => page.evaluate(() => {
      const root = document.querySelector('[data-flow-waterfall]').getBoundingClientRect()
      const track = document.querySelector('[data-fw-track]').getBoundingClientRect()
      const names = [...document.querySelectorAll('.fw-name-text')]
      const cut = names.filter(el => el.scrollWidth > el.clientWidth)
      return { pageOverflowPx: document.documentElement.scrollWidth - innerWidth, rootPx: Math.round(root.width), trackPx: Math.round(track.width),
        rootInside: root.left >= 0 && root.right <= innerWidth + 0.5, ticks: document.querySelectorAll('.fw-axis .fw-tick').length,
        // Every agent row paints a lane at least half the component wide, with bars inside it.
        narrowLanes: [...document.querySelectorAll('.fw-view-agents .fw-row:not(.fw-sticky-row) .fw-lane')].filter(el => el.getBoundingClientRect().width < root.width / 2).length,
        paintedBars: [...document.querySelectorAll('.fw-view-agents .fw-row:not(.fw-sticky-row) .fw-bar')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth }).length,
        stacked: getComputedStyle(document.querySelector('.fw-view-agents .fw-label')).position === 'absolute', labelColPx: Math.round(document.querySelector('.fw-view-agents .fw-row')?.firstElementChild?.getBoundingClientRect().width ?? 0),
        names: names.length, truncated: cut.length, truncatedWithTitle: cut.filter(el => el.closest('[title]')?.title.includes(el.textContent)).length }
    })
    report.fit = []
    // FW_FIT: comma-separated demo fixtures; long runs come from FW_DATA_DIR as otlp:<file>, names=long is the worst case.
    const fixtures = (process.env.FW_FIT ?? 'release,discovery').split(',')
    for (const fixture of fixtures) {
      const tag = fixture.replace(/^otlp:|\.otlp\.jsonl|&.*$/g, '') + (fixture.includes('names=long') ? '-long' : '')
      for (const width of [320, 390, 768, 1280, 1920, 2560]) {
        const { page, context } = await open(`fixture=${fixture}&view=agents&theme=dark&pad=0&height=2000`, { width, height: 1200 })
        report.fit.push({ fixture: tag, width, ...(await measure(page)) })
        await shot(page, `fit-${tag}-${width}`)
        await context.close()
      }
      // Every bar opens its card: hover each of the first ten agents' bars in order, as the review does.
      {
        const { page, context } = await open(`fixture=${fixture}&view=agents&theme=dark&pad=0&height=2000`, { width: 1512, height: 1200 })
        const rows = page.locator('.fw-view-agents .fw-row:not(.fw-sticky-row)')
        const n = Math.min(10, await rows.count())
        let opened = 0
        for (let i = 0; i < n; i++) {
          const bar = rows.nth(i).locator('.fw-bar')
          await bar.hover(); await page.waitForTimeout(250)
          const name = await rows.nth(i).locator('.fw-name-text').innerText()
          if ((await page.locator('.fw-card').count()) && (await page.locator('.fw-card').innerText()).includes(name.slice(0, 12))) opened += 1
        }
        const linkOpacity = await page.locator('.fw-view-agents .fw-link:not(.fw-link-hot)').first().evaluate(el => Number(getComputedStyle(el).opacity)).catch(() => null)
        report.fit.push({ fixture: tag, barsHovered: n, cardsOpened: opened, restingLinkOpacity: linkOpacity })
        await context.close()
      }
      // The hover card on a busy agent's first mark, at a desktop and a phone width.
      for (const width of [1280, 390]) {
        const { page, context } = await open(`fixture=${fixture}&view=agents&theme=dark&pad=0&height=2000`, { width, height: 1200 })
        const mark = page.locator('.fw-view-agents .fw-row:not(.fw-sticky-row) :is(.fw-seg, .fw-bar)').nth(3)
        await mark.hover(); await page.waitForTimeout(350)
        report.fit.push({ fixture: tag, card: width, shown: await page.locator('.fw-card').count(), words: (await page.locator('.fw-card').innerText().catch(() => '')).split(/\s+/).filter(Boolean).length })
        await page.screenshot({ path: `${out}/fit-${tag}-card-${width}.png` })
        await context.close()
      }
      // A resize recording: 1920 down to 390 and back, in steps, at the served layout.
      const { page, context } = await open(`fixture=${fixture}&view=agents&theme=dark&pad=0&height=2000`, { width: 1920, height: 1200 }, true)
      const before = await measure(page)
      const steps = [1600, 1280, 1024, 768, 640, 560, 480, 390, 480, 640, 1024, 1440, 1920]
      const during = []
      for (const width of steps) { await page.setViewportSize({ width, height: 1200 }); await page.waitForTimeout(450); during.push({ width, ...(await measure(page)) }) }
      await context.close()
      const video = readdirSync(out).find(name => name.endsWith('.webm') && !name.startsWith('fit-') && !name.startsWith('interaction') && !name.startsWith('live'))
      if (video) renameSync(`${out}/${video}`, `${out}/fit-${tag}-resize.webm`)
      report.fit.push({ fixture: tag, resize: steps.join('>'), trackBefore: before.trackPx, maxPageOverflowPx: Math.max(...during.map(d => d.pageOverflowPx)), tracks: during.map(d => d.trackPx) })
    }
    console.log(JSON.stringify(report.fit))
    throw Object.assign(new Error('only fit'), { skip: true })
  }
  if (only === 'otlp' || only === 'live') throw Object.assign(new Error('only otlp'), { skip: true })
  if (only !== 'perf') {
  // Reference 1 and 2: the span waterfall, both themes, at the reference viewport, through the run.
  for (const theme of ['light', 'dark']) {
    const { page, context } = await open(`fixture=release&theme=${theme}&width=1140`)
    for (const f of [0.25, 0.5, 0.75]) { await seek(page, f); await shot(page, `spans-${theme}-${Math.round(f * 100)}`) }
    await page.getByRole('button', { name: 'Show full trace' }).click()
    await shot(page, `spans-${theme}-done`)
    await page.locator('[data-span-id="d2"] .fw-bar').hover()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${out}/spans-${theme}-hover.png` })
    report.frames.push(`spans-${theme}-hover`)
    await page.mouse.move(5, 5)
    await page.getByRole('button', { name: 'Collapse Researcher' }).click()
    await page.getByRole('button', { name: 'Collapse Coder' }).click()
    await shot(page, `spans-${theme}-collapsed`)
    await context.close()
  }
  // Reference 6: the agent timeline, dark, through the run and with its hover card.
  {
    const { page, context } = await open('fixture=incident&theme=dark&view=agents&width=760&label=Payment failures on Oct 9', { width: 900, height: 720 })
    for (const f of [0.05, 0.25, 0.5, 0.75]) { await seek(page, f); await shot(page, `agents-dark-${Math.round(f * 100)}`) }
    await page.getByRole('button', { name: 'Show full trace' }).click()
    await shot(page, 'agents-dark-done')
    const segment = page.locator('[data-span-id="c"] .fw-seg').last()
    await segment.hover()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${out}/agents-dark-hover.png` })
    report.frames.push('agents-dark-hover')
    await context.close()
  }
  // Real data: run 21c in both views, and the recorded Discovery canary.
  for (const [name, query] of [['run21c-agents', 'fixture=run21c&view=agents&theme=dark&width=1440'], ['run21c-spans', 'fixture=run21c&theme=dark&width=1440&collapsed=1'], ['discovery-spans', 'fixture=discovery&theme=dark&width=1140']]) {
    if (name.startsWith('run21c') && !run21c) continue
    const { page, context } = await open(query, { width: 1512, height: 945 })
    await shot(page, name)
    await context.close()
  }
  // Phone width.
  {
    const { page, context } = await open('fixture=release&theme=dark&pad=8', { width: 390, height: 844 })
    await shot(page, 'spans-dark-phone')
    await context.close()
  }

  }
  // First paint at 500 spans, median of five.
  const paints = []
  for (let i = 0; i < 5; i++) {
    const { page, context } = await open('fixture=load&n=500&theme=dark&width=1140')
    paints.push(await page.evaluate(() => window.__fwFirstPaintMs))
    await context.close()
  }
  paints.sort((a, b) => a - b)
  report.perf.firstPaint500 = { medianMs: paints[2], samplesMs: paints }

  // Scroll fps at 5,000 spans: scroll the tree for three seconds and read every frame interval.
  const fps = async (query, drive) => {
    const { page, context } = await open(query)
    const result = await page.evaluate(async (driveName) => {
      const scroller = document.querySelector('.fw-scroller')
      const frames = []
      let last = performance.now()
      const until = last + 3000
      await new Promise(resolve => {
        const step = now => {
          frames.push(now - last); last = now
          if (driveName === 'scroll') scroller.scrollTop += 24
          if (now < until) requestAnimationFrame(step); else resolve()
        }
        requestAnimationFrame(step)
      })
      frames.shift()
      const sorted = [...frames].sort((a, b) => a - b)
      const mean = frames.reduce((a, b) => a + b, 0) / frames.length
      const worstWindow = Math.min(...frames.map((_, i) => { const w = frames.slice(i, i + 30); return w.length < 30 ? Infinity : 1000 / (w.reduce((a, b) => a + b, 0) / w.length) }))
      return { frames: frames.length, meanFps: 1000 / mean, p95FrameMs: sorted[Math.floor(sorted.length * 0.95)], worst30FrameFps: Number.isFinite(worstWindow) ? worstWindow : null, longFrames: frames.filter(f => f > 1000 / 55).length }
    }, drive.name)
    await context.close()
    return result
  }
  report.perf.scroll5000 = await fps('fixture=load&n=5000&theme=dark&width=1140&height=800', { name: 'scroll' })
  // Renderer CPU per scroll step over a fixed 150 steps: process CPU time, not wall time, so a
  // loaded host stretches it far less than fps. Compare commits on this number.
  report.perf.scrollCost5000 = await (async () => {
    const { page, context } = await open('fixture=load&n=5000&theme=dark&width=1140&height=800')
    const cdp = await context.newCDPSession(page)
    await cdp.send('Performance.enable')
    const read = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]))
    const steps = 150
    const before = await read()
    await page.evaluate(async (n) => {
      const scroller = document.querySelector('.fw-scroller')
      for (let i = 0; i < n; i++) { scroller.scrollTop += 24; await new Promise(r => requestAnimationFrame(r)) }
    }, steps)
    const after = await read()
    await context.close()
    const per = key => (after[key] - before[key]) * 1000 / steps
    return { steps, cpuMsPerStep: per('ProcessTime'), taskMsPerStep: per('TaskDuration'), scriptMsPerStep: per('ScriptDuration'), layoutMsPerStep: per('LayoutDuration'), styleMsPerStep: per('RecalcStyleDuration') }
  })()
  report.perf.playback = await (async () => {
    const { page, context } = await open('fixture=release&theme=dark&width=1140')
    await page.getByRole('button', { name: 'Restart' }).click()
    await page.getByRole('button', { name: 'Play' }).click()
    const result = await page.evaluate(async () => {
      const frames = []; let last = performance.now(); const until = last + 3000
      await new Promise(resolve => { const step = now => { frames.push(now - last); last = now; if (now < until) requestAnimationFrame(step); else resolve() }; requestAnimationFrame(step) })
      frames.shift()
      const mean = frames.reduce((a, b) => a + b, 0) / frames.length
      return { frames: frames.length, meanFps: 1000 / mean, longFrames: frames.filter(f => f > 1000 / 55).length }
    })
    await context.close()
    return result
  })()

  // One uncut recording of each interaction: expand, hover, play and scrub, zoom, agent focus.
  if (only !== 'perf') {
    const { page, context } = await open('fixture=release&theme=dark&width=1140', { width: 1185, height: 1016 }, true)
    const pause = ms => page.waitForTimeout(ms)
    await pause(600)
    await page.getByRole('button', { name: 'Collapse Researcher' }).click(); await pause(500)
    await page.getByRole('button', { name: 'Expand Researcher' }).click(); await pause(500)
    for (const id of ['plan', 'ws2', 'd2', 'code']) { await page.locator(`[data-span-id="${id}"] .fw-bar`).hover(); await pause(700) }
    await page.mouse.move(5, 5)
    await page.getByRole('button', { name: 'Restart' }).click()
    await page.getByRole('button', { name: 'Play' }).click(); await pause(4000)
    await page.getByRole('button', { name: 'Pause' }).click(); await pause(400)
    await seek(page, 0.3); await pause(400); await seek(page, 0.6); await pause(400)
    await page.getByRole('button', { name: 'Show full trace' }).click(); await pause(400)
    await page.getByRole('button', { name: 'Zoom in' }).click(); await pause(600)
    await page.getByRole('button', { name: 'Fit the whole trace' }).click(); await pause(400)
    await page.getByRole('radio', { name: 'Agents' }).click(); await pause(1200)
    await page.locator('[data-span-id="wri"]').click(); await page.keyboard.press('ArrowRight'); await pause(1200)
    await context.close()
    const video = readdirSync(out).find(name => name.endsWith('.webm') && !name.startsWith('interaction'))
    if (video) renameSync(`${out}/${video}`, `${out}/interaction-spans.webm`)
  }
} catch (error) {
  if (!error.skip) throw error
} finally {
  report.errors = errors
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report.perf, null, 1), '\nerrors:', errors.length, errors.slice(0, 5))
  await browser.close()
  server.kill()
}
