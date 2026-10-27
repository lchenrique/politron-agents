import { randomUUID } from 'node:crypto'
import { ipcMain, shell, WebContentsView, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { safeWebUrl, type PlatformBrowserBounds, type PlatformBrowserOwner, type PlatformBrowserState } from '../../shared/platform-browser'

const sameOwner = (a: PlatformBrowserOwner | null, b: PlatformBrowserOwner | null) => !!a && !!b && a.workspaceId === b.workspaceId && a.conversationId === b.conversationId && a.agentId === b.agentId
const validOwner = (owner: unknown): owner is PlatformBrowserOwner => !!owner && typeof owner === 'object' && ['workspaceId', 'conversationId', 'agentId'].every(key => typeof (owner as Record<string, unknown>)[key] === 'string' && ((owner as Record<string, string>)[key]).length > 0 && ((owner as Record<string, string>)[key]).length <= 200)
function normalizeAction(operation: string, args: Record<string, unknown>): Record<string, unknown> {
  if (operation === 'click') {
    if (typeof args.selector === 'string' && args.selector.length > 0 && args.selector.length <= 400) return { selector: args.selector }
    const x = Number(args.x), y = Number(args.y)
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) throw new Error('Posição inválida.')
    return { x, y }
  }
  if (operation === 'fill') {
    if (typeof args.selector !== 'string' || !args.selector || args.selector.length > 400) throw new Error('Seletor inválido.')
    return { selector: args.selector, text: String(args.text ?? '').slice(0, 10000) }
  }
  if (operation === 'scroll') return { deltaY: Math.max(-1200, Math.min(1200, Number(args.deltaY) || 0)) }
  if (operation === 'key') throw new Error('Tecla não suportada com segurança; o foco não foi alterado.')
  throw new Error('Ação de navegador desconhecida.')
}

