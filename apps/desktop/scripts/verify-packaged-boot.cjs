// Smoke do Electron empacotado, perfil isolado. Nunca altera o perfil pessoal.
const { _electron } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const appRoot = path.resolve(__dirname, '..')
const executablePath = path.join(appRoot, 'dist', 'win-unpacked', 'Boobot.exe')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'boobot-packaged-smoke-'))
let app
async function run() {
  assert.ok(fs.existsSync(executablePath), 'Boobot.exe empacotado não encontrado')
  const env = { ...process.env, BOOBOT_E2E_USER_DATA_DIR: profile }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  app = await _electron.launch({ executablePath, env, timeout: 60000 })
  const page = await app.firstWindow()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.waitForFunction(() => !!window.appAPI, undefined, { timeout: 30000 })
  const fixture = await page.evaluate(async () => {
    const workspace = await window.appAPI.saveWorkspace({ name: 'QA instalador' })
    const conversation = await window.appAPI.saveConversation({ name: 'QA plano instalador', workspaceId: workspace.id, kind: 'direct', agentIds: [] })
    return conversation.name
  })
  await page.getByRole('button', { name: fixture, exact: true }).click()
  const control = page.getByRole('button', { name: 'Modo planejamento' })
  await control.waitFor({ timeout: 30000 })
  assert.equal(await control.getAttribute('aria-pressed'), 'false')
  await control.click()
  assert.equal(await control.getAttribute('aria-pressed'), 'true')
  await control.click()
  assert.equal(await control.getAttribute('aria-pressed'), 'false')
  const snapshot = await page.evaluate(() => window.appAPI.snapshot())
  assert.ok(Array.isArray(snapshot.workspaces))
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({pass:true, packagedExe:executablePath, planModeToggle:true, errors}, null, 2))
}
run().catch(e => { console.error(e.stack); process.exitCode=1 }).finally(async () => {
  try { await app?.close() } catch {}
  fs.rmSync(profile, {recursive:true,force:true,maxRetries:3,retryDelay:300})
})
