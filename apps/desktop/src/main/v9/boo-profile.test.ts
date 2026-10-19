import { describe, expect, it } from 'vitest'
import type { Agent } from '../../shared/v9'
import { buildSelfProfileUpdate } from './boo-profile'

const chief = {
  id: 'c1', name: 'Atlas', alias: 'atlas', description: 'Chief',
  instructions: 'Coordene a equipe.', role: 'chief', runtime: 'codex', model: 'gpt-6',
  canWrite: false, computerUse: false, approvalMode: 'ask', color: '#786bea',
  avatar: 'data:image/png;base64,AA==', revision: 1,
} as Agent

describe('autoedição segura de perfil', () => {
  it('permite personalidade e aparência sem alterar outras configurações', () => {
    const next = buildSelfProfileUpdate(chief, {
      instructions: 'Seja direto e coopere.', color: '#ABCDEF',
      pitsShape: 'ghost-wave', pitsAccessory: 'antenna', pitsEyeSize: 12, pitsBodyWidth: 1.2, pitsBodyHeight: .85, pitsMouthSize: 1.35, pitsBlushStrength: .7,
    })
    expect(next).toMatchObject({
      instructions: 'Seja direto e coopere.', color: '#abcdef', pitsShape: 'ghost-wave',
      pitsAccessory: 'antenna', pitsEyeSize: 12, pitsBodyWidth: 1.2, pitsBodyHeight: .85, pitsMouthSize: 1.35, pitsBlushStrength: .7,
      model: 'gpt-6', runtime: 'codex', role: 'chief', canWrite: false,
      computerUse: false, avatar: chief.avatar, alias: 'atlas',
    })
    expect(chief.instructions).toBe('Coordene a equipe.')
  })
  it.each([
    { runtime: 'claude' }, { model: 'admin-model' }, { canWrite: true },
    { computerUse: true }, { approvalMode: 'automatic' }, { role: 'agent' },
    { alias: 'other' }, { avatar: 'data:image/png;base64,abc' },
    { id: 'other' }, { permissions: {} },
  ])('bloqueia campos sensíveis: %o', payload => {
    expect(() => buildSelfProfileUpdate(chief, payload)).toThrow(/sensível/)
  })
  it('rejeita instruções vazias, cores e atributos inválidos', () => {
    for (const payload of [{ instructions: ' ' }, { color: '#x' }, { pitsAccessory: 'remote-control' },
      { pitsShape: 'unknown' }, { pitsEyeSize: 100 }, { pitsBodyWidth: 2 }, { pitsBodyHeight: -1 }, { pitsMouthSize: 2 }, { pitsBlushStrength: -1 }, { pitsAnimate: 'yes' }, {}]) {
      expect(() => buildSelfProfileUpdate(chief, payload)).toThrow()
    }
  })
})
