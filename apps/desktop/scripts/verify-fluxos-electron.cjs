// E2E dos fluxos principais do Boobot num perfil descartável (não toca no perfil do usuário).
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const cwd = 'D:\\projetos pessoais\\politron\\apps\\desktop'
const { _electron } = require(path.join(cwd, 'node_modules', 'playwright'))

const root = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'boobot-e2e3-'))
fs.mkdirSync(root, { recursive: true })
const build = path.join(cwd, 'out')
const workspaceDir = path.join(root, 'projeto-fixture')
fs.mkdirSync(workspaceDir, { recursive: true })
fs.writeFileSync(path.join(workspaceDir, 'README.md'), '# Fixture E2E\n\nMARCADOR-README-E2E\n')

const results = []
const clean = (s) => (s || '').replace(/\s+/g, ' ').trim()
const log = (kind, data) => {
  fs.appendFileSync(path.join(root, 'evidencia.jsonl'), JSON.stringify({ at: new Date().toISOString(), kind, data }) + '\n')
  console.log(kind, JSON.stringify(data))
}

let app, page, consoleErrors = []

async function launch() {
  const bootstrap = path.join(root, 'bootstrap.cjs')
  if (!fs.existsSync(bootstrap)) fs.writeFileSync(bootstrap, `const{app}=require('electron');app.setPath('appData',${JSON.stringify(path.join(root, 'appData'))});require(${JSON.stringify(path.join(build, 'main/index.js'))});`)
  const env = { ...process.env, BOOBOT_E2E_USER_DATA_DIR: path.join(root, 'userData') }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  app = await _electron.launch({ executablePath: require(path.join(cwd, 'node_modules', 'electron')), args: [bootstrap], cwd, env, timeout: 90_000 })
  page = await app.firstWindow()
  consoleErrors = []
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push('console: ' + message.text().slice(0, 160)) })
  await page.waitForFunction(() => !!window.appAPI, undefined, { timeout: 120_000 })
  await page.waitForTimeout(1500)
  await app.evaluate(({ dialog }, dir) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] }) }, workspaceDir)
}

const snapshot = () => page.evaluate(() => window.appAPI.snapshot())
const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
const shot = (name) => page.screenshot({ path: path.join(root, name + '.png') })
const novoToolbar = () => page.getByRole('button', { name: 'Criar nova pasta de workspace' })

async function closeOverlays() {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (!(await page.getByRole('dialog').count())) return
    await page.keyboard.press('Escape')
    await page.waitForTimeout(220)
    if (!(await page.getByRole('dialog').count())) return
    const close = page.getByRole('dialog').first().getByRole('button', { name: 'Fechar' })
    if (await close.count()) await close.first().click({ force: true }).catch(() => {})
    await page.waitForTimeout(220)
  }
}

async function step(name, run) {
  await closeOverlays()
  const started = Date.now()
  try {
    const evidence = await run()
    results.push({ name, status: 'PASS' })
    log('PASS', { name, ms: Date.now() - started, evidence })
  } catch (error) {
    results.push({ name, status: 'FAIL', error: clean(error.message).slice(0, 240) })
    log('FAIL', { name, error: clean(error.stack || error.message).slice(0, 480) })
    await shot(`falha-${results.length}`).catch(() => {})
  }
  await closeOverlays()
}

async function waitUntil(check, label, timeout = 15_000) {
  const deadline = Date.now() + timeout
  let last
  while (Date.now() < deadline) {
    last = await check()
    if (last) return last
    await page.waitForTimeout(150)
  }
  throw new Error(`não observado em ${timeout} ms: ${label}`)
}

