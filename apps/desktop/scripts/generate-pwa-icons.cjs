const { chromium } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')
const cwd = path.resolve(__dirname,'..')
const out = path.join(cwd,'src/main/pwa/assets')
const svg = fs.readFileSync(path.join(out,'icon.svg'),'utf8')
;(async () => {
 const browser = await chromium.launch({headless:true})
 try {
   for (const size of [192,512]) {
     const page=await browser.newPage({viewport:{width:size,height:size},deviceScaleFactor:1})
     const src='data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64')
     await page.setContent('<!DOCTYPE html><html><style>html,body{margin:0;padding:0;background:transparent}img{display:block;width:100%;height:100%}</style><img src="'+src+'">')
     await page.locator('img').screenshot({path:path.join(out,'icon-'+size+'.png')})
     console.log('Generated icon-'+size+'.png')
     await page.close()
   }
 } finally { await browser.close() }
})().catch(error=>{console.error(error);process.exitCode=1})
