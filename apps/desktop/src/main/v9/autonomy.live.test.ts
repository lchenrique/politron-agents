// @vitest-environment node
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, safeStorage: { isEncryptionAvailable: () => false }, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false } }))
import { AppService } from './workspace'
import type { WorkspaceEvent } from '../../shared/v9'

it.skipIf(process.env.BOOBOT_RUN_AUTONOMY !== '1')('Codex real cria time, delega e grava em pasta vazia com Bypass', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boobot-autonomy-live-'))
  const service = new AppService(join(root, 'profile'))
  const events: unknown[] = []
  try {
    const models = await service.runtime.models()
    const model = models.find(item => item.id === 'gpt-6-luna') || models.find(item => item.isDefault)
    if (!model) throw new Error('Nenhum modelo Codex autorizado disponível.')
    const chief = service.saveAgent({ name: 'Atlas Smoke', role: 'chief', instructions: 'Conclua a tarefa com as ferramentas do Boobot. Este teste dispensa skills e memória. Use apenas a pasta atual. Para delegar use mode=wait. Não crie reforços além do Boo pedido.', runtime: 'codex', model: model.id, canWrite: true, approvalMode: 'bypass' })
    const workspace = service.store.saveWorkspace({ name: 'LP descartável', path: root })
    const conversation = service.saveConversation({ name: 'Autonomia real', workspaceId: workspace.id, agentIds: [chief.id] })
    service.on('workspace-event', (event: WorkspaceEvent) => {
      if (event.type === 'approval') {
        events.push(event)
        if (event.approval.status === 'pending') void service.respondApproval(event.approval.id, false)
      }
    })
    await service.send(conversation.id, 'Crie uma equipe permanente com um Boo chamado Hermes Smoke, especialista em frontend. Adicione-o a esta conversa e delegue a ele a criação de index.html com o título Studio Criskelly e o texto Aplicação em cinco minutos. O especialista deve gravar o arquivo por workspace_write. Aguarde o resultado, confira o arquivo por workspace_read e execute node --version pelo terminal. Conclua relatando apenas os resultados reais. A pasta vazia é o projeto novo, não é um bloqueio.')
    const team = service.store.agents().filter(item => item.id !== chief.id)
    const delegations = service.store.delegations()
    const commands = service.store.runs().flatMap(run => service.store.commandEvidenceForRun(run.id))
    const evidence = { root, model: model.id, team: team.map(({ name, canWrite, approvalMode }) => ({ name, canWrite, approvalMode })), conversation: service.store.conversation(conversation.id), delegations, commands, events, history: service.history(conversation.id) }
    await writeFile(join(root, 'evidence.json'), JSON.stringify(evidence, null, 2))
    expect(team).toHaveLength(1)
    expect(team[0]).toMatchObject({ canWrite: true, approvalMode: 'bypass' })
    expect(service.store.conversation(conversation.id).agentIds).toContain(team[0].id)
    expect(delegations).toHaveLength(1)
    expect(delegations[0].status).toBe('completed')
    expect(await readFile(join(root, 'index.html'), 'utf8')).toContain('Studio Criskelly')
    expect(commands.some(item => item.exitCode === 0 && /^v\d+\./m.test(item.output))).toBe(true)
    expect(service.store.approvals()).toEqual([])
  } finally { console.info('EVIDÊNCIA AUTONOMIA:', root); service.dispose() }
}, 240_000)
