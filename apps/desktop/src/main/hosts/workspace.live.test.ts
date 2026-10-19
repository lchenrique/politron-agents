// @vitest-environment node
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false } }))
import { AppService } from '../v9/workspace'
import { HostServer } from './server'
import { HostClient } from './client'
import { HostRpc } from './rpc'
import { createIdentity, pairingLink, parsePairing } from './identity'
import type { Agent, Conversation, Snapshot, Workspace, WorkspaceEvent } from '../../shared/v9'

it.skipIf(process.env.BOOBOT_RUN_HOST_LIVE !== '1')('Codex real: dois projetos remotos, delegação de três níveis, edição, aprovação e testes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boobot-host-live-')), service = new AppService(join(root, 'host-data')), rpc = new HostRpc()
  const evidence: unknown[] = [], record = (kind: string, data: unknown) => evidence.push({ time: new Date().toISOString(), kind, data })
  for (const method of ['snapshot','models','saveAgent','saveWorkspace','saveConversation','send','respondApproval','history','stop'] as const) rpc.register(`v9:${method}`, service[method].bind(service) as (...args: never[]) => unknown)
  const identity = createIdentity('Host de teste'), server = new HostServer(identity, rpc.dispatch)
  const port = await server.listen('127.0.0.1', 0), client = new HostClient(parsePairing(pairingLink(identity, `ws://127.0.0.1:${port}/boobot`)))
  service.on('workspace-event', (data: WorkspaceEvent) => server.broadcast({ channel: 'v9:event', data }))
  const approvals: Promise<unknown>[] = []
  client.on('event', ({ data }: { data: WorkspaceEvent }) => {
    if (data.type !== 'approval' || data.approval.status !== 'pending') return
    const approval = data.approval
    const allow = approval.kind === 'delegation' || approval.kind === 'write' && approval.details.path?.replace(/\\/g, '/') === 'src/counter.ts' || approval.kind === 'command' && approval.details.command?.trim() === 'npm test' && approval.details.cwd?.startsWith(root)
    record('approval', { kind: approval.kind, details: approval.details, allow })
    approvals.push(client.call('v9:respondApproval', [approval.id, !!allow]))
  })
  try {
    await client.connect()
    const models = await service.runtime.models(), model = (models.find(item => /luna/i.test(item.id)) || models.find(item => item.isDefault) || models[0]).id
    record('model', model)
    const save = (input: Partial<Agent>) => client.call('v9:saveAgent', [{ runtime: 'codex', model, effort: 'low', canWrite: false, computerUse: false, ...input }]) as Promise<Agent>
    const worker = await save({ name: 'Implementador Fixture', alias: 'fixture-worker', canWrite: true, instructions: 'Leia src/counter.ts e tests/counter.test.ts com ferramentas do workspace. Corrija somente src/counter.ts, para increment retornar value+1, usando workspace_write. Execute npm test via workspace_run_command. Não altere testes ou package.json, não use rede nem arquivos fora do projeto. Reporte saída e caminho.' })
    const coordinator = await save({ name: 'Coordenador Fixture', alias: 'fixture-coordinator', instructions: 'Use ask_agent mode wait para delegar a fixture-worker a correção de src/counter.ts e execução de npm test deste workspace. Aguarde o resultado e relate-o. Não edite arquivos nem use skills.' })
    const chief = await save({ name: 'Chief Fixture', alias: 'chief-fixture', role: 'chief', instructions: 'Consulte group_members e use ask_agent mode wait para pedir a fixture-coordinator que coordene a correção de src/counter.ts neste workspace. Aguarde o retorno e reporte o resultado dos testes. Não edite nem execute comandos você mesmo.' })
    const other = await save({ name: 'Origem Paralela', alias: 'origem-paralela', instructions: chief.instructions })
    const chats: Conversation[] = []
    for (const [index, origin] of [chief, other].entries()) {
      const path = join(root, `react-ts-${index}`)
      await mkdir(join(path, 'src'), { recursive: true }); await mkdir(join(path, 'tests'))
      await writeFile(join(path, 'src/counter.ts'), 'export function increment(value: number): number { return value - 1 }\n')
      await writeFile(join(path, 'src/Counter.tsx'), "import { increment } from './counter.ts'\nexport function Counter({ value }: {value: number}) { return <button>{increment(value)}</button> }\n")
      await writeFile(join(path, 'tests/counter.test.ts'), "import { strict as assert } from 'node:assert'\nimport { test } from 'node:test'\nimport { increment } from '../src/counter.ts'\ntest('incrementa zero',()=>assert.equal(increment(0),1))\ntest('incrementa negativo',()=>assert.equal(increment(-2),-1))\n")
      await writeFile(join(path, 'package.json'), JSON.stringify({ private: true, type: 'module', scripts: { test: 'node --experimental-strip-types --test tests/counter.test.ts' } }))
      const workspace = await client.call('v9:saveWorkspace', [{ name: `Fixture ${index}`, path, defaultAgentIds: [origin.id, coordinator.id, worker.id] }]) as Workspace
      chats.push(await client.call('v9:saveConversation', [{ name: `Missão remota ${index}`, workspaceId: workspace.id, agentIds: [origin.id], kind: 'direct' }]) as Conversation)
    }
    await Promise.all(chats.map(chat => client.call('v9:send', [chat.id, 'Coordene a correção do contador deste workspace via fixture-coordinator, que deve delegar a fixture-worker, aguarde e reporte npm test. Use mode wait; não use background.'])))
    await Promise.all(approvals)
    const snapshot = await client.call('v9:snapshot') as Snapshot
    record('runs', snapshot.runs.map(run => ({ id: run.id, parent: run.parentId, runtime: run.agent.runtime, status: run.status, path: run.workspacePath })))
    expect(snapshot.runs.filter(run => run.parentId)).toHaveLength(4)
    expect(snapshot.runs.every(run => run.status === 'completed')).toBe(true)
    for (let index = 0; index < chats.length; index++) {
      const directory = join(root, `react-ts-${index}`)
      const result = await promisify(execFile)(process.execPath, ['--experimental-strip-types','--test','tests/counter.test.ts'], { cwd: directory, timeout: 20_000 })
      record('independent-tests', { directory, output: result.stdout })
      expect(result.stdout).toContain('pass 2')
      expect(await readFile(join(directory, 'src/counter.ts'), 'utf8')).toContain('+ 1')
    }
  } finally {
    for (const run of service.snapshot().runs.filter(run => ['queued','running','waiting'].includes(run.status))) await service.stop(run.conversationId)
    record('final', service.snapshot()); await writeFile(join(root, 'evidence.json'), JSON.stringify(evidence, null, 2))
    console.info('EVIDÊNCIA REAL:', root)
    client.close(); await server.close(); service.dispose()
  }
}, 600_000)
