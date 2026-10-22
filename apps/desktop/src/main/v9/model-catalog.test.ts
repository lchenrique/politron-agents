import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentRuntime } from './agent-runtime'
import type { Model } from '../../shared/v9'

vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false }, safeStorage: { isEncryptionAvailable: () => false } }))
import { AppService } from './workspace'

class CatalogRuntime extends EventEmitter implements AgentRuntime {
  models = vi.fn<() => Promise<Model[]>>()
  async thread() { return { id: 'thread', history: 'empty' as const } }
  async send() { return {} }
  respond() {}
  async interrupt() {}
  close = vi.fn()
}
const dirs: string[] = []
const services: AppService[] = []
afterEach(() => {
  for (const service of services.splice(0)) service.dispose()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  vi.useRealTimers()
})
function setup(credential = true) {
  const directory = mkdtempSync(join(tmpdir(), 'politron-model-catalog-')); dirs.push(directory)
  const codex = new CatalogRuntime(); const claude = new CatalogRuntime()
  const app = new AppService(directory, codex, claude); services.push(app)
  vi.spyOn(app.credentials, 'has').mockResolvedValue(credential)
  codex.models.mockResolvedValue([{ id: 'gpt', name: 'GPT', runtime: 'codex', isDefault: true }])
  claude.models.mockResolvedValue([{ id: 'sonnet', name: 'Sonnet', runtime: 'claude', isDefault: true }])
  return { app, codex, claude }
}

describe('catálogo de modelos independente por runtime', () => {
  it('preserva ordem, identificadores e nomes ao agregar ambos os catálogos', async () => {
    const { app } = setup()
    await expect(app.models()).resolves.toEqual([
      { id: 'codex:gpt', name: 'GPT · Codex', runtime: 'codex', isDefault: true },
      { id: 'claude:sonnet', name: 'Sonnet · Claude', runtime: 'claude', isDefault: true },
    ])
  })
  it('consulta apenas o runtime solicitado explicitamente', async () => {
    const { app, codex, claude } = setup()
    await expect(app.models('claude')).resolves.toContainEqual(expect.objectContaining({ id: 'claude:sonnet' }))
    expect(claude.models).toHaveBeenCalledOnce()
    expect(codex.models).not.toHaveBeenCalled()
  })
  it('preserva Claude quando Codex falha e existe credencial do aplicativo', async () => {
    const { app, codex, claude } = setup()
    codex.models.mockRejectedValue(new Error('Codex indisponível.'))
    await expect(app.models()).resolves.toEqual([{ id: 'claude:sonnet', name: 'Sonnet · Claude', runtime: 'claude', isDefault: true }])
    expect(claude.models).toHaveBeenCalledOnce()
  })
  it('preserva Codex quando Claude falha', async () => {
    const { app, claude } = setup()
    claude.models.mockRejectedValue(new Error('Claude indisponível.'))
    await expect(app.models()).resolves.toContainEqual(expect.objectContaining({ id: 'codex:gpt' }))
  })
  it('consulta o login do CLI Claude mesmo sem chave própria do aplicativo', async () => {
    const { app, codex, claude } = setup(false)
    codex.models.mockRejectedValue(new Error('Codex precisa de login.'))
    await expect(app.models()).resolves.toContainEqual(expect.objectContaining({ id: 'claude:sonnet' }))
    expect(claude.models).toHaveBeenCalledOnce()
  })
  it('mantém erro útil quando todos falham e erro original em pedido explícito', async () => {
    const { app, codex, claude } = setup()
    codex.models.mockRejectedValue(new Error('Codex precisa de login.'))
    claude.models.mockRejectedValue(new Error('Chave Anthropic recusada.'))
    await expect(app.models()).rejects.toThrow('Codex precisa de login.')
    await expect(app.models('claude')).rejects.toThrow('Chave Anthropic recusada.')
  })
  it('limita runtime travado e devolve catálogo disponível', async () => {
    vi.useFakeTimers()
    const { app, codex } = setup()
    codex.models.mockImplementation(() => new Promise(() => {}))
    const models = app.models()
    await vi.advanceTimersByTimeAsync(15_000)
    await expect(models).resolves.toContainEqual(expect.objectContaining({ id: 'claude:sonnet' }))
    expect(codex.close).not.toHaveBeenCalled()
  })
  it.each([
    { efforts: [] as Model['supportedEfforts'], expected: undefined },
    { efforts: ['low', 'high'] as Model['supportedEfforts'], expected: 'high' },
  ])('normaliza esforço herdado pelo catálogo sem alterar o perfil: $expected', async ({ efforts, expected }) => {
    const { app, claude } = setup()
    const agent = app.saveAgent({ name: 'Claude', instructions: 'Ajude o usuário.', runtime: 'claude', model: 'haiku', effort: 'max' })
    const conversation = app.saveConversation({ agentIds: [agent.id] })
    app.setCachedModelResolver(async () => [{ id: 'haiku', name: 'Haiku', runtime: 'claude', isDefault: true, supportedEfforts: efforts, defaultEffort: 'high' }])
    // Interrompe antes de qualquer envio; o estado da execução já contém o perfil efetivo.
    vi.spyOn(claude, 'thread').mockRejectedValue(new Error('Sessão simulada encerrada.'))
    await app.send(conversation.id, 'Pedido simulado.')
    expect(app.store.runs().find(run => run.conversationId === conversation.id)?.agent.effort).toBe(expected)
    expect(app.store.agent(agent.id).effort).toBe('max')
    expect(claude.models).not.toHaveBeenCalled()
  })
})
