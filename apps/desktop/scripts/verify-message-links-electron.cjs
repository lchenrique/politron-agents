// QA E2E dos links das mensagens: editor de arquivo, Navegador da plataforma, Ctrl+clique e bloqueios.
// Uso: node scripts/verify-message-links-electron.cjs [pasta-do-build]  (padrão: out). Perfil, fixture e HTTP em TEMP.
// Modo dev: node scripts/verify-message-links-electron.cjs --dev  (main/preload de desenvolvimento em .qa-dev-out e
// servidor Vite próprio do renderer, com porta livre e cache separados; não toca no `npm run dev` em execução).
// shell.openExternal é substituído no processo principal por um registro: a janela do navegador padrão não é observada.
const { _electron } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const os = require('node:os')
const { DatabaseSync } = require('node:sqlite')
const cwd = path.resolve(__dirname, '..')
const dev = process.argv.includes('--dev')
const build = path.resolve(cwd, process.argv.slice(2).find(arg => !arg.startsWith('--')) || (dev ? '.qa-dev-out' : 'out'))
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'boobot-message-links-'))
const results = []
let app, server, page, rendererServer

/** Igual ao `electron-vite dev`, sem abrir o Electron: compila main/preload em modo development e serve o renderer pelo Vite. */
async function startDevRenderer() {
  process.env.NODE_ENV_ELECTRON_VITE = 'development'
  const { resolveConfig } = await import('electron-vite')
  const vite = await import('vite')
  const { config } = await resolveConfig({ root: cwd, build: { outDir: build }, cacheDir: path.join(build, 'vite-cache'), logLevel: 'warn' }, 'serve', 'development')
  await vite.build(config.main)
  await vite.build(config.preload)
  // Porta própria (o dev do usuário costuma ocupar 5173); a URL usada vem da porta realmente aberta.
  rendererServer = await vite.createServer(vite.mergeConfig(config.renderer, { server: { port: 5290, strictPort: false, host: '127.0.0.1' } }))
  await rendererServer.listen()
  return `http://127.0.0.1:${rendererServer.httpServer.address().port}`
}
function record(kind, data) {
  fs.appendFileSync(path.join(root, 'evidence.jsonl'), JSON.stringify({ time: new Date().toISOString(), kind, data }) + '\n')
  console.log(kind, JSON.stringify(data))
}
async function step(name, run) {
  try { const evidence = await run(); results.push({ name, status: 'PASS' }); record('PASS ' + name, evidence) }
  catch (error) {
    results.push({ name, status: 'FAIL' })
    await page?.screenshot({ path: path.join(root, 'falha-' + name.split(' ')[0] + '.png') }).catch(() => undefined)
    record('FAIL ' + name, { error: error.message.split('\n')[0] })
  }
}
async function waitUntil(check, label, timeout = 15_000) {
  const deadline = Date.now() + timeout
  let last
  while (Date.now() < deadline) { last = await check(); if (last) return last; await new Promise(resolve => setTimeout(resolve, 100)) }
  throw new Error('Não observado em ' + timeout + ' ms: ' + label)
}

