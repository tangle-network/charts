#!/usr/bin/env node
// Runs the outcome and checker palettes in src/figure.css through the dataviz palette validator, light and dark.
//
//   node scripts/palette-check.mjs <path to dataviz scripts/validate_palette.js>
//
// Both palettes are categorical. Outcomes are checked as adjacent pairs in stack order (a stacked bar); checkers as
// adjacent series in index order (lines in release order). Exit 1 when any check fails.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const validator = process.argv[2]
if (!validator) {
  console.error('usage: node scripts/palette-check.mjs <validate_palette.js>')
  process.exit(2)
}
const { validate } = await import(pathToFileURL(path.resolve(validator)).href)
const css = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'figure.css'), 'utf8')
const pairs = (prefix) => [...css.matchAll(new RegExp(`--chart-${prefix}-([a-z0-9-]+):\\s*light-dark\\((#[0-9a-f]{6}),\\s*(#[0-9a-f]{6})\\)`, 'gi'))]
  .map(([, name, light, dark]) => ({ name, light, dark }))
const surfaces = { light: '#fcfcfb', dark: '#161616' }
let failed = false
for (const [label, prefix] of [['outcomes', 'outcome'], ['checkers', 'checker']]) {
  const palette = pairs(prefix)
  if (palette.length < 2) throw new Error(`palette-check: found ${palette.length} ${label} in figure.css`)
  for (const mode of ['light', 'dark']) {
    const { ok, report } = validate(palette.map((p) => p[mode]), { mode, surface: surfaces[mode] })
    failed ||= !ok
    console.log(`${label} ${mode} (${palette.map((p) => p.name).join(' > ')}) on ${surfaces[mode]}: ${ok ? 'PASS' : 'FAIL'}`)
    for (const [check, pass, detail] of report) console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${check}: ${detail}`)
  }
}
process.exit(failed ? 1 : 0)
