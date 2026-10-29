import { withoutFallbacks } from "./check-agent-graph-tokens.mjs"
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const css = readFileSync('src/react/flow-waterfall.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const withoutVars = withoutFallbacks(css)
assert.equal(/\b\d*\.?\d+(?:ms|s)\b|cubic-bezier\(|(?:hsl|rgb)a?\(/i.test(withoutVars),false,'Motion and colors must read Brand variables; literals belong only in var() fallbacks')
assert.equal(/@keyframes/.test(css),false,'Keyframes belong to Brand')
console.log('PASS waterfall uses Brand motion and color roles')