async function main() {
  const pages = { '/': '<title>Fixture A</title><h1>MARCADOR-FIXTURE-A</h1>', '/b': '<title>Fixture B</title><h1>MARCADOR-FIXTURE-B</h1>' }
  const requests = []
  server = http.createServer((request, response) => {
    requests.push(request.url)
    const body = pages[request.url]
    response.writeHead(body ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' }).end(body || 'nao encontrado')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}/`
  const urlA = base, urlB = base + 'b'
  const closed = http.createServer(); await new Promise(resolve => closed.listen(0, '127.0.0.1', resolve))
  const closedUrl = `http://127.0.0.1:${closed.address().port}/`; await new Promise(resolve => closed.close(resolve))

  const workspaceDir = path.join(root, 'workspace'); fs.mkdirSync(workspaceDir)
  fs.writeFileSync(path.join(workspaceDir, 'README.md'), '# Fixture\n\nMARCADOR-README-7F3A\n')
  fs.writeFileSync(path.join(root, 'secret.txt'), 'SEGREDO-FORA-DO-WORKSPACE')

  const profile = path.join(root, 'userData')
  const env = { ...process.env, BOOBOT_E2E_USER_DATA_DIR: profile }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  if (dev) env.ELECTRON_RENDERER_URL = await startDevRenderer()
  const bootstrap = path.join(root, 'bootstrap.cjs')
  fs.writeFileSync(bootstrap, `const{app}=require('electron');app.setPath('appData',${JSON.stringify(path.join(root, 'appData'))});require(${JSON.stringify(path.join(build, 'main/index.js'))});`)
  app = await _electron.launch({ executablePath: require('electron'), args: [bootstrap], cwd, env, timeout: 60_000 })
  page = await app.firstWindow()
  page.on('pageerror', error => record('renderer-error', error.message))
  page.on('dialog', dialog => { record('dialog', dialog.type()); void dialog.dismiss() })
  await page.waitForFunction(() => !!window.appAPI && !!window.platformBrowserAPI, undefined, { timeout: 120_000 })

  // Registro de chamadas ao navegador do sistema; nada é aberto de verdade.
  await app.evaluate(({ shell }) => { globalThis.__external = []; shell.openExternal = async url => { globalThis.__external.push(url) } })
  const external = () => app.evaluate(() => globalThis.__external.slice())
  const browserView = () => app.evaluate(async ({ BrowserWindow, session }) => {
    const target = session.fromPartition('persist:boobot-platform-browser')
    const window = BrowserWindow.getAllWindows().find(item => !item.isDestroyed() && item.contentView.children.some(child => child.webContents?.session === target))
    const view = window?.contentView.children.find(child => child.webContents?.session === target)
    if (!view || view.webContents.isDestroyed()) return null
    const text = view.webContents.isLoading() ? '' : await view.webContents.executeJavaScript('document.body ? document.body.innerText : ""').catch(() => '')
    return { url: view.webContents.getURL(), text, visible: view.getVisible(), bounds: view.getBounds(), history: view.webContents.navigationHistory.length(), windows: BrowserWindow.getAllWindows().length }
  })
  const windowCount = () => app.evaluate(({ BrowserWindow, webContents }) => ({ windows: BrowserWindow.getAllWindows().length, contents: webContents.getAllWebContents().length }))
  const address = () => page.getByLabel('Endereço', { exact: true }).inputValue()
  const tabs = () => page.locator('[aria-label^="Aba "]').evaluateAll(items => items.map(item => item.getAttribute('aria-label')))

  const fixture = await page.evaluate(async dir => {
    const workspace = await window.appAPI.saveWorkspace({ name: 'QA links', path: dir })
    const conversation = await window.appAPI.saveConversation({ name: 'QA links conversa', workspaceId: workspace.id, kind: 'direct', agentIds: [] })
    const loose = await window.appAPI.saveWorkspace({ name: 'QA sem pasta' })
    const noFolder = await window.appAPI.saveConversation({ name: 'QA links sem pasta', workspaceId: loose.id, kind: 'direct', agentIds: [] })
    return { workspace, conversation, noFolder }
  }, workspaceDir)
  const text = [
    `[README](README.md)`, `[Local A](${urlA})`, `[Local B](${urlB})`, `[Local fechado](${closedUrl})`,
    `[JS](javascript:alert(1))`, `[Arquivo file](file:///C:/Windows/win.ini)`, `[Traversal](../secret.txt)`,
    `[Traversal codificado](..%2Fsecret.txt)`, `[Absoluto Windows](C:/Windows/win.ini)`, `[Absoluto barra](/etc/passwd)`,
  ].join('\n\n')
  const database = new DatabaseSync(path.join(profile, 'politron-v9.sqlite'))
  try {
    database.exec('PRAGMA busy_timeout=5000')
    const insert = database.prepare('INSERT INTO v9_messages(id,conversation_id,data) VALUES(?,?,?)')
    const message = (id, conversationId, body) => insert.run(id, conversationId, JSON.stringify({ id, conversationId, agentId: 'assistant', author: 'Assistente', role: 'assistant', text: body, status: 'completed', runId: null, createdAt: new Date().toISOString() }))
    message('qa-links', fixture.conversation.id, text)
    message('qa-links-sem-pasta', fixture.noFolder.id, '[README sem pasta](README.md)')
  } finally { database.close() }
  await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].webContents.on('render-process-gone', (_event, details) => { globalThis.__gone = details }) })
  try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 }) } catch (error) { record('reload-gone', await app.evaluate(() => globalThis.__gone || null)); throw error }
  await page.waitForFunction(() => !!window.appAPI && !!window.platformBrowserAPI, undefined, { timeout: 120_000 })
  // Sidebar v2: a conversa só aparece depois de entrar no projeto dela.
  const openConversation = async (workspaceName, conversationName) => {
    const back = page.getByRole('button', { name: 'Voltar aos projetos', exact: true })
    if (await back.count()) await back.click()
    await page.getByRole('button', { name: new RegExp('^' + workspaceName) }).first().click()
    await page.getByRole('button', { name: new RegExp('^' + conversationName) }).first().click()
  }
  await openConversation(fixture.workspace.name, fixture.conversation.name)
  const link = name => page.locator('[data-message-id="qa-links"] a', { hasText: new RegExp('^' + name + '$') })
  // Abrir arquivo ativa a aba do editor na área do chat; volta ao chat antes de cada clique.
  const showChat = async () => { const chat = page.locator('[aria-label="Aba Assistente"]'); if (await chat.count()) await chat.first().click() }
  await link('README').waitFor()
  const appUrl = page.url()
  record('fixture', { root, base, workspaceDir, build, dev, appUrl, hrefs: await page.locator('[data-message-id="qa-links"] a').evaluateAll(items => items.map(item => [item.textContent, item.getAttribute('href')])) })

  await step('1 link relativo README.md abre no editor', async () => {
    await link('README').click()
    await page.locator('[aria-label="Aba README.md"]').waitFor({ timeout: 10_000 })
    await waitUntil(() => page.locator('.monaco-editor .view-lines').evaluateAll(items => items.some(item => item.textContent.includes('MARCADOR-README-7F3A'))), 'conteúdo do README no Monaco')
    const title = await page.locator('[aria-label="Aba README.md"]').getAttribute('title')
    assert.equal(title, 'README.md')
    await page.screenshot({ path: path.join(root, '1-readme.png') })
    return { tab: 'Aba README.md', title, marker: 'MARCADOR-README-7F3A', tabs: await tabs() }
  })

  await step('2 clique normal em HTTP local abre o Navegador interno', async () => {
    const before = requests.length
    await showChat()
    await link('Local A').click()
    await page.locator('[aria-label="Aba Navegador"]').waitFor({ timeout: 10_000 })
    const view = await waitUntil(async () => { const value = await browserView(); return value?.text.includes('MARCADOR-FIXTURE-A') && value }, 'página A carregada')
    const shown = await waitUntil(async () => (await address()) === urlA && await address(), 'URL canônica na barra')
    const visible = await waitUntil(async () => { const value = await browserView(); return value.visible && value.bounds.width > 0 && value.bounds.height > 0 && value }, 'view visível com área')
    const calls = await external()
    assert.deepEqual(calls, [])
    const image = await app.evaluate(async ({ BrowserWindow, session }) => {
      const target = session.fromPartition('persist:boobot-platform-browser')
      const view = BrowserWindow.getAllWindows()[0].contentView.children.find(child => child.webContents?.session === target)
      return (await view.webContents.capturePage()).toPNG().toString('base64')
    })
    fs.writeFileSync(path.join(root, '2-view.png'), Buffer.from(image, 'base64'))
    await page.screenshot({ path: path.join(root, '2-shell.png') })
    return { address: shown, viewUrl: view.url, visible: visible.visible, bounds: visible.bounds, requests: requests.slice(before), openExternal: calls }
  })

  await step('2b servidor fora do ar mostra a URL tentada e o erro', async () => {
    await showChat()
    await link('Local fechado').click()
    const alert = await page.getByRole('alert').filter({ hasText: /ERR_CONNECTION_REFUSED|Falha/ }).first().textContent({ timeout: 10_000 })
    const shown = await waitUntil(async () => (await address()) === closedUrl && await address(), 'URL tentada na barra')
    assert.deepEqual(await external(), [])
    return { address: shown, alert, view: await browserView() }
  })

  await step('3 Ctrl+clique chama shell.openExternal com a URL exata e não navega o painel', async () => {
    await showChat()
    await link('Local B').click()
    await waitUntil(async () => (await browserView())?.text.includes('MARCADOR-FIXTURE-B'), 'painel em B antes do Ctrl+clique')
    const before = await browserView(), requestsBefore = requests.length
    await link('Local A').click({ modifiers: ['Control'] })
    const calls = await waitUntil(async () => { const value = await external(); return value.length && value }, 'openExternal chamado')
    await page.waitForTimeout(800)
    const after = await browserView()
    assert.deepEqual(calls, [urlA])
    assert.equal(after.url, urlB); assert.equal(after.history, before.history); assert.equal(await address(), urlB)
    assert.deepEqual(requests.slice(requestsBefore), [])
    return { openExternal: calls, panelUrlBefore: before.url, panelUrlAfter: after.url, historyBefore: before.history, historyAfter: after.history, newRequests: [] }
  })

  await step('4 javascript:, file:, traversal, absolutos e arquivo sem pasta são bloqueados', async () => {
    const evidence = []
    await showChat()
    for (const name of ['JS', 'Arquivo file', 'Traversal', 'Traversal codificado', 'Absoluto Windows', 'Absoluto barra']) {
      const tabsBefore = await tabs(), externalBefore = (await external()).length, viewBefore = await browserView(), countBefore = await windowCount(), requestsBefore = requests.length
      const href = await link(name).getAttribute('href')
      await link(name).click()
      const notice = await page.getByRole('status').filter({ hasText: 'Link não aberto' }).first().textContent({ timeout: 5_000 })
      await page.waitForTimeout(300)
      const viewAfter = await browserView()
      assert.deepEqual(await tabs(), tabsBefore, name + ': abas mudaram')
      assert.equal((await external()).length, externalBefore, name + ': openExternal chamado')
      assert.equal(viewAfter.url, viewBefore.url, name + ': painel navegou'); assert.equal(viewAfter.history, viewBefore.history)
      assert.deepEqual(await windowCount(), countBefore, name + ': janela/webContents nova')
      assert.equal(requests.length, requestsBefore)
      assert.equal(page.url(), appUrl, name + ': janela do app navegou'); assert.ok(!page.url().includes('secret') && !page.url().includes('win.ini'))
      evidence.push({ name, href, notice })
    }
    await openConversation('QA sem pasta', fixture.noFolder.name)
    await showChat()
    const tabsBefore = await tabs(), externalBefore = (await external()).length
    await page.locator('[data-message-id="qa-links-sem-pasta"] a').click()
    const notice = await page.getByRole('status').filter({ hasText: 'não tem pasta de projeto' }).first().textContent({ timeout: 5_000 })
    assert.deepEqual(await tabs(), tabsBefore); assert.equal((await external()).length, externalBefore)
    evidence.push({ name: 'README sem pasta', href: 'README.md', notice })
    await openConversation(fixture.workspace.name, fixture.conversation.name)
    await showChat()
    await link('README').waitFor()
    return evidence
  })

  await step('5 fechar e reabrir o Navegador não reaproveita URL nem estado', async () => {
    await page.locator('[aria-label="Aba Navegador"]').hover()
    await page.getByRole('button', { name: 'Fechar Navegador', exact: true }).click()
    await waitUntil(async () => (await page.locator('[aria-label="Aba Navegador"]').count()) === 0, 'aba fechada')
    const closed = await waitUntil(async () => (await browserView()) === null ? 'sem view' : null, 'view removida')
    const stateAfterClose = await page.evaluate(() => window.platformBrowserAPI.state())
    assert.equal(stateAfterClose, null)
    // Reabrir vazio pela aba nova: sem URL nem página antigas.
    await page.getByRole('button', { name: 'Nova aba', exact: true }).first().click()
    await page.getByRole('menuitem', { name: 'Navegador', exact: true }).click()
    await page.getByText('Digite um endereço ou clique num link da conversa.').waitFor({ timeout: 10_000 })
    const emptyAddress = await address()
    assert.equal(emptyAddress, ''); assert.equal(await browserView(), null)
    // Com o painel vazio já montado, um link deve mostrar somente B, sem histórico anterior.
    await showChat()
    await link('Local B').click()
    const reopened = await waitUntil(async () => { const value = await browserView(); return value?.text.includes('MARCADOR-FIXTURE-B') && value }, 'B após reabrir')
    await waitUntil(async () => (await address()) === urlB, 'barra com B após reabrir')
    assert.equal(reopened.history, 1, 'histórico antigo reaproveitado')
    const back = await page.getByRole('button', { name: 'Voltar', exact: true }).isDisabled()
    assert.equal(back, true)
    // Fechar de novo e reabrir por link: somente A.
    await page.locator('[aria-label="Aba Navegador"]').hover()
    await page.getByRole('button', { name: 'Fechar Navegador', exact: true }).click()
    await waitUntil(async () => (await browserView()) === null, 'view removida de novo')
    await showChat()
    await link('Local A').click()
    const again = await waitUntil(async () => { const value = await browserView(); return value?.text.includes('MARCADOR-FIXTURE-A') && value }, 'A após reabrir')
    await waitUntil(async () => (await address()) === urlA, 'barra com A após reabrir')
    assert.equal(again.history, 1)
    assert.deepEqual(await external(), [urlA])
    return { closed, stateAfterClose, emptyAddress, reopenedB: { url: reopened.url, history: reopened.history, backDisabled: back }, reopenedA: { url: again.url, address: await address(), history: again.history } }
  })

  // Último passo: altera o main. Simula o Electron dev com processo principal anterior ao navegador (sem handlers).
  await step('6 main sem handler do navegador mostra aviso de processo desatualizado', async () => {
    await page.locator('[aria-label="Aba Navegador"]').hover()
    await page.getByRole('button', { name: 'Fechar Navegador', exact: true }).click()
    await app.evaluate(({ ipcMain }) => { for (const name of ['navigate', 'state']) ipcMain.removeHandler('platformBrowser:' + name) })
    await showChat()
    await link('Local B').click()
    const notice = await page.getByRole('status').filter({ hasText: 'processo principal do Boobot está desatualizado' }).first().textContent({ timeout: 10_000 })
    assert.equal(await address(), '')
    return { notice }
  })
}

main().catch(error => { record('harness-error', { error: error.stack || error.message }); process.exitCode = 1 }).finally(async () => {
  console.log('\nRESUMO', JSON.stringify(results))
  if (results.some(item => item.status === 'FAIL') || results.length < 7) process.exitCode = 1
  await app?.close().catch(() => undefined)
  server?.close()
  await rendererServer?.close()
  if (dev && !process.argv.slice(2).some(arg => !arg.startsWith('--'))) fs.rmSync(build, { recursive: true, force: true })
  if (process.env.BOOBOT_KEEP_QA_ARTIFACTS === '1') console.log('Artefatos em', root)
  else fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
})
