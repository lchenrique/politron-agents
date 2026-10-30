// Smoke do Electron empacotado, perfil isolado. Nunca altera o perfil pessoal.
const { _electron } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const appRoot = path.resolve(__dirname, '..')
const executablePath = path.join(appRoot, 'dist', 'win-unpacked', 'Boobot.exe')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'boobot-packaged-smoke-'))
// Smoke PocketTTS with the locally installed optional engine, but never mutate
// the actual user's app data. The installer does not bundle this optional binary.
const installedPocket = path.join(process.env.APPDATA || '', 'politron-desktop', 'voice-models', 'pocket-tts', 'bin', 'pocket-tts.exe')
const portablePocket = path.join(profile, 'voice-models', 'pocket-tts', 'bin', 'pocket-tts.exe')
const hasPocket = fs.existsSync(installedPocket)
if (hasPocket) {
  fs.mkdirSync(path.dirname(portablePocket), { recursive: true })
  fs.copyFileSync(installedPocket, portablePocket)
}
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
  // A sidebar lista projetos; a conversa aparece depois de entrar no projeto.
  await page.getByRole('button', { name: /^QA instalador/ }).first().click()
  // O nome acessível da conversa inclui o tempo relativo ("agora").
  await page.getByRole('button', { name: new RegExp('^' + fixture) }).first().click()
  const control = page.getByRole('button', { name: 'Modo planejamento' })
  await control.waitFor({ timeout: 30000 })
  assert.equal(await control.getAttribute('aria-pressed'), 'false')
  await control.click()
  assert.equal(await control.getAttribute('aria-pressed'), 'true')
  await control.click()
  assert.equal(await control.getAttribute('aria-pressed'), 'false')
  const snapshot = await page.evaluate(() => window.appAPI.snapshot())
  assert.ok(Array.isArray(snapshot.workspaces))
  const status = await page.evaluate(() => window.realtimeAPI.status())
  assert.equal(status.settings.ttsEngine, 'piper')
  assert.equal(typeof status.pocketInstalled, 'boolean')
  const pocket = await page.evaluate(() => window.appAPI.pocketVoices())
  assert.ok(pocket.choices.some(voice => voice.id === 'vera'))
  if (hasPocket) {
    assert.equal(status.pocketInstalled, true, 'PocketTTS local precisa ser reconhecido no aplicativo empacotado')
    await page.evaluate(async () => {
      const saved = await window.realtimeAPI.saveSettings({ ttsEngine: 'pocket' })
      if (saved.ttsEngine !== 'pocket') throw new Error('A escolha PocketTTS não foi salva')
      await window.appAPI.setPocketVoice('vera')
    })
    const audio = await page.evaluate(() => window.realtimeAPI.previewPocketVoice())
    assert.ok(audio.length > 1000, 'PocketTTS não produziu áudio')
    assert.equal(Buffer.from(audio).toString('ascii', 0, 4), 'RIFF', 'Prévia PocketTTS inválida')
  }
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({pass:true, packagedExe:executablePath, planModeToggle:true, pocketTtsValidated:hasPocket, errors}, null, 2))
}
run().catch(e => { console.error(e.stack); process.exitCode=1 }).finally(async () => {
  try { await app?.close() } catch {}
  fs.rmSync(profile, {recursive:true,force:true,maxRetries:3,retryDelay:300})
})
