// User-like acceptance through Electron, OpenCode Zen (free) and a disposable workspace.
// Requires explicit opt-in: BOOBOT_LIVE_ZEN_UI=1 node scripts/verify-opencode-zen-ui.cjs
const { _electron } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'boobot-zen-ui-'))
const profile = path.join(root, 'profile')
const workspaceRoot = path.join(root, 'workspace')
const filename = 'zen-ui-acceptance.txt'
const file = path.join(workspaceRoot, filename)
fs.mkdirSync(workspaceRoot)
let app
let failed = false
async function main() {
  assert.equal(process.env.BOOBOT_LIVE_ZEN_UI, '1', 'Exige BOOBOT_LIVE_ZEN_UI=1')
  const env = { ...process.env, BOOBOT_E2E_USER_DATA_DIR: profile }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  const cwd = path.resolve(__dirname, '..')
  app = await _electron.launch({ executablePath: require('electron'), args: [path.join(cwd, 'out/main/index.js')], cwd, env, timeout: 60_000 })
  const page = await app.firstWindow()
  const errors = []
  page.on('pageerror', err => errors.push(err.message))
  await page.waitForFunction(() => !!window.appAPI, undefined, { timeout: 30000 })
  const setup = await page.evaluate(async ({ path: work, model }) => {
    const agent = await window.appAPI.saveAgent({ name: 'Zen Editor UI Smoke', alias: 'zen-editor-ui', runtime: 'opencode',
      model, instructions: 'Use apenas boobot_tools e boobot_call para modificar arquivos.', canWrite: true, computerUse: false, approvalMode: 'ask' })
    const workspace = await window.appAPI.saveWorkspace({ name: 'Workspace descartável Zen UI', path: work,
      permissions: { filesWrite:'inherit', computerUse:'deny', chiefCreateAgents:false, chiefEditAgents:false, chiefManageTeam:false, chiefCreateSessions:false } })
    const conversation = await window.appAPI.saveConversation({ name:'Teste Zen aprovação UI', workspaceId:workspace.id, kind:'direct', agentIds:[agent.id] })
    return { agent:agent.id, workspace:workspace.id, conversation:conversation.id }
  }, { path: workspaceRoot, model: process.env.BOOBOT_ZEN_MODEL || 'opencode/big-pickle' })
  await page.getByRole('button', { name: 'Teste Zen aprovação UI', exact: true }).click()
  const send = page.evaluate(async ({ id, filename }) => {
    try { await window.appAPI.send(id,
      'Use a ferramenta boobot_call para chamar workspace_write com path '+filename+' e content ZEN_UI_OK. Aguarde aprovação antes de dizer que concluiu. Não use ferramentas nativas do OpenCode.')
      return { ok:true }
    } catch (error) { return { ok:false, error:String(error) } }
  }, { id: setup.conversation, filename })
  const region = page.getByRole('region', { name: 'Aprovação de ferramenta' }).filter({ hasText: filename })
  // Wait for the actual actionable card, not a polled database state that can
  // transition between two Playwright roundtrips.
  await region.getByRole('button', { name: 'Aprovar', exact: true }).waitFor({ timeout: 165000 })
  assert.equal(fs.existsSync(file), false, 'Não pode escrever antes de obter a aprovação')
  const pending = await page.evaluate(async id => {
    const snap = await window.appAPI.snapshot()
    return snap.approvals.find(value => value.conversationId === id && value.status === 'pending' && value.kind === 'write')
  }, setup.conversation)
  assert.ok(pending?.id, 'Cartão de aprovação visual sem aprovação pendente no backend')
  await region.getByRole('button', { name: 'Aprovar', exact: true }).click()
  await send
  assert.equal(fs.readFileSync(file, 'utf8'), 'ZEN_UI_OK')
  const history = await page.evaluate(id => window.appAPI.history(id), setup.conversation)
  const run = await page.evaluate(async id => {
    const snap=await window.appAPI.snapshot()
    return {runs:snap.runs.filter(value => value.conversationId === id).map(value => value.status),
      approvals:snap.approvals.filter(value => value.conversationId === id).map(value => value.status)}
  }, setup.conversation)
  assert.ok(run.runs.includes('completed'), 'Agente não concluiu a execução.')
  assert.ok(run.approvals.includes('approved'), 'A aprovação não foi persistida.')
  assert.equal(errors.length, 0, 'Renderer apresentou erros: ' + errors.join('; '))
  console.log(JSON.stringify({ success:true, file:filename, content:'ZEN_UI_OK', setup, run,
    messages:history.filter(m=>m.role==='assistant').map(m=>m.text.slice(-300)), errors }, null, 2))
}
main().catch(async error => {
  failed = true
  console.error('E2E ZEN UI FALHOU', error.stack)
  if (app) {
    try {
      const page=await app.firstWindow()
      await page.screenshot({path:path.join(root,'failure.png')})
      console.error('Screenshot:',path.join(root,'failure.png'))
    } catch {}
  }
  process.exitCode=1
}).finally(async () => {
  try { await app?.close() } catch {}
  await new Promise(resolve => setTimeout(resolve, 1500))
  if (!failed) try { fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:200}) } catch {}
})
