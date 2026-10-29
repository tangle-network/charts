import { readFileSync } from 'node:fs'

const files = ['src/react/agent-graph/agent-live-card.tsx', 'src/react/agent-graph/agent-hub-css.ts']
// Read nested var() calls so only a real fallback permits a literal.
export function withoutFallbacks(source) {
  let result = ''
  for (let i = 0; i < source.length; i++) {
    if (!source.startsWith('var(', i)) { result += source[i]; continue }
    const start = i
    let depth = 1, comma = -1
    for (i += 4; i < source.length && depth; i++) {
      if (source[i] === '(') depth++
      if (source[i] === ')') depth--
      if (source[i] === ',' && depth === 1 && comma < 0) comma = i
    }
    result += source.slice(start, comma < 0 ? i : comma) + (comma < 0 ? '' : ')')
    i--
  }
  return result
}
let failures = 0
for (const file of files) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
  for (const line of source.split('\n')) {
    const checked = withoutFallbacks(line).replace(/(?:box-shadow|boxShadow)[^;\n]*/g, '')
    if (/(?:\d|\.)\s*ms\b|cubic-bezier\s*\(|\b(?:hsl|rgb)\s*\(/.test(checked)) {
      console.error(`${file}: use the Brand token: ${line.trim()}`)
      failures++
    }
  }
}
if (failures) process.exitCode = 1
else console.log('Run motion and colour literals: none outside var() fallbacks/shadows')
