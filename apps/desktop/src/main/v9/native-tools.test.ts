import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false }, safeStorage: { isEncryptionAvailable: () => false } }))
import { nativeToolCall } from './workspace'
import { codexRuntimePermissions, claudeRuntimePermissions, effectiveRuntimeAgent, hasFullAccess } from './runtime-permissions'

describe('ferramentas nativas no Acesso total', () => {
  it('traduz itens do Codex e do Claude para as ferramentas que o chat já exibe', () => {
    expect(nativeToolCall({ type: 'commandExecution', command: 'npm test' })).toEqual({ name: 'workspace_run_command', args: { command: 'npm test' } })
    expect(nativeToolCall({ type: 'fileChange', changes: [{ path: 'a.ts' }, { path: 'b.ts' }] })).toEqual({ name: 'workspace_write', args: { path: 'a.ts, b.ts' } })
    expect(nativeToolCall({ type: 'nativeTool', name: 'Bash', input: { command: 'ls' } })).toEqual({ name: 'workspace_run_command', args: { command: 'ls' } })
    expect(nativeToolCall({ type: 'nativeTool', name: 'Edit', input: { file_path: 'src/x.ts' } })).toEqual({ name: 'workspace_write', args: { path: 'src/x.ts' } })
    expect(nativeToolCall({ type: 'nativeTool', name: 'Read', input: { file_path: 'src/x.ts' } })).toEqual({ name: 'workspace_read', args: { path: 'src/x.ts' } })
    expect(nativeToolCall({ type: 'agentMessage' }).name).toBe('')
  })

  it('o mesmo modo liga o full access do Codex e o bypass do Claude', () => {
    const full = { runtimePermissionMode: 'bypass' as const }
    expect(hasFullAccess(full)).toBe(true)
    expect(codexRuntimePermissions(full)).toEqual({ sandbox: 'danger-full-access', approvalPolicy: 'untrusted' })
    expect(claudeRuntimePermissions(full)).toEqual({ permissionMode: 'bypassPermissions', allowDangerouslySkipPermissions: true })
    expect(hasFullAccess({ runtimePermissionMode: 'managed' })).toBe(false)
  })
})

describe('Acesso total no Codex', () => {
  it.each([{ planMode: true }, { boardReview: true }])('desliga ferramentas nativas no Codex com escopo %j, inclusive ao retomar', async scope => {
    const { CodexRuntime } = await import('./codex')
    const { ASSISTANT } = await import('./store')
    const runtime = new CodexRuntime()
    const request = vi.fn(async () => ({ thread: { id: 't1' } }))
    Object.assign(runtime, { start: async () => undefined, request })
    const full = { ...ASSISTANT, runtimePermissionMode: 'bypass' as const }
    await runtime.thread(effectiveRuntimeAgent(full, scope), process.cwd(), [], 'existing')
    expect(request).toHaveBeenCalledWith('thread/resume', expect.objectContaining({
      sandbox: 'read-only', approvalPolicy: 'on-request', threadId: 'existing',
      config: expect.objectContaining({ 'features.shell_tool': false, 'features.unified_exec': false, 'features.apply_patch_freeform': false }),
    }))
    expect(full.runtimePermissionMode).toBe('bypass')
  })

  it('liga shell e edição nativos só no Acesso total, mantendo navegador e computer use desligados', async () => {
    const { CodexRuntime } = await import('./codex')
    const { ASSISTANT } = await import('./store')
    const configs: Record<string, unknown>[] = []
    const runtime = new CodexRuntime()
    Object.assign(runtime, { start: async () => undefined, request: async (_method: string, params: { config: Record<string, unknown> }) => { configs.push(params.config); return { thread: { id: 't1' } } } })
    await runtime.thread({ ...ASSISTANT, runtimePermissionMode: 'bypass' }, process.cwd(), [])
    await runtime.thread({ ...ASSISTANT, runtimePermissionMode: 'managed' }, process.cwd(), [])
    expect(configs[0]['features.shell_tool']).toBe(true)
    expect(configs[0]['features.unified_exec']).toBe(true)
    expect(configs[0]['features.browser_use']).toBe(false)
    expect(configs[0]['features.computer_use']).toBe(false)
    expect(configs[1]['features.shell_tool']).toBe(false)
  })
})
