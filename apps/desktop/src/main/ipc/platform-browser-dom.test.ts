// @vitest-environment jsdom
import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, shell: { openExternal: vi.fn() }, WebContentsView: class {} }))
import { PlatformBrowser } from './platform-browser'

function setup(html: string) {
  document.body.innerHTML = html
  const contents = Object.assign(new EventEmitter(), {
    getURL: () => location.href, getTitle: () => '', isLoading: () => false, isDestroyed: () => false,
    navigationHistory: { canGoBack: () => false, canGoForward: () => false },
    loadURL: async () => undefined, setWindowOpenHandler: () => undefined, sendInputEvent: vi.fn(),
    executeJavaScriptInIsolatedWorld: async (_id: number, scripts: { code: string }[]) => window.eval(scripts[0].code),
  })
  const view = { webContents: contents, setBounds: vi.fn(), setVisible: vi.fn() }
  const host = { isDestroyed: () => false, contentView: { addChildView: vi.fn(), removeChildView: vi.fn() }, webContents: { send: vi.fn(), getZoomFactor: () => 1 } }
  const browser = new PlatformBrowser(() => host as never, () => view as never, async () => undefined, () => true)
  const owner = { workspaceId: 'workspace', conversationId: 'chat', agentId: 'agent' }
  browser.navigate(location.href); browser.setBounds({ x: 0, y: 0, width: 300, height: 200 }, true)
  browser.setSharingContext(owner); browser.grantSharing(owner)
  const act = async (operation: string, args: Record<string, unknown>) => browser.actForAgent(owner, operation, args, await browser.captureDocument(owner, operation, args))
  return { browser, owner, contents, act }
}
function expose(element: Element) {
  Object.defineProperty(element, 'getBoundingClientRect', { configurable: true, value: () => ({ x: 10, y: 10, left: 10, top: 10, right: 110, bottom: 40, width: 100, height: 30 }) })
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => element })
}
afterEach(() => { vi.restoreAllMocks(); history.replaceState(null, '', '/'); document.body.innerHTML = '' })

