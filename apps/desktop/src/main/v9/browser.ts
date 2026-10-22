import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { EventEmitter } from 'node:events'
import type { BrowserFrame } from '../../shared/v9'

type Session = { key: string; conversationId: string; agentId: string; context: BrowserContext; page: Page; x: number | null; y: number | null; human: boolean; action: string }
type SessionStart = { conversationId: string; agentId: string; cancelled: boolean; promise: Promise<Session> }
const viewport = { width: 1280, height: 800 }
const httpUrl = (value: unknown) => {
  if (typeof value !== 'string' || value.length > 4000) throw new Error('Informe um endereço web válido.')
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('O navegador aceita endereços HTTP e HTTPS.')
  return url.toString()
}

export class BrowserService extends EventEmitter {
  private browser: Browser | null = null
  private browserStart: Promise<Browser> | null = null
  private sessions = new Map<string, Session>()
  private sessionStarts = new Map<string, SessionStart>()
  private latest = new Map<string, BrowserFrame>()
  private async getBrowser() {
    if (this.browser?.isConnected()) return this.browser
    if (!this.browserStart) this.browserStart = chromium.launch({ headless: true, args: ['--disable-background-networking', '--disable-default-apps', '--no-first-run'] }).then(browser => { this.browser = browser; return browser }).finally(() => { this.browserStart = null })
    return this.browserStart
  }
  private async session(conversationId: string, agentId: string): Promise<Session> {
    const key = `${conversationId}:${agentId}`
    const current = this.sessions.get(key)
    if (current && !current.page.isClosed()) return current
    const pending = this.sessionStarts.get(key)
    if (pending) return pending.promise
    const start: SessionStart = { conversationId, agentId, cancelled: false, promise: Promise.resolve(null as never) }
    start.promise = this.createSession(key, conversationId, agentId, start).finally(() => { if (this.sessionStarts.get(key) === start) this.sessionStarts.delete(key) })
    this.sessionStarts.set(key, start)
    return start.promise
  }
  private async createSession(key: string, conversationId: string, agentId: string, start: SessionStart): Promise<Session> {
    const browser = await this.getBrowser()
    if (start.cancelled) throw new Error('A sessão de navegador foi encerrada.')
    const context = await browser.newContext({ viewport, acceptDownloads: false, serviceWorkers: 'block' })
    if (start.cancelled) { await context.close().catch(() => undefined); throw new Error('A sessão de navegador foi encerrada.') }
    try {
    const page = await context.newPage()
    if (start.cancelled) { await context.close().catch(() => undefined); throw new Error('A sessão de navegador foi encerrada.') }
    const value: Session = { key, conversationId, agentId, context, page, x: null, y: null, human: false, action: 'Navegador pronto' }
    page.on('close', () => { if (this.sessions.get(key) === value) { this.sessions.delete(key); this.latest.delete(key) } })
    this.sessions.set(key, value)
    await this.capture(value)
    if (start.cancelled || this.sessions.get(key) !== value) { await context.close().catch(() => undefined); throw new Error('A sessão de navegador foi encerrada.') }
    return value
    } catch (error) { await context.close().catch(() => undefined); if (this.sessions.get(key)?.context === context) this.sessions.delete(key); throw error }
  }
  private async capture(session: Session): Promise<BrowserFrame> {
    const page = session.page
    const image = page.isClosed() ? '' : `data:image/png;base64,${(await page.screenshot({ type: 'png', animations: 'disabled' })).toString('base64')}`
    const frame: BrowserFrame = { key: session.key, conversationId: session.conversationId, agentId: session.agentId, url: page.isClosed() ? '' : page.url(), title: page.isClosed() ? '' : await page.title().catch(() => ''), image, width: viewport.width, height: viewport.height, x: session.x, y: session.y, human: session.human, action: session.action, capturedAt: new Date().toISOString() }
    if (this.sessions.get(session.key) === session) { this.latest.set(session.key, frame); this.emit('frame', frame) }
    return frame
  }
  private async summarize(page: Page) {
    return page.evaluate(() => {
      const visible = (element: Element) => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' }
      const targets = [...document.querySelectorAll('a,button,input,textarea,select,[role="button"],[contenteditable="true"]')].filter(visible).slice(0, 100).map((element, index) => {
        const el = element as HTMLElement
        const rect = el.getBoundingClientRect()
        return { index, tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || '', text: (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title') || '').trim().slice(0, 180), href: el instanceof HTMLAnchorElement ? el.href : undefined, x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
      })
      return { title: document.title, url: location.href, text: (document.body?.innerText || '').slice(0, 12000), targets }
    })
  }
  async open(conversationId: string, agentId: string, value: unknown) {
    const session = await this.session(conversationId, agentId)
    if (session.human) throw new Error('O navegador está sob controle humano. Devolva o controle ao agente primeiro.')
    await session.page.goto(httpUrl(value), { waitUntil: 'domcontentloaded', timeout: 45000 })
    session.action = 'Agente abriu a página'
    const summary = await this.summarize(session.page)
    await this.capture(session)
    return summary
  }
  async observe(conversationId: string, agentId: string) {
    const session = await this.session(conversationId, agentId)
    return this.summarize(session.page)
  }
  async act(conversationId: string, agentId: string, operation: string, args: Record<string, unknown>) {
    const session = await this.session(conversationId, agentId)
    if (session.human) throw new Error('O navegador está sob controle humano. Devolva o controle ao agente primeiro.')
    const page = session.page
    if (operation === 'click') {
      if (typeof args.selector === 'string' && args.selector.length <= 400) {
        const target = page.locator(args.selector).first()
        const box = await target.boundingBox()
        await target.click({ timeout: 15000 })
        if (box) { session.x = Math.round(box.x + box.width / 2); session.y = Math.round(box.y + box.height / 2) }
      } else {
        const x = Number(args.x), y = Number(args.y)
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= viewport.width || y >= viewport.height) throw new Error('Informe um seletor ou uma posição válida na página.')
        await page.mouse.click(x, y); session.x = Math.round(x); session.y = Math.round(y)
      }
      session.action = 'Agente clicou na página'
    } else if (operation === 'fill') {
      const selector = typeof args.selector === 'string' ? args.selector : ''
      if (!selector || selector.length > 400) throw new Error('Informe o seletor do campo de texto.')
      await page.locator(selector).first().fill(String(args.text ?? '').slice(0, 10000), { timeout: 15000 })
      const box = await page.locator(selector).first().boundingBox()
      if (box) { session.x = Math.round(box.x + box.width / 2); session.y = Math.round(box.y + box.height / 2) }
      session.action = 'Agente digitou na página'
    } else if (operation === 'key') {
      const key = String(args.key || '')
      if (!/^(Enter|Tab|Escape|Arrow(Up|Down|Left|Right)|Backspace|Delete|Home|End|Page(Up|Down)|[A-Za-z0-9])$/.test(key)) throw new Error('Essa tecla não está liberada para a sessão do navegador.')
      await page.keyboard.press(key); session.action = `Agente pressionou ${key}`
    } else if (operation === 'scroll') {
      const delta = Math.max(-1200, Math.min(1200, Number(args.deltaY) || 0))
      await page.mouse.wheel(0, delta); session.action = 'Agente rolou a página'
    } else throw new Error('Ação de navegador desconhecida.')
    const summary = await this.summarize(page)
    await this.capture(session)
    return summary
  }
  frames(conversationId: string) {
    return [...this.latest.values()].filter(frame => frame.conversationId === conversationId)
  }
  async disposeConversation(conversationId: string): Promise<void> {
    await this.disposeWhere(owner => owner.conversationId === conversationId)
  }
  async disposeAgent(agentId: string): Promise<void> {
    await this.disposeWhere(owner => owner.agentId === agentId)
  }
  private async disposeWhere(matches: (owner: Pick<Session, 'conversationId' | 'agentId'>) => boolean): Promise<void> {
    const keys = new Set<string>()
    for (const [key, session] of this.sessions) if (matches(session)) keys.add(key)
    for (const [key, start] of this.sessionStarts) if (matches(start)) keys.add(key)
    const closing: Promise<unknown>[] = []
    for (const key of keys) {
      const start = this.sessionStarts.get(key)
      if (start) { start.cancelled = true; this.sessionStarts.delete(key) }
      const session = this.sessions.get(key)
      if (session) {
        this.sessions.delete(key)
        closing.push(session.context.close().catch(() => undefined))
      }
      const frame = this.latest.get(key)
      this.latest.delete(key)
      if (frame) this.emit('frameClosed', { key, conversationId: frame.conversationId, agentId: frame.agentId })
    }
    await Promise.allSettled(closing)
  }
  async control(key: string, human: boolean) {
    const session = this.sessions.get(key)
    if (!session || session.page.isClosed()) throw new Error('A sessão de navegador ainda não foi aberta por um agente.')
    session.human = human; session.action = human ? 'Você assumiu o navegador' : 'Controle devolvido ao agente'
    await this.capture(session)
  }
  async userAction(key: string, action: { type: 'click' | 'type' | 'scroll' | 'key' | 'refresh'; x?: number; y?: number; text?: string }) {
    const session = this.sessions.get(key)
    if (!session || session.page.isClosed()) throw new Error('A sessão de navegador não está disponível.')
    if (!session.human) throw new Error('Assuma o controle do navegador antes de interagir.')
    if (action.type === 'click') {
      const x = Number(action.x), y = Number(action.y)
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Posição do clique inválida.')
      await session.page.mouse.click(x, y); session.x = Math.round(x); session.y = Math.round(y); session.action = 'Clique manual'
    } else if (action.type === 'type') { await session.page.keyboard.type(String(action.text || '').slice(0, 5000)); session.action = 'Texto digitado manualmente' }
    else if (action.type === 'key') { await session.page.keyboard.press(String(action.text || 'Enter')); session.action = 'Tecla enviada manualmente' }
    else if (action.type === 'scroll') { await session.page.mouse.wheel(0, Math.max(-1200, Math.min(1200, Number(action.y) || 0))); session.action = 'Rolagem manual' }
    else if (action.type === 'refresh') { await session.page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 }); session.action = 'Página atualizada manualmente' }
    await this.capture(session)
  }
  async close() {
    for (const start of this.sessionStarts.values()) start.cancelled = true
    this.sessionStarts.clear()
    const frames = [...this.latest.values()]
    for (const frame of frames) this.emit('frameClosed', { key: frame.key, conversationId: frame.conversationId, agentId: frame.agentId })
    await this.browserStart?.catch(() => undefined)
    await Promise.all([...this.sessions.values()].map(session => session.context.close().catch(() => undefined)))
    this.sessions.clear(); this.latest.clear(); await this.browser?.close().catch(() => undefined); this.browser = null
  }
}
