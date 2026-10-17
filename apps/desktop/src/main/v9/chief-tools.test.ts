import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false }, safeStorage: { isEncryptionAvailable: () => false } }))

import { AppService } from './workspace'
import type { Agent } from '../../shared/v9'

class FakeRuntime extends EventEmitter {
  async models() { return [] }
  async thread() { return 'thread-test' }
  async request() { return { turn: { id: 'turn-test', status: 'inProgress' } } }
  respond() {}
  async interrupt() {}
  close() {}
}

const permissions = { chiefCreateAgents: false, chiefEditAgents: false, chiefManageTeam: false, chiefCreateSessions: false, filesWrite: 'inherit' as const, computerUse: 'inherit' as const }
const services: AppService[] = []
const directories: string[] = []
afterEach(() => {
  for (const service of services.splice(0)) service.dispose()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
})

function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'politron-chief-tools-'))
  directories.push(directory)
  const service = new AppService(directory, new FakeRuntime() as unknown as ConstructorParameters<typeof AppService>[1])
  services.push(service)
  const chief = service.saveAgent({ name: 'Chief', alias: 'chief', role: 'chief', instructions: 'Coordene a equipe.' })
  const workspace = service.store.saveWorkspace({ name: 'Projeto' })
  const names = (agent: Agent = chief) => ((service as unknown as { tools: (context: unknown) => { name: string }[] }).tools({ agent, run: { workspaceId: workspace.id } })).map(tool => tool.name)
  const propose = (name: string, args: Record<string, unknown>) => (service as unknown as { callTool: (context: unknown, name: string, args: Record<string, unknown>) => Promise<unknown> }).callTool({ agent: chief, run: { workspaceId: workspace.id, workspacePath: workspace.path } }, name, args)
  return { service, chief, workspace, names, propose }
}

describe('permissões independentes do Chief', () => {
  it('exibe as ferramentas do Chief, mas nega criar agente sem permissão', async () => {
    const { service, workspace, names, propose } = setup()
    service.store.saveWorkspace({ id: workspace.id, permissions: { ...permissions, chiefManageTeam: true } })
    expect(names()).toEqual(expect.arrayContaining(['propose_team', 'propose_agent', 'propose_session']))
    await expect(propose('propose_agent', { operation: 'create', name: 'Teste', instructions: 'Trabalhe.' })).rejects.toThrow(/não pode criar agentes/)
    await expect(propose('propose_session', { name: 'Nova sessão', agents: [] })).rejects.toThrow(/não pode criar sessões/)
  })

  it('exibe proposta de sessão, mas aplica permissões na execução', async () => {
    const { service, workspace, names, propose } = setup()
    service.store.saveWorkspace({ id: workspace.id, permissions: { ...permissions, chiefCreateSessions: true } })
    expect(names()).toEqual(expect.arrayContaining(['propose_team', 'propose_agent', 'propose_session']))
    await expect(propose('propose_team', { agents: [] })).rejects.toThrow(/não pode alterar a equipe/)
    await expect(propose('propose_agent', { operation: 'create', name: 'Teste', instructions: 'Trabalhe.' })).rejects.toThrow(/não pode criar agentes/)
  })

  it('não oferece ferramentas do Chief a agentes normais', () => {
    const { service, workspace, chief, names } = setup()
    service.store.saveWorkspace({ id: workspace.id, permissions: { ...permissions, chiefCreateAgents: true, chiefEditAgents: true, chiefManageTeam: true, chiefCreateSessions: true } })
    expect(names()).toEqual(expect.arrayContaining(['propose_agent', 'propose_team', 'propose_session']))
    expect(names({ ...chief, role: 'agent' })).not.toEqual(expect.arrayContaining(['propose_agent', 'propose_team', 'propose_session']))
  })
})
