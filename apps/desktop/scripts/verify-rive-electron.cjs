// Smoke com perfil temporário: valida se o .riv e o WASM locais inicializam no Electron compilado.
const { _electron } = require('playwright')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const cwd = path.resolve(__dirname, '..')
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'boobot-rive-electron-'))
let app
async function main() {
  const env = { ...process.env, BOOBOT_E2E_USER_DATA_DIR: path.join(home, 'userData') }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  app = await _electron.launch({ executablePath: require('electron'), args: [path.join(cwd, 'out/main/index.js')], cwd, env, timeout: 60000 })
  const page = await app.firstWindow()
  const errors = []
  const failedRequests = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()) })
  page.on('requestfailed', req => failedRequests.push({ url: req.url(), error: req.failure()?.errorText }))
  await page.waitForFunction(() => !!window.appAPI)
  await page.evaluate(async () => {
    const conv = await window.appAPI.saveConversation({ name: 'Rive QA', agentIds: [] })
    await window.appAPI.setVisibleConversation(conv.id)
  })
  await page.getByRole('button', { name: 'Rive QA', exact: true }).click()
  await page.getByRole('tab', { name: /Agentes/ }).click()
  await page.getByRole('button', { name: 'Abrir painéis e abas' }).click()
  await page.getByRole('menuitem', { name: 'Mascote', exact: true }).click()
  await page.getByRole('region', { name: 'Visualização do mascote' }).waitFor()
  await page.waitForTimeout(3500)
  const ui = await page.evaluate(() => ({
    avatars: document.querySelectorAll('.poli-avatar').length,
    riveActive: document.querySelectorAll('.poli-avatar[data-rive-active="true"]').length,
    riveCanvases: document.querySelectorAll('.poli-avatar canvas').length,
    legacyVisible: Array.from(document.querySelectorAll('.poli-avatar > svg')).filter(svg => getComputedStyle(svg).visibility !== 'hidden').length,
  }))
  const report = { ui, errors, failedRequests, home }
  console.log(JSON.stringify(report, null, 2))
  assert.ok(ui.avatars, 'Nenhum Boo exibido no smoke')
  assert.ok(ui.riveCanvases, 'O renderer Rive nao foi montado')
  assert.ok(ui.riveActive, 'Arquivo Rive nao terminou de carregar; veja erros de WASM')
  assert.equal(errors.length, 0, 'Renderer com erros JS')
}
main().catch(e => { console.error(e); process.exitCode = 1 }).finally(async () => { if (app) await app.close() })
