// Regenera o bloco BOO-ART de client.js a partir da arte aprovada do Politron (apps/desktop/.../boo-reference-art.ts).
// O client.js do DSH é um arquivo único (sem imports), então a geometria é embutida; as animações líquidas ficam de fora.
// Uso: node scripts/gen-art.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = join(here, '..', '..', '..', 'apps', 'desktop', 'src', 'renderer', 'src', 'features', 'app', 'boo-reference-art.ts')
const text = readFileSync(source, 'utf8').replace(/^[\s\S]*?export const BOO_REFERENCE_ART =/, 'return').replace(/\} as const[\s\S]*$/, '}')
const art = new Function(text)()

const slim = Object.fromEntries(['idle', 'focus', 'happy', 'sleep'].map(pose => {
  const { body, eyes, glints, mouth, brow, hands } = art[pose]
  return [pose, { body, eyes, glints, mouth, brow, hands }]
}))

const client = join(here, '..', 'client.js')
const block = `/* BOO-ART:START (gerado por scripts/gen-art.mjs; não editar) */\nconst BOO_ART = ${JSON.stringify(slim)}\n/* BOO-ART:END */`
const current = readFileSync(client, 'utf8')
if (!/\/\* BOO-ART:START[\s\S]*?BOO-ART:END \*\//.test(current)) throw new Error('Marcadores BOO-ART não encontrados em client.js')
writeFileSync(client, current.replace(/\/\* BOO-ART:START[\s\S]*?BOO-ART:END \*\//, () => block))
console.log(`BOO_ART atualizado (${Math.round(block.length / 1024)} KB)`)
