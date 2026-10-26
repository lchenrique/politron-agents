// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { assertPwaRpcAuthorized, PWA_READ_ONLY, type PwaCapability } from '../../shared/pwa-host-policy'
import { HostRpc } from './rpc'

describe('capacidades explícitas do gateway PWA', () => {
  it('permite apenas leituras ao perfil inicial da PWA', () => {
    expect(() => assertPwaRpcAuthorized('v9:snapshot', [], PWA_READ_ONLY)).not.toThrow()
    expect(() => assertPwaRpcAuthorized('v9:historyPage', ['conv', null], PWA_READ_ONLY)).not.toThrow()
    expect(() => assertPwaRpcAuthorized('v9:send', ['conv', 'oi'], PWA_READ_ONLY)).toThrow(/Permissão/)
    expect(() => assertPwaRpcAuthorized('v9:respondApproval', ['id', true], PWA_READ_ONLY)).toThrow(/Permissão/)
    expect(() => assertPwaRpcAuthorized('v9:readProjectFile', ['.env'], PWA_READ_ONLY)).toThrow(/Permissão/)
    expect(() => assertPwaRpcAuthorized('v9:writeProjectFile', ['file', 'code'], PWA_READ_ONLY)).toThrow(/Permissão/)
  })
  it('mantém métodos perigosos fora do browser mesmo quando todas as capacidades foram concedidas', () => {
    const grants: PwaCapability[] = ['read', 'chat', 'approvals', 'files:read', 'files:write']
    for (const method of ['v9:agentTerminalSessions', 'v9:agentTerminalStop', 'v9:openExternalTerminal', 'v9:saveTerminalAccess', 'v9:saveAssistantPreferences', 'v9:browserControl', 'v9:browserAction', 'v9:deleteWorkspace', 'providers:refresh', 'hosts:browse', '__proto__', 'constructor']) {
      expect(() => assertPwaRpcAuthorized(method, [], grants)).toThrow(/não está disponível/)
    }
  })
  it('recusa formato inválido de argumento', () => {
    expect(() => assertPwaRpcAuthorized('v9:snapshot', {}, PWA_READ_ONLY)).toThrow(/Parâmetros/)
    expect(() => assertPwaRpcAuthorized('v9:snapshot', Array(13).fill('x'), PWA_READ_ONLY)).toThrow(/Parâmetros/)
  })
  it('não encaminha escrita à RPC do host quando o usuário autorizou apenas leitura', async () => {
    const rpc = new HostRpc()
    let calls = 0
    rpc.register('v9:send', () => { calls++; return 'sent' })
    await expect(() => rpc.dispatchFromPwa('v9:send', ['conversation', 'message'], PWA_READ_ONLY)).toThrow(/Permissão/)
    expect(calls).toBe(0)
    expect(rpc.dispatchFromPwa('v9:send', ['conversation', 'message'], ['chat'])).toBe('sent')
    expect(calls).toBe(1)
  })
})
