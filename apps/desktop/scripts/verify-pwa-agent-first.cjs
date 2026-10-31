// Aceite visual da PWA centrada nos agentes (390x844): abre no Chief, faixa de Boos, "Trabalhando agora",
// aviso de conclusão, input sempre habilitado e Projetos acessíveis. Host falso e isolado; não toca dados reais.
// Requer o build da PWA (npm run build:pwa).
const { chromium } = require('playwright')
const esbuild = require('esbuild')
const Module = require('node:module')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const cwd = path.resolve(__dirname, '..')
const source = path.join(cwd, 'src/main/pwa/gateway.ts')
const code = esbuild.buildSync({ entryPoints: [source], bundle: true, platform: 'node', format: 'cjs', external: ['electron'], write: false }).outputFiles[0].text
const mod = new Module(source, module)
mod.filename = source
mod.paths = Module._nodeModulePaths(path.dirname(source))
mod._compile(code, source)
const { PwaGateway } = mod.exports
const shot = name => path.join(os.tmpdir(), `boobot-pwa-agent-first-${name}.png`)

async function main() {
  const calls = []
  const now = () => new Date().toISOString()
  const agent = (id, name, extra = {}) => ({ id, name, alias: name.toLowerCase(), color: '#786bea', pitsShape: 'little-cat', ...extra })
  const conv = (id, workspaceId, name, agentIds, extra = {}) => ({ id, workspaceId, name, kind: 'direct', archived: false, agentIds, createdAt: '2026-10-30T10:00:00Z', ...extra })
  const snapshot = {
    workspaces: [
      { id: 'free', name: 'Livre', kind: 'free', archived: false },
      { id: 'ws1', name: 'Projeto Fictício', kind: 'local', archived: false, branch: 'main' },
    ],
    agents: [agent('chief', 'Atlas', { role: 'chief' }), agent('luna', 'Luna'), agent('rex', 'Rex')],
    assistant: agent('app-assistant', 'Assistente'),
    conversations: [
      conv('chief-chat', 'free', 'Atlas', ['chief']),
      conv('rex-chat', 'free', 'Rex', ['rex']),
      conv('proj-chat', 'ws1', 'Conversa do projeto', ['luna']),
      conv('task-luna', 'free', 'Revisar o login', ['luna'], { parentConversationId: 'chief-chat', updatedAt: now() }),
    ],
    runs: [{ id: 'run-luna', workspaceId: 'free', conversationId: 'task-luna', agentId: 'luna', status: 'running', createdAt: now() }],
    approvals: [],
  }
  const history = {
    'chief-chat': [{ id: 'm1', conversationId: 'chief-chat', agentId: 'chief', author: 'Atlas', role: 'assistant', status: 'completed', text: 'Oi! Deleguei a revisão do login para a Luna.', createdAt: now() }],
    'proj-chat': [{ id: 'm2', conversationId: 'proj-chat', agentId: 'luna', author: 'Luna', role: 'assistant', status: 'completed', text: 'Mensagem do projeto.', createdAt: now() }],
  }
  const gateway = new PwaGateway({
    assets: path.join(cwd, 'src/main/pwa/assets'),
    host: () => ({ id: 'local', name: 'Desktop QA' }),
    dispatch: async (method, args) => {
      calls.push([method, args])
      if (method === 'v9:snapshot') return snapshot
      if (method === 'v9:historyPage') return { messages: history[args[0]] || [], hasMore: false }
      if (method === 'v9:send') {
        history[args[0]] = [...(history[args[0]] || []), { id: 'u-' + calls.length, conversationId: args[0], agentId: null, author: 'Você', role: 'user', status: 'queued', text: args[1], createdAt: now() }]
        return undefined
      }
      if (method === 'v9:models') return []
      if (method === 'v9:sidebarLayout') return null
      if (method === 'v9:voiceStatus') return { transcription: false, speech: false }
      throw Error('Unsupported method ' + method)
    },
  })
  const port = await gateway.listen(0)
  const browser = await chromium.launch({ headless: true })
  const errors = []
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
    page.on('pageerror', err => errors.push(err.message))
    await page.goto('http://127.0.0.1:' + port, { waitUntil: 'networkidle' })
    await page.getByLabel('Código de oito dígitos').fill(gateway.issueCode().code)
    await page.getByRole('button', { name: 'Conectar dispositivo' }).click()
    await page.getByRole('navigation', { name: 'Navegação principal' }).waitFor()
    gateway.setDevicePermissions(gateway.status().devices[0].id, { chat: true, approvals: true })

    // 1) Abre direto na conversa do Chief, com input e navegação visíveis no rodapé.
    await page.getByText('Oi! Deleguei a revisão do login para a Luna.').waitFor({ timeout: 15000 })
    const nav = page.getByRole('navigation', { name: 'Navegação principal' })
    assert.equal(await nav.getByRole('button', { name: /Chief/ }).getAttribute('aria-current'), 'page')
    const box = async locator => (await locator.boundingBox())
    const textarea = page.locator('textarea').first()
    const inside = async (locator, label) => { const b = await box(locator); assert.ok(b && b.y >= 0 && b.y + b.height <= 844 && b.x >= 0 && b.x + b.width <= 390, label + ' fora da tela: ' + JSON.stringify(b)) }
    await inside(textarea, 'input'); await inside(nav, 'navegação')
    assert.ok((await box(textarea)).y < (await box(nav)).y, 'input deve ficar acima da barra inferior')

    // 2) Faixa de Boos e "Trabalhando agora".
    const strip = page.getByRole('navigation', { name: 'Boos da equipe' })
    await strip.getByRole('button', { name: /^Luna: Trabalhando/ }).waitFor()
    await strip.getByRole('button', { name: 'Rex: Disponível' }).waitFor()
    const working = page.getByRole('region', { name: 'Trabalhando agora' })
    await working.getByRole('button', { name: /Luna, trabalhando: Revisar o login/ }).waitFor()
    await page.screenshot({ path: shot('chief') })

    // 3) Input nunca desabilitado enquanto o Chief/Boos trabalham; mensagem entra na fila.
    await page.waitForFunction(() => { const el = document.querySelector('textarea'); return !!el && el.matches(':enabled') }, null, { timeout: 12000 }) // a permissão de chat chega no próximo sync (4 s)
    assert.equal(await textarea.isDisabled(), false, 'input desabilitado')
    await textarea.fill('Priorize o login')
    await textarea.press('Enter')
    await page.getByText('Priorize o login').waitFor({ timeout: 15000 })
    assert.ok(calls.find(([method, args]) => method === 'v9:send' && args[0] === 'chief-chat' && args[1] === 'Priorize o login'), 'v9:send não chamado para o Chief')
    await page.getByText(/na fila/i).first().waitFor({ timeout: 10000 })
    await page.screenshot({ path: shot('queued') })
    assert.equal(await textarea.isDisabled(), false)

    // 4) Aviso quando o Boo termina.
    snapshot.runs = [{ ...snapshot.runs[0], status: 'completed' }]
    await page.getByText('Luna terminou: Revisar o login').waitFor({ timeout: 20000 })
    await page.screenshot({ path: shot('finished') })

    // 5) Aba Boos e conversa com um Boo.
    await textarea.blur() // fecha o teclado: a barra inferior volta
    await nav.getByRole('button', { name: 'Boos' }).click()
    await page.getByRole('heading', { name: 'Boos', level: 1 }).waitFor()
    await page.getByRole('button', { name: /Rex/ }).click()
    await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Boos' }).waitFor()
    assert.equal(await nav.getByRole('button', { name: 'Boos' }).getAttribute('aria-current'), 'page')
    await inside(page.locator('textarea').first(), 'input do Rex')
    await page.screenshot({ path: shot('boo') })

    // 6) Projetos e sessões continuam acessíveis.
    await nav.getByRole('button', { name: 'Projetos' }).click()
    await page.getByRole('button', { name: /Projeto Fictício/ }).first().waitFor()
    await page.screenshot({ path: shot('projects') })
    await page.getByRole('button', { name: /Projeto Fictício/ }).first().click()
    await page.getByRole('button', { name: /Conversa do projeto/ }).first().click()
    await page.getByText('Mensagem do projeto.').waitFor({ timeout: 15000 })
    assert.equal(await nav.getByRole('button', { name: 'Projetos' }).getAttribute('aria-current'), 'page')

    // 7) Teclado aberto: a barra inferior cede lugar ao campo; volta ao tirar o foco.
    await page.locator('textarea').first().focus()
    assert.equal(await nav.isVisible(), false, 'barra inferior deve sumir com o campo focado')
    await page.locator('textarea').first().blur()
    assert.equal(await nav.isVisible(), true)

    // 8) Sem estouro horizontal em nenhuma aba.
    for (const name of ['Chief', 'Boos', 'Projetos']) {
      await nav.getByRole('button', { name: new RegExp(name) }).click()
      await page.waitForTimeout(400)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth)
      assert.equal(overflow, false, 'estouro horizontal na aba ' + name)
    }
    assert.deepEqual(errors, [], 'erros de página: ' + errors.join('; '))
    console.log('PWA agent-first OK. Capturas em ' + os.tmpdir())
  } finally {
    await browser.close()
    await gateway.close?.()
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1) })
