const { chromium } = require('playwright')
async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9444')
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))
  const levels = [0, 0.25, -0.25, 0.5, -0.5, 1, -1, 1.5, 2, -2]
  for (const zoom of levels) {
    await page.evaluate((z) => window.vibeAPI?.windowControls?.setZoom?.(z), zoom)
    await page.waitForTimeout(200)
    const textarea = page.getByRole('textbox', { name: 'Message' })
    await textarea.click()
    await textarea.fill('')
    await textarea.type('oi', { delay: 30 })
    await page.waitForTimeout(150)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(400)
    const last = page.locator('[data-slot=bubble-content]').last()
    const html = await last.innerHTML()
    const box = await last.boundingBox()
    console.log('ZOOM', zoom, 'HTML', JSON.stringify(html), 'BOX', JSON.stringify(box))
  }
  await browser.close()
}
main().catch(e => { console.error('ERR', e); process.exitCode = 1 })
