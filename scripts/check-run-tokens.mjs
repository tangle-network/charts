import { readdirSync, readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(directory + '/' + entry.name) : [directory + '/' + entry.name])
const files = process.argv.length > 2 ? process.argv.slice(2) : walk('src/react').filter(file => (/\.(css|tsx)$/.test(file) || file.endsWith('/agent-hub-css.ts')) && !file.includes('.test.'))
for (const file of files) {
  const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
  assert.equal(/#[\da-f]{3,8}\b|(?:rgb|hsl)a?\(\s*[\d.]|cubic-bezier\(|\b\d*\.?\d+ms\b/i.test(source), false, `${file}: color and motion literals belong to Brand`)
  assert.equal(/(?:transition|animation)(?:-[a-z]+)?\s*:[^;]*\b\d*\.?\d+(?:ms|s)\b/i.test(source), false, `${file}: motion timing belongs to Brand`)
  assert.equal(/@keyframes/.test(source), false, `${file}: keyframes belong to Brand`)
}
console.log(`PASS ${files.length} presentation sources use Brand color and motion roles`)
