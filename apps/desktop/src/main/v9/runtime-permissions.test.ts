import { describe, expect, it } from 'vitest'
import { claudeRuntimePermissions, codexRuntimePermissions } from './runtime-permissions'

describe('permissões do runtime por agente', () => {
  it('mantém os runtimes gerenciados como padrão e preserva compatibilidade com perfis antigos', () => {
    expect(codexRuntimePermissions({})).toEqual({ sandbox: 'read-only', approvalPolicy: 'on-request' })
    expect(claudeRuntimePermissions({})).toEqual({ permissionMode: 'default', allowDangerouslySkipPermissions: false })
  })

  it('mapeia acesso total do Codex para sandbox irrestrito e política sem prompts', () => {
    expect(codexRuntimePermissions({ runtimePermissionMode: 'bypass' })).toEqual({ sandbox: 'danger-full-access', approvalPolicy: 'never' })
  })

  it('mapeia bypass do Claude Code para bypassPermissions do SDK', () => {
    expect(claudeRuntimePermissions({ runtimePermissionMode: 'bypass' })).toEqual({ permissionMode: 'bypassPermissions', allowDangerouslySkipPermissions: true })
  })
})
