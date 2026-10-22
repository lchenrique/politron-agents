// Prepare public updater assets without publishing code or GitHub credentials.
// Run after npm run dist:win and upload the manifest LAST.
import { readFile, mkdir, copyFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const cwd = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'))
const channel = process.argv[2]
if (channel !== 'stable' && channel !== 'beta') {
  console.error('Uso: node scripts/stage-update-release.mjs stable|beta')
  process.exit(1)
}
if (pkg.version.includes('-') !== (channel === 'beta')) {
  throw new Error('A versão do package.json não corresponde ao canal ' + channel)
}
const source = join(cwd, 'dist')
const destination = join(source, 'update-staging', channel)
const manifestName = channel === 'beta' ? 'beta.yml' : 'latest.yml'
const manifest = await readFile(join(source, manifestName), 'utf8')
if (!manifest.includes('version: ' + pkg.version) || !manifest.includes('sha512:')) {
  throw new Error('Manifesto sem versão esperada ou hash SHA-512.')
}
const exeName = 'Boobot-Setup-' + pkg.version + '-x64.exe'
if (!manifest.includes(exeName)) throw new Error('Manifesto não referencia o instalador esperado: ' + exeName)
const present = new Set(await readdir(source))
if (!present.has(exeName)) throw new Error('Instalador não encontrado: ' + exeName)
await mkdir(destination, { recursive: true })
await copyFile(join(source, exeName), join(destination, exeName))
if (present.has(exeName + '.blockmap')) {
  await copyFile(join(source, exeName + '.blockmap'), join(destination, exeName + '.blockmap'))
}
await copyFile(join(source, manifestName), join(destination, manifestName))
console.log('Assets do canal ' + channel + ' preparados em ' + destination)
console.log('Suba primeiro o instalador e .blockmap (se houver). Publique ' + manifestName + ' por último.')
console.log('Antes de publicar: confira assinatura de código, HTTPS, hashes e teste de atualização no Windows.')
