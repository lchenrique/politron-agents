import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false }, safeStorage: { isEncryptionAvailable: () => false } }))

import { AppService } from '../workspace'
import { RealtimeService } from './service'
import type { Agent } from '../../../shared/v9'

class FakeRuntime extends EventEmitter {
  async models() { return [] }
  async thread() { return 'thread-test' }
  async request() { return { turn: { id: 'turn-test', status: 'inProgress' } } }
  respond() {}
  async interrupt() {}
  close() {}
}

const directories: string[] = []
const services: AppService[] = []
afterEach(() => {
  for (const service of services.splice(0)) service.dispose()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
})

function setup(awaitMs = 50) {
  const directory = mkdtempSync(join(tmpdir(), 'politron-realtime-tool-'))
  directories.push(directory)
  const appService = new AppService(directory, new FakeRuntime() as unknown as ConstructorParameters<typeof AppService>[1])
  services.push(appService)
  const agent = appService.saveAgent({ name: 'Nina', alias: 'nina', instructions: 'Cuide do frontend.' })
  const workspace = appService.store.saveWorkspace({ name: 'Projeto' })
  const conversation = appService.store.saveConversation({ workspaceId: workspace.id, agentIds: [agent.id] })
  const realtime = new RealtimeService(directory, appService, awaitMs)
  const tool = (realtime as unknown as { executeTool: (conversationId: string, agent: Agent) => { run: (args: Record<string, unknown>) => Promise<string> } }).executeTool(conversation.id, agent)
  return { appService, agent, conversation, realtime, tool }
}

describe('ferramenta de voz executar_tarefa', () => {
  it('quando o agente responde rápido, devolve o texto real pra Gemini narrar na hora, sem preenchimento', async () => {
    const { appService, agent, conversation, tool } = setup()
    vi.spyOn(appService, 'respondToAgent').mockResolvedValue('No Rio de Janeiro está 25°C.')
    const result = await tool.run({ tarefa: 'qual a temperatura no Rio de Janeiro' })
    expect(result).toBe('No Rio de Janeiro está 25°C.')
    expect(appService.respondToAgent).toHaveBeenCalledWith(conversation.id, 'qual a temperatura no Rio de Janeiro', agent.id)
  })

  it('tarefa longa: devolve preenchimento dentro do prazo e narra o resultado de verdade depois, na mesma sessão', async () => {
    const { appService, tool, realtime } = setup(30)
    let resolveTask!: (text: string) => void
    vi.spyOn(appService, 'respondToAgent').mockReturnValue(new Promise(resolve => { resolveTask = resolve }))
    const narrate = vi.fn()
    ;(realtime as unknown as { session: unknown }).session = { narrate }

    const immediate = await tool.run({ tarefa: 'refatora o módulo de login' })
    expect(immediate).toMatch(/ainda estou trabalhando/i)
    expect(narrate).not.toHaveBeenCalled()

    resolveTask('Refatorei o login; os testes passaram.')
    await vi.waitFor(() => expect(narrate).toHaveBeenCalledOnce())
    expect(narrate.mock.calls[0][0]).toContain('Refatorei o login; os testes passaram.')
  })

  it('não narra numa sessão diferente da que ainda estava aberta quando a tarefa foi pedida', async () => {
    const { appService, tool, realtime } = setup(30)
    let resolveTask!: (text: string) => void
    vi.spyOn(appService, 'respondToAgent').mockReturnValue(new Promise(resolve => { resolveTask = resolve }))
    const firstNarrate = vi.fn()
    const secondNarrate = vi.fn()
    ;(realtime as unknown as { session: unknown }).session = { narrate: firstNarrate }

    await tool.run({ tarefa: 'tarefa demorada' })
    // Usuário desligou e ligou de novo antes da tarefa terminar: troca a sessão ativa.
    ;(realtime as unknown as { session: unknown }).session = { narrate: secondNarrate }
    resolveTask('pronto')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(firstNarrate).not.toHaveBeenCalled()
    expect(secondNarrate).not.toHaveBeenCalled()
  })
})
