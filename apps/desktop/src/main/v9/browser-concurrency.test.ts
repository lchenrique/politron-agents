import { describe, expect, it, vi } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { BrowserService } from './browser'

describe('inicialização concorrente do navegador', () => {
  it('compartilha uma única inicialização Chromium entre agentes', async () => {
    const service = new BrowserService()
    const browser = { isConnected: () => true, close: vi.fn(async () => {}) } as unknown as Browser
    let launch!: (browser: Browser) => void
    const pending = new Promise<Browser>(resolve => { launch = resolve })
    const spy = vi.spyOn(chromium, 'launch').mockReturnValue(pending)
    try {
      const internal = service as unknown as { getBrowser(): Promise<Browser> }
      const first = internal.getBrowser(), second = internal.getBrowser()
      launch(browser)
      await expect(first).resolves.toBe(browser)
      await expect(second).resolves.toBe(browser)
      expect(spy).toHaveBeenCalledTimes(1)
    } finally { spy.mockRestore(); await service.close() }
  })

  it('descarta newContext pendente de conversa sem publicar frame tardio', async () => {
    const service = new BrowserService()
    const browser = { isConnected: () => true, close: vi.fn(async () => {}) } as unknown as Browser
    let resolveContext!: (context: never) => void
    const newContext = vi.fn(() => new Promise<never>(resolve => { resolveContext = resolve }))
    const spy = vi.spyOn(chromium, 'launch').mockResolvedValue({ ...browser, newContext } as unknown as Browser)
    const internal = service as unknown as { session(conversationId: string, agentId: string): Promise<unknown>; disposeConversation?(id: string): Promise<void> }
    const frames = vi.fn()
    service.on('frame', frames)
    try {
      const pending = internal.session('conversation-deleted', 'agent-a')
      await vi.waitFor(() => expect(newContext).toHaveBeenCalledOnce())
      await internal.disposeConversation?.('conversation-deleted')
      const page = { on: vi.fn(), isClosed: () => false, screenshot: async () => Buffer.from('png'), url: () => 'about:blank', title: async () => 'test' }
      const context = { close: vi.fn(async () => {}), newPage: vi.fn(async () => page) }
      resolveContext(context as never)
      await expect(pending).rejects.toThrow()
      expect(context.close).toHaveBeenCalledOnce()
      expect(service.frames('conversation-deleted')).toEqual([])
      expect(frames).not.toHaveBeenCalled()
    } finally { spy.mockRestore(); await service.close() }
  })

  it('fecha sessões e frames do agente excluído, preservando a sessão de outro agente', async () => {
    const service = new BrowserService()
    const pages = ['a', 'b'].map(name => ({ on: vi.fn(), isClosed: () => false, screenshot: async () => Buffer.from(name), url: () => `https://${name}.test`, title: async () => name }))
    const contexts = pages.map(page => ({ close: vi.fn(async () => {}), newPage: vi.fn(async () => page) }))
    const allContexts = [...contexts]
    const browser = { isConnected: () => true, close: vi.fn(async () => {}), newContext: vi.fn().mockImplementation(async () => contexts.shift()) } as unknown as Browser
    const spy = vi.spyOn(chromium, 'launch').mockResolvedValue(browser)
    const internal = service as unknown as { session(conversationId: string, agentId: string): Promise<unknown>; disposeAgent(id: string): Promise<void> }
    const closed = vi.fn()
    service.on('frameClosed', closed)
    try {
      await internal.session('conversation-a', 'agent-a')
      await internal.session('conversation-b', 'agent-b')
      await internal.disposeAgent('agent-a')
      expect(allContexts[0].close).toHaveBeenCalledOnce()
      expect(allContexts[1].close).not.toHaveBeenCalled()
      expect(service.frames('conversation-a')).toEqual([])
      expect(service.frames('conversation-b')).toHaveLength(1)
      expect(closed).toHaveBeenCalledWith({ key: 'conversation-a:agent-a', conversationId: 'conversation-a', agentId: 'agent-a' })
    } finally { spy.mockRestore(); await service.close() }
  })
})
