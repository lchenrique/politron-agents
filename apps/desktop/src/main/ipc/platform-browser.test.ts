// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, shell: { openExternal: vi.fn() }, WebContentsView: class {} }))
import { PlatformBrowser, PLATFORM_BROWSER_PARTITION } from './platform-browser'
import { safeWebUrl } from '../../shared/platform-browser'

function fakeView() {
  const listeners = new Map<string, (...args: never[]) => void>()
  let openHandler: ((details: { url: string }) => { action: string }) | null = null
  let destroyed = false
  const webContents = {
    loaded: [] as string[],
    loadURL: vi.fn(async (url: string) => { webContents.loaded.push(url) }),
    on: (name: string, listener: (...args: never[]) => void) => { listeners.set(name, listener) },
    setWindowOpenHandler: (handler: typeof openHandler) => { openHandler = handler },
    isDestroyed: () => destroyed, close: vi.fn(() => { destroyed = true }),
    getURL: () => webContents.loaded.at(-1) || '', getTitle: () => 'Título', isLoading: () => false, reload: vi.fn(),
    executeJavaScriptInIsolatedWorld: vi.fn(async () => 'fake-document' as unknown),
    navigationHistory: { canGoBack: () => true, canGoForward: () => false, goBack: vi.fn(), goForward: vi.fn() },
  }
  const view = { webContents, setBounds: vi.fn(), setVisible: vi.fn() }
  return { view, listeners, open: (url: string) => openHandler!({ url }) }
}
function setup(authorize: (owner: { workspaceId: string; conversationId: string; agentId: string }) => boolean = () => true) {
  const fake = fakeView()
  const host = { isDestroyed: () => false, contentView: { addChildView: vi.fn(), removeChildView: vi.fn() }, webContents: { send: vi.fn(), getZoomFactor: () => 1.25 } }
  const external = vi.fn(async () => undefined)
  const browser = new PlatformBrowser(() => host as never, () => fake.view as never, external, authorize)
  return { fake, host, external, browser }
}