// Código fixo executado em mundo isolado, sem ler cookies nem aceitar JavaScript do agente.
function pageOperation(operation: string, args: Record<string, unknown>, expectedUrl: string, documentId: string, focusId: string) {
  const isolated = globalThis as unknown as { __politronDocumentIdentity?: string; __politronCapturedFocus?: Map<string, { focus: Element | null; target: Element | null; operation: string; args: string }> }
  const identity = () => location.href === expectedUrl && /^https?:$/.test(location.protocol) && isolated.__politronDocumentIdentity === documentId
  if (!identity()) throw new Error('O documento da página mudou.')
  const captured = isolated.__politronCapturedFocus?.get(focusId)
  isolated.__politronCapturedFocus?.delete(focusId)
  if (operation !== 'observe' && (!captured || captured.operation !== operation || captured.args !== JSON.stringify(args))) throw new Error('Autorização de alvo inválida.')
  const cleanUrl = (value: string) => { try { if (!value || value.length > 8192) return ''; const url = new URL(value, location.href); if (!/^https?:$/.test(url.protocol) || url.username || url.password) return ''; url.search = ''; url.hash = ''; return url.href.slice(0, 512) } catch { return '' } }
  const cleanText = (value: string, limit: number) => value.slice(0, limit * 2).replace(/https?:\/\/[^\s<>"']+/gi, url => cleanUrl(url)).slice(0, limit)
  const visibleRect = (element: Element, pointer: boolean) => {
    const rect = element.getBoundingClientRect()
    let left = Math.max(0, rect.left), top = Math.max(0, rect.top), right = Math.min(innerWidth, rect.right), bottom = Math.min(innerHeight, rect.bottom), depth = 0
    if (rect.width <= 0 || rect.height <= 0) return null
    for (let current: Element | null = element; current; current = current.parentElement) {
      if (++depth > 64) return null
      const style = getComputedStyle(current)
      if (style.display === 'none' || style.visibility !== 'visible' || pointer && style.pointerEvents === 'none' || Number(style.opacity || '1') === 0) return null
      if (current !== element) {
        const bounds = current.getBoundingClientRect()
        if (/(hidden|clip|scroll|auto)/.test(style.overflowX || style.overflow)) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right) }
        if (/(hidden|clip|scroll|auto)/.test(style.overflowY || style.overflow)) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom) }
      }
    }
    return right > left && bottom > top ? { left, top, right, bottom } : null
  }
  const exposed = (element: Element, pointer: boolean) => {
    const rect = visibleRect(element, pointer)
    if (!rect) return false
    const hit = document.elementFromPoint((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2)
    return !!hit && (hit === element || element.contains(hit) && !!visibleRect(hit, pointer))
  }
  const actionable = (element: Element | null): element is HTMLElement => {
    if (!(element instanceof HTMLElement) || !element.isConnected || element instanceof HTMLIFrameElement || element instanceof HTMLFrameElement || element.closest('[inert], [aria-disabled="true"], [disabled]') || element.matches(':disabled')) return false
    return exposed(element, true)
  }
  const safeInput = (target: HTMLInputElement | HTMLTextAreaElement) => !target.readOnly && !(target instanceof HTMLInputElement && !['text', 'search', 'email', 'url', 'tel', 'number'].includes(target.type)) && !/(password|one-time-code|cc-)/i.test(target.getAttribute('autocomplete') || '')
  if (operation === 'click') {
    const target = typeof args.selector === 'string' ? document.querySelector(args.selector) : document.elementFromPoint(Number(args.x), Number(args.y))
    if (!captured || captured.operation !== operation || captured.args !== JSON.stringify(args) || captured.target !== target || !actionable(target)) throw new Error('Alvo alterado, indisponível ou não visível.')
    target.click()
  } else if (operation === 'fill') {
    const target = document.querySelector(String(args.selector))
    if (!captured || captured.operation !== operation || captured.args !== JSON.stringify(args) || captured.target !== target || !actionable(target) || !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) || !safeInput(target)) throw new Error('Alvo ou campo de texto indisponível.')
    target.focus()
    if (document.activeElement !== target || document.querySelector(String(args.selector)) !== target || !identity() || !actionable(target) || !safeInput(target)) throw new Error('O foco ou a página mudou.')
    const prototype = target instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
    if (!setter) throw new Error('Campo de texto indisponível.')
    setter.call(target, String(args.text)); target.dispatchEvent(new Event('input', { bubbles: true })); target.dispatchEvent(new Event('change', { bubbles: true }))
  } else if (operation === 'scroll') window.scrollBy(0, Number(args.deltaY))
  if (!identity()) throw new Error('O documento da página mudou.')
  const targets: { index: number; tag: string; role: string; text: string; href?: string; x: number; y: number; width: number; height: number }[] = []
  let text = '', visited = 0
  if (document.body) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
    let node: Node | null
    while (visited < 3000 && (node = walker.nextNode())) {
      visited++
      if (node.nodeType === Node.TEXT_NODE && text.length < 12000) {
        const parent = node.parentElement
        if (parent && !parent.closest('script,style,noscript,template,[hidden],[inert]') && exposed(parent, false)) text += cleanText(node.nodeValue || '', Math.min(200, 12000 - text.length)) + ' '
      } else if (node instanceof HTMLElement && targets.length < 100 && node.matches('a,button,input,textarea,select,[role="button"],[contenteditable="true"]') && actionable(node)) {
        const rect = node.getBoundingClientRect()
        let label = node.getAttribute('aria-label') || node.getAttribute('placeholder') || node.getAttribute('title') || ''
        if (!label && node.firstChild?.nodeType === Node.TEXT_NODE) label = node.firstChild.nodeValue || ''
        targets.push({ index: targets.length, tag: node.tagName.toLowerCase(), role: cleanText(node.getAttribute('role') || '', 100), text: cleanText(label.slice(0, 360).trim(), 180), href: node instanceof HTMLAnchorElement ? cleanUrl(node.getAttribute('href') || '') : undefined, x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) })
      }
    }
  }
  return { title: cleanText(document.title, 300), url: cleanUrl(location.href), text: text.trim().slice(0, 12000), targets }
}

