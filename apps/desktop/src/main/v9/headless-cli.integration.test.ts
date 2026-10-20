// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false }, safeStorage: { isEncryptionAvailable: () => false } }))
import { AppService } from './workspace'

/** Inferência real, opt-in. Perfis e Boos ficam somente na pasta descartável. */
describe.skipIf(process.env.POLITRON_RUN_CLI_TOOL_INTEGRATION !== '1')('ferramentas reais de CLI com aprovação e persistência', () => {
  for (const [runtime, model] of [
    ['antigravity', process.env.POLITRON_ANTIGRAVITY_TEST_MODEL || 'gemini-3.8-flash-high'],
    ['opencode', process.env.POLITRON_OPENCODE_TEST_MODEL || ''],
  ] as const) {
  it.skipIf(!model)(`Chief cria um Boo real somente após aprovação: ${runtime}`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'boobot-tools-real-'))
    const service = new AppService(directory)
    const calls: string[] = []
    let approvals = 0
    try {
      const chief = service.saveAgent({ name: 'Chief QA', alias: 'chief-qa', role: 'chief', instructions: 'Execute o pedido com as ferramentas reais do Boobot. Seja breve.', runtime, model })
      const workspace = service.store.saveWorkspace({ name: 'QA', path: directory, permissions: { chiefCreateAgents: true, chiefEditAgents: false, chiefManageTeam: false, chiefCreateSessions: false, filesWrite: 'deny', computerUse: 'deny' } })
      const conversation = service.store.saveConversation({ name: 'QA', kind: 'direct', workspaceId: workspace.id, agentIds: [chief.id] })
      service[runtime === 'opencode' ? 'openCodeRuntime' : 'antigravityRuntime'].on('event', event => {
        if (event.method === 'item/tool/call') { calls.push(event.params.tool); console.log(`[${runtime}] ferramenta: ${event.params.tool}`) }
        if (event.method === 'turn/completed') console.log(`[${runtime}] turno: ${event.params.turn.status}`)
      })
      service.on('workspace-event', event => {
        if (event.type !== 'approval' || event.approval.status !== 'pending') return
        // O cadastro ainda contém somente o Chief enquanto o usuário decide.
        expect(service.store.agents()).toHaveLength(1)
        approvals++
        void service.respondApproval(event.approval.id, true)
      })
      await service.send(conversation.id, 'Crie exatamente um Boo PERMANENTE chamado Íris QA, especializado em revisão de interface. Consulte os Boos existentes e use propose_boos; aguarde a aprovação. Não crie equipe nem sessão, não delegue e não salve skills. Conclua depois da ferramenta confirmar a criação, em uma frase curta.')
      const iris = service.store.agents().find(agent => agent.name === 'Íris QA')
      console.log(JSON.stringify({ runtime, model, calls, approvals, created: !!iris, statuses: service.store.runs().map(run => run.status), replies: service.store.history(conversation.id).filter(message => message.role === 'assistant').map(message => message.text.slice(-700)), directory }))
      expect(calls).toContain('group_members')
      expect(calls).toContain('propose_boos')
      expect(approvals).toBe(1)
      expect(iris).toMatchObject({ temporary: false, canWrite: false, computerUse: false })
      expect(service.store.runs().every(run => run.status === 'completed')).toBe(true)
    } finally {
      service.dispose()
      rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    }
  }, 180_000)
  }
})
