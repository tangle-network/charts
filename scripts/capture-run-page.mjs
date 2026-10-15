#!/usr/bin/env node
/** Capture each run page addition (React and static forms) at 1440 px light and 390 px dark, after `npm run build`. */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { rolldown } from 'rolldown'
import { chartTokensCss, figureCss } from '../dist/index.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.resolve(process.argv[2] || path.join(root, 'docs/screenshots'))
const sections = ['marks-bands', 'lanes', 'segments', 'small-multiples', 'figure-view', 'second-channel']
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'charts-run-page-'))
fs.mkdirSync(output, { recursive: true })
// React reads process.env.NODE_ENV; a banner defines it for the browser bundle.
const bundle = await rolldown({ input: path.join(root, 'scripts/run-page-demo.mjs'), platform: 'browser' })
await bundle.write({ file: path.join(temp, 'demo.js'), format: 'iife', banner: 'var process={env:{NODE_ENV:"production"}};' })
const live = fs.readFileSync(path.join(root, 'dist/react/live.css'), 'utf8')
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Run page charts</title><style>${chartTokensCss}\n${figureCss}\n${live}
:root{--chart-live-fg:var(--chart-ink);--chart-live-muted:var(--chart-ink-muted);--chart-live-faint:var(--chart-muted);--chart-live-surface:var(--chart-canvas);--chart-live-raised:var(--chart-canvas);--chart-live-border:var(--chart-rule)}
*{box-sizing:border-box}body{margin:0;padding:16px;background:var(--chart-canvas);color:var(--chart-ink);font:14px/1.5 Inter,system-ui,sans-serif}
section{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px;padding:16px 0 24px;border-bottom:1px solid var(--chart-rule)}
.panel{min-width:0}.panel h3{margin:0 0 8px;font:600 12px/1.4 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.04em;color:var(--chart-ink-muted)}
.tgc-figure{margin:0}@media(max-width:900px){section{grid-template-columns:1fr}}</style></head>
<body>${sections.map((id) => `<section id="${id}"></section>`).join('')}<script src="demo.js"></script></body></html>`
fs.writeFileSync(path.join(temp, 'index.html'), page)
const knownBrowsers = ['/snap/bin/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser']
const executablePath = process.env.CHROMIUM_BIN || knownBrowsers.find((file) => fs.existsSync(file))
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), headless: true, args: ['--no-sandbox'] })
try {
  for (const [width, theme] of [[1440, 'light'], [390, 'dark']]) {
    const tab = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2, colorScheme: theme })
    const errors = []
    tab.on('pageerror', (error) => errors.push(error.message))
    try {
      await tab.goto(pathToFileURL(path.join(temp, 'index.html')).href)
      await tab.locator('#second-channel svg').first().waitFor()
      await tab.waitForTimeout(400)
      if (errors.length) throw new Error(errors.join('\n'))
      for (const id of sections) {
        const target = path.join(output, `run-page-${id}-${width}-${theme}.png`)
        await tab.locator(`#${id}`).screenshot({ path: target })
        console.log(target)
      }
    } finally { await tab.close() }
  }
} finally {
  await browser.close()
  fs.rmSync(temp, { recursive: true, force: true })
}
