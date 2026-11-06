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
    // A delegação roda em segundo plano (o Chief não bloqueia): espera a conclusão antes de conferir.
    await vi.waitFor(() => expect(service.store.delegations()[0]?.status).toBe('completed'), { timeout: 200_000, interval: 1000 })
    // Ao concluir, o Chief é reativado para continuar: espera as execuções terminarem antes de conferir o terminal.
    await vi.waitFor(() => expect(service.store.runs().filter(run => ['queued', 'running', 'waiting'].includes(run.status))).toEqual([]), { timeout: 200_000, interval: 1000 })
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

it.skipIf(process.env.BOOBOT_RUN_AUTONOMY !== '1')('Codex real: Chief cria projeto, equipe, vincula ao projeto e só exclui Boo com confirmação', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boobot-chief-control-live-'))
  const service = new AppService(join(root, 'profile'))
  const approvals: { kind: string; details: { action?: string; task?: string } }[] = []
  try {
    const models = await service.runtime.models()
    const model = models.find(item => item.id === 'gpt-6-luna') || models.find(item => item.isDefault)
    if (!model) throw new Error('Nenhum modelo Codex autorizado disponível.')
    const chief = service.saveAgent({ name: 'Atlas Smoke', role: 'chief', instructions: 'Conclua a tarefa usando as ferramentas do Boobot. Este teste dispensa skills e memória. Relate apenas resultados reais.', runtime: 'codex', model: model.id, canWrite: true, approvalMode: 'bypass' })
    const home = service.store.saveWorkspace({ name: 'Central', path: root })
    const conversation = service.saveConversation({ name: 'Controle do Chief', workspaceId: home.id, agentIds: [chief.id] })
    service.on('workspace-event', (event: WorkspaceEvent) => {
      if (event.type === 'approval' && event.approval.status === 'pending') {
        approvals.push(event.approval)
        // Exclusão pede confirmação mesmo no Bypass; o teste aprova só ela e recusa qualquer outra coisa.
        void service.respondApproval(event.approval.id, event.approval.kind === 'agent-change')
      }
    })
    await service.send(conversation.id, `Crie o projeto "Loja Teste" na pasta ${join(root, 'loja-teste').split(String.fromCharCode(92)).join('/')} (crie a pasta se faltar), crie dois Boos permanentes, "Ana Front" (frontend) e "Beto Back" (backend), defina os dois como o time padrão desse projeto e depois exclua o Boo "Beto Back". Relate apenas o que de fato aconteceu.`)
    await vi.waitFor(() => expect(service.store.runs().filter(run => ['queued', 'running', 'waiting'].includes(run.status))).toEqual([]), { timeout: 200_000, interval: 1000 })
    const project = service.store.workspaces().find(item => item.name === 'Loja Teste')
    const names = service.store.agents().filter(item => item.id !== chief.id).map(item => item.name)
    await writeFile(join(root, 'evidence.json'), JSON.stringify({ root, project, names, approvals, history: service.history(conversation.id) }, null, 2))
    expect(project).toBeTruthy()
    expect(names).toContain('Ana Front')
    expect(names).not.toContain('Beto Back')
    const ana = service.store.agents().find(item => item.name === 'Ana Front')!
    expect(project!.defaultAgentIds).toContain(ana.id)
    expect(approvals.some(item => /Beto Back/.test(JSON.stringify(item.details)))).toBe(true)
  } finally { console.info('EVIDÊNCIA CONTROLE:', root); service.dispose() }
}, 240_000)

