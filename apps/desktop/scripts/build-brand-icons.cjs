// Builds app icons from the shared vector Boobot logo. No extra dependency or cloud service.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const svgPath = path.join(root, 'site/assets/boobot-logo.svg');
const out = path.join(root, 'apps/desktop/branding');
const sizes = [16, 32, 48, 64, 128, 256];
async function main() {
  const svg = fs.readFileSync(svgPath, 'utf8');
  fs.mkdirSync(out, {recursive: true});
  const chrome = process.env.BOOBOT_ICON_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await chromium.launch({headless:true, executablePath:chrome});
  const frames = [];
  try {
    const page = await browser.newPage({viewport:{width:256,height:256},deviceScaleFactor:1});
    for (const size of sizes) {
      await page.setViewportSize({width:size,height:size});
      await page.setContent('<style>html,body{margin:0;padding:0;width:100%;height:100%;background:transparent}img{display:block;width:100%;height:100%}</style><img alt="" src="data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64')+'">');
      await page.locator('img').evaluate(el=>el.decode());
      const png = await page.screenshot({omitBackground:true});
      frames.push({size,png});
      if(size===256) fs.writeFileSync(path.join(out,'icon.png'),png);
    }
  } finally {await browser.close()}
  const header=Buffer.alloc(6+frames.length*16);
  header.writeUInt16LE(0,0);header.writeUInt16LE(1,2);header.writeUInt16LE(frames.length,4);
  let offset=header.length;
  frames.forEach(({size,png},i)=>{
    const entry=6+i*16;
    header.writeUInt8(size===256?0:size,entry);
    header.writeUInt8(size===256?0:size,entry+1);
    header.writeUInt8(0,entry+2);header.writeUInt8(0,entry+3);
    header.writeUInt16LE(1,entry+4);
    header.writeUInt16LE(32,entry+6);
    header.writeUInt32LE(png.length,entry+8);
    header.writeUInt32LE(offset,entry+12);
    offset+=png.length;
  });
  const target=path.join(out,'icon.ico');
  fs.writeFileSync(target,Buffer.concat([header,...frames.map(x=>x.png)]));
  console.log('BRAND_ICON_OK',target,fs.statSync(target).size);
}
main().catch(e=>{console.error('BRAND_ICON_FAIL',e);process.exitCode=1});
