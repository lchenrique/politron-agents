import { describe, expect, it } from 'vitest'
import { shouldAutoApprove } from './approval-policy'

describe('aprovações por agente no backend', () => {
  it('pede confirmação para comandos mesmo com automático', () => {
    expect(shouldAutoApprove('ask', 'command', true)).toBe(false)
    expect(shouldAutoApprove('automatic', 'command', true)).toBe(false)
  })
  it('permite bypass explicitamente selecionado para terminal', () => {
    expect(shouldAutoApprove('bypass', 'command', true)).toBe(true)
    expect(shouldAutoApprove('bypass', 'write', false)).toBe(true)
    expect(shouldAutoApprove('bypass', 'browser', false)).toBe(true)
  })
  it('mantém aprovações administrativas e delegação protegidas', () => {
    for (const mode of ['ask', 'automatic'] as const) {
      expect(shouldAutoApprove(mode, 'agent-change', false)).toBe(false)
      expect(shouldAutoApprove(mode, 'agent-change', true)).toBe(false)
      expect(shouldAutoApprove(mode, 'delegation', true)).toBe(false)
    }
  })
  it('respeita modo automático apenas para arquivos e navegador', () => {
    expect(shouldAutoApprove('automatic', 'write', false)).toBe(true)
    expect(shouldAutoApprove('automatic', 'browser', false)).toBe(true)
    expect(shouldAutoApprove('ask', 'write', false)).toBe(false)
    expect(shouldAutoApprove('ask', 'browser', false)).toBe(false)
    expect(shouldAutoApprove('automatic', 'write', true)).toBe(false)
  })
})