async function main() {
  await launch()

  await step('01 boot limpo sem erro de renderer', async () => {
    const body = await text()
    if (!body.includes('Seu espaço de trabalho')) throw new Error('estado vazio não apareceu: ' + body.slice(0, 140))
    if (consoleErrors.length) throw new Error('erros no renderer: ' + consoleErrors.slice(0, 3).join(' | '))
    await shot('01-boot')
    return { titulo: await page.title() }
  })

  await step('02 criar projeto pelo modal com seletor de pasta', async () => {
    await page.getByRole('button', { name: 'Novo projeto' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor({ timeout: 10_000 })
    await dialog.getByPlaceholder('Ex: billing-service').fill('Fixture')
    await dialog.getByRole('button', { name: 'Escolher' }).click()
    const pathField = dialog.getByPlaceholder('~/projetos/billing-service')
    await waitUntil(async () => clean(await pathField.inputValue()).length > 0, 'caminho preenchido pelo seletor', 12_000)
    await dialog.getByRole('button', { name: /Salvar Workspace|Abrir projeto|Criar projeto/ }).click()
    await waitUntil(async () => !(await page.getByRole('dialog').count()), 'modal fechou depois de salvar', 12_000)
    const created = (await snapshot()).workspaces.find((w) => w.name === 'Fixture')
    if (!created) throw new Error('workspace não entrou no snapshot')
    await shot('02-projeto-criado')
    return { caminho: created.path }
  })

  await step('03 Esc fecha o modal de projeto', async () => {
    await novoToolbar().click()
    await page.getByRole('dialog').waitFor({ timeout: 10_000 })
    await page.keyboard.press('Escape')
    await waitUntil(async () => !(await page.getByRole('dialog').count()), 'modal fechou com Esc', 5_000)
    return { fechouComEsc: true }
  })

  await step('04 criar Boo pelo modal rápido do sidebar', async () => {
    await page.getByRole('button', { name: 'Boo', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor({ timeout: 10_000 })
    await dialog.getByPlaceholder('Ex: Orion').fill('Bia')
    await dialog.getByPlaceholder('Ex: DevOps & Containers').fill('Testes E2E')
    await dialog.getByPlaceholder(/Como este Boo deve atuar/).fill('Você revisa código e aponta riscos de teste.')
    await dialog.getByRole('button', { name: 'Violeta' }).click()
    await shot('04-form-boo')
    await dialog.getByRole('button', { name: 'Criar Boo' }).click()
    await waitUntil(async () => !(await page.getByRole('dialog').count()), 'modal do Boo fechou', 12_000)
    const boo = (await snapshot()).agents.find((a) => a.name === 'Bia')
    if (!boo) throw new Error('Boo não foi criado')
    await waitUntil(async () => (await text()).includes('Bia'), 'Boo apareceu no sidebar')
    await shot('04-boo-criado')
    return { boo: { alias: boo.alias, color: boo.color, runtime: boo.runtime } }
  })

  await step('05 Esc fecha o modal rápido de Boo', async () => {
    await page.getByRole('button', { name: 'Boo', exact: true }).click()
    await page.getByRole('dialog').waitFor({ timeout: 10_000 })
    await page.keyboard.press('Escape')
    await waitUntil(async () => !(await page.getByRole('dialog').count()), 'modal do Boo fechou com Esc', 5_000)
    return { fechouComEsc: true }
  })

  await step('06 cor do Boo pelo menu do sidebar persiste', async () => {
    const before = (await snapshot()).agents.find((a) => a.name === 'Bia')
    const trigger = page.getByRole('button', { name: 'Ações de Bia' })
    await trigger.hover()
    await trigger.click()
    await waitUntil(async () => (await page.getByRole('button', { name: 'Coral' }).count()) > 0, 'paleta do menu abriu')
    await page.getByRole('button', { name: 'Coral' }).click()
    await waitUntil(async () => {
      const now = (await snapshot()).agents.find((a) => a.name === 'Bia')
      return now && now.color !== before.color
    }, 'cor do Boo mudou no snapshot', 10_000)
    await shot('06-cor-boo')
    return { antes: before.color, depois: (await snapshot()).agents.find((a) => a.name === 'Bia').color }
  })

  await step('07 cor do Assistente persiste (regressão do erro de menção)', async () => {
    const before = (await snapshot()).assistant
    const trigger = page.getByRole('button', { name: 'Ações de Assistente' })
    await trigger.hover()
    await trigger.click()
    await waitUntil(async () => (await page.getByRole('button', { name: 'Âmbar' }).count()) > 0, 'menu do Assistente abriu')
    await page.getByRole('button', { name: 'Âmbar' }).click()
    await waitUntil(async () => (await snapshot()).assistant.color !== before.color, 'cor do Assistente mudou', 10_000)
    if (/já pertence a outro agente/i.test(await text())) throw new Error('o erro antigo de menção apareceu na tela')
    await shot('07-cor-assistente')
    return { antes: before.color, depois: (await snapshot()).assistant.color }
  })

  await step('08 menção duplicada diz de qual Boo é a menção', async () => {
    await page.getByRole('button', { name: 'Boo', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor({ timeout: 10_000 })
    await dialog.getByPlaceholder('Ex: Orion').fill('Bia')
    await dialog.getByPlaceholder(/Como este Boo deve atuar/).fill('Duplicada de propósito.')
    await dialog.getByRole('button', { name: 'Criar Boo' }).click()
    const alert = await waitUntil(async () => dialog.locator('[role="alert"]').first().textContent().catch(() => ''), 'mensagem de erro do formulário', 12_000)
    await shot('08-mencao-duplicada')
    if (!/@bia/i.test(alert) || !/Bia/.test(alert)) throw new Error('mensagem não identifica a menção nem o dono: ' + clean(alert))
    return { mensagem: clean(alert) }
  })

  await step('09 filtro do sidebar filtra a lista de Boos', async () => {
    const input = page.locator('input[placeholder*="Filtrar"]').first()
    await input.click()
    await input.fill('Bia')
    await page.waitForTimeout(800)
    const body = await text()
    if (!body.includes('Bia')) throw new Error('filtro escondeu o Boo procurado')
    await input.fill('zzzz')
    await page.waitForTimeout(800)
    const depois = await text()
    await shot('09-filtro')
    if (depois.includes('Ações de Bia')) throw new Error('filtro não escondeu o Boo com termo sem correspondência')
    await input.fill('')
    return { filtro: 'ok' }
  })

  await step('10 configurações abrem com Ctrl+,', async () => {
    await page.keyboard.press('Control+Comma')
    await waitUntil(async () => /Configurações|Aparência|Geral|Permissões/i.test(await text()), 'página de configurações', 10_000)
    await shot('10-configuracoes')
    return { abriu: true }
  })

  await step('11 criar sessão no projeto, enviar mensagem e ver resposta ou erro claro', async () => {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(700)
    await page.getByRole('button', { name: /Criar primeira sessão|Nova conversa/ }).first().click()
    await page.waitForTimeout(900)
    // "Criar primeira sessão" abre direto a conversa; em outros pontos o app pede o modal de participantes.
    const dialog = page.getByRole('dialog')
    if (await dialog.count()) {
      await dialog.getByRole('button', { name: /Criar conversa|Criar grupo/ }).click()
      await waitUntil(async () => !(await page.getByRole('dialog').count()), 'modal de conversa fechou', 12_000)
    }
    const composer = page.locator('textarea').first()
    await composer.waitFor({ timeout: 15_000 })
    await composer.click()
    await composer.fill('Responda apenas: E2E-OK')
    await shot('11-composer')
    await page.keyboard.press('Enter')
    const outcome = await waitUntil(async () => {
      const body = await text()
      if (/E2E-OK/.test(body.replace('Responda apenas: E2E-OK', ''))) return 'respondeu'
      if (/precisa configurar|indisponível|falhou|sem credencial|não autenticad|erro/i.test(body)) return 'erro visível: ' + body.slice(-160)
      return ''
    }, 'resposta ou erro do motor', 90_000).catch(async () => 'sem resposta em 90s: ' + (await text()).slice(-200))
    await shot('11-envio')
    log('OBS', { passo: 'envio de mensagem', outcome })
    return { outcome }
  })

  await step('12 clicar no Assistente abre a conversa dele', async () => {
    await page.getByText('Assistente', { exact: true }).first().click()
    // O texto do campo é placeholder, não innerText: a checagem precisa ir no atributo.
    await waitUntil(async () => /Assistente/.test((await page.locator('textarea[aria-label="Message"]').first().getAttribute('placeholder')) || ''), 'composer apontando para o Assistente', 15_000)
    const snap = await snapshot()
    const conversa = snap.conversations.find(item => item.agentIds.length === 0)
    if (!conversa) throw new Error('nenhuma conversa sem participantes foi criada para o Assistente')
    await shot('12-assistente')
    return { conversa: conversa.id, agentIds: conversa.agentIds, conversas: snap.conversations.length }
  })

  await step('13 persistência depois de reiniciar o app', async () => {
    const before = await snapshot()
    await app.close()
    await launch()
    const after = await snapshot()
    const boo = after.agents.find((a) => a.name === 'Bia')
    if (!boo) throw new Error('Boo sumiu depois do reinício')
    if (boo.color !== before.agents.find((a) => a.name === 'Bia').color) throw new Error('cor do Boo não persistiu')
    if (after.assistant.color !== before.assistant.color) throw new Error('cor do Assistente não persistiu')
    if (!after.workspaces.find((w) => w.name === 'Fixture')) throw new Error('workspace sumiu depois do reinício')
    await shot('12-reinicio')
    return { boo: boo.name, corBoo: boo.color, corAssistente: after.assistant.color, workspaces: after.workspaces.length, conversas: after.conversations.length }
  })

  const summary = { root, results, consoleErrors: consoleErrors.slice(0, 6) }
  fs.writeFileSync(path.join(root, 'resumo.json'), JSON.stringify(summary, null, 2))
  console.log('\n=== RESUMO ===')
  for (const item of results) console.log(item.status, item.name, item.error ? '-> ' + item.error : '')
  console.log('PASS:', results.filter((r) => r.status === 'PASS').length, 'FAIL:', results.filter((r) => r.status === 'FAIL').length)
  console.log('evidência:', root)
  await app.close().catch(() => {})
}

main().catch((error) => {
  console.error('ABORTOU', error.stack || error.message)
  process.exitCode = 1
})
