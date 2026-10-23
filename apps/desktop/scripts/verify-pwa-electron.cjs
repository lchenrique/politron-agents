// Isolated Electron and browser E2E of PWA pairing and local host routing.
const { _electron, chromium } = require('playwright')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const cwd = path.resolve(__dirname, '..')
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'boobot-pwa-electron-'))
let electron, browser
async function main() {
  const env = { ...process.env, BOOBOT_E2E_USER_DATA_DIR: path.join(home, 'userData'), BOOBOT_E2E_PWA_PORT: '0' }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  electron = await _electron.launch({ executablePath: require('electron'), args: [path.join(cwd, 'out/main/index.js')], cwd, env, timeout: 60_000 })
  const desktop = await electron.firstWindow()
  const errors = []
  desktop.on('pageerror', error => errors.push(error.message))
  await desktop.waitForFunction(() => !!window.appAPI && !!window.pwaAPI)
  await desktop.waitForFunction(async () => (await window.pwaAPI.status()).running)
  const initial = await desktop.evaluate(() => window.pwaAPI.status())
  assert.ok(initial.running)
  assert.ok(initial.port > 0 && initial.port !== 6780)
  const info = await desktop.evaluate(() => window.pwaAPI.issueCode())
  const base = 'http://127.0.0.1:' + initial.port
  browser = await chromium.launch({ headless: true })
  const web = await browser.newPage({ viewport: { width: 390, height: 844 } })
  web.on('pageerror', error => errors.push(error.message))
  const response = await web.goto(base)
  console.log('[PWA E2E] Status HTTP:', response?.status(), 'Title:', await web.title(), 'Preview:', (await web.locator('body').innerText()).slice(0, 170))
  await web.getByLabel('Código de oito dígitos').fill(info.code)
  await web.getByRole('button', { name: 'Conectar dispositivo' }).click()
  await web.getByText('Continue de onde parou.').waitFor()
  const status = await web.evaluate(async () => (await fetch('/api/status')).json())
  assert.equal(status.paired, true)
  const snapshot = await web.evaluate(async () => (await fetch('/api/rpc', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Boobot-PWA': '1' },
    body: JSON.stringify({ method: 'v9:snapshot', args: [] }),
  })).json())
  assert.ok(Array.isArray(snapshot.result.workspaces), 'Local host snapshot not available from PWA')
  const forbidden = await web.evaluate(async () => (await fetch('/api/rpc', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Boobot-PWA': '1' },
    body: JSON.stringify({ method: 'v9:saveTerminalAccess', args: [true] }),
  })).status)
  assert.equal(forbidden, 403)
  await desktop.evaluate(() => window.pwaAPI.revokeAll())
  const revoked = await web.evaluate(async () => (await fetch('/api/rpc', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Boobot-PWA': '1' },
    body: JSON.stringify({ method: 'v9:snapshot', args: [] }),
  })).status)
  assert.equal(revoked, 401)
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ result: 'PASS', gatewayPort: initial.port, paired: status.paired,
    workspaces: snapshot.result.workspaces.length, forbidden, revoked, errors }, null, 2))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
  .finally(async () => { if (browser) await browser.close(); if (electron) await electron.close() })
