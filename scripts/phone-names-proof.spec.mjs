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
    const geometry = await page.locator('.fw-agent-row').evaluateAll(rows => rows.map(row => {
      const name = row.querySelector('.fw-name-text'), end = row.querySelector('.fw-end'), status = row.querySelector('.fw-row-state, .fw-quiet'), bar = row.querySelector('.fw-bar')
      const box = element => { const b = element.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right } }
      const text = box(name), numbers = box(end), state = box(status), lane = box(bar)
      return { name: name.textContent, whole: name.scrollWidth <= name.clientWidth, text, numbers, state, lane, row: box(row), status: status.textContent, size: [name, status, end.querySelector('.fw-duration')].map(node => parseFloat(getComputedStyle(node).fontSize)) }
    }))
    checks.push({ theme, width, geometry })
    assert.equal(geometry.length, 3)
    assert.ok(geometry.every(g => g.size.every(size => size >= 13)), 'readable metadata uses at least13px in both compositions')
    if (width === 390) for (const g of geometry) {
      assert.equal(g.whole, true, `distinctive agent suffix is truncated at ${width}: ${JSON.stringify(g)}`)
      assert.ok(g.text.bottom <= g.numbers.top + 1, 'name has a full line above duration/cost')
      assert.ok(g.state.bottom <= g.lane.top + 1, 'status remains above the work bars')
      assert.ok(g.state.right <= g.numbers.left, 'status and long duration/cost do not overlap')
    }
    assert.ok(geometry[0].status.startsWith('Quiet'))
    assert.ok(await page.locator('.fw-heading .fw-quiet').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).position !== 'absolute')), 'header attention counts retain their normal inline layout')
    assert.equal(geometry[1].status, 'Failed')
    assert.equal(geometry[2].status, 'Done')
    assert.ok((await row.locator('.fw-names').getAttribute('title')).includes('peer-director-1-resume'), 'full identity remains available at desktop reading width')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await row.locator('.fw-bar').click()
    const card = page.locator('.fw-card')
    await card.waitFor()
    const text = await card.innerText()
    for (const label of ['peer‑director‑1‑resume', 'Model', 'Ran for', 'Tokens', 'Model latency', 'Cost', 'Model calls', 'Tool calls', 'Failures', 'Retries']) assert.ok(text.includes(label), `full metrics retains ${label}`)
    await page.screenshot({ path: `${output}/metrics-${theme}-${width}.png`, fullPage: true })
    await page.keyboard.press('Escape')
    assert.equal(await card.count(), 0)
    const known = { 'Model calls':'731',Model:'canonical/model',Tokens:'8,000,000 total · split not recorded','Model latency':'p50 3 s · p90 11 s · p99 32 s','Tool calls':'9,004',Failures:'127 failed steps',Retries:'44 retries · 8 restarts','Ran for':'23 h 12 m',Cost:'$992.18 list' }
    for (const authority of ['known', 'unknown', 'zero']) {
      await page.goto(`${base}/iframe.html?id=chatcontrols-flowwaterfall--phone-names&globals=agentTheme:agent-${theme}&authority=${authority}`)
      await row.waitFor()
      await row.locator('.fw-bar').click()
      await card.waitFor()
      const values = await card.evaluate(card => [...card.querySelectorAll('.fw-card-table > div')].map(row => [row.querySelector('dt').textContent, row.querySelector('dd').textContent]))
      await page.screenshot({ path: `${output}/authority-${authority}-${theme}-${width}.png`, fullPage: true })
      const expected = authority === 'unknown' ? Object.fromEntries(Object.keys(known).map(key => [key, 'Not recorded'])) : authority === 'zero' ? { Tokens:'0','Model calls':'0','Tool calls':'0',Failures:'0',Retries:'0',Cost:'$0.00' } : known
      for (const [label, value] of Object.entries(expected)) {
        const matching = values.filter(([key]) => key.toLowerCase() === label.toLowerCase())
        assert.equal(matching.length, 1, `${authority} keeps exactly one ${label} row`)
        assert.equal(matching[0][1], value, `${authority} explicit ${label} overrides the bounded display inference`)
      }
      const summary = await row.locator('.fw-subtitle').textContent()
      for (const label of ['Model calls', 'Tool calls']) assert.ok(summary.includes(`${label}: ${expected[label]}`), `${authority} lane uses the full-stream ${label}: ${summary}`)
      assert.ok(!summary.includes('1 model call') && !summary.includes('1 tool call'), 'sampled display counts cannot contradict the host in the lane')
      checks.push({ theme, width, authority, values, summary })
      await page.keyboard.press('Escape')
      assert.equal(await card.count(), 0)
    }
    await page.goto(`${base}/iframe.html?id=chatcontrols-flowwaterfall--phone-names&globals=agentTheme:agent-${theme}&authority=known&family=1`)
    const family = page.locator('[data-span-id="family:Worker"]')
    await family.waitFor()
    const familySummary = await family.locator('.fw-subtitle').textContent()
    assert.ok(familySummary.includes('2 agents') && familySummary.includes('1 failed'), `family retains agent/outcome rollup: ${familySummary}`)
    assert.ok(!familySummary.includes('Model calls') && !familySummary.includes('tool call'), 'family lane does not invent a total from opaque facts')
    const familyBar = family.locator('.fw-bar'), box = await familyBar.boundingBox()
    await familyBar.hover({ position: { x: box.width - 4, y: box.height / 2 } })
    await card.waitFor()
    assert.equal(await card.locator('.fw-card-who').textContent(), 'Worker')
    const familyValues = await card.evaluate(card => Object.fromEntries([...card.querySelectorAll('.fw-card-table > div')].map(row => [row.querySelector('dt').textContent, row.querySelector('dd').textContent])))
    await page.screenshot({ path: `${output}/authority-family-${theme}-${width}.png`, fullPage: true })
    for (const label of ['Model calls', 'Tool calls', 'Model latency', 'Failures', 'Retries']) assert.equal(familyValues[label], 'Not recorded', `family cannot aggregate formatted ${label} facts`)
    for (const value of ['200 in', '40 out', '100 cached']) assert.ok(familyValues.Tokens.includes(value), `family retains full numeric token rollup: ${familyValues.Tokens}`)
    assert.equal(familyValues.Cost, '$4.00')
    checks.push({ theme, width, authority: 'family', familySummary, values: familyValues })
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
