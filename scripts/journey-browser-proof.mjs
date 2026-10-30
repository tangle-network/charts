/** Actual HTTP packed-consumer proof for Discovery's shared overview timeline. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const output = process.env.CHARTS_PROOF_DIR
assert.ok(output, 'CHARTS_PROOF_DIR must retain the evidence outside the gate cache')
await mkdir(output, { recursive: true })
const server = spawn(process.execPath, ['scripts/charts-browser-smoke.mjs', ...process.argv.slice(2)], { stdio: ['ignore', 'pipe', 'pipe'] })
const logs = []
for (const stream of [server.stdout, server.stderr]) stream.on('data', bytes => logs.push(String(bytes)))
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
  for (const agents of [100, 124, 1000]) for (const theme of ['light', 'dark']) for (const width of [1512, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 982 }, colorScheme: theme, recordVideo: { dir: output, size: { width, height: 982 } } })
    const page = await context.newPage(), errors = []
    const currentStyle = (selector, property) => page.evaluate(({selector, property}) => getComputedStyle(document.querySelector(selector))[property], {selector, property})
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`http://127.0.0.1:46489/?id=journey&globals=agent-${theme}&agents=${agents}`)
    await page.locator('[data-lane="agent-0"]').waitFor()
    assert.equal(await page.locator('.ov-gantt').evaluate(node => { const parent = node.parentElement, css = getComputedStyle(parent); return Math.abs(node.clientWidth - (parent.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight))) <= 1 && getComputedStyle(node).marginTop === '0px' }), true, 'a live plot fills its host without report margins')
    assert.ok(await page.locator('[data-lane]').count() < 40, `${agents} lanes render a bounded window`)
    assert.deepEqual(await page.locator('.ov-step-state').allTextContents(), ['Pass', 'Stuck', 'Unchecked'])
    assert.ok((await page.locator('[data-lane=agent-0] .ov-gantt-count').textContent()).includes('190'))
    await page.getByRole('button', { name: 'Agent 0', exact: true }).click()
    await page.locator('[data-lane=agent-0] .ov-gantt-end').waitFor()
    assert.equal(await page.locator('[data-lane=agent-0] .ov-gantt-end').count(), 1, 'only the latest span has an unambiguous end reading')
    assert.ok(!(await page.locator('[data-lane=agent-0] .ov-gantt-end title').textContent()).startsWith('30s'), 'array order cannot select an older span')
    assert.equal(await page.locator('[data-lane=agent-0] .ov-gantt-end').evaluate(node => node.parentElement.lastElementChild === node), true, 'later spans cannot paint over the end reading')
    assert.ok((await page.locator('[data-lane=agent-0] .ov-gantt-end title').textContent()).includes('≥$12,345.67'))
    const labels = await page.locator('.ov-gantt > svg [data-labelled]').evaluateAll(nodes => nodes.map(node => ({show:node.dataset.labelled, text:getComputedStyle(node.querySelector('text')).display})))
    assert.ok(labels.filter(label => label.show === 'true').length > 1, 'more than just the best release is named')
    assert.ok(labels.some(label => label.show === 'false' && label.text === 'none'), 'dense release labels are sparse')
    assert.equal(await page.locator('.ov-gantt > svg [data-labelled][aria-label="rc18"]').getAttribute('data-labelled'), 'true', 'the selected late release keeps a label in the crowded header')
    const hidden = page.locator('.ov-gantt > svg [data-labelled=false]').first(), hiddenId = await hidden.getAttribute('data-mark-id'), hiddenText = '[data-mark-id='+JSON.stringify(hiddenId)+'] text'
    await hidden.hover()
    assert.notEqual(await currentStyle(hiddenText, 'display'), 'none', 'a release reveals its name on hover')
    await hidden.focus()
    assert.notEqual(await currentStyle(hiddenText, 'display'), 'none', 'keyboard focus reveals a release name')
    await page.getByRole('button', { name: 'Agent 0', exact: true }).press('End')
    await page.getByRole('button', { name: `Agent ${agents - 1}`, exact: true }).waitFor()
    await page.getByRole('button', { name: `Agent ${agents - 1}`, exact: true }).press('Enter')
    assert.equal(await page.getByRole('button', { name: `Agent ${agents - 1}`, exact: true }).getAttribute('aria-pressed'), 'true')
    await page.getByRole('button', { name: `Agent ${agents - 1}`, exact: true }).hover()
    await page.locator('.ov-tip').waitFor()
    const tooltip = await page.locator('.ov-tip').boundingBox(), plot = await page.locator('.ov-gantt').boundingBox()
    assert.ok(tooltip.y >= plot.y && tooltip.y + tooltip.height <= plot.y + plot.height, 'A late virtual row tooltip stays beside the visible row')
    await page.locator('.ov-gantt-scroll').evaluate(el => { el.scrollTop -= 20 })
    await page.locator('.ov-tip').waitFor({ state: 'hidden' })
    await page.getByRole('button', { name: `Agent ${agents - 1}`, exact: true }).press('Home')
    await page.getByRole('button', { name: 'Agent 0', exact: true }).waitFor()
    const before = await page.locator('[data-lane="agent-3"] [data-open] rect').getAttribute('width')
    await page.screenshot({ path: `${output}/journey-${agents}-${width}-${theme}.png` })
    await page.waitForFunction(previous => { const bar = document.querySelector('[data-lane="agent-3"] [data-open] rect'); return bar && bar.getAttribute('width') !== previous }, before, { timeout: 10000 })
    assert.equal(await page.locator('[data-best] circle').count(), 1)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    assert.equal(await currentStyle('[data-lane="agent-3"] [data-open] rect', 'animationName'), 'none')
    assert.notEqual(await currentStyle('svg[role="group"] .ov-mark-deadline', 'strokeDasharray'), 'none')
    await page.goto(`http://127.0.0.1:46489/?id=journey&globals=agent-${theme}&ancestor=1`)
    await page.locator('.ov-axis').first().waitFor()
    assert.equal(await currentStyle('.ov-axis', 'fill'), 'rgb(17, 109, 91)')
    assert.equal(await currentStyle('.ov-mark-label', 'fill'), 'rgb(32, 67, 120)')
    assert.deepEqual(errors, [])
    await context.close()
    await page.video().saveAs(`${output}/journey-${agents}-${width}-${theme}.webm`)
    checks.push({ theme, width, result: 'PASS', agents })
  }
} finally {
  await Promise.all((browser?.contexts() ?? []).map(context => context.close())); await browser?.close()
  server.kill('SIGTERM')
  await writeFile(`${output}/consumer.log`, logs.join(''))
  await writeFile(`${output}/checks.json`, JSON.stringify(checks, null, 2))
}
