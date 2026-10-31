import { describe, expect, it } from 'vitest'
import { claudeRuntimePermissions, codexRuntimePermissions, effectiveRuntimeAgent } from './runtime-permissions'

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

describe('escopo de acesso do turno', () => {
  it.each([{ planMode: true }, { boardReview: true }, { planMode: true, boardReview: true }])('restringe bypass no escopo %j sem alterar o perfil', scope => {
    const agent = Object.freeze({ runtimePermissionMode: 'bypass' as const })
    const effective = effectiveRuntimeAgent(agent, scope)
    expect(codexRuntimePermissions(effective)).toEqual({ sandbox: 'read-only', approvalPolicy: 'on-request' })
    expect(claudeRuntimePermissions(effective)).toEqual({ permissionMode: 'default', allowDangerouslySkipPermissions: false })
    expect(agent.runtimePermissionMode).toBe('bypass')
  })

  it('preserva o perfil e Acesso total na execução normal', () => {
    const agent = { runtimePermissionMode: 'bypass' as const }
    expect(effectiveRuntimeAgent(agent, {})).toBe(agent)
  })
})
