const { _electron } = require('playwright')
const assert = require('node:assert/strict')
const { mkdtempSync, mkdirSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const executablePath = path.resolve(__dirname, '../dist/win-unpacked/Boobot.exe')
const profile = mkdtempSync(path.join(tmpdir(), 'boobot-packaged-smoke-'))
const roaming = path.join(profile, 'Roaming')
const local = path.join(profile, 'Local')
mkdirSync(roaming)
mkdirSync(local)
const env = { ...process.env, APPDATA: roaming, LOCALAPPDATA: local, BOOBOT_E2E_USER_DATA_DIR: path.join(profile, 'userData') }
delete env.ELECTRON_RUN_AS_NODE
delete env.ELECTRON_RENDERER_URL
let electron
async function main() {
  electron = await _electron.launch({ executablePath, env, timeout: 60000 })
  const info = await electron.evaluate(({ app }) => ({
    userData: app.getPath('userData'), packaged: app.isPackaged, version: app.getVersion()
  }))
  assert.ok(info.userData.toLowerCase().startsWith(profile.toLowerCase()), 'Perfil nao esta isolado: ' + info.userData)
  assert.equal(info.packaged, true)
  const page = await electron.firstWindow()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.waitForFunction(() => Boolean(window.hostsAPI && window.appAPI), { timeout: 25000 })
  const state = await page.evaluate(async () => ({
    host: await window.hostsAPI.snapshot(),
    workspaces: (await window.appAPI.snapshot()).workspaces.length
  }))
  assert.equal(state.host.selectedId, 'local')
  console.log('PACKAGED_APP_OK', JSON.stringify({ info, workspaces: state.workspaces, jsErrors: errors, profile }))
}
main().catch(error => { console.error('PACKAGED_APP_FAIL', error.stack); process.exitCode = 1 })
  .finally(async () => { if (electron) await electron.close().catch(() => {}) })
