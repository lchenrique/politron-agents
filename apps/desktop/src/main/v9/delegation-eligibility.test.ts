import { describe, expect, it } from 'vitest'
import type { Agent } from '../../shared/v9'
import { delegationEligibility, type DelegationEligibilityContext } from './delegation-eligibility'

const candidate = (overrides: Partial<Agent> = {}): Agent => ({
  id: 'specialist', name: 'Especialista', alias: 'especialista', description: '', instructions: 'Trabalhe com cuidado.',
  runtime: 'codex', model: '', color: '#6366f1', avatar: '', canWrite: false, computerUse: false,
  approvalMode: 'ask', revision: 1, createdAt: '2026-10-01T00:00:00.000Z', ...overrides,
})
const context = (overrides: Partial<DelegationEligibilityContext> = {}): DelegationEligibilityContext => ({
  agentId: 'chief', role: 'chief', workspaceId: 'workspace-a', ancestry: ['chief'], ...overrides,
})

describe('delegationEligibility', () => {
  it('permite ao Chief qualquer Boo permanente do catálogo e o temporário disponível do workspace', () => {
    expect(delegationEligibility(context(), candidate())).toEqual({ canDelegate: true })
    expect(delegationEligibility(context({ role: 'agent' }), candidate())).toEqual({ canDelegate: true })
    expect(delegationEligibility(context(), candidate({ temporary: true, temporaryStatus: 'available', temporaryWorkspaceId: 'workspace-a' }))).toEqual({ canDelegate: true })
  })

  it('nega self-call, agente aposentado, temporário fora do workspace e temporário ocupado', () => {
    expect(delegationEligibility(context(), candidate({ id: 'chief' }))).toMatchObject({ canDelegate: false, reason: expect.stringMatching(/si mesmo/) })
    expect(delegationEligibility(context(), candidate({ temporary: true, temporaryStatus: 'retired', temporaryWorkspaceId: 'workspace-a' }))).toMatchObject({ canDelegate: false, reason: expect.stringMatching(/aposentado/) })
    expect(delegationEligibility(context(), candidate({ temporary: true, temporaryStatus: 'available', temporaryWorkspaceId: 'workspace-b' }))).toMatchObject({ canDelegate: false, reason: expect.stringMatching(/outro workspace/) })
    expect(delegationEligibility(context(), candidate({ temporary: true, temporaryStatus: 'working', temporaryWorkspaceId: 'workspace-a' }))).toMatchObject({ canDelegate: false, reason: expect.stringMatching(/ocupado/) })
  })

  it('nega ciclos e profundidade excedida; ocupação de agente permanente é informada separadamente', () => {
    expect(delegationEligibility(context({ ancestry: ['chief', 'specialist'] }), candidate())).toMatchObject({ canDelegate: false, reason: expect.stringMatching(/ciclo/) })
    expect(delegationEligibility(context({ ancestry: ['chief', 'a', 'b', 'c'] }), candidate())).toMatchObject({ canDelegate: false, reason: expect.stringMatching(/profundidade/) })
    expect(delegationEligibility(context(), candidate())).toEqual({ canDelegate: true })
  })
})
