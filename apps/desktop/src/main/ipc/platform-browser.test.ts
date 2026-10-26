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
    navigationHistory: { canGoBack: () => true, canGoForward: () => false, goBack: vi.fn(), goForward: vi.fn() },
  }
  const view = { webContents, setBounds: vi.fn(), setVisible: vi.fn() }
  return { view, listeners, open: (url: string) => openHandler!({ url }) }
}
function setup() {
  const fake = fakeView()
  const host = { isDestroyed: () => false, contentView: { addChildView: vi.fn(), removeChildView: vi.fn() }, webContents: { send: vi.fn(), getZoomFactor: () => 1.25 } }
  const external = vi.fn(async () => undefined)
  const browser = new PlatformBrowser(() => host as never, () => fake.view as never, external)
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
  it('fechar remove e destrói a view', () => {
    const { fake, host, browser } = setup()
    browser.navigate('https://example.com')
    browser.close()
    expect(host.contentView.removeChildView).toHaveBeenCalledWith(fake.view)
    expect(fake.view.webContents.close).toHaveBeenCalled()
    expect(browser.state()).toBeNull()
  })
})
