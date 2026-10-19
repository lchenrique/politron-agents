// @vitest-environment node
import { tmpdir } from 'node:os'
import type { query } from '@anthropic-ai/claude-agent-sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Agent } from '../../shared/v9'
import { ClaudeRuntime } from './claude'
import { CodexRuntime } from './codex'

const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }))
vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  execFile: execFileMock,
}))

afterEach(() => {
  if (vi.isFakeTimers()) vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  execFileMock.mockReset()
})

function windowsExecutableLookup(stdout: string) {
  vi.stubGlobal('process', new Proxy(process, {
    get: (target, key) => key === 'platform' ? 'win32' : Reflect.get(target, key),
  }))
  execFileMock.mockImplementation((_command: string, _args: string[], _options: unknown, callback: (error: Error | null, output: { stdout: string; stderr: string }) => void) => {
    callback(null, { stdout, stderr: '' })
  })
}

async function startClaudeWithoutDiscovery() {
  vi.useFakeTimers()
  const sdk = vi.fn((_input: Parameters<typeof query>[0]) => ({
    close: vi.fn(),
    async *[Symbol.asyncIterator]() {
      yield { type: 'system', subtype: 'init', session_id: 'session-from-cache' }
    },
  }))
  const runtime = new ClaudeRuntime(tmpdir(), async () => null, sdk as unknown as typeof query)
  const models = vi.spyOn(runtime, 'models')
  const agent: Agent = {
    id: 'claude-agent', name: 'Claude', alias: 'claude', description: '', instructions: 'Ajude o usuário.',
    runtime: 'claude', model: 'sonnet', color: '#786bea', avatar: '', canWrite: false,
    computerUse: false, approvalMode: 'ask', revision: 1, createdAt: '2026-10-18T00:00:00Z',
  }
  try {
    const threadId = await runtime.thread(agent, tmpdir(), [])
    await expect(runtime.request('turn/start', { threadId, input: [{ type: 'text', text: 'Mensagem simulada.' }] }))
      .resolves.toMatchObject({ thread: { id: 'session-from-cache' } })
    expect(models).not.toHaveBeenCalled()
    expect(sdk).toHaveBeenCalledOnce()
    return sdk.mock.calls[0][0]
  } finally { runtime.close() }
}

describe('catálogo informado pelos CLIs', () => {
  it('percorre páginas do Codex e conserva capacidades reais sem modelos ocultos', async () => {
    const runtime = new CodexRuntime()
    vi.spyOn(runtime, 'start').mockResolvedValue(undefined)
    const request = vi.spyOn(runtime, 'request')
      .mockResolvedValueOnce({ data: [{ id: 'gpt-a', displayName: 'GPT A', isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'high' }], defaultReasoningEffort: 'high' }, { id: 'hidden', hidden: true }], nextCursor: 'page-2' })
      .mockResolvedValueOnce({ data: [{ id: 'gpt-b', displayName: 'GPT B' }], nextCursor: null })
    const models = await runtime.models()
    expect(models.map(model => model.id)).toEqual(['gpt-a', 'gpt-b'])
    expect(models[0]).toMatchObject({ supportedEfforts: ['low', 'high'], defaultEffort: 'high', isDefault: true })
    expect(models[1].supportedEfforts).toEqual([])
    expect(request).toHaveBeenNthCalledWith(2, 'model/list', { cursor: 'page-2' })
  })

  it('encerra paginação se o servidor repetir cursor', async () => {
    const runtime = new CodexRuntime()
    vi.spyOn(runtime, 'start').mockResolvedValue(undefined)
    const request = vi.spyOn(runtime, 'request').mockResolvedValue({ data: [{ id: 'gpt' }], nextCursor: 'same' })
    expect(await runtime.models()).toHaveLength(1)
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('consulta Claude sem chave própria, sem enviar prompt ou carregar hooks/MCPs do usuário', async () => {
    const close = vi.fn()
    const sdk = vi.fn((_input: Parameters<typeof query>[0]) => ({ close, supportedModels: vi.fn().mockResolvedValue([
      { value: 'sonnet', displayName: 'Sonnet', description: 'Modelo do CLI', supportsEffort: true, supportedEffortLevels: ['low', 'high'] },
    ]) }))
    const runtime = new ClaudeRuntime(tmpdir(), async () => null, sdk as unknown as typeof query)
    const models = await runtime.models('C:\\fake\\claude.exe')
    expect(models[0]).toMatchObject({ id: 'sonnet', supportedEfforts: ['low', 'high'] })
    const input = sdk.mock.calls[0][0]
    expect(input.options).toMatchObject({ persistSession: false, tools: [], mcpServers: {}, strictMcpConfig: true, settingSources: [], settings: { disableAllHooks: true }, pathToClaudeCodeExecutable: 'C:\\fake\\claude.exe' })
    expect(input.options?.env).not.toHaveProperty('ANTHROPIC_API_KEY')
    expect(typeof input.prompt).not.toBe('string')
    if (typeof input.prompt !== 'string') expect(await input.prompt[Symbol.asyncIterator]().next()).toMatchObject({ done: true })
    expect(close).toHaveBeenCalledOnce()
  })
})

describe('executável Claude após reinício com inventário em cache', () => {
  it('resolve o executável instalado ao iniciar uma sessão sem consultar models antes', async () => {
    windowsExecutableLookup('C:\\tools\\claude.exe\r\n')
    const input = await startClaudeWithoutDiscovery()
    expect(input.options?.pathToClaudeCodeExecutable).toBe('C:\\tools\\claude.exe')
    expect(execFileMock).toHaveBeenCalledWith('where', ['claude'], { timeout: 3000, windowsHide: true }, expect.any(Function))
  })

  it('ignora shims POSIX, cmd, bat e ps1 no Windows e escolhe o exe da mesma lista', async () => {
    windowsExecutableLookup([
      'C:\\npm\\claude', 'C:\\npm\\claude.cmd', 'C:\\npm\\claude.bat',
      'C:\\npm\\claude.ps1', 'C:\\native\\claude.exe',
    ].join('\r\n'))
    const input = await startClaudeWithoutDiscovery()
    expect(input.options?.pathToClaudeCodeExecutable).toBe('C:\\native\\claude.exe')
  })

  it('permite o executável distribuído pelo SDK quando where encontra somente shims', async () => {
    windowsExecutableLookup(['C:\\npm\\claude', 'C:\\npm\\claude.cmd', 'C:\\npm\\claude.ps1'].join('\r\n'))
    const input = await startClaudeWithoutDiscovery()
    expect(input.options?.pathToClaudeCodeExecutable).toBeUndefined()
  })
})
