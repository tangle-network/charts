#!/usr/bin/env node
/** Render the retained source snapshots into a comparison page after build. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { heatmap, latencyRange, phaseWaterfall, isRefusal, renderFigure, chartTokensCss, figureCss } from '../dist/index.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const [kind, output] = process.argv.slice(2)
if (!['heatmap', 'latency-range', 'phase-waterfall'].includes(kind) || !output) {
  throw new Error('Usage: node scripts/render-figures.mjs <heatmap|latency-range|phase-waterfall> <output.html>')
}
const harness = JSON.parse(fs.readFileSync(path.join(root, 'docs/fixtures/harness-lifecycle.json'), 'utf8'))
const waterfall = JSON.parse(fs.readFileSync(path.join(root, 'docs/fixtures/waterfall-phases.json'), 'utf8'))
let figure
if (kind === 'heatmap') {
  figure = heatmap(harness.columns, harness.rows.map(row => ({ ...row,
    label: row.id.startsWith('firecracker:') ? `${row.label.split(' · ')[0]} · FC` : row.label.split(' · ')[0],
    cells: row.cells.map(c => ({ status: c.status, value: c.value === null ? null : c.value / 1000 })) })),
    { measure: 'p95 latency', unit: 's', statusRule: '5 s p95 SLO', id: 'harness-heatmap' })
} else if (kind === 'latency-range') {
  const cold = harness.rows.filter(row => row.id.startsWith('docker:')).map(row => ({ id: row.id, label: row.label,
    p50Ms: row.cells[0].p50Ms, p95Ms: row.cells[0].p95Ms, n: row.cells[0].n }))
  const eligible = cold.filter(row => row.n >= 5 && row.p50Ms !== null && row.p95Ms !== null)
  const excluded = cold.filter(row => !eligible.includes(row)).map(row => `${row.label}: n=${row.n} below minimum n=5.`)
  figure = latencyRange(eligible, { measure: 'cold create latency', sloMs: harness.sloMs, minN: 5, excluded, id: 'create-range' })
} else {
  figure = phaseWaterfall(waterfall.phases, { measure: 'restore-at-create wall time', totalMs: waterfall.totalMs, id: 'create-phases' })
}
if (isRefusal(figure)) throw new Error(figure.refused)
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${kind} comparison</title><style>${chartTokensCss}\n${figureCss}\n*{box-sizing:border-box}body{margin:0;background:var(--chart-canvas);color:var(--chart-ink);font:14px/1.5 Inter,system-ui,sans-serif}.intro{padding:14px 18px;border-bottom:1px solid var(--chart-rule)}.intro h1{font-size:20px;line-height:1.2;margin:0}.intro p{margin:4px 0 0;color:var(--chart-ink-muted)}.panels{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0}.panel{min-width:0;padding:12px;border-right:1px solid var(--chart-rule)}.label{font:600 12px/1.4 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.04em;color:var(--chart-ink-muted);margin:0 0 12px}.reference{display:block;border:0;width:100%;height:${kind === 'phase-waterfall' ? 1480 : 1170}px;background:var(--chart-canvas)}.tgc-figure{margin:0;max-width:none}.tgc-plot{max-width:720px;container-type:normal}.tgc-wide svg{max-width:100%;height:auto}@media(max-width:800px){.panels{grid-template-columns:1fr}.reference{height:700px}.panel{border-right:0;border-bottom:1px solid var(--chart-rule)}.tgc-plot{container-type:inline-size}}@media(prefers-color-scheme:dark){body{color-scheme:dark}}</style></head><body><header class="intro"><h1>${kind.replaceAll('-', ' ')}</h1><p>Source: harness lifecycle ${harness.at}; restore-at-create rep 1. The left panel is Drew's approved speed reference.</p></header><main class="panels"><section class="panel"><h2 class="label">Approved reference</h2><iframe class="reference" title="Approved speed reference" src="reference/speed.html"></iframe></section><section class="panel"><h2 class="label">Charts figure</h2>${renderFigure(figure, 1)}</section></main></body></html>`
const rowNote = kind === 'heatmap' ? ' Docker rows come first; FC marks Firecracker rows.' : ''
fs.writeFileSync(output, html.replace("The left panel is Drew's approved speed reference.", `The left panel is Drew's approved speed reference.${rowNote}`))
console.log(output)
