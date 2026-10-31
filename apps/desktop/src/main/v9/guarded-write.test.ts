// @vitest-environment node
import type { ServiceInternals } from './test-support'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { EventEmitter } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureFileVersion, commitFileWrite, fileContentMatches } from './guarded-write'
vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false } }))
import { AppService } from './workspace'
import type { Agent, Message, Run } from '../../shared/v9'

const directories: string[] = []
const services: AppService[] = []
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'politron-guarded-write-'))
  directories.push(root)
  return root
}
afterEach(async () => {
  for (const service of services.splice(0)) service.dispose()
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

class NoopRuntime extends EventEmitter { close() {} }
async function toolContext(root: string, approvalMode: Agent['approvalMode']) {
  const service = new AppService(root, new NoopRuntime() as unknown as ConstructorParameters<typeof AppService>[1])
  services.push(service)
  const agent = service.saveAgent({ name: 'Escritor', alias: 'escritor', instructions: 'Escreva apenas quando solicitado.', canWrite: true, approvalMode })
  const conversation = service.saveConversation({ kind: 'group', name: 'Projeto', agentIds: [agent.id], workspacePath: root })
  const workspace = service.store.workspace(conversation.workspaceId)
  const createdAt = new Date().toISOString()
  const run: Run = { id: 'write-run', conversationId: conversation.id, agentId: agent.id, rootId: 'write-run', parentId: null, ancestry: [agent.id], status: 'running', threadId: null, turnId: null, messageId: 'write-message', input: 'Atualize o arquivo', agent, workspaceId: workspace.id, workspacePath: workspace.path, createdAt }
  const message: Message = { id: run.messageId, conversationId: conversation.id, agentId: agent.id, author: agent.name, role: 'assistant', text: '', status: 'running', runId: run.id, createdAt }
  service.store.putRun(run); service.store.putMessage(message)
  return { service, context: { run, message, conversation, agent } }
}

describe('escrita protegida por versão do arquivo', () => {
  it('compara o arquivo completo quando a proposta coincide apenas com o prefixo', async () => {
    const root = await fixture()
    const original = Buffer.alloc(200_004, 0x61)
    const proposed = original.subarray(0, 200_000)
    await writeFile(join(root, 'large.txt'), original)

    const { service, context } = await toolContext(root, 'automatic')
    const result = await (service as unknown as ServiceInternals).callTool(context, 'workspace_write', { path: 'large.txt', content: proposed.toString('utf8') }, 'write-large')

    expect(result).toBe('Arquivo salvo: large.txt')
    expect(await readFile(join(root, 'large.txt'))).toEqual(proposed)
  })

  it('recusa edição humana feita enquanto a aprovação aguardava', async () => {
    const root = await fixture()
    const path = join(root, 'notes.txt')
    await writeFile(path, 'conteúdo aprovado')
    const { service, context } = await toolContext(root, 'ask')
    vi.spyOn(service as unknown as ServiceInternals, 'requestApproval').mockImplementation(async () => {
      await writeFile(path, 'edição humana mais recente')
      return true
    })

    await expect((service as unknown as ServiceInternals).callTool(context, 'workspace_write', { path: 'notes.txt', content: 'proposta aprovada' }, 'write-conflict')).rejects.toThrow(/alterado no disco/)
    expect(await readFile(path, 'utf8')).toBe('edição humana mais recente')
  })

  it('detecta arquivo criado ou removido depois de capturar a versão', async () => {
    const root = await fixture()
    const absent = await captureFileVersion(root, 'new.txt')
    await writeFile(join(root, 'new.txt'), 'criado por outro processo')
    await expect(commitFileWrite({ root, relativePath: 'new.txt', content: Buffer.from('proposta'), expectedVersion: absent })).rejects.toThrow(/alterado no disco/)

    const existing = await captureFileVersion(root, 'new.txt')
    await rm(join(root, 'new.txt'))
    await expect(commitFileWrite({ root, relativePath: 'new.txt', content: Buffer.from('proposta'), expectedVersion: existing })).rejects.toThrow(/alterado no disco/)
  })

  it('serializa propostas do app baseadas na mesma versão', async () => {
    const root = await fixture()
    const path = join(root, 'race.txt')
    await writeFile(path, 'base')
    const expectedVersion = await captureFileVersion(root, 'race.txt')
    const results = await Promise.allSettled([
      commitFileWrite({ root, relativePath: 'race.txt', content: Buffer.from('primeira'), expectedVersion }),
      commitFileWrite({ root, relativePath: 'race.txt', content: Buffer.from('segunda'), expectedVersion }),
    ])

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
    expect(['primeira', 'segunda']).toContain(await readFile(path, 'utf8'))
  })

  it('preserva UTF-8 e modo, suporta arquivo ausente, rejeita diretórios novos e respeita cancelamento', async () => {
    const root = await fixture()
    const expected = await captureFileVersion(root, 'síntese.txt')
    const content = Buffer.from('ação: coração 💚', 'utf8')
    await commitFileWrite({ root, relativePath: 'síntese.txt', content, expectedVersion: expected })
    expect(await readFile(join(root, 'síntese.txt'))).toEqual(content)

    const cancelled = new AbortController()
    cancelled.abort()
    const version = await captureFileVersion(root, 'síntese.txt')
    await expect(commitFileWrite({ root, relativePath: 'síntese.txt', content: Buffer.from('não salvar'), expectedVersion: version, signal: cancelled.signal })).rejects.toThrow(/interrompida/)
    await expect(captureFileVersion(root, 'pasta/não-criar.txt')).rejects.toThrow(/pasta/i)
    expect(await readFile(join(root, 'síntese.txt'), 'utf8')).toBe('ação: coração 💚')
  })

  it('preserva os bytes de um arquivo binário e o modo original em substituição atômica', async () => {
    const root = await fixture()
    const path = join(root, 'image.bin')
    await writeFile(path, Buffer.from([0, 1, 2, 255]), { mode: 0o640 })
    const mode = (await stat(path)).mode & 0o777
    const expectedVersion = await captureFileVersion(root, 'image.bin')
    const content = Buffer.from([255, 0, 128, 7])

    await commitFileWrite({ root, relativePath: 'image.bin', content, expectedVersion })

    expect(await readFile(path)).toEqual(content)
    expect((await stat(path)).mode & 0o777).toBe(mode)
  })
})
