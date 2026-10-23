const esbuild = require('esbuild')
const Module = require('node:module')
const path = require('node:path')
const fs = require('node:fs')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { chromium } = require('playwright')

const cwd = path.resolve(__dirname, '..')
const file = path.join(cwd, 'src/renderer/src/features/app/BooCaps.tsx')
const compiled = esbuild.buildSync({ entryPoints: [file], bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react'], write: false }).outputFiles[0].text
const mod = new Module(file, module)
mod.filename = file
mod.paths = Module._nodeModulePaths(path.dirname(file))
mod._compile(compiled, file)
const bodyFile = fs.readFileSync(path.join(cwd, 'src/renderer/src/features/app/boo-appearance.ts'), 'utf8')
const match = bodyFile.match(/'ghost-wave':\s*'([^']+)'/)
if (!match) throw new Error('Faltou silhueta ghost-wave')
const variants = ['cap', 'cap-flat', 'cap-back']
const hats = variants.map(variant => {
  const cap = renderToStaticMarkup(React.createElement('svg', null, React.createElement(mod.exports.BooCap, { style: variant }))).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')
  return '<div class="item"><h2>' + variant + '</h2><svg viewBox="28 -2 185 210" width="280" height="318"><defs><radialGradient id="body-' + variant + '"><stop stop-color="#bcb5ff"/><stop offset=".52" stop-color="#786bea"/><stop offset="1" stop-color="#4a4190"/></radialGradient></defs><path d="' + match[1] + '" fill="url(#body-' + variant + ')"/>' + cap + '<ellipse cx="94" cy="94" rx="8" ry="12" fill="white"/><ellipse cx="146" cy="94" rx="8" ry="12" fill="white"/><path d="M108 124 Q120 135 132 124" fill="none" stroke="white" stroke-width="5" stroke-linecap="round"/></svg></div>'
}).join('')
;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1020, height: 440 }, deviceScaleFactor: 1 })
  await page.setContent('<html><style>body{margin:0;background:#121723;color:#dce4f0;font:16px system-ui;display:flex;gap:20px;padding:25px}.item{text-align:center;width:300px;background:#1d2430;border-radius:18px}svg{overflow:visible}</style>' + hats)
  const out = path.join(require('node:os').tmpdir(), 'boobot-new-caps.jpg')
  await page.screenshot({ path: out, type: 'jpeg', quality: 66 })
  console.log('PREVIEW=' + out)
  await browser.close()
})().catch(e => { console.error(e); process.exitCode = 1 })
