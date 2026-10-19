// @vitest-environment node
import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BrowserService } from './browser'

const enabled = process.env.POLITRON_RUN_BROWSER_INTEGRATION === '1'
describe.skipIf(!enabled)('navegador real isolado, sem perfis pessoais', () => {
  const browser = new BrowserService()
  let server: Server, origin: string
  beforeAll(async () => {
    server = createServer((request, response) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8')
      response.end(request.url === '/next' ? '<title>Segunda página</title><h1>Navegação concluída</h1>' : `<title>Fixture Boobot</title><h1>Formulário local</h1><input id="name" aria-label="Nome"><button id="save" onclick="localStorage.setItem('fixture',document.querySelector('#name').value);document.querySelector('#result').textContent='Olá '+document.querySelector('#name').value">Salvar localmente</button><p id="result"></p><a id="next" href="/next">Próxima</a>`)
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Endereço local indisponível')
    origin = `http://127.0.0.1:${address.port}`
  })
  afterAll(async () => { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())) })
  it('abre, lê, preenche, clica e navega com sessões independentes por agente', async () => {
    const [first, second] = await Promise.all([browser.open('chat', 'boo-a', origin), browser.open('chat', 'boo-b', origin)])
    expect(first.title).toBe('Fixture Boobot'); expect(second.text).toContain('Formulário local')
    await browser.act('chat', 'boo-a', 'fill', { selector: '#name', text: 'Pessoa sintética' })
    const result = await browser.act('chat', 'boo-a', 'click', { selector: '#save' })
    expect(result.text).toContain('Olá Pessoa sintética')
    expect((await browser.observe('chat', 'boo-b')).text).not.toContain('Olá Pessoa sintética')
    const internal = browser as unknown as { sessions: Map<string, { page: { evaluate<T>(fn: () => T): Promise<T> } }> }
    expect(await internal.sessions.get('chat:boo-a')!.page.evaluate(() => localStorage.getItem('fixture'))).toBe('Pessoa sintética')
    expect(await internal.sessions.get('chat:boo-b')!.page.evaluate(() => localStorage.getItem('fixture'))).toBeNull()
    expect((await browser.act('chat', 'boo-a', 'click', { selector: '#next' })).url).toBe(`${origin}/next`)
    expect((await browser.open('chat', 'boo-a', origin)).title).toBe('Fixture Boobot')
    await browser.control('chat:boo-a', true)
    await expect(browser.act('chat', 'boo-a', 'click', { selector: '#save' })).rejects.toThrow(/controle humano/)
    await browser.control('chat:boo-a', false)
    expect(browser.frames('chat')).toHaveLength(2)
  }, 60000)
  it('abre página pública e comunica URL inválida e falha de rede', async () => {
    const result = await browser.open('public', 'boo-public', 'https://example.com')
    expect(result.url).toBe('https://example.com/')
    expect(result.text).toContain('documentation')
    await expect(browser.open('chat', 'boo-a', 'file:///C:/Windows/win.ini')).rejects.toThrow(/HTTP/)
    await expect(browser.open('chat', 'boo-a', 'http://127.0.0.1:1')).rejects.toThrow(/net::ERR/)
  }, 60000)
})
