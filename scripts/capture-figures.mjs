#!/usr/bin/env node
/** Capture the retained fixture pages in both themes at phone and desktop widths. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.resolve(process.argv[2] || path.join(root, 'docs/screenshots'))
fs.mkdirSync(output, { recursive: true })
const knownBrowsers = ['/snap/bin/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser']
const executablePath = process.env.CHROMIUM_BIN || knownBrowsers.find(file => fs.existsSync(file))
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), headless: true, args: ['--no-sandbox'] })
try {
  for (const kind of ['heatmap', 'phase-waterfall', 'latency-range']) {
    const pageUrl = pathToFileURL(path.join(root, 'docs', `${kind}-comparison.html`)).href
    for (const width of [390, 1440]) {
      for (const theme of ['light', 'dark']) {
        const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: theme })
        try {
          await page.goto(pageUrl)
          await page.frameLocator('iframe.reference').locator('main').waitFor()
          const target = path.join(output, `${kind}-${width}-${theme}.png`)
          await page.screenshot({ path: target, fullPage: true })
          console.log(target)
        } finally { await page.close() }
      }
    }
  }
} finally { await browser.close() }