describe('navegador da plataforma', () => {
  it('valida somente HTTP/HTTPS sem credenciais', () => {
    expect(safeWebUrl('https://example.com/a')).toBe('https://example.com/a')
    expect(safeWebUrl('http://localhost:5173')).toBe('http://localhost:5173/')
    for (const value of ['javascript:alert(1)', 'file:///C:/Windows', 'mailto:a@b.c', 'https://user:pass@example.com', 'ftp://x', '', 42]) expect(safeWebUrl(value)).toBeNull()
  })
  it('abre a página numa view própria anexada à janela e recusa protocolos', () => {
    const { fake, host, browser } = setup()
    expect(() => browser.navigate('javascript:alert(1)')).toThrow(/HTTP/)
    expect(host.contentView.addChildView).not.toHaveBeenCalled()
    const state = browser.navigate('https://example.com')
    expect(host.contentView.addChildView).toHaveBeenCalledWith(fake.view)
    expect(fake.view.webContents.loaded).toEqual(['https://example.com/'])
    expect(state).toMatchObject({ title: 'Título', canGoBack: true, error: null })
    expect(PLATFORM_BROWSER_PARTITION).not.toMatch(/agent|playwright/i)
  })
  it('bloqueia navegação e pop-up fora de HTTP/HTTPS e mantém pop-ups na mesma aba', () => {
    const { fake, external, browser } = setup()
    browser.navigate('https://example.com')
    const listener = (name: string) => fake.listeners.get(name) as (...args: unknown[]) => void
    const event = { preventDefault: vi.fn() }
    listener('will-navigate')(event, 'file:///etc/passwd')
    expect(event.preventDefault).toHaveBeenCalled()
    const ok = { preventDefault: vi.fn() }
    listener('will-redirect')(ok, 'https://example.org')
    expect(ok.preventDefault).not.toHaveBeenCalled()
    expect(fake.open('https://popup.example')).toEqual({ action: 'deny' })
    expect(fake.open('ms-settings:privacy')).toEqual({ action: 'deny' })
    expect(fake.view.webContents.loaded).toEqual(['https://example.com/', 'https://popup.example/'])
    expect(external).not.toHaveBeenCalled()
  })
  it('converte limites CSS para DIP com zoom e recusa limites inválidos', () => {
    const { fake, browser } = setup()
    browser.navigate('https://example.com')
    browser.setBounds({ x: 10, y: 20, width: 400, height: 300 }, true)
    expect(fake.view.setBounds).toHaveBeenLastCalledWith({ x: 13, y: 25, width: 500, height: 375 })
    expect(fake.view.setVisible).toHaveBeenLastCalledWith(true)
    browser.setBounds({ x: 0, y: 0, width: 0, height: 0 }, true)
    expect(fake.view.setVisible).toHaveBeenLastCalledWith(false)
    expect(() => browser.setBounds({ x: -1, y: 0, width: 1, height: 1 }, true)).toThrow(/inválida/)
    expect(() => browser.setBounds({ x: 0, y: 0, width: Infinity, height: 1 }, true)).toThrow(/inválida/)
  })
  it('navegador do sistema só recebe URL HTTP/HTTPS validada', async () => {
    const { external, browser } = setup()
    await expect(browser.openExternal('file:///C:/x.exe')).rejects.toThrow(/HTTP/)
    await browser.openExternal('https://example.com/docs')
    expect(external).toHaveBeenCalledWith('https://example.com/docs')
  })
  it('exige autorização explícita e revoga o acesso ao ocultar a view', async () => {
    const { browser } = setup()
    const owner = { workspaceId: 'workspace', conversationId: 'chat', agentId: 'agent' }
    browser.navigate('https://example.com')
    browser.setBounds({ x: 0, y: 0, width: 300, height: 200 }, true)
    browser.setSharingContext(owner)
    await expect(browser.observeForAgent(owner)).rejects.toThrow(/compartilh/i)
    browser.grantSharing(owner)
    expect(browser.sharingState()).toEqual(owner)
    browser.setBounds({ x: 0, y: 0, width: 0, height: 0 }, false)
    expect(browser.sharingState()).toBeNull()
    await expect(browser.observeForAgent(owner)).rejects.toThrow(/compartilh/i)
  })
  it('bloqueia outro agente e reavalia permissões antes de cada leitura', async () => {
    let allowed = true
    const { browser } = setup(() => allowed)
    const owner = { workspaceId: 'workspace', conversationId: 'chat', agentId: 'agent' }
    browser.navigate('https://example.com'); browser.setBounds({ x: 0, y: 0, width: 300, height: 200 }, true)
    browser.setSharingContext(owner); browser.grantSharing(owner)
    await expect(browser.observeForAgent({ ...owner, agentId: 'other' })).rejects.toThrow(/compartilh/i)
    allowed = false
    await expect(browser.observeForAgent(owner)).rejects.toThrow(/compartilh/i)
  })
  it('não aceita autorização antiga após revogar e compartilhar novamente', () => {
    const { browser } = setup()
    const owner = { workspaceId: 'workspace', conversationId: 'chat', agentId: 'agent' }
    browser.navigate('https://example.com')
    browser.setBounds({ x: 0, y: 0, width: 300, height: 200 }, true)
    browser.setSharingContext(owner); browser.grantSharing(owner)
    const token = browser.captureSharing(owner)
    browser.revokeSharing(); browser.grantSharing(owner)
    expect(() => browser.assertSharing(owner, token)).toThrow(/compartilh/i)
  })
  it('invalida autorização após reload, navegação na mesma URL, histórico ou popup', () => {
    const { browser, fake } = setup()
    const owner = { workspaceId: 'workspace', conversationId: 'chat', agentId: 'agent' }
    browser.navigate('https://example.com'); browser.setBounds({ x: 0, y: 0, width: 300, height: 200 }, true)
    browser.setSharingContext(owner); browser.grantSharing(owner)
    const verify = (navigate: () => void) => { const token = browser.captureSharing(owner); navigate(); expect(() => browser.assertSharing(owner, token)).toThrow(/página|documento/i) }
    verify(() => browser.reload())
    verify(() => browser.navigate('https://example.com'))
    verify(() => browser.back())
    verify(() => fake.open('https://example.com'))
    verify(() => (fake.listeners.get('did-start-navigation') as (...args: unknown[]) => void)({}, 'https://example.com/', false, true))
    verify(() => (fake.listeners.get('did-navigate-in-page') as (...args: unknown[]) => void)({}, 'https://example.com/#section', true))
  })
  it('não retorna leitura pendente após revogação ou troca de agente', async () => {
    const { browser, fake } = setup()
    const owner = { workspaceId: 'workspace', conversationId: 'chat', agentId: 'agent' }
    browser.navigate('https://example.com')
    browser.setBounds({ x: 0, y: 0, width: 300, height: 200 }, true)
    browser.setSharingContext(owner)
    browser.grantSharing(owner)
    let complete!: (value: unknown) => void
    fake.view.webContents.executeJavaScriptInIsolatedWorld.mockImplementationOnce(async () => 'fake-document').mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    const pending = browser.observeForAgent(owner)
    await vi.waitFor(() => expect(complete).toBeTypeOf('function'))
    browser.setSharingContext({ ...owner, agentId: 'other' })
    complete({ url: 'https://example.com/', title: '', text: 'segredo', targets: [] })
    await expect(pending).rejects.toThrow(/compartilh/i)
    expect(browser.sharingState()).toBeNull()
  })
  it('descarta leitura pendente após reload da mesma URL', async () => {
    const { browser, fake } = setup()
    const owner = { workspaceId: 'workspace', conversationId: 'chat', agentId: 'agent' }
    browser.navigate('https://example.com'); browser.setBounds({ x: 0, y: 0, width: 300, height: 200 }, true)
    browser.setSharingContext(owner); browser.grantSharing(owner)
    let complete!: (value: unknown) => void
    fake.view.webContents.executeJavaScriptInIsolatedWorld.mockImplementationOnce(async () => 'fake-document').mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    const pending = browser.observeForAgent(owner)
    await vi.waitFor(() => expect(complete).toBeTypeOf('function'))
    browser.reload()
    complete({ url: 'https://example.com/', title: '', text: 'antigo', targets: [] })
    await expect(pending).rejects.toThrow(/página|documento/i)
  })
  it('fechar remove e destrói a view', () => {
    const { fake, host, browser } = setup()
    browser.navigate('https://example.com')
    browser.close()
    expect(host.contentView.removeChildView).toHaveBeenCalledWith(fake.view)
    expect(fake.view.webContents.close).toHaveBeenCalled()
    expect(browser.state()).toBeNull()
  })
  describe('acquireForAgent', () => {
    const owner = { workspaceId: 'w', conversationId: 'c', agentId: 'a' }
    const bounds = { x: 0, y: 0, width: 100, height: 100 }
    it('envia reveal, espera visível e compartilha', async () => {
      const { fake, host, browser } = setup()
      const pending = browser.acquireForAgent(owner, 'https://example.com/')
      expect(host.webContents.send).toHaveBeenCalledWith('platformBrowser:reveal', owner)
      browser.setBounds(bounds, true)
      await Promise.resolve(); await Promise.resolve()
      ;(fake.listeners.get('did-stop-loading') as () => void)()
      await pending
      expect(browser.sharingState()).toEqual(owner)
    })
    it('sem página lança orientação', async () => {
      const { browser } = setup()
      const pending = browser.acquireForAgent(owner)
      browser.setBounds(bounds, true)
      await expect(pending).rejects.toThrow(/use browser_open primeiro/)
    })
    it('revogação pelo usuário bloqueia acquire até novo grantSharing', async () => {
      const { fake, browser } = setup()
      browser.navigate('https://example.com/')
      const first = browser.acquireForAgent(owner); browser.setBounds(bounds, true); await first
      browser.revokeSharing(true)
      await expect(browser.acquireForAgent(owner)).rejects.toThrow(/bloqueado pelo usuário/)
      browser.setSharingContext(owner); browser.grantSharing(owner)
      browser.revokeSharing()
      await browser.acquireForAgent(owner)
      expect(browser.sharingState()).toEqual(owner)
      expect(fake.view.webContents.loaded).toHaveLength(1)
    })
    it('timeout quando a aba não aparece', async () => {
      const { browser } = setup()
      await expect(browser.acquireForAgent(owner, 'https://example.com/', 50)).rejects.toThrow(/não pôde ser aberta/)
    })
  })
})
