// Browser evidence for the trace inspector: reference-matched frames, hover cards, measured fps and first paint,
// and an uncut interaction recording. `node scripts/flow-waterfall-capture.mjs <out-dir> [run-21c.json]`
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, renameSync, readdirSync } from 'node:fs'

const out = process.argv[2] ?? '/tmp/flow-waterfall-capture'
const run21c = process.argv[3]
const port = 8000 + Math.floor(Math.random() * 900)
mkdirSync(out, { recursive: true })
const server = spawn(process.execPath, ['scripts/flow-waterfall-demo.mjs', String(port), ...(run21c ? [run21c] : [])], { stdio: ['ignore', 'pipe', 'inherit'] })
await new Promise((resolve, reject) => { server.stdout.on('data', resolve); server.on('exit', reject) })
const base = `http://127.0.0.1:${port}/`
const report = { frames: [], perf: {} }
const browser = await chromium.launch()
const errors = []
const open = async (query, viewport = { width: 1185, height: 1016 }, video) => {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, ...(video ? { recordVideo: { dir: out, size: viewport } } : {}) })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(`${query}: ${error.message}`))
  page.on('console', message => { if (message.type() === 'error') errors.push(`${query}: ${message.text()}`) })
  await page.goto(`${base}?${query}`)
  await page.locator('body[data-ready="1"]').waitFor({ timeout: 30_000 })
  await page.waitForTimeout(300)
  return { page, context }
}
const shot = async (page, name) => {
  const path = `${out}/${name}.png`
  await page.locator('[data-flow-waterfall]').screenshot({ path, animations: 'disabled' })
  report.frames.push(name)
}
const seek = async (page, fraction) => {
  const slider = page.getByLabel('Playback position')
  const max = Number(await slider.getAttribute('max'))
  await slider.fill(String(max * fraction))
  await page.waitForTimeout(150)
}

try {
  // Reference 1 and 2: the span waterfall, both themes, at the reference viewport, through the run.
  for (const theme of ['light', 'dark']) {
    const { page, context } = await open(`fixture=release&theme=${theme}&width=1140&description=Ship annual billing by Friday`)
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
      return { frames: frames.length, meanFps: 1000 / mean, p95FrameMs: sorted[Math.floor(sorted.length * 0.95)], worst30FrameFps: worstWindow, longFrames: frames.filter(f => f > 1000 / 55).length }
    }, drive.name)
    await context.close()
    return result
  }
  report.perf.scroll5000 = await fps('fixture=load&n=5000&theme=dark&width=1140&height=800', { name: 'scroll' })
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
  {
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
} finally {
  report.errors = errors
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report.perf, null, 1), '\nerrors:', errors.length, errors.slice(0, 5))
  await browser.close()
  server.kill()
}
