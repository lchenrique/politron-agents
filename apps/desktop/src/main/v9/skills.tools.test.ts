import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false }, safeStorage: { isEncryptionAvailable: () => false } }))

import { AppService } from './workspace'

class FakeRuntime extends EventEmitter {
  async models() { return [] }
  async thread() { return { id: 'thread-test', history: 'empty' as const } }
  async request() { return { turn: { id: 'turn-test', status: 'inProgress' } } }
  respond() {}
  async interrupt() {}
  close() {}
}

const services: AppService[] = []
const directories: string[] = []
afterEach(() => {
  for (const service of services.splice(0)) service.dispose()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
})

function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'politron-skills-tools-'))
  directories.push(directory)
  const service = new AppService(directory, new FakeRuntime() as unknown as ConstructorParameters<typeof AppService>[1])
  services.push(service)
  const agent = service.saveAgent({ name: 'Nina', alias: 'nina', instructions: 'Cuide do frontend.', canWrite: true })
  const workspace = service.store.saveWorkspace({ name: 'Projeto' })
  const call = (name: string, args: Record<string, unknown>) => (service as unknown as { callTool: (context: unknown, name: string, args: Record<string, unknown>) => Promise<unknown> }).callTool({ agent, run: { workspaceId: workspace.id, workspacePath: workspace.path } }, name, args)
  const names = () => ((service as unknown as { tools: (context: unknown) => { name: string }[] }).tools({ agent, run: { workspaceId: workspace.id } })).map(tool => tool.name)
  return { service, agent, workspace, call, names }
}

describe('skills como ferramenta do agente', () => {
  it('expõe list_skills, read_skill e save_skill mesmo quando o workspace bloqueia escrita (skill fica nos dados do app)', () => {
    const { names, service, workspace } = setup()
    expect(names()).toEqual(expect.arrayContaining(['list_skills', 'read_skill', 'save_skill']))
    service.store.saveWorkspace({ id: workspace.id, permissions: { chiefCreateAgents: false, chiefEditAgents: false, chiefManageTeam: false, chiefCreateSessions: false, filesWrite: 'deny', computerUse: 'inherit' } })
    expect(names()).toEqual(expect.arrayContaining(['list_skills', 'read_skill', 'save_skill']))
  })

  it('Boo sem escrita grava skill e vê o aprendizado na conversa; segredos são recusados', async () => {
    const { service, workspace } = setup()
    const agent = service.saveAgent({ name: 'Leitor', alias: 'leitor', instructions: 'Só lê.', canWrite: false })
    const conversation = service.saveConversation({ name: 'Skills', workspaceId: workspace.id })
    const call = (args: Record<string, unknown>) => (service as unknown as { callTool: (context: unknown, name: string, args: Record<string, unknown>) => Promise<unknown> }).callTool({ agent, conversation, run: { id: 'run-x', workspaceId: workspace.id, workspacePath: workspace.path } }, 'save_skill', args)
    await call({ operation: 'create', slug: 'ler-logs', name: 'Ler logs', description: 'Quando investigar falha.', content: 'Abra logs/main.log.' })
    await call({ operation: 'update', slug: 'ler-logs', name: 'Ler logs', description: 'Quando investigar falha.', content: 'Abra logs/main.log e o Crashpad.' })
    expect(service.store.history(conversation.id).filter(message => message.role === 'activity').map(message => message.text)).toEqual(['Aprendizado · Ler logs', 'Aprendizado · Ler logs (atualizada)'])
    await expect(call({ operation: 'create', slug: 'chave', name: 'Chave', description: 'Quando chamar a API.', content: 'curl -H "Authorization: Bearer sk-abcdefghijklmnopqrstuvwxyz"' })).rejects.toThrow(/segredo/)
  })

  it('agente grava uma skill, ela aparece em list_skills e dá para ler o conteúdo completo', async () => {
    const { call } = setup()
    const before = JSON.parse((await call('list_skills', {})) as string)
    expect(before.some((skill: { name: string }) => skill.name === 'Corrigir build quebrado')).toBe(false)

    const result = await call('save_skill', { operation: 'create', slug: 'corrigir-build-quebrado', name: 'Corrigir build quebrado', description: 'Use quando o build falhar por dependência desatualizada.', content: 'Passo 1: rode npm install.' })
    expect(result).toContain('criada')

    const after = JSON.parse((await call('list_skills', {})) as string) as { id: string; name: string; source: string }[]
    const saved = after.find(skill => skill.name === 'Corrigir build quebrado')
    expect(saved).toMatchObject({ source: 'learned' })
    expect(await call('read_skill', { id: saved!.id })).toContain('Passo 1: rode npm install.')
  })

  it('recusa criar skill duplicada e exige update pra corrigir uma já existente', async () => {
    const { call } = setup()
    await call('save_skill', { operation: 'create', slug: 'minha-skill', name: 'Minha skill', description: 'Teste.', content: 'Conteúdo original.' })
    await expect(call('save_skill', { operation: 'create', slug: 'minha-skill', name: 'Minha skill', description: 'Teste.', content: 'x' })).rejects.toThrow(/já existe/i)
    await call('save_skill', { operation: 'update', slug: 'minha-skill', name: 'Minha skill', description: 'Teste atualizado.', content: 'Conteúdo corrigido.' })
    const list = JSON.parse((await call('list_skills', {})) as string) as { id: string; name: string; description: string }[]
    const skill = list.find(item => item.name === 'Minha skill')!
    expect(skill.description).toBe('Teste atualizado.')
  })
})
