// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {}, dialog: {}, shell: {},
  BrowserWindow: { getAllWindows: () => [] },
  Notification: { isSupported: () => false },
  safeStorage: { isEncryptionAvailable: () => false },
}))
import { AppService } from './workspace'

describe('Boobot + OpenCode Zen: escrita com autorização real pelo broker', () => {
  it.skipIf(process.env.BOOBOT_LIVE_ZEN_EDIT !== '1')('edita um arquivo descartável só após aprovação', async () => {
    const root = mkdtempSync(join(tmpdir(), 'boobot-zen-edit-'))
    const data = join(root, 'profile')
    const workspaceRoot = join(root, 'workspace')
    const { mkdirSync } = await import('node:fs')
    mkdirSync(workspaceRoot)
    const output = join(workspaceRoot, 'edit-zen.txt')
    const model = process.env.BOOBOT_ZEN_MODEL || 'opencode/big-pickle'
    const service = new AppService(data)
    const calls: string[] = []
    const approvals: string[] = []
    const original = service.openCodeRuntime
    original.on('event', event => { if (event.method === 'item/tool/call') calls.push(event.params.tool) })
    try {
      const agent = service.saveAgent({
        name: 'Editor QA', alias: 'editor-qa', runtime: 'opencode',
        model, instructions: 'Use boobot_tools e boobot_call para ações em arquivos. Nunca use shell nativo.',
        canWrite: true, computerUse: false, approvalMode: 'ask',
      })
      const workspace = await service.saveWorkspace({
        name: 'Teste Zen isolado', path: workspaceRoot,
        permissions: { filesWrite: 'inherit', computerUse: 'deny', chiefCreateAgents: false, chiefEditAgents: false, chiefManageTeam: false, chiefCreateSessions: false },
      })
      const conversation = service.saveConversation({
        name: 'Editor teste', workspaceId: workspace.id, kind: 'direct', agentIds: [agent.id],
      })
      service.on('workspace-event', event => {
        if (event.type === 'approval' && event.approval.status === 'pending' && event.approval.kind === 'write') {
          approvals.push(event.approval.id)
          // Critical assertion: the file MUST NOT exist until human consent.
          expect(existsSync(output)).toBe(false)
          void service.respondApproval(event.approval.id, true)
        }
      })
      await service.send(conversation.id,
        'Tarefa de programação: use a ferramenta boobot_call com name workspace_write e argumentsJson JSON para criar edit-zen.txt na raiz do workspace, contendo exatamente BOOBOT_ZEN_EDIT_OK. Espere a aprovação e o retorno real. Não use bash, write, read ou outros tools nativos do OpenCode. Depois diga se concluiu.')
      const messages = service.store.history(conversation.id).filter(m => m.role === 'assistant')
      const runs = service.store.runs().map(r => r.status)
      console.log(JSON.stringify({ model, calls, approvals: approvals.length, runs, fileCreated: existsSync(output), content: existsSync(output) ? readFileSync(output, 'utf8') : '', messages: messages.map(m => m.text.slice(-450)) }))
      expect(runs).toContain('completed')
      expect(calls).toContain('workspace_write')
      expect(approvals.length).toBe(1)
      expect(readFileSync(output, 'utf8')).toBe('BOOBOT_ZEN_EDIT_OK')
    } finally {
      service.dispose()
      await new Promise(resolve => setTimeout(resolve, 1600))
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
    }
  }, 190000)
})
