// @vitest-environment node
import { createServer } from 'node:http'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false }, safeStorage: { isEncryptionAvailable: () => false } }))
import { AppService } from './workspace'

/** CLI OpenCode real; servidor de modelo controlado. Não certifica um modelo remoto. */
async function runTransport(tryNative: boolean) {
  const directory = mkdtempSync(join(tmpdir(), 'boobot-opencode-tools-'))
  const sentinel = join(directory, 'native-command-must-not-run.txt')
  let nativeBashOffered = false
  const actions = [
    { action: 'tool', tool: 'group_members', arguments: '{}', text: '' },
    { action: 'tool', tool: 'agent_create', arguments: JSON.stringify({ purpose: 'team', agents: [{ name: 'Íris QA', instructions: 'Revise interfaces.' }] }), text: '' },
    { action: 'final', tool: 'none', arguments: '{}', text: 'O Boo Íris QA foi criado.' },
  ]
  const inputs: string[] = []
  const server = createServer(async (request, response) => {
    let raw = ''
    for await (const chunk of request) raw += String(chunk)
    if (!raw) { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ data: [] })); return }
    const payload = JSON.parse(raw)
    const title = payload.messages?.some((item: { role: string; content?: unknown }) => item.role === 'system' && typeof item.content === 'string' && /^\s*You are a title generator\b/i.test(item.content)) === true
    const input = JSON.stringify(payload.messages || [])
    const nativeAttempt = tryNative && !title && inputs.length === 0
    if (nativeAttempt) nativeBashOffered = payload.tools?.some((tool: { function?: { name?: string } }) => tool.function?.name === 'bash') === true
    const content = title ? 'QA' : JSON.stringify(actions[Math.min(Math.max(inputs.length - (tryNative ? 1 : 0), 0), actions.length - 1)])
    const delta = nativeAttempt ? { role: 'assistant', tool_calls: [{ index: 0, id: 'native-attempt', type: 'function', function: {
      name: 'bash', arguments: JSON.stringify({ description: 'Teste de rejeição nativa', command: `node -e "require('node:fs').writeFileSync(Buffer.from('${Buffer.from(sentinel).toString('base64')}','base64').toString(),'unsafe')"` }),
    } }] } : { role: 'assistant', content }
    if (!title) inputs.push(input)
    if (payload.stream !== true) {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ id: 'qa-local', object: 'chat.completion', created: 1, model: 'boobot-test', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }))
      return
    }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    const base = { id: 'qa-local', object: 'chat.completion.chunk', created: 1, model: 'boobot-test' }
    response.write('data: ' + JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] }) + '\n\n')
    response.write('data: ' + JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: nativeAttempt ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }) + '\n\n')
    response.end('data: [DONE]\n\n')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Servidor local indisponível.')
  const config = join(directory, 'opencode.json')
  writeFileSync(config, JSON.stringify({ enabled_providers: ['qa'], model: 'qa/boobot-test', small_model: 'qa/boobot-test', provider: { qa: { npm: '@ai-sdk/openai-compatible', name: 'QA', options: { baseURL: `http://127.0.0.1:${address.port}/v1`, apiKey: 'local-test' }, models: { 'boobot-test': { name: 'QA', limit: { context: 128000, output: 4096 } } } } } }))
  const previous = process.env.OPENCODE_CONFIG
  process.env.OPENCODE_CONFIG = config
  const service = new AppService(directory)
  let nativeDiagnostic = ''
  const adapter = service.openCodeRuntime as any
  const launch = adapter.launch.bind(adapter)
  vi.spyOn(adapter, 'launch').mockImplementation(async (...args: unknown[]) => {
    const [session, prompt] = args as [any, string]
    await launch(session, prompt)
    const collect = (chunk: Buffer | string) => { nativeDiagnostic = (nativeDiagnostic + chunk.toString()).slice(-4000) }
    session.child?.stdout.on('data', collect)
    session.child?.stderr.on('data', collect)
  })
  let approvals = 0
  const calls: string[] = []
  try {
    const chief = service.saveAgent({ name: 'Chief QA', role: 'chief', runtime: 'opencode', model: 'qa/boobot-test', instructions: 'Use as ferramentas.' })
    const workspace = service.store.saveWorkspace({ name: 'QA', path: directory, permissions: { chiefCreateAgents: true, chiefEditAgents: false, chiefManageTeam: false, chiefCreateSessions: false, filesWrite: 'deny', computerUse: 'deny' } })
    const conversation = service.store.saveConversation({ name: 'QA', kind: 'direct', workspaceId: workspace.id, agentIds: [chief.id] })
    service.openCodeRuntime.on('event', event => { if (event.method === 'item/tool/call') calls.push(event.params.tool) })
    service.on('workspace-event', event => {
      if (event.type === 'approval' && event.approval.status === 'pending') {
        expect(service.store.agents()).toHaveLength(1)
        approvals++; void service.respondApproval(event.approval.id, true)
      }
    })
    await service.send(conversation.id, 'Crie um Boo permanente Íris QA para revisar interfaces.')
    console.log(JSON.stringify({ tryNative, nativeBashOffered, nativeRejected: nativeDiagnostic.includes('auto-rejecting'), calls, approvals, requests: inputs.length, created: service.store.agents().some(agent => agent.name === 'Íris QA'), replies: service.store.history(conversation.id).filter(message => message.role === 'assistant').map(message => message.text.slice(-500)) }))
    if (tryNative) {
      expect(nativeBashOffered).toBe(true)
      expect(nativeDiagnostic).toContain('auto-rejecting')
      expect(existsSync(sentinel)).toBe(false)
      expect(calls).toEqual([])
      expect(approvals).toBe(0)
      expect(service.store.agents()).toHaveLength(1)
      expect(service.store.runs().every(run => run.status === 'failed')).toBe(true)
      return
    }
    expect(calls).toEqual(['group_members', 'agent_create'])
    expect(approvals).toBe(0)
    expect(service.store.agents().find(agent => agent.name === 'Íris QA')).toMatchObject({ temporary: false, canWrite: false, computerUse: false })
    expect(service.store.runs().every(run => run.status === 'completed')).toBe(true)
    expect(inputs).toHaveLength(3)
    expect(inputs[2]).toContain('Boos criados:')
    expect(existsSync(sentinel)).toBe(false)
  } finally {
    service.dispose()
    if (previous === undefined) delete process.env.OPENCODE_CONFIG
    else process.env.OPENCODE_CONFIG = previous
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
}

it.skipIf(process.env.POLITRON_RUN_CLI_TRANSPORT_INTEGRATION !== '1')('OpenCode transporta ferramentas, aprovação e resultado sem execução nativa', () => runTransport(false), 120_000)
it.skipIf(process.env.POLITRON_RUN_CLI_TRANSPORT_INTEGRATION !== '1')('OpenCode recusa shell nativo em vez de executar sem aprovação', () => runTransport(true), 60_000)