describe('operações da página compartilhada', () => {
  it('executa o código fixo em DOM simulado, sem acesso arbitrário ao agente', async () => {
    const { act } = setup('<button id="click">Clique</button><input id="field"><input id="password" type="password">')
    const button = document.querySelector('#click')!, field = document.querySelector('#field')!
    const clicked = vi.fn(); button.addEventListener('click', clicked)
    expose(button); await act('click', { selector: '#click' })
    expect(clicked).toHaveBeenCalledOnce()
    expose(field); await act('fill', { selector: '#field', text: 'teste' })
    expect((field as HTMLInputElement).value).toBe('teste')
    expose(document.querySelector('#password')!)
    await expect(act('fill', { selector: '#password', text: 'segredo' })).rejects.toThrow(/indisponível/)
  })
  it('recusa clique e preenchimento em elementos ocultos, cobertos, fora da tela ou desabilitados', async () => {
    const { act } = setup('<button id="hidden" style="display:none">Oculto</button><button id="covered">Coberto</button><button id="disabled" disabled>Bloqueado</button><input id="field" disabled><button id="outside">Fora</button><div id="overlay"></div>')
    const hidden = document.querySelector('#hidden')!, covered = document.querySelector('#covered')!, disabled = document.querySelector('#disabled')!, field = document.querySelector('#field')!, outside = document.querySelector('#outside')!
    expose(hidden); await expect(act('click', { selector: '#hidden' })).rejects.toThrow()
    expose(covered); Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => document.querySelector('#overlay') })
    await expect(act('click', { selector: '#covered' })).rejects.toThrow()
    expose(disabled); await expect(act('click', { selector: '#disabled' })).rejects.toThrow()
    expose(field); await expect(act('fill', { selector: '#field', text: 'x' })).rejects.toThrow()
    expose(outside); Object.defineProperty(outside, 'getBoundingClientRect', { configurable: true, value: () => ({ x: -500, y: -500, left: -500, top: -500, right: -400, bottom: -400, width: 100, height: 100 }) })
    await expect(act('click', { selector: '#outside' })).rejects.toThrow()
  })
  it('recusa teclas em foco de senha, arquivo e iframe sem enviar eventos nativos', async () => {
    const { act, contents } = setup('<input id="password" type="password"><input id="file" type="file"><iframe id="frame"></iframe>')
    for (const selector of ['#password', '#file', '#frame']) {
      const target = document.querySelector(selector) as HTMLElement
      expose(target); target.focus()
      await expect(act('key', { key: 'Enter' })).rejects.toThrow()
    }
    expect(contents.sendInputEvent).not.toHaveBeenCalled()
  })
  it('permite a navegação aprovada e recaptura o documento resultante', async () => {
    const { browser, owner } = setup('<p>Página simulada</p>')
    const token = await browser.captureDocument(owner)
    const result = await browser.openForAgent(owner, location.href, token)
    expect(result.url).toBe(location.origin + location.pathname)
  })
  it('não age quando a identidade do documento mudou, mesmo com a mesma URL', async () => {
    const { browser, owner } = setup('<button id="click">Enviar</button>')
    const button = document.querySelector('#click')!; expose(button)
    const clicked = vi.fn(); button.addEventListener('click', clicked)
    const token = await browser.captureDocument(owner, 'click', { selector: '#click' })
    await expect(browser.actForAgent(owner, 'click', { selector: '#click' }, { ...token, documentId: 'documento-diferente' })).rejects.toThrow(/documento/i)
    expect(clicked).not.toHaveBeenCalled()
  })
  it('recusa troca do nó sob o mesmo seletor durante a aprovação', async () => {
    const { browser, owner } = setup('<button id="pay">Original</button>')
    const original = document.querySelector('#pay') as HTMLButtonElement; expose(original)
    const args = { selector: '#pay' }, token = await browser.captureDocument(owner, 'click', args)
    const replacement = document.createElement('button'); replacement.id = 'pay'
    const clicked = vi.fn(); replacement.addEventListener('click', clicked); original.replaceWith(replacement); expose(replacement)
    await expect(browser.actForAgent(owner, 'click', args, token)).rejects.toThrow(/alvo|elemento/i)
    expect(clicked).not.toHaveBeenCalled()
  })
  it('recusa substituir o campo ou mudar argumentos depois da captura', async () => {
    const { browser, owner } = setup('<input id="field">')
    const original = document.querySelector('#field') as HTMLInputElement; expose(original)
    const args = { selector: '#field', text: 'aprovado' }, token = await browser.captureDocument(owner, 'fill', args)
    const replacement = document.createElement('input'); replacement.id = 'field'; original.replaceWith(replacement); expose(replacement)
    await expect(browser.actForAgent(owner, 'fill', args, token)).rejects.toThrow(/alvo|campo/i)
    expect(replacement.value).toBe('')
    const another = await browser.captureDocument(owner, 'fill', args)
    await expect(browser.actForAgent(owner, 'fill', { ...args, text: 'não aprovado' }, another)).rejects.toThrow(/autorização|alvo/i)
    expect(replacement.value).toBe('')
  })
  it('recusa troca do nó sob as coordenadas durante a aprovação', async () => {
    const { browser, owner } = setup('<button id="first">Primeiro</button><button id="second">Segundo</button>')
    const first = document.querySelector('#first')!, second = document.querySelector('#second')!
    expose(first); const args = { x: 20, y: 20 }, token = await browser.captureDocument(owner, 'click', args)
    expose(second); const clicked = vi.fn(); second.addEventListener('click', clicked)
    await expect(browser.actForAgent(owner, 'click', args, token)).rejects.toThrow(/alvo|elemento/i)
    expect(clicked).not.toHaveBeenCalled()
  })
  it('aceita descendente visível do botão no hit-test, mas não sobreposição externa', async () => {
    const { act } = setup('<button id="button"><span id="label">Salvar</span></button><div id="overlay"></div>')
    const button = document.querySelector('#button')!, child = document.querySelector('#label')!, overlay = document.querySelector('#overlay')!
    expose(button); expose(child)
    const clicked = vi.fn(); button.addEventListener('click', clicked)
    await act('click', { selector: '#button' }); expect(clicked).toHaveBeenCalledOnce()
    expose(overlay); await expect(act('click', { selector: '#button' })).rejects.toThrow()
  })
  it('não lê texto ocultado por modal ou recortado por ancestral', async () => {
    const { browser, owner } = setup('<div id="under">segredo sob modal</div><div id="overlay">modal</div><div id="clip" style="overflow:hidden"><span id="clipped">segredo recortado</span></div>')
    const under = document.querySelector('#under')!, overlay = document.querySelector('#overlay')!, clip = document.querySelector('#clip')!, clipped = document.querySelector('#clipped')!
    expose(under); expose(clipped); expose(overlay)
    Object.defineProperty(clip, 'getBoundingClientRect', { configurable: true, value: () => ({ left: 300, top: 300, right: 400, bottom: 400, width: 100, height: 100 }) })
    const result = await browser.observeForAgent(owner)
    expect(result.text).not.toContain('segredo')
  })
  it('não informa sucesso para tecla sintética sem efeito comprovado', async () => {
    const { act } = setup('<input id="field">')
    const field = document.querySelector('#field') as HTMLInputElement; expose(field); field.focus()
    await expect(act('key', { key: 'Enter' })).rejects.toThrow(/não.*suportad|não.*comprova/i)
  })
  it('não envia tecla a outro campo quando o foco muda após capturar o documento', async () => {
    const { browser, owner } = setup('<input id="a"><input id="b">')
    const a = document.querySelector('#a') as HTMLInputElement, b = document.querySelector('#b') as HTMLInputElement
    expose(a); a.focus()
    const token = await browser.captureDocument(owner)
    expose(b); b.focus()
    const event = vi.fn(); b.addEventListener('keydown', event)
    await expect(browser.actForAgent(owner, 'key', { key: 'Enter' }, token)).rejects.toThrow(/foco/i)
    expect(event).not.toHaveBeenCalled()
  })
  it('limita leitura DOM e oculta queries e fragmentos de URLs', async () => {
    history.replaceState(null, '', '/path?token=secret#private')
    const { browser, owner } = setup(`<a id="link" href="https://example.com/path?secret=one#two" title="${'T'.repeat(2000)}" role="${'R'.repeat(2000)}">Veja https://example.com/path?token=secret#private</a>` + '<div>texto</div>'.repeat(5000))
    expose(document.querySelector('#link')!)
    const original = document.createTreeWalker.bind(document)
    let visited = 0
    const spy = vi.spyOn(document, 'createTreeWalker').mockImplementation((...args) => {
      const walker = original(...args), next = walker.nextNode.bind(walker)
      walker.nextNode = () => { visited++; return next() }
      return walker
    })
    const result = await browser.observeForAgent(owner)
    expect(spy).toHaveBeenCalled(); expect(visited).toBeLessThanOrEqual(3000)
    expect(result.url).not.toContain('token=secret'); expect(JSON.stringify(result)).not.toContain('secret=one'); expect(JSON.stringify(result)).not.toContain('token=secret')
    expect(result.targets[0].href).toBe('https://example.com/path')
    expect(result.targets[0].role.length).toBeLessThanOrEqual(100)
    expect(result.title.length).toBeLessThanOrEqual(300)
  })
})
