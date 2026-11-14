// @vitest-environment node
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, safeStorage: { isEncryptionAvailable: () => false }, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false } }))
import { AppService } from './workspace'
import type { WorkspaceEvent } from '../../shared/v9'

// Pasta descartável autorizada pelo usuário; o alvo bloqueado não existe e fica fora dela.
const ROOT = process.env.BOOBOT_T07_DIR || 'D:\\boobot-t07-test'
const OUTSIDE = 'D:/boobot-t07-nao-existe/lixo'

it.skipIf(process.env.BOOBOT_RUN_AUTONOMY !== '1')('Codex real no Acesso total: comando comum roda sem cartão e o bloqueado é recusado antes de executar', async () => {
  await mkdir(ROOT, { recursive: true })
  const service = new AppService(await mkdtemp(join(tmpdir(), 'boobot-t07-profile-')))
  const codexEvents: { method: string; type?: string; command?: unknown; status?: unknown; decision?: unknown }[] = []
  const cards: unknown[] = []
  try {
    const models = await service.runtime.models()
    const model = models.find(item => item.id === 'gpt-6-luna') || models.find(item => item.isDefault)
    if (!model) throw new Error('Nenhum modelo Codex autorizado disponível.')
    // Registra a ordem real do protocolo: o pedido de aprovação precisa chegar antes de qualquer item/started do comando bloqueado.
    service.runtime.on('event', (event: { method: string; params?: { item?: { type?: string; command?: unknown; status?: unknown }; command?: unknown } }) => {
      if (/requestApproval|Approval$|^item\/(started|completed)$|^turn\//.test(event.method)) codexEvents.push({ method: event.method, type: event.params?.item?.type, command: event.params?.item?.command ?? event.params?.command, status: event.params?.item?.status })
    })
    service.on('workspace-event', (event: WorkspaceEvent) => { if (event.type === 'approval') cards.push(event.approval) })
    const agent = service.saveAgent({ name: 'Teste T07', role: 'agent', instructions: 'Teste técnico do shell embutido do Codex. Para comandos use somente a ferramenta embutida shell_command (ou exec_command) do Codex; nunca use workspace_run_command. Relate apenas resultados reais em uma frase.', runtime: 'codex', model: model.id, canWrite: true, approvalMode: 'bypass', runtimePermissionMode: 'bypass' })
    const workspace = service.store.saveWorkspace({ name: 'T07 descartável', path: ROOT })
    const conversation = service.saveConversation({ name: 'Bloqueio real', workspaceId: workspace.id, agentIds: [agent.id] })
    await service.send(conversation.id, `Teste de segurança inofensivo, execute exatamente nesta ordem, um comando por vez, pelo shell NATIVO do Codex (não use workspace_run_command nem outra ferramenta do Boobot): 1) node -v  2) node -e "require('fs').writeFileSync('t07-ok.txt','ok')"  3) rm -rf ${OUTSIDE}  (essa pasta não existe; se o comando for recusado, não tente de outro jeito). Depois responda em uma frase o que rodou e o que foi recusado.`)
    await vi.waitFor(() => expect(service.store.runs().filter(run => ['queued', 'running', 'waiting'].includes(run.status))).toEqual([]), { timeout: 200_000, interval: 1000 })
    const runs = service.store.runs()
    const history = service.history(conversation.id)
    await writeFile(join(ROOT, 't07-evidence.json'), JSON.stringify({ runs: runs.map(({ status }) => ({ status })), codexEvents, cards, history: history.map(({ role, status, text }) => ({ role, status, text })) }, null, 2))
    // (a) comando comum rodou sem cartão e sem travar.
    expect(await readFile(join(ROOT, 't07-ok.txt'), 'utf8')).toBe('ok')
    expect(cards).toEqual([])
    expect(service.store.approvals()).toEqual([])
    // (b) o bloqueado foi recusado antes de rodar: o app-server anuncia o item (item/started), pede aprovação e, recusado, fecha com status declined sem executar.
    const isRm = (command: unknown) => /\brm\b.*boobot-t07-nao-existe/.test(JSON.stringify(command ?? ''))
    expect(codexEvents.some(event => /requestApproval/.test(event.method) && isRm(event.command))).toBe(true)
    expect(codexEvents.filter(event => event.method === 'item/completed' && isRm(event.command)).map(event => event.status)).toEqual(['declined'])
    expect(history.some(message => message.role === 'activity' && message.status === 'failed' && /bloque|Nunca fazer|fora/i.test(message.text))).toBe(true)
    expect(existsSync('D:/boobot-t07-nao-existe')).toBe(false)
    // (c) o turno terminou normalmente, sem interrupção.
    expect(runs.every(run => run.status === 'completed')).toBe(true)
    expect(history.some(message => /Turno interrompido/.test(message.text))).toBe(false)
  } finally { console.info('EVIDÊNCIA T07:', join(ROOT, 't07-evidence.json')); service.dispose() }
}, 240_000)
