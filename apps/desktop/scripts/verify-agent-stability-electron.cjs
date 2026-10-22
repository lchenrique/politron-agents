// Execute depois de npm run build. Aceites Electron locais com perfil e artefatos em TEMP.
const { _electron } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { DatabaseSync } = require('node:sqlite')
const cwd = path.resolve(__dirname, '..')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'boobot-agent-stability-'))
let app
function record(kind, data) {
  fs.appendFileSync(path.join(root, 'evidence.jsonl'), JSON.stringify({ time: new Date().toISOString(), kind, data }) + '\n')
  console.log(kind, JSON.stringify(data))
}
async function main() {
  const profile = path.join(root, 'userData')
  const env = { ...process.env, BOOBOT_E2E_USER_DATA_DIR: profile }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  app = await _electron.launch({ executablePath: require('electron'), args: [path.join(cwd, 'out/main/index.js')], cwd, env, timeout: 60_000 })
  const page = await app.firstWindow()
  page.on('pageerror', error => record('renderer-error', error.message))
  const dialogs = []
  page.on('dialog', dialog => { dialogs.push(dialog.type()); void dialog.dismiss() })
  await page.waitForFunction(() => !!window.appAPI)
  const fixture = await page.evaluate(async () => {
    const workspace = await window.appAPI.saveWorkspace({ name: 'Aceite estabilidade' })
    const conversation = await window.appAPI.saveConversation({ name: 'Histórico e exclusão', workspaceId: workspace.id, kind: 'direct', agentIds: [] })
    return { workspace, conversation }
  })
  const database = new DatabaseSync(path.join(profile, 'politron-v9.sqlite'))
  const offline = Array.from({ length: 80 }, (_, index) => ({
    id: `stability-history-${index}`, conversationId: fixture.conversation.id, agentId: 'assistant', author: 'Assistente',
    role: 'assistant', text: `Mensagem de histórico ${index}. ${'Conteúdo de teste para medir a altura da mensagem. '.repeat(index % 4)}`,
    status: 'completed', runId: null, createdAt: new Date(Date.now() + index).toISOString(),
  }))
  try {
    database.exec('PRAGMA busy_timeout=5000')
    const insert = database.prepare('INSERT INTO v9_messages(id,conversation_id,data) VALUES(?,?,?)')
    for (const message of offline) insert.run(message.id, message.conversationId, JSON.stringify(message))
  } finally { database.close() }
  await page.reload()
  await page.waitForFunction(() => !!window.appAPI)
  await page.getByRole('button', { name: fixture.conversation.name, exact: true }).click()
  const loadedHistory = await page.evaluate(id => window.appAPI.history(id), fixture.conversation.id)
  record('history-loaded', { conversationId: fixture.conversation.id, count: loadedHistory.length, latestId: loadedHistory.at(-1)?.id, latestText: loadedHistory.at(-1)?.text })
  await page.screenshot({ path: path.join(root, 'history.png') })
  await page.getByText('Mensagem de histórico 79.', { exact: false }).waitFor()
  const scroller = page.locator('[style*="overflow-anchor"]')
  await scroller.waitFor()
  const rows = page.locator('[data-message-id^="stability-history-"]')
  await page.waitForFunction(() => document.querySelectorAll('[data-message-id^="stability-history-"]').length > 5)
  await scroller.evaluate(element => {
    element.scrollTop = Math.min(600, element.scrollHeight / 2)
    element.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
  await page.waitForTimeout(250)
  const anchor = await scroller.evaluate(element => {
    const top = element.getBoundingClientRect().top
    const row = [...element.querySelectorAll('[data-message-id^="stability-history-"]')].find(item => item.getBoundingClientRect().top >= top + 80)
    if (!row) return null
    const items = [...element.querySelectorAll('[data-message-id^="stability-history-"]')]
    const index = items.indexOf(row)
    return { id: row.getAttribute('data-message-id'), above: items[Math.max(0, index - 2)]?.getAttribute('data-message-id') }
  })
  assert.ok(anchor?.id && anchor.above, 'âncora visível e mensagem acima devem estar montadas')
  const beforeGrowth = await page.locator(`[data-message-id="${anchor.id}"]`).evaluate(element => element.getBoundingClientRect().top)
  await page.locator(`[data-message-id="${anchor.above}"]`).evaluate(element => { element.style.minHeight = `${element.getBoundingClientRect().height + 240}px` })
  await page.waitForTimeout(350)
  const afterGrowth = await page.locator(`[data-message-id="${anchor.id}"]`).evaluate(element => element.getBoundingClientRect().top)
  assert.ok(Math.abs(afterGrowth - beforeGrowth) <= 4, `âncora deslocou ${Math.abs(afterGrowth - beforeGrowth)} px após crescimento`)
  const beforeResize = afterGrowth
  await page.setViewportSize({ width: 1100, height: 760 })
  await page.waitForTimeout(350)
  const afterResize = await page.locator(`[data-message-id="${anchor.id}"]`).evaluate(element => element.getBoundingClientRect().top)
  assert.ok(Math.abs(afterResize - beforeResize) <= 4, `âncora deslocou ${Math.abs(afterResize - beforeResize)} px após resize`)
  record('history-anchor', { messageId: anchor.id, growthDelta: afterGrowth - beforeGrowth, resizeDelta: afterResize - beforeResize })

  if (process.env.BOOBOT_RUN_LIVE_APPROVAL === '1') {
    const model = process.env.BOOBOT_LIVE_TOOL_MODEL?.trim()
    assert.ok(model, 'Defina BOOBOT_LIVE_TOOL_MODEL para a aprovação real na UI.')
    const delegation = await page.evaluate(async modelId => {
      const worker = await window.appAPI.saveAgent({ name: 'Worker Stability UI', alias: 'stability-worker', runtime: 'codex', model: modelId, instructions: 'Responda exatamente ACEITE-LIVE. Não use ferramentas.' })
      const chief = await window.appAPI.saveAgent({ name: 'Chief Stability UI', alias: 'stability-chief', role: 'chief', runtime: 'codex', model: modelId, instructions: 'Para cada tarefa do usuário, consulte group_members e use ask_agent mode wait para delegar a @stability-worker. Aguarde e relate a resposta. Não use ferramentas além de ask_agent.' })
      const workspace = await window.appAPI.saveWorkspace({ name: 'Delegação com aprovação UI', defaultAgentIds: [chief.id, worker.id] })
      const conversation = await window.appAPI.saveConversation({ name: 'Aprovação real na interface', workspaceId: workspace.id, kind: 'direct', agentIds: [chief.id], leaderAgentId: chief.id })
      return { worker, chief, workspace, conversation }
    }, model)
    await page.getByRole('button', { name: delegation.conversation.name, exact: true }).click()
    const composerForDelegation = page.getByRole('textbox', { name: 'Message' })
    const livePrompt = 'Use ask_agent mode wait para delegar a tarefa ao agente stability-worker. Peça exatamente ACEITE-LIVE, sem ferramentas, e depois informe o resultado.'
    await composerForDelegation.fill(livePrompt)
    assert.equal(await composerForDelegation.inputValue(), livePrompt)
    assert.equal(await page.getByRole('button', { name: 'Enviar mensagem' }).isEnabled(), true)
    await page.evaluate(({ conversationId, text }) => { void window.appAPI.send(conversationId, text) }, { conversationId: delegation.conversation.id, text: livePrompt })
    const approval = page.getByRole('region', { name: 'Aprovação de ferramenta' }).filter({ hasText: 'Delegação do Chief' })
    await page.waitForFunction(async id => {
      const snapshot = await window.appAPI.snapshot()
      return snapshot.approvals.some(item => item.conversationId === id && item.kind === 'delegation' && item.status === 'pending')
        || snapshot.runs.some(run => run.conversationId === id && ['completed', 'failed', 'interrupted'].includes(run.status))
    }, delegation.conversation.id, { timeout: 120_000 })
    assert.equal(await approval.count(), 1, 'o Chief deve abrir um cartão pendente de delegação na UI')
    await page.screenshot({ path: path.join(root, 'delegation-approval.png') })
    record('delegation-approval-ui', { title: await approval.innerText(), workspaceId: delegation.workspace.id, conversationId: delegation.conversation.id, model })
    await approval.getByRole('button', { name: 'Aprovar', exact: true }).click()
    await page.waitForFunction(async id => {
      const snapshot = await window.appAPI.snapshot()
      return snapshot.runs.some(run => run.conversationId === id && run.agentId && run.status === 'completed')
        && snapshot.approvals.some(item => item.kind === 'delegation' && item.status === 'approved')
    }, delegation.conversation.id, { timeout: 120_000 })
    const result = await page.evaluate(id => window.appAPI.history(id), delegation.conversation.id)
    assert.ok(result.some(message => message.role === 'assistant' && message.text.includes('ACEITE-LIVE')), 'resposta da delegação deve aparecer no chat')
    record('delegation-approved-and-completed', { conversationId: delegation.conversation.id, assistantMessages: result.filter(message => message.role === 'assistant').length })
  } else record('live-delegation-approval', 'skip; defina BOOBOT_RUN_LIVE_APPROVAL=1 para chamar o Codex real')

  await page.getByRole('button', { name: `Ações de ${fixture.workspace.name}` }).click()
  await page.getByRole('menuitem', { name: 'Excluir workspace' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click()
  assert.equal(await page.getByText(fixture.workspace.name, { exact: true }).count(), 1)
  await page.getByRole('button', { name: `Ações de ${fixture.workspace.name}` }).click()
  await page.getByRole('menuitem', { name: 'Excluir workspace' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir' }).click()
  await page.getByRole('textbox', { name: 'Message' }).waitFor()
  const composer = page.getByRole('textbox', { name: 'Message' })
  await composer.fill('O composer continua editável após excluir o workspace.')
  assert.equal(await composer.inputValue(), 'O composer continua editável após excluir o workspace.')
  assert.deepEqual(dialogs, [])
  record('workspace-delete-composer', { cancelledPreservedWorkspace: true, confirmed: true, composerEditable: true, nativeDialogs: dialogs.length })
  await page.screenshot({ path: path.join(root, 'composer-after-delete.png') })
}
main().catch(async error => {
  record('failed', error.stack)
  try {
    const page = await app?.firstWindow()
    if (page) {
      await page.screenshot({ path: path.join(root, 'failure.png') })
      const state = await page.evaluate(async () => {
        const snapshot = await window.appAPI.snapshot()
        const conversationId = new URLSearchParams(location.search).get('conversation')
        const histories = await Promise.all(snapshot.conversations.map(async item => ({ id: item.id, messages: await window.appAPI.history(item.id) })))
        return { notices: [...document.querySelectorAll('[role="status"]')].map(node => node.textContent), textbox: document.querySelector('[aria-label="Message"]')?.value, runs: snapshot.runs.map(run => ({ id: run.id, status: run.status, error: run.error, conversationId: run.conversationId, agentId: run.agentId })), approvals: snapshot.approvals.map(item => ({ kind: item.kind, status: item.status, details: item.details })), conversations: snapshot.conversations.map(item => ({ id: item.id, name: item.name })), histories: histories.map(item => ({ id: item.id, last: item.messages.slice(-2) })), conversationId }
      })
      record('failure-state', state)
    }
  } catch (diagnosticError) { record('diagnostic-failed', String(diagnosticError)) }
  process.exitCode = 1
}).finally(async () => {
  await app?.close().catch(() => undefined)
  console.log('Evidência preservada em:', root)
})
