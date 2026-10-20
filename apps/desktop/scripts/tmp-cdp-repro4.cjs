const { chromium } = require('playwright')
async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9444')
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))
  const last = page.locator('[data-slot=bubble-content]').last()
  const before = await last.evaluate(el => el.getBoundingClientRect().height)
  await last.evaluate(el => { el.style.overflowWrap = 'normal' })
  await page.waitForTimeout(150)
  const after = await last.evaluate(el => el.getBoundingClientRect().height)
  console.log('heightBefore', before, 'heightAfterOverflowWrapNormal', after)
}
main().catch(e => { console.error('ERR', e); process.exitCode = 1 })
