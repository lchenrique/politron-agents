// Execute depois de npm run build. Usa dois perfis descartáveis e somente loopback.
const { _electron } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { DatabaseSync } = require('node:sqlite')
const cwd = path.resolve(__dirname, '..')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'boobot-hosts-electron-'))
const apps = []
function log(kind, data) {
  fs.appendFileSync(path.join(root, 'evidence.jsonl'), JSON.stringify({ time: new Date().toISOString(), kind, data }) + '\n')
  console.log(kind, JSON.stringify(data))
}
async function waitUntil(check) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    try { if (await check()) return } catch (error) { if (!/Execution context was destroyed|Cannot find context/.test(error.message)) throw error }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('O estado esperado não foi observado em 20 segundos.')
}
async function open(name) {
  const profile = path.join(root, name); fs.mkdirSync(profile)
  const bootstrap = path.join(root, name + '.cjs')
  fs.writeFileSync(bootstrap, `const{app}=require('electron');app.setPath('appData',${JSON.stringify(profile)});require(${JSON.stringify(path.join(cwd,'out/main/index.js'))});`)
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
  const packaged = name === 'client' && process.env.BOOBOT_TEST_PACKAGED_CLIENT === '1'
  const userData = path.join(profile, 'userData')
  env.BOOBOT_E2E_USER_DATA_DIR = userData
  const executablePath = packaged ? path.join(cwd, 'dist', 'win-unpacked', 'Boobot.exe') : require('electron')
  const app = await _electron.launch({ executablePath, args: packaged ? [] : [bootstrap], cwd, env, timeout: 60_000 })
  apps.push(app)
  const page = await app.firstWindow()
  page.on('pageerror', error => log('renderer-error', error.message))
  await page.waitForFunction(() => !!window.hostsAPI && !!window.appAPI)
  return { app, page, userData }
}
async function main() {
  const host = await open('host'), client = await open('client')
  await client.page.getByRole('button', { name: 'Configurações', exact: true }).click()
  await client.page.getByRole('button', { name: 'Voz em tempo real', exact: true }).click()
  await client.page.getByLabel('Chave do Gemini Live').waitFor()
  assert.equal(await client.page.getByRole('dialog').count(), 1)
  await client.page.screenshot({ path: path.join(root,'voice-settings.png') })
  await client.page.getByRole('button', { name: 'Conexões', exact: true }).click()
  await client.page.getByLabel('Permitir conexão a este computador').waitFor()
  await client.page.getByRole('button', { name: 'Fechar', exact: true }).click()
  log('central-settings', true)
  const settings = await host.page.evaluate(async () => {
    const state = await window.hostsAPI.snapshot()
    const next = await window.hostsAPI.configure({ ...state.local, enabled: true, port: 0 })
    return window.hostsAPI.configure({ ...next.local, advertisedUrl: `ws://127.0.0.1:${next.local.port}/boobot` })
  })
  assert.equal(settings.local.running, true)
  let pairing
  const originalClipboard = await host.app.evaluate(({ clipboard }) => clipboard.readText())
  try { await host.page.evaluate(() => window.hostsAPI.copyPairing()); pairing = await host.app.evaluate(({ clipboard }) => clipboard.readText()) }
  finally { await host.app.evaluate(({ clipboard }, text) => clipboard.writeText(text), originalClipboard) }
  const fixture = path.join(root, 'host-project'); fs.mkdirSync(fixture); fs.writeFileSync(path.join(fixture,'remote.txt'), 'original')
  const project = await host.page.evaluate(path => window.appAPI.saveWorkspace({ name: 'Projeto de teste do host', path }), fixture)
  const chat = await host.page.evaluate(async () => {
    const workspace = await window.appAPI.saveWorkspace({ name: 'Recuperação offline' })
    const conversation = await window.appAPI.saveConversation({ name: 'Mensagens durante a queda', workspaceId: workspace.id, kind: 'direct', agentIds: [] })
    return { workspace, conversation }
  })
  await client.page.getByRole('button', { name: 'Selecionar host', exact: true }).click()
  await client.page.getByRole('menuitem', { name: 'Adicionar host', exact: true }).click()
  await client.page.getByLabel('Link de pareamento').fill(pairing)
  await client.page.getByLabel('Nome (opcional)', { exact: true }).fill('Host descartável')
  await client.page.getByRole('button', { name: 'Conectar', exact: true }).click()
  await client.page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 20_000 })
  await waitUntil(() => client.page.evaluate(async () => { const state = await window.hostsAPI.snapshot(); return state.selectedId !== 'local' && state.hosts.some(host => host.id === state.selectedId && host.status === 'connected') }))
  await client.page.getByRole('button', { name: 'Mensagens durante a queda', exact: true }).click()
  await client.page.getByText('Projeto de teste do host', { exact: true }).first().waitFor()
  await client.page.evaluate(async id => { const file = await window.appAPI.readProjectFile(id,'remote.txt'); await window.appAPI.writeProjectFile(id,'remote.txt','ESCRITA-REMOTA-OK',file.hash) }, project.id)
  assert.equal(fs.readFileSync(path.join(fixture,'remote.txt'),'utf8'), 'ESCRITA-REMOTA-OK')
  log('remote-write', { project: project.id, path: fixture })
  await client.page.screenshot({ path: path.join(root,'connected.png') })
  await host.page.evaluate(async () => { const state = await window.hostsAPI.snapshot(); await window.hostsAPI.configure({ ...state.local, enabled: false }) })
  await waitUntil(() => client.page.evaluate(async () => { const state = await window.hostsAPI.snapshot(); return state.hosts.find(host => host.id === state.selectedId).status !== 'connected' }))
  const refused = await client.page.evaluate(async () => { try { await window.appAPI.saveConversation({ name: 'NÃO CRIAR LOCALMENTE' }); return false } catch (error) { return error.message.includes('Host desconectado') } })
  assert.equal(refused, true); log('offline-blocked', true)
  const offlineText = 'Mensagem concluída no host enquanto o cliente estava desconectado.'
  const database = new DatabaseSync(path.join(host.userData, 'politron-v9.sqlite'))
  try {
    database.exec('PRAGMA busy_timeout=5000')
    const message = { id: 'electron-offline-recovery-message', conversationId: chat.conversation.id, agentId: 'assistant', author: 'Assistente', role: 'assistant', text: offlineText, status: 'completed', runId: null, createdAt: new Date().toISOString() }
    database.prepare('INSERT INTO v9_messages(id,conversation_id,data) VALUES(?,?,?)').run(message.id, message.conversationId, JSON.stringify(message))
  } finally { database.close() }
  await host.page.evaluate(async () => { const state = await window.hostsAPI.snapshot(); await window.hostsAPI.configure({ ...state.local, enabled: true }) })
  await waitUntil(() => client.page.evaluate(async () => { const state = await window.hostsAPI.snapshot(); return state.hosts.find(host => host.id === state.selectedId).status === 'connected' }))
  assert.equal((await client.page.evaluate(() => window.appAPI.snapshot())).workspaces.some(workspace => workspace.id === project.id), true)
  await client.page.getByText(offlineText, { exact: true }).waitFor({ timeout: 20_000 })
  const recoveredCount = new DatabaseSync(path.join(host.userData, 'politron-v9.sqlite'))
  try { assert.equal(recoveredCount.prepare('SELECT COUNT(*) AS count FROM v9_messages WHERE id=?').get('electron-offline-recovery-message').count, 1) }
  finally { recoveredCount.close() }
  log('offline-message-recovered-once', { conversationId: chat.conversation.id, text: offlineText })
  log('reconnected', true)
  await client.page.getByRole('button', { name: 'Selecionar host', exact: true }).click()
  await Promise.all([client.page.waitForEvent('load'), client.page.getByRole('menuitem').filter({ hasText: 'Este computador' }).click()])
  await waitUntil(() => client.page.evaluate(async () => (await window.hostsAPI.snapshot()).selectedId === 'local'))
  const local = await client.page.evaluate(() => window.appAPI.snapshot())
  assert.equal(local.workspaces.some(workspace => workspace.id === project.id), false)
  assert.equal(local.conversations.some(conversation => conversation.name === 'NÃO CRIAR LOCALMENTE'), false)
  log('local-state-separated', true)
}
main().catch(error => { log('failed', error.stack); process.exitCode = 1 }).finally(async () => {
  for (const app of apps.reverse()) await app.close().catch(() => undefined)
  console.log('Evidência preservada em:', root)
})