/** Partição própria: sem cookies/armazenamento do app nem do navegador Playwright dos agentes. */
export const PLATFORM_BROWSER_PARTITION = 'persist:boobot-platform-browser'
type SharingToken = { generation: number; document: number; url: string }
type DocumentToken = SharingToken & { documentId: string; focusId: string }
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
  private visible = false
  private context: PlatformBrowserOwner | null = null
  private sharing: PlatformBrowserOwner | null = null
  private generation = 0
  private documentEpoch = 0
  constructor(private readonly host: () => Host | null, private readonly createView: () => View = createPlatformBrowserView,
    private readonly openExternalUrl: (url: string) => Promise<void> = url => shell.openExternal(url),
    private readonly authorizeOwner: (owner: PlatformBrowserOwner) => boolean = () => false) {}

  navigate(value: unknown): PlatformBrowserState {
    const url = safeWebUrl(value)
    if (!url) throw new Error('Somente endereços HTTP ou HTTPS podem ser abertos no navegador do Boobot.')
    const view = this.ensure()
    this.error = null
    this.documentEpoch++
    void view.webContents.loadURL(url).catch(() => undefined)
    return this.state()!
  }
  state(): PlatformBrowserState | null {
    const contents = this.view?.webContents
    if (!contents || contents.isDestroyed()) return null
    return { url: contents.getURL(), title: contents.getTitle(), loading: contents.isLoading(), canGoBack: contents.navigationHistory.canGoBack(), canGoForward: contents.navigationHistory.canGoForward(), error: this.error, sharing: this.sharingState() }
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
    this.visible = visible && width > 0 && height > 0
    this.view.setVisible(this.visible)
    if (!this.visible) this.revokeSharing()
  }
  setSharingContext(owner: PlatformBrowserOwner | null): void {
    if (owner !== null && !validOwner(owner)) throw new Error('Contexto inválido.')
    if (!sameOwner(this.context, owner)) this.revokeSharing()
    this.context = owner ? { ...owner } : null
  }
  sharingState(): PlatformBrowserOwner | null { return this.sharing ? { ...this.sharing } : null }
  grantSharing(owner: PlatformBrowserOwner): void {
    if (!validOwner(owner) || !sameOwner(owner, this.context) || !this.visible || !this.view || !safeWebUrl(this.view.webContents.getURL()) || !this.authorizeOwner(owner)) throw new Error('Não é possível compartilhar este navegador neste contexto.')
    this.generation++; this.sharing = { ...owner }; this.publish()
  }
  revokeSharing(): void {
    this.generation++
    if (this.sharing) { this.sharing = null; this.publish() }
  }
  private checkSharing(owner: PlatformBrowserOwner, generation?: number): Electron.WebContents {
    const contents = this.view?.webContents, host = this.host()
    if (!host || host.isDestroyed() || !sameOwner(owner, this.sharing) || !sameOwner(owner, this.context) || !this.visible || !contents || contents.isDestroyed() || !safeWebUrl(contents.getURL()) || !this.authorizeOwner(owner) || (generation !== undefined && generation !== this.generation)) throw new Error('Compartilhamento do navegador indisponível ou revogado.')
    return contents
  }
  captureSharing(owner: PlatformBrowserOwner): SharingToken {
    const contents = this.checkSharing(owner)
    if (contents.isLoading()) throw new Error('A página ainda está carregando.')
    return { generation: this.generation, document: this.documentEpoch, url: contents.getURL() }
  }
  assertSharing(owner: PlatformBrowserOwner, token: SharingToken, requireDocument = true): void {
    const contents = this.checkSharing(owner, token.generation)
    if (requireDocument && (contents.isLoading() || token.document !== this.documentEpoch || contents.getURL() !== token.url)) throw new Error('O documento da página mudou.')
  }
  async captureDocument(owner: PlatformBrowserOwner, operation = '', args: Record<string, unknown> = {}): Promise<DocumentToken> {
    const token = this.captureSharing(owner), contents = this.checkSharing(owner, token.generation)
    const candidate = randomUUID(), focusId = randomUUID(), normalized = operation ? normalizeAction(operation, args) : {}
    const code = `(() => { if (location.href !== ${JSON.stringify(token.url)} || !/^https?:$/.test(location.protocol)) throw new Error('A página mudou.'); if (!Object.hasOwn(globalThis, '__politronDocumentIdentity')) Object.defineProperty(globalThis, '__politronDocumentIdentity', { value: ${JSON.stringify(candidate)}, configurable: false }); if (!Object.hasOwn(globalThis, '__politronCapturedFocus')) Object.defineProperty(globalThis, '__politronCapturedFocus', { value: new Map(), configurable: false }); const map = globalThis.__politronCapturedFocus, op = ${JSON.stringify(operation)}, args = ${JSON.stringify(normalized)}; const target = op === 'click' ? (typeof args.selector === 'string' ? document.querySelector(args.selector) : document.elementFromPoint(args.x, args.y)) : op === 'fill' ? document.querySelector(args.selector) : null; if ((op === 'click' || op === 'fill') && !target) throw new Error('Alvo não encontrado.'); if (map.size >= 64) map.delete(map.keys().next().value); map.set(${JSON.stringify(focusId)}, { focus: document.activeElement, target, operation: op, args: JSON.stringify(args) }); return globalThis.__politronDocumentIdentity })()`
    const documentId = await contents.executeJavaScriptInIsolatedWorld(999, [{ code }])
    this.assertSharing(owner, token)
    if (typeof documentId !== 'string' || documentId.length > 80 || !documentId) throw new Error('Identidade do documento indisponível.')
    return { ...token, documentId, focusId }
  }
  async observeForAgent(owner: PlatformBrowserOwner, token?: DocumentToken) { return this.runPageOperation(owner, 'observe', {}, token || await this.captureDocument(owner)) }
  async openForAgent(owner: PlatformBrowserOwner, value: unknown, token: DocumentToken) {
    this.assertSharing(owner, token)
    const contents = this.checkSharing(owner), generation = this.generation, url = safeWebUrl(value)
    if (!url) throw new Error('Somente endereços HTTP ou HTTPS são permitidos.')
    const valid = await contents.executeJavaScriptInIsolatedWorld(999, [{ code: `location.href === ${JSON.stringify(token.url)} && globalThis.__politronDocumentIdentity === ${JSON.stringify(token.documentId)}` }])
    this.assertSharing(owner, token)
    if (valid !== true) throw new Error('O documento da página mudou.')
    this.documentEpoch++
    await contents.loadURL(url)
    this.checkSharing(owner, generation)
    return this.observeForAgent(owner)
  }
  async actForAgent(owner: PlatformBrowserOwner, operation: string, args: Record<string, unknown>, token: DocumentToken) {
    this.assertSharing(owner, token)
    return this.runPageOperation(owner, operation, normalizeAction(operation, args), token)
  }
  private async runPageOperation(owner: PlatformBrowserOwner, operation: string, args: Record<string, unknown>, token: DocumentToken) {
    this.assertSharing(owner, token)
    const contents = this.checkSharing(owner, token.generation)
    const code = `(${pageOperation.toString()})(${JSON.stringify(operation)}, ${JSON.stringify(args)}, ${JSON.stringify(token.url)}, ${JSON.stringify(token.documentId)}, ${JSON.stringify(token.focusId)})`
    // A revogação invalida o resultado e chamadas futuras, mas não desfaz um efeito já enviado ao renderer.
    const result = await contents.executeJavaScriptInIsolatedWorld(999, [{ code }])
    this.assertSharing(owner, token)
    if (!result) throw new Error('Resultado da página indisponível.')
    return result as ReturnType<typeof pageOperation>
  }
  back() { if (this.view?.webContents.navigationHistory.canGoBack()) { this.documentEpoch++; this.view.webContents.navigationHistory.goBack() } }
  forward() { if (this.view?.webContents.navigationHistory.canGoForward()) { this.documentEpoch++; this.view.webContents.navigationHistory.goForward() } }
  reload() { if (this.view) { this.documentEpoch++; this.view.webContents.reload() } }
  async openExternal(value: unknown): Promise<void> {
    const url = safeWebUrl(value)
    if (!url) throw new Error('Somente endereços HTTP ou HTTPS podem ser abertos no navegador do sistema.')
    await this.openExternalUrl(url)
  }
  close(): void {
    this.revokeSharing(); this.context = null; this.visible = false
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
    const block = (event: Electron.Event, url: string) => { this.documentEpoch++; if (!safeWebUrl(url)) { event.preventDefault(); this.error = 'Endereço bloqueado: somente HTTP ou HTTPS.'; this.publish() } }
    contents.on('did-start-navigation', (_event, _url, _isInPlace, isMainFrame) => { if (isMainFrame) this.documentEpoch++ })
    contents.on('will-navigate', block)
    contents.on('will-redirect', block)
    contents.on('destroyed', () => { if (this.view === view) { this.visible = false; this.context = null; this.revokeSharing(); this.view = null; this.publish() } })
    // Pop-ups permanecem na mesma aba; nada é entregue ao sistema sem gesto do usuário.
    contents.setWindowOpenHandler(({ url }) => { const safe = safeWebUrl(url); if (safe) { this.documentEpoch++; void contents.loadURL(safe).catch(() => undefined) } return { action: 'deny' } })
    contents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => { if (isMainFrame && code !== -3) { this.error = description || 'Falha ao carregar a página.'; this.publish() } })
    for (const name of ['did-start-loading', 'did-stop-loading', 'did-navigate', 'did-navigate-in-page', 'page-title-updated'] as const) contents.on(name as 'did-stop-loading', () => { if (name === 'did-start-loading' || name === 'did-navigate' || name === 'did-navigate-in-page') this.documentEpoch++; this.publish() })
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
  handle('setSharingContext', owner => browser.setSharingContext(owner as PlatformBrowserOwner | null))
  handle('grantSharing', owner => browser.grantSharing(owner as PlatformBrowserOwner))
  handle('revokeSharing', () => browser.revokeSharing())
}