/** Cenários reais (Codex) de memória, cartões interativos e esperas por evento. */
async function liveChief(prefix: string) {
  const root = await mkdtemp(join(tmpdir(), prefix))
  const service = new AppService(join(root, 'profile'))
  const models = await service.runtime.models()
  const model = models.find(item => item.id === 'gpt-6-luna') || models.find(item => item.isDefault)
  if (!model) throw new Error('Nenhum modelo Codex autorizado disponível.')
  const chief = service.saveAgent({ name: 'Atlas Smoke', role: 'chief', instructions: 'Conclua a tarefa usando as ferramentas do Boobot. Este teste dispensa skills. Relate apenas resultados reais, em uma frase.', runtime: 'codex', model: model.id, canWrite: true, approvalMode: 'bypass' })
  const home = service.store.saveWorkspace({ name: 'Central', path: root })
  const chat = (name: string) => service.saveConversation({ name, workspaceId: home.id, agentIds: [chief.id] })
  const idle = () => vi.waitFor(() => expect(service.store.runs().filter(run => ['queued', 'running', 'waiting'].includes(run.status))).toEqual([]), { timeout: 200_000, interval: 1000 })
  const lastReply = (conversationId: string) => service.history(conversationId).filter(message => message.role === 'assistant').at(-1)?.text ?? ''
  return { root, service, chief, chat, idle, lastReply }
}

it.skipIf(process.env.BOOBOT_RUN_AUTONOMY !== '1')('Codex real: o Boo grava uma memória e a recupera em outra conversa', async () => {
  const { root, service, chat, idle, lastReply } = await liveChief('boobot-memory-live-')
  try {
    const first = chat('Memória 1')
    await service.send(first.id, 'Guarde na sua memória, como memória global e essencial, o fato: "A cor favorita do Carlos é verde-musgo". Use a ferramenta remember.')
    await idle()
    expect(service.store.memories.list({}).some(memory => /verde-musgo/i.test(memory.text))).toBe(true)
    const second = chat('Memória 2')
    await service.send(second.id, 'Qual é a cor favorita do Carlos? Responda só com a cor.')
    await idle()
    expect(lastReply(second.id)).toMatch(/musgo/i)
  } finally { console.info('EVIDÊNCIA MEMÓRIA:', root); service.dispose() }
}, 300_000)

it.skipIf(process.env.BOOBOT_RUN_AUTONOMY !== '1')('Codex real: ask_ui mostra um cartão, a resposta volta ao Boo e o segredo não vai ao histórico', async () => {
  const { root, service, chat, idle, lastReply } = await liveChief('boobot-cards-live-')
  const cards: string[] = []
  try {
    service.on('workspace-event', (event: WorkspaceEvent) => {
      const approval = event.type === 'approval' ? event.approval : undefined
      if (!approval || approval.status !== 'pending' || !approval.details.card || cards.includes(approval.id)) return
      cards.push(approval.id)
      const card = approval.details.card
      void service.answerCard(approval.id, card.kind === 'form' ? { status: 'answered', values: Object.fromEntries(card.fields.map(field => [field.id, field.secret ? 'SEGREDO-123' : 'ana'])) } : { status: 'answered', values: { confirmed: true } })
    })
    const conversation = chat('Cartões')
    await service.send(conversation.id, 'Use a ferramenta ask_ui com um cartão do tipo form, título "Acesso", com dois campos: "user" (rótulo Usuário) e "senha" (rótulo Senha, secret true). Depois diga apenas o valor que veio no campo user.')
    await idle()
    expect(cards.length).toBeGreaterThanOrEqual(1)
    expect(lastReply(conversation.id)).toMatch(/ana/i)
    expect(JSON.stringify(service.store.approvals())).not.toContain('SEGREDO-123')
  } finally { console.info('EVIDÊNCIA CARTÕES:', root); service.dispose() }
}, 300_000)

it.skipIf(process.env.BOOBOT_RUN_AUTONOMY !== '1')('Codex real: await_event registra a espera e encerra o turno', async () => {
  const { root, service, chief, chat, idle } = await liveChief('boobot-waits-live-')
  try {
    const home = service.store.workspaces()[0]
    service.saveRoutine({ name: 'Checar deploy', instructions: 'Verifique o deploy.', agentId: chief.id, workspaceId: home.id, trigger: { kind: 'daily', time: '09:00', weekdays: [] } })
    const conversation = chat('Esperas')
    await service.send(conversation.id, 'O deploy ainda não terminou. Use a ferramenta await_event com a nota "aguardar o deploy" e encerre o turno.')
    await idle()
    const open = service.store.waits.open(chief.id)
    expect(open).toHaveLength(1)
    expect(open[0].note).toMatch(/deploy/i)
  } finally { console.info('EVIDÊNCIA ESPERAS:', root); service.dispose() }
}, 300_000)
