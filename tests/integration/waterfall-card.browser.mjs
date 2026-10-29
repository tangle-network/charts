import assert from 'node:assert/strict'

export default async function proveFactColumns(page, base, output) {
  for (const width of [1512, 390]) for (const theme of ['agent-light', 'agent-dark']) {
    await page.setViewportSize({ width, height: 982 })
    await page.goto(`${base}/iframe.html?id=chatcontrols-flowwaterfall--agent-metrics&authority=long&globals=agentTheme:${theme}`)
    await page.locator('[data-span-id="builder"] .fw-bar').click()
    const card = page.locator('.fw-card'), facts = card.locator('.fw-card-table')
    await facts.waitFor()
    const sizes = await facts.locator('dd').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().width))
    assert.ok(sizes.every(size => size > 100), `long tool labels must leave readable value columns: ${sizes}`)
    const tool = facts.locator('div').filter({ has: page.locator('dt', { hasText: 'agent-runtime-coordination_knowledge_record' }) })
    await tool.scrollIntoViewIfNeeded()
    const geometry = await tool.locator('dt').evaluate(node => { const a=node.getBoundingClientRect(), b=node.nextElementSibling.getBoundingClientRect(); return { end:a.right, value:b.left, scroll:node.scrollWidth, width:node.clientWidth } })
    assert.ok(geometry.end <= geometry.value && geometry.scroll <= geometry.width + 1, JSON.stringify(geometry))
    assert.match(await tool.locator('dd').innerText(), /42 calls/)
    await page.screenshot({ path: `${output}/long-fact-${width}-${theme}.png` })
    await card.evaluate(node => { node.scrollTop = 0 })
    assert.equal(await facts.locator('div').filter({ has: page.locator('dt', { hasText: /^Model$/ }) }).locator('dd').innerText(), 'canonical/model')
  }
}
