const {chromium}=require('../apps/desktop/node_modules/playwright');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
 try{
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
   const page=await browser.newPage({viewport,deviceScaleFactor:1});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('file:///'+path.resolve(__dirname,'index.html').replace(/\\/g,'/'),{waitUntil:'load'});
   await page.locator('.hero h1').waitFor();
   assert.match(await page.title(),/Boobot/);
   assert.ok(await page.locator('.feature').count()>=4);
   assert.equal(await page.locator('img').count(),await page.locator('img').evaluateAll(imgs=>imgs.filter(el=>el.complete && el.naturalWidth>0).length));
   assert.ok(await page.locator('body').evaluate(el=>el.scrollWidth<=window.innerWidth+3),'horizontal overflow '+viewport.width);
   if(viewport.width<700){await page.locator('.menu-toggle').click();assert.equal(await page.locator('.nav-menu').evaluate(el=>el.classList.contains('open')),true);}
   assert.deepEqual(errors,[]);
   const snap=path.join(require('node:os').tmpdir(),'boobot-site-'+viewport.width+'.png');
   await page.screenshot({path:snap,fullPage:true,animations:'disabled'});
   console.log('SITE_OK',viewport.width,viewport.height,snap);
   await page.close();
  }
 } finally{await browser.close()}
})().catch(e=>{console.error('SITE_FAIL',e.stack);process.exitCode=1});
