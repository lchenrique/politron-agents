// @vitest-environment node
import { mkdtemp, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, safeStorage: { isEncryptionAvailable: () => true, decryptString: () => { throw new Error('A fixture não deve usar credenciais persistidas do Boobot.') } }, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false } }))
import { AppService } from './workspace'
import type { Agent, WorkspaceEvent } from '../../shared/v9'

const runtime = process.env.BOOBOT_LIVE_TOOL_RUNTIME
it.skipIf(runtime !== 'pi' && runtime !== 'claude')('runtime real: lê, edita e executa um teste via broker aprovado', async () => {
  const root = await mkdtemp(join(tmpdir(), `boobot-tools-${runtime}-`)), service = new AppService(join(root,'data'))
  const logs: unknown[] = []
  try {
    const engine = runtime === 'pi' ? service.piRuntime : service.claudeRuntime, models = await engine.models()
    const explicit = process.env.BOOBOT_LIVE_TOOL_MODEL
    const model = (explicit ? models.find(model => model.id === explicit) : models.find(model => model.isDefault))?.id
    if (!model) throw new Error('Defina explicitamente BOOBOT_LIVE_TOOL_MODEL com um modelo autorizado ou configure o padrão do CLI. O catálogo não comprova assinatura ou saldo.')
    await writeFile(join(root,'counter.js'), 'exports.increment = value => value - 1\n')
    await writeFile(join(root,'test.cjs'), "const assert=require('node:assert/strict');const {increment}=require('./counter.js');assert.equal(increment(0),1);console.log('TESTE-RUNTIME-OK')\n")
    const agent = service.saveAgent({ name: 'Fixture Runtime', alias: 'fixture-runtime', runtime: runtime as Agent['runtime'], model, canWrite: true, computerUse: false, instructions: 'Use somente ferramentas workspace_read, workspace_write e workspace_run_command. Corrija counter.js para incrementar somando 1. Preserve test.cjs. Execute exatamente node test.cjs. Não use rede, skills, delegação ou outros caminhos. Relate a saída real.' })
    const conversation = service.saveConversation({ name: 'Teste real isolado', workspacePath: root, agentIds: [agent.id], kind: 'direct' })
    service.on('workspace-event', (event: WorkspaceEvent) => {
      if (event.type !== 'approval' || event.approval.status !== 'pending') return
      const approval = event.approval, allow = approval.kind === 'write' && approval.details.path === 'counter.js' || approval.kind === 'command' && approval.details.command?.trim() === 'node test.cjs' && approval.details.cwd === root
      logs.push({ kind: 'approval', approval, allow }); service.respondApproval(approval.id, allow)
    })
    await service.send(conversation.id, 'Leia counter.js e test.cjs, corrija somente counter.js para incrementar corretamente, execute node test.cjs e reporte a saída, usando ferramentas reais.')
    const snapshot = service.snapshot(); logs.push({ model, snapshot, history: service.history(conversation.id) })
    expect(snapshot.runs.every(run => run.status === 'completed')).toBe(true)
    expect(snapshot.fileChanges.some(change => change.status === 'applied')).toBe(true)
    expect(service.history(conversation.id).some(message => message.text.includes('TESTE-RUNTIME-OK'))).toBe(true)
    expect(await readFile(join(root,'counter.js'),'utf8')).toMatch(/\+\s*1/)
  } finally { await writeFile(join(root,'evidence.json'), JSON.stringify(logs,null,2)); console.info('RUNTIME REAL:', runtime, root); service.dispose() }
}, 180_000)
