// E2E das telas redesenhadas, no navegador, sobre as galerias de desenvolvimento (dados fictícios).
// Sobe o renderer em modo dev isolado, sem Electron, sem perfil do usuário e sem chamar agentes.
// Uso: node scripts/verify-redesign-web.cjs [pasta-de-capturas]
const { chromium } = require('playwright')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')

const cwd = path.resolve(__dirname, '..')
const shots = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'boobot-redesign-e2e'))
fs.mkdirSync(shots, { recursive: true })

async function main() {
  const { createServer } = await import(pathToFileURL(require.resolve('vite', { paths: [cwd] }).replace(/index\.cjs$/, 'dist/node/index.js')).href)
  const server = await createServer({ configFile: false, logLevel: 'error', root: path.join(cwd, 'src/renderer'), resolve: { alias: { '@': path.join(cwd, 'src/renderer/src') } }, server: { port: 0, host: '127.0.0.1' } })
  await server.listen()
  const base = server.resolvedUrls.local[0].replace(/\/$/, '')
  const browser = await chromium.launch()
  const errors = []
  try {
    const page = await browser.newPage({ viewport: { width: 1300, height: 900 } })
    page.on('pageerror', error => errors.push(error.message))
    const open = async (route, ready) => { await page.goto(base + route, { waitUntil: 'load', timeout: 120000 }); await page.locator(ready).first().waitFor({ timeout: 120000 }) }
    const box = async locator => { const value = await locator.boundingBox(); assert.ok(value, 'elemento sem caixa visível'); return value }

    // Boo: pose de trabalho e os efeitos de pensar e dormir.
    await open('/boo-gallery', 'svg.boo-work')
    assert.equal(await page.locator('svg.boo-work').count(), 6, 'Boo trabalhando em 3 tamanhos x 2 temas')
    assert.ok(await page.locator('[data-boo-prop="thought"]').count() > 0, 'balão de pensamento')
    assert.ok(await page.locator('[data-boo-prop="zzz"]').count() > 0, 'Z do sono')
    await page.locator('[data-theme-sample="Escuro"] [data-boo-working]').screenshot({ path: path.join(shots, 'boo-working.png') })

    // Chat: card "Executando tarefa" com o Boo e navegador de turnos dentro do chat, à esquerda.
    await open('/transcript-gallery', '[data-part="work-card"]')
    const card = page.locator('[data-part="work-card"]')
    assert.match(await card.innerText(), /Executando tarefa/)
    assert.equal(await card.locator('svg.boo-work').count(), 1, 'Boo no card')
    const nav = await box(page.getByRole('navigation', { name: 'Navegação por turnos' }))
    const chat = await box(page.locator('[data-transcript-gallery] [data-turn-id]').first())
    const scroller = await box(page.locator('[data-transcript-gallery] [data-turn-id]').first().locator('xpath=ancestor::div[contains(@style,"overflow-anchor")][1]'))
    assert.ok(nav.x >= scroller.x && nav.x + nav.width <= chat.x, `navegador dentro do chat e à esquerda (nav ${nav.x}, chat ${chat.x}, área ${scroller.x})`)
    await page.screenshot({ path: path.join(shots, 'chat.png') })

    // Composer: uma linha só e modelo como ícone.
    await open('/composer-gallery', 'textarea[aria-label="Message"]')
    const text = await box(page.locator('textarea[aria-label="Message"]'))
    const send = await box(page.locator('form[data-slot="prompt-input"] button[type="submit"]'))
    const attach = await box(page.getByRole('button', { name: 'Anexar arquivos' }))
    assert.ok(Math.abs((text.y + text.height / 2) - (send.y + send.height / 2)) < 12 && Math.abs((attach.y + attach.height / 2) - (send.y + send.height / 2)) < 12, 'anexar, texto e enviar na mesma linha')
    assert.ok(attach.x < text.x && text.x < send.x, 'anexar à esquerda, enviar à direita')
    assert.ok((await box(page.getByRole('button', { name: 'Selecionar modelo' }))).width <= 40, 'seletor de modelo compacto')
    await page.locator('form[data-slot="prompt-input"]').screenshot({ path: path.join(shots, 'composer.png') })

    // Sidebar: item ativo, Novo Boo e rodapé em linha.
    await open('/sidebar-gallery', 'aside')
    await page.getByRole('button', { name: /Board da empresa/ }).click()
    assert.equal(await page.getByRole('button', { name: /Board da empresa/ }).getAttribute('aria-current'), 'page')
    await page.getByRole('tab', { name: 'Boos' }).click()
    await page.getByRole('button', { name: 'Novo Boo' }).waitFor()
    const settings = await box(page.getByRole('button', { name: 'Configurações' }))
    const folder = await box(page.getByRole('button', { name: 'Abrir pasta' }))
    assert.ok(Math.abs(settings.y - folder.y) < 4 && folder.x > settings.x, 'rodapé numa linha')
    await page.locator('aside').screenshot({ path: path.join(shots, 'sidebar.png') })

    // Painel do Boo: tela de ligação e atividade expansível.
    await open('/boo-work-gallery', 'section[aria-label="Ligação por voz"]')
    const stage = page.locator('section[aria-label="Ligação por voz"]')
    assert.equal(await stage.locator('.realtime-wave i').count(), 31, 'ondas')
    await page.getByRole('button', { name: 'Ligar para Atlas' }).waitFor()
    assert.ok(await page.getByRole('button', { name: 'Desligar ligação' }).isDisabled(), 'encerrar desligado fora da ligação')
    assert.match(await stage.innerText(), /Modo de voz/)
    const activity = page.getByRole('button', { name: /Atividade em andamento|Última atividade/ })
    await activity.click()
    assert.equal(await activity.getAttribute('aria-expanded'), 'true')
    await page.locator('section[aria-label="Boo ao vivo"]').screenshot({ path: path.join(shots, 'voice-panel.png') })

    // Escritório vivo: sala ilustrada, Boos com estado real e alguém andando pela sala.
    await open('/office-gallery', '.office__scene')
    assert.equal(await page.locator('.office-boo').count(), 6, 'um Boo por agente')
    assert.ok(await page.locator('.office-boo svg.boo-work').count() >= 2, 'Boos digitando nas mesas')
    assert.equal(await page.locator('.office__alert-badge').count(), 1, 'alerta de aprovação')
    const positions = () => page.locator('.office-boo').evaluateAll(nodes => nodes.map(node => node.getAttribute('transform')).join('|'))
    const before = await positions()
    let moved = false
    for (let i = 0; i < 20 && !moved; i++) { await page.waitForTimeout(500); moved = (await positions()) !== before }
    assert.ok(moved, 'Boos livres andam pela sala')
    await page.locator('[data-office-gallery]').screenshot({ path: path.join(shots, 'office.png') })

    assert.deepEqual(errors, [], 'sem erros de página')
    console.log('Redesign verificado. Capturas em ' + shots)
  } finally {
    await browser.close()
    await server.close()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
