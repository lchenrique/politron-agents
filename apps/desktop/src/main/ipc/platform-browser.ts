import { ipcMain, shell, WebContentsView, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { safeWebUrl, type PlatformBrowserBounds, type PlatformBrowserState } from '../../shared/platform-browser'

/** Partição própria: sem cookies/armazenamento do app nem do navegador Playwright dos agentes. */
export const PLATFORM_BROWSER_PARTITION = 'persist:boobot-platform-browser'
type View = Pick<WebContentsView, 'setBounds' | 'setVisible'> & { webContents: Electron.WebContents }
type Host = Pick<BrowserWindow, 'isDestroyed'> & { contentView: Pick<BrowserWindow['contentView'], 'addChildView' | 'removeChildView'>; webContents: Pick<Electron.WebContents, 'send' | 'getZoomFactor'> }

export function createPlatformBrowserView(): View {
  // Sem preload e sem Node: conteúdo web arbitrário não alcança as APIs do Boobot.
  const view = new WebContentsView({ webPreferences: { partition: PLATFORM_BROWSER_PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: false, webviewTag: false, safeDialogs: true } })
  view.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  return view
}

export class PlatformBrowser {
  private view: View | null = null
  private error: string | null = null
  constructor(private readonly host: () => Host | null, private readonly createView: () => View = createPlatformBrowserView,
    private readonly openExternalUrl: (url: string) => Promise<void> = url => shell.openExternal(url)) {}

  navigate(value: unknown): PlatformBrowserState {
    const url = safeWebUrl(value)
    if (!url) throw new Error('Somente endereços HTTP ou HTTPS podem ser abertos no navegador do Boobot.')
    const view = this.ensure()
    this.error = null
    void view.webContents.loadURL(url).catch(() => undefined)
    return this.state()!
  }
  state(): PlatformBrowserState | null {
    const contents = this.view?.webContents
    if (!contents || contents.isDestroyed()) return null
    return { url: contents.getURL(), title: contents.getTitle(), loading: contents.isLoading(), canGoBack: contents.navigationHistory.canGoBack(), canGoForward: contents.navigationHistory.canGoForward(), error: this.error }
  }
  setBounds(bounds: unknown, visible: unknown): void {
    if (!this.view) return
    const value = bounds as Partial<PlatformBrowserBounds> | null
    const numbers = [value?.x, value?.y, value?.width, value?.height]
    if (typeof visible !== 'boolean' || !numbers.every(item => typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= 20000)) throw new Error('Área do navegador inválida.')
    // O renderer mede em pixels CSS; a view usa DIPs da janela, que incluem o zoom do app.
    const zoom = this.host()?.webContents.getZoomFactor() || 1
    const [x, y, width, height] = (numbers as number[]).map(item => Math.round(item * zoom))
    this.view.setBounds({ x, y, width, height })
    this.view.setVisible(visible && width > 0 && height > 0)
  }
  back() { if (this.view?.webContents.navigationHistory.canGoBack()) this.view.webContents.navigationHistory.goBack() }
  forward() { if (this.view?.webContents.navigationHistory.canGoForward()) this.view.webContents.navigationHistory.goForward() }
  reload() { this.view?.webContents.reload() }
  async openExternal(value: unknown): Promise<void> {
    const url = safeWebUrl(value)
    if (!url) throw new Error('Somente endereços HTTP ou HTTPS podem ser abertos no navegador do sistema.')
    await this.openExternalUrl(url)
  }
  close(): void {
    const view = this.view
    if (!view) return
    this.view = null
    const host = this.host()
    if (host && !host.isDestroyed()) { host.contentView.removeChildView(view as WebContentsView); host.webContents.send('platformBrowser:state', null) }
    if (!view.webContents.isDestroyed()) view.webContents.close()
  }

  private ensure(): View {
    if (this.view && !this.view.webContents.isDestroyed()) return this.view
    const host = this.host()
    if (!host || host.isDestroyed()) throw new Error('Janela do Boobot indisponível.')
    const view = this.createView()
    const contents = view.webContents
    const block = (event: Electron.Event, url: string) => { if (!safeWebUrl(url)) { event.preventDefault(); this.error = 'Endereço bloqueado: somente HTTP ou HTTPS.'; this.publish() } }
    contents.on('will-navigate', block)
    contents.on('will-redirect', block)
    // Pop-ups permanecem na mesma aba; nada é entregue ao sistema sem gesto do usuário.
    contents.setWindowOpenHandler(({ url }) => { const safe = safeWebUrl(url); if (safe) void contents.loadURL(safe).catch(() => undefined); return { action: 'deny' } })
    contents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => { if (isMainFrame && code !== -3) { this.error = description || 'Falha ao carregar a página.'; this.publish() } })
    for (const name of ['did-start-loading', 'did-stop-loading', 'did-navigate', 'did-navigate-in-page', 'page-title-updated'] as const) contents.on(name as 'did-stop-loading', () => this.publish())
    view.setVisible(false)
    host.contentView.addChildView(view as WebContentsView)
    this.view = view
    return view
  }
  private publish() { const host = this.host(); if (host && !host.isDestroyed()) host.webContents.send('platformBrowser:state', this.state()) }
}

/** IPC local da janela principal. Não faz parte da RPC de hosts nem da PWA. */
export function registerPlatformBrowserIpc(browser: PlatformBrowser, isMainSender: (event: IpcMainInvokeEvent) => boolean): void {
  const handle = (name: string, handler: (...args: unknown[]) => unknown) => ipcMain.handle(`platformBrowser:${name}`, (event, ...args) => {
    if (!isMainSender(event)) throw new Error('Janela não autorizada.')
    return handler(...args)
  })
  handle('navigate', url => browser.navigate(url))
  handle('state', () => browser.state())
  handle('setBounds', (bounds, visible) => browser.setBounds(bounds, visible))
  handle('back', () => browser.back())
  handle('forward', () => browser.forward())
  handle('reload', () => browser.reload())
  handle('openExternal', url => browser.openExternal(url))
  handle('close', () => browser.close())
}
