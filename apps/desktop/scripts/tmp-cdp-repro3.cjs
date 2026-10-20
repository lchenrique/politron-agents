const { chromium } = require('playwright')
async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9444')
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))
  await page.evaluate(() => window.vibeAPI?.windowControls?.setZoom?.(0))
  await page.waitForTimeout(200)
  const textarea = page.getByRole('textbox', { name: 'Message' })
  await textarea.click()
  await textarea.fill('')
  await textarea.type('oi', { delay: 30 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  const last = page.locator('[data-slot=bubble-content]').last()
  await last.screenshot({ path: 'D:/projetos pessoais/politron/bubble-oi.png' })
  const info = await last.evaluate(el => {
    const cs = getComputedStyle(el)
    return {
      text: el.textContent,
      childNodes: el.childNodes.length,
      outerHTML: el.outerHTML,
      width: cs.width, maxWidth: cs.maxWidth, display: cs.display,
      wordBreak: cs.wordBreak, overflowWrap: cs.overflowWrap, whiteSpace: cs.whiteSpace,
      parentWidth: getComputedStyle(el.parentElement).width,
      parentOuterHTML: el.parentElement.outerHTML.slice(0, 300),
    }
  })
  console.log('INFO', JSON.stringify(info, null, 2))
  await browser.close()
}
main().catch(e => { console.error('ERR', e); process.exitCode = 1 })
