import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ASSISTANT_ID, type Approval, type Run } from '../../../shared/v9'

vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false }, safeStorage: { isEncryptionAvailable: () => false } }))

import { AppService } from '../../../main/v9/workspace'
import { PlatformBrowser } from '../../../main/ipc/platform-browser'
import { WorkspaceStore } from '../../../main/v9/store'

class FakeRuntime extends EventEmitter {
  async models() { return [] }
  async thread() { return { id: 'thread-test', history: 'empty' as const } }
  async request() { return { turn: { id: 'turn-test', status: 'inProgress' } } }
  respond() {}
  async interrupt() {}
  close() {}
}

const directories: string[] = []
const services: AppService[] = []
function directory() { const value = mkdtempSync(join(tmpdir(), 'politron-approval-')); directories.push(value); return value }
function open(path: string) { const service = new AppService(path, new FakeRuntime() as any); services.push(service); return service }
afterEach(() => {
  for (const service of services.splice(0)) service.dispose()
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 })
})

function setup() {
  const data = directory(); const workspacePath = directory(); const service = open(data)
  const agent = service.saveAgent({ name: 'Escritora', alias: 'escritora', instructions: 'Edite apenas o solicitado.', canWrite: true, approvalMode: 'ask' })
  const conversation = service.saveConversation({ name: 'Aprovações', agentIds: [agent.id], workspacePath })
  const workspace = service.store.workspace(conversation.workspaceId)
  const now = new Date().toISOString()
  const message = { id: 'message-test', conversationId: conversation.id, agentId: agent.id, author: agent.name, role: 'assistant' as const, text: 'Vou criar o arquivo.', status: 'running' as const, runId: 'run-test', createdAt: now }
  service.store.putMessage(message)
  const run = { id: 'run-test', conversationId: conversation.id, agentId: agent.id, rootId: 'run-test', parentId: null, ancestry: [agent.id], status: 'running' as const, threadId: null, turnId: null, messageId: message.id, input: 'Crie um arquivo.', agent, workspaceId: workspace.id, workspacePath: workspace.path, createdAt: now } satisfies Run
  service.store.putRun(run)
  const context: any = { run, message, conversation, agent, signal: new AbortController().signal }
  ;(service as any).contexts.set(run.id, context)
  return { service, context, workspacePath, run }
}

const write = (service: AppService, context: unknown, content = 'proposta', toolCallId = 'tool-1') => (service as any).callTool(context, 'workspace_write', { path: 'nota.txt', content }, toolCallId) as Promise<string>

