// Smoke browser/mobile end to end; isolated PWA gateway with fake projects.
// Never opens users' databases or real host pairing codes.
const { chromium } = require('playwright')
const esbuild = require('esbuild')
const Module = require('node:module')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const assert = require('node:assert/strict')
const cwd = path.resolve(__dirname, '..')
const entry = path.join(cwd, 'src/main/pwa/gateway.ts')
const compiled = esbuild.buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text
const moduleInstance = new Module(entry, module)
moduleInstance.filename = entry
moduleInstance.paths = Module._nodeModulePaths(path.dirname(entry))
moduleInstance._compile(compiled, entry)
const { PwaGateway } = moduleInstance.exports
let browser, gateway

async function main() {
  const snapshot = {
    workspaces: [{ id: 'ws1', name: 'Projeto Fictício', kind: 'local', archived: false, branch: 'main' }],
    conversations: [{ id: 'c1', workspaceId: 'ws1', name: 'Conversa de teste', kind: 'direct', archived: false }],
    agents: [{ id: 'a1', name: 'Boo de QA', color: '#786bea' }], runs: [], approvals: [],
  }
  gateway = new PwaGateway({
    assets: path.join(cwd, 'src/main/pwa/assets'),
    host: () => ({ id: 'local', name: 'Host de testes' }),
    dispatch: async (method, args) => {
      if (method === 'v9:snapshot') return snapshot
      if (method === 'v9:historyPage') return { messages: [{ id: 'm1', conversationId: 'c1',
        agentId: 'a1', author: 'Boo de QA', role: 'assistant', text: 'Mensagem do host de teste.',
        status: 'completed', createdAt: new Date().toISOString() }], hasMore: false, beforeCursor: null }
      if (method === 'v9:workspaceDiff') return 'diff --git a/test.txt b/test.txt'
      if (method === 'v9:listProjectFiles') return [{ name: 'src', path: 'src', directory: true }]
      throw Error('Unknown '+method+' '+args)
    },
  })
  const port = await gateway.listen(0)
  const base = 'http://127.0.0.1:' + port
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(base, { waitUntil: 'networkidle' })
  assert.ok(await page.getByText('Seu espaço de trabalho, em qualquer tela.').isVisible())
  assert.ok(await page.locator('link[rel="manifest"]').count())
  await page.screenshot({ path: path.join(os.tmpdir(), 'boobot-pwa-mobile-pair.png'), fullPage: true })
  const code = gateway.issueCode().code
  await page.getByLabel('Código de oito dígitos').fill(code)
  await page.getByRole('button', { name: 'Conectar dispositivo' }).click()
  await page.getByText('Continue de onde parou.').waitFor()
  await page.getByRole('button', { name: 'Abrir menu' }).click()
  await page.getByRole('button', { name: /Projeto Fictício/ }).click()
  await page.getByRole('button', { name: 'Abrir menu' }).click()
  await page.getByRole('button', { name: /Conversa de teste/ }).click()
  await page.getByText('Mensagem do host de teste.').waitFor()
  await page.getByRole('button', { name: 'Abrir detalhes do projeto' }).click()
  await page.getByRole('button', { name: 'Diff' }).click()
  await page.getByText('diff --git a/test.txt b/test.txt').waitFor()
  await page.getByRole('button', { name: 'Arquivos' }).click()
  await page.locator('#inspector-body li').filter({ hasText: 'src' }).waitFor()
  await page.getByRole('button', { name: 'Fechar detalhes' }).click()

  const mobile = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth,
    messages: document.querySelectorAll('.message').length,
    hasUnauthorizedControl: !!document.querySelector('button[data-send]') }))
  assert.equal(mobile.overflow, false, 'Horizontal scroll in mobile UI')
  assert.equal(mobile.messages, 1)
  assert.equal(mobile.hasUnauthorizedControl, false)
  await page.screenshot({ path: path.join(os.tmpdir(), 'boobot-pwa-mobile-paired.png') })
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  await desktop.goto(base, { waitUntil: 'networkidle' })
  // Transfer test cookie deliberately to a second local page for layout verification.
  const cookies = await page.context().cookies(base)
  await desktop.context().addCookies(cookies)
  await desktop.reload()
  await desktop.getByRole('button', { name: /Projeto Fictício/ }).click()
  await desktop.getByRole('button', { name: 'Diff' }).click()
  await desktop.getByText('diff --git a/test.txt b/test.txt').waitFor()
  await desktop.getByRole('button', { name: 'Arquivos' }).click()
  await desktop.locator('#inspector-body li').filter({ hasText: 'src' }).waitFor()
  await desktop.screenshot({ path: path.join(os.tmpdir(), 'boobot-pwa-desktop.png') })
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ result: 'PASS', gatewayPort: port, mobile,
    screenshots: ['boobot-pwa-mobile-pair.png','boobot-pwa-mobile-paired.png','boobot-pwa-desktop.png'],
    errors }, null, 2))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
.finally(async () => { if (browser) await browser.close(); if (gateway) await gateway.close() })
