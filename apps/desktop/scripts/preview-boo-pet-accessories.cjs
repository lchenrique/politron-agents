/** Generate an inspection sheet from the Boo Pet SVG collection as installed in Boobot. */
const esbuild = require('esbuild')
const Module = require('node:module')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { chromium } = require('playwright')
const cwd = path.resolve(__dirname, '..')
const source = path.join(cwd, 'src/renderer/src/features/app/BooPetAccessories.tsx')
const code = esbuild.buildSync({entryPoints: [source], bundle: true, platform: 'node', format: 'cjs', external: ['react', 'react-dom'], jsx: 'automatic', write: false }).outputFiles[0].text
const mod = new Module(source, module)
mod.filename = source
mod.paths = Module._nodeModulePaths(path.dirname(source))
mod._compile(code, source)
const sourceShapes = fs.readFileSync(path.join(cwd, 'src/renderer/src/features/app/boo-appearance.ts'), 'utf8')
const shapes = Object.fromEntries([...sourceShapes.matchAll(/^  (?:'([^']+)'|([a-z]+)): '([^']+)'/gm)].map(([,quoted, key, d]) => [quoted || key, d]))
const heads = ['cap','beanie','top-hat','witch-hat','crown','party-hat','chef-hat','bow','flower','halo']
const faces = ['round-glasses','sunglasses','heart-glasses','star-glasses','monocle','mustache','star-mask']
const entries = [...heads.map((name,i) => ({name, shape: ['round','ghost-wave','little-cat','drop'][i%4], layer:'head'})), ...faces.map((name,i) => ({name, shape: ['round','ghost-wave','little-cat'][i%3], layer:'face'}))]
function card({name,shape,layer}) {
 const looks = {shape,head:layer==='head'?name:'none',face:layer==='face'?name:'none',width:1,height:1,eyeSize:8,eyeSpacing:26,mouthSize:1,colors:{}}
 const svg = renderToStaticMarkup(React.createElement(mod.exports.ImportedBooPetAccessory,{looks,layer}))
 return `<section><div class="item-title">${name} <small>${shape}</small></div>
 <svg viewBox="0 -58 240 265"><defs><radialGradient id="body-${name}"><stop stop-color="#bcb5ff"/><stop offset=".52" stop-color="#786bea"/><stop offset="1" stop-color="#4a4190"/></radialGradient></defs>
 <path d="${shapes[shape]}" fill="url(#body-${name})"/><ellipse cx="94" cy="94" rx="8" ry="12" fill="#fff"/><ellipse cx="146" cy="94" rx="8" ry="12" fill="#fff"/><path d="M108 124 Q120 135 132 124" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>${svg}</svg></section>`
}
;(async()=>{
 const browser=await chromium.launch({headless:true})
 const page=await browser.newPage({viewport:{width:1300,height:1160},deviceScaleFactor:1})
 await page.setContent(`<html><style>body{background:#121721;color:#dde6ef;font:14px system-ui;margin:0;padding:20px} main{display:grid;grid-template-columns:repeat(5,1fr);gap:14px} section{background:#202b3a;border-radius:16px;min-width:0;text-align:center;padding:12px 4px}svg{width:220px;height:220px;display:block;margin:auto;overflow:visible}small{font-size:10px;color:#92a2bd}</style><main>${entries.map(card).join('')}</main></html>`)
 const outfile=path.join(os.tmpdir(),'boobot-imported-boo-pet-accessories.jpg')
 await page.screenshot({path:outfile, type:'jpeg', quality:70, fullPage:true})
 console.log(outfile)
 await browser.close()
})().catch(error=>{console.error(error);process.exitCode=1})