describe('aprovações inline V9', () => {
  it('persiste permissões e modo de aprovação do Assistente, exigindo confirmação antes de escrever', async () => {
    const data = directory(), workspacePath = directory(), service = open(data)
    const assistant = service.saveAssistantPreferences({ canWrite: true, computerUse: true, approvalMode: 'ask' })
    expect(service.store.agent(ASSISTANT_ID)).toMatchObject({ canWrite: true, computerUse: true, approvalMode: 'ask' })
    const persisted = new WorkspaceStore(data)
    expect(persisted.snapshot().assistant).toMatchObject({ canWrite: true, computerUse: true, approvalMode: 'ask' })
    persisted.close()
    const conversation = service.saveConversation({ name: 'Assistente', agentIds: [], workspacePath })
    const workspace = service.store.workspace(conversation.workspaceId)
    const now = new Date().toISOString()
    const message = { id: 'assistant-message', conversationId: conversation.id, agentId: ASSISTANT_ID, author: 'Assistente', role: 'assistant' as const, text: '', status: 'running' as const, runId: 'assistant-run', createdAt: now }
    const run: Run = { id: 'assistant-run', conversationId: conversation.id, agentId: ASSISTANT_ID, rootId: 'assistant-run', parentId: null, ancestry: [ASSISTANT_ID], status: 'running', threadId: null, turnId: null, messageId: message.id, input: 'Crie arquivo.', agent: assistant, workspaceId: workspace.id, workspacePath, createdAt: now }
    service.store.putMessage(message); service.store.putRun(run)
    const context: any = { run, message, conversation, agent: service.store.agent(ASSISTANT_ID), signal: new AbortController().signal }
    const pendingWrite = write(service, context, 'conteúdo do assistente', 'assistant-write')
    await vi.waitFor(() => expect(service.store.approvals()[0]?.status).toBe('pending'))
    expect(existsSync(join(workspacePath, 'nota.txt'))).toBe(false)
    await service.respondApproval(service.store.approvals()[0].id, true)
    await expect(pendingWrite).resolves.toContain('Arquivo salvo')
  })

  it('suspende a execução e só grava a proposta depois da aprovação', async () => {
    const { service, context, workspacePath, run } = setup()
    const pendingWrite = write(service, context)
    await vi.waitFor(() => expect(service.store.approvals()[0]?.status).toBe('pending'))
    expect(service.store.runs().find(item => item.id === run.id)?.status).toBe('waiting')
    const approval = service.store.approvals()[0]
    expect(approval.details).toMatchObject({ path: 'nota.txt', after: 'proposta' })
    expect(existsSync(join(workspacePath, 'nota.txt'))).toBe(false)
    await service.respondApproval(approval.id, true)
    await expect(pendingWrite).resolves.toContain('Arquivo salvo')
    expect(readFileSync(join(workspacePath, 'nota.txt'), 'utf8')).toBe('proposta')
    expect(service.store.approval(approval.id)?.status).toBe('approved')
    expect(service.store.fileChangesForRun(run.id)[0]).toMatchObject({ status: 'applied', after: 'proposta' })
  })

  it('nega escrita e permite cancelar uma espera sem executar a ferramenta', async () => {
    const first = setup(); const deniedWrite = write(first.service, first.context)
    await vi.waitFor(() => expect(first.service.store.approvals()[0]?.status).toBe('pending'))
    await first.service.respondApproval(first.service.store.approvals()[0].id, false)
    await expect(deniedWrite).resolves.toContain('negada')
    expect(existsSync(join(first.workspacePath, 'nota.txt'))).toBe(false)

    const second = setup(); const controller = new AbortController(); second.context.signal = controller.signal
    const waitingWrite = write(second.service, second.context)
    await vi.waitFor(() => expect(second.service.store.approvals()[0]?.status).toBe('pending'))
    controller.abort()
    await expect(waitingWrite).resolves.toContain('negada')
    expect(second.service.store.approvals()[0].status).toBe('interrupted')
    expect(existsSync(join(second.workspacePath, 'nota.txt'))).toBe(false)
  })

  it('pede aprovação antes de abrir o navegador', async () => {
    const { service, context } = setup()
    context.agent = service.saveAgent({ ...context.agent, computerUse: true })
    const open = vi.fn()
    service.setPlatformBrowser({ openForAgent: open, captureDocument: async () => 1, assertSharing: () => undefined, revokeSharing: () => undefined } as never)
    const pendingNavigation = (service as any).callTool(context, 'browser_open', { url: 'https://example.com' }, 'browser-call') as Promise<string>
    await vi.waitFor(() => expect(service.store.approvals()[0]?.status).toBe('pending'))
    expect(service.store.approvals()[0]).toMatchObject({ kind: 'browser', details: { action: 'Abrir https://example.com/' } })
    expect(open).not.toHaveBeenCalled()
    await service.respondApproval(service.store.approvals()[0].id, false)
    await expect(pendingNavigation).resolves.toContain('negada')
    expect(open).not.toHaveBeenCalled()
  })

  it('não grava query nem fragmento de URLs nos detalhes da aprovação', async () => {
    const { service, context } = setup()
    context.agent = service.saveAgent({ ...context.agent, computerUse: true })
    service.setPlatformBrowser({ openForAgent: vi.fn(), captureDocument: async () => 1, assertSharing: () => undefined, revokeSharing: () => undefined } as never)
    const pending = (service as any).callTool(context, 'browser_open', { url: 'https://example.com/path?token=secret#private' }, 'browser-private-url') as Promise<string>
    await vi.waitFor(() => expect(service.store.approvals()[0]?.status).toBe('pending'))
    const action = String(service.store.approvals()[0].details.action)
    expect(action).toContain('https://example.com/path')
    expect(action).not.toContain('token=secret'); expect(action).not.toContain('#private')
    await service.respondApproval(service.store.approvals()[0].id, false)
    await pending
  })
  it('remove queries de URLs embutidas em argumentos de clique', async () => {
    const { service, context } = setup()
    context.agent = service.saveAgent({ ...context.agent, computerUse: true })
    service.setPlatformBrowser({ captureDocument: async () => 1, assertSharing: () => undefined, revokeSharing: () => undefined } as never)
    const pending = (service as any).callTool(context, 'browser_click', { selector: 'a[href="https://example.com/path?token=secret#private"]' }, 'browser-private-selector') as Promise<string>
    await vi.waitFor(() => expect(service.store.approvals()[0]?.status).toBe('pending'))
    const action = String(service.store.approvals()[0].details.action)
    expect(action).toContain('https://example.com/path'); expect(action).not.toContain('token=secret'); expect(action).not.toContain('#private')
    await service.respondApproval(service.store.approvals()[0].id, false); await pending
  })
  it('não executa aprovação pendente após revogação e novo compartilhamento', async () => {
    const { service, context } = setup()
    context.agent = service.saveAgent({ ...context.agent, computerUse: true })
    let generation = 1
    const open = vi.fn()
    service.setPlatformBrowser({ openForAgent: open, captureDocument: async () => generation, assertSharing: (_owner: unknown, token: number) => { if (token !== generation) throw new Error('Compartilhamento revogado.') }, revokeSharing: () => undefined } as never)
    const pending = (service as any).callTool(context, 'browser_open', { url: 'https://example.com' }, 'browser-stale') as Promise<unknown>
    await vi.waitFor(() => expect(service.store.approvals()[0]?.status).toBe('pending'))
    generation++
    await service.respondApproval(service.store.approvals()[0].id, true)
    await expect(pending).rejects.toThrow(/revogado/)
    expect(open).not.toHaveBeenCalled()
  })

  it('não aplica clique aprovado antes de reload da mesma página', async () => {
    const { service, context } = setup()
    context.agent = service.saveAgent({ ...context.agent, computerUse: true })
    const contents = Object.assign(new EventEmitter(), {
      loadURL: vi.fn(async () => undefined), getURL: () => 'https://example.com/', getTitle: () => '', isLoading: () => false, isDestroyed: () => false,
      navigationHistory: { canGoBack: () => false, canGoForward: () => false }, setWindowOpenHandler: vi.fn(), reload: vi.fn(),
      executeJavaScriptInIsolatedWorld: vi.fn(async () => 'document-id'),
    })
    const view = { webContents: contents, setBounds: vi.fn(), setVisible: vi.fn() }
    const host = { isDestroyed: () => false, contentView: { addChildView: vi.fn(), removeChildView: vi.fn() }, webContents: { send: vi.fn(), getZoomFactor: () => 1 } }
    const browser = new PlatformBrowser(() => host as never, () => view as never, async () => undefined, owner => service.canShareBrowser(owner))
    const owner = { workspaceId: context.conversation.workspaceId, conversationId: context.conversation.id, agentId: context.agent.id }
    browser.navigate('https://example.com'); browser.setBounds({ x: 0, y: 0, width: 300, height: 200 }, true)
    browser.setSharingContext(owner); browser.grantSharing(owner); service.setPlatformBrowser(browser)
    const act = vi.spyOn(browser, 'actForAgent'), capture = vi.spyOn(browser, 'captureDocument')
    const pending = (service as any).callTool(context, 'browser_click', { selector: '#pay' }, 'browser-document') as Promise<unknown>
    await vi.waitFor(() => expect(service.store.approvals()[0]?.status).toBe('pending'))
    expect(capture).toHaveBeenCalledWith(owner, 'click', { selector: '#pay' })
    browser.reload()
    await service.respondApproval(service.store.approvals()[0].id, true)
    await expect(pending).rejects.toThrow(/documento|página/i)
    expect(act).not.toHaveBeenCalled()
  })

  it('recusa tecla não suportada sem solicitar aprovação nem enviar evento', async () => {
    const { service, context } = setup()
    context.agent = service.saveAgent({ ...context.agent, computerUse: true })
    const capture = vi.fn()
    service.setPlatformBrowser({ captureDocument: capture, revokeSharing: () => undefined } as never)
    await expect((service as any).callTool(context, 'browser_key', { key: 'Enter' }, 'unsupported-key')).rejects.toThrow(/não suportada/i)
    expect(capture).not.toHaveBeenCalled(); expect(service.store.approvals()).toHaveLength(0)
  })
  it('bloqueia navegação antes de pedir aprovação quando o agente não tem permissão', async () => {
    const { service, context } = setup()
    const opened = vi.fn()
    service.setPlatformBrowser({ openForAgent: opened, revokeSharing: () => undefined } as never)
    await expect((service as unknown as { callTool: (context: unknown, tool: string, args: Record<string, unknown>, id: string) => Promise<unknown> }).callTool(context, 'browser_open', { url: 'https://example.com' }, 'browser-denied')).rejects.toThrow('bloqueado')
    expect(service.store.approvals()).toHaveLength(0)
    expect(opened).not.toHaveBeenCalled()
  })

  it('converte aprovações pendentes em interrompidas ao reiniciar, sem repetir a escrita', () => {
    const data = directory(), workspacePath = directory(), store = new WorkspaceStore(data)
    const agent = store.saveAgent({ name: 'Escritora', alias: 'escritora', instructions: 'Escreva com aprovação.' })
    const conversation = store.saveConversation({ name: 'Pendente', agentIds: [agent.id], workspacePath })
    const workspace = store.workspace(conversation.workspaceId)
    const now = new Date().toISOString()
    const message = { id: 'message-pending', conversationId: conversation.id, agentId: agent.id, author: agent.name, role: 'assistant' as const, text: '', status: 'waiting' as const, runId: 'run-pending', createdAt: now }
    const run: Run = { id: 'run-pending', conversationId: conversation.id, agentId: agent.id, rootId: 'run-pending', parentId: null, ancestry: [agent.id], status: 'waiting', threadId: 'thread-pending', turnId: 'turn-pending', messageId: message.id, input: 'Crie um arquivo.', agent, workspaceId: workspace.id, workspacePath: workspace.path, createdAt: now }
    const approval: Approval = { id: 'approval-pending', runId: run.id, conversationId: conversation.id, agentId: agent.id, kind: 'write', details: { path: 'secret.txt', after: 'never write' }, status: 'pending', createdAt: now, resolvedAt: null }
    store.putMessage(message); store.putRun(run); store.putApproval(approval); store.close()
    const reopened = new WorkspaceStore(data)
    expect(reopened.approval(approval.id)).toMatchObject({ status: 'interrupted' })
    expect(reopened.runs().find(item => item.id === run.id)?.status).toBe('interrupted')
    expect(reopened.message(message.id)?.status).toBe('interrupted')
    expect(existsSync(join(workspacePath, 'secret.txt'))).toBe(false)
    reopened.close()
  })
})
