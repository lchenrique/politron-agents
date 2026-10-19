// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { HostServer } from './server'
import { HostClient } from './client'
import { createIdentity, pairingLink, parsePairing } from './identity'
import { HostRpc } from './rpc'
import { validateEndpoint } from './wire'

const cleanup: (() => unknown)[] = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn() })
async function setup() {
  const identity = createIdentity('Host descartável'), rpc = new HostRpc()
  rpc.register('v9:snapshot', () => ({ agents: ['boo-host'] }))
  rpc.register('v9:send', async () => { await new Promise(resolve => setTimeout(resolve, 15)); return 'Tarefa concluída no host' })
  const server = new HostServer(identity, rpc.dispatch)
  const port = await server.listen('127.0.0.1', 0)
  cleanup.push(() => server.close())
  const host = parsePairing(pairingLink(identity, `ws://127.0.0.1:${port}/boobot`))
  return { identity, rpc, server, host }
}
describe('conexão real criptografada entre dois Boobots em loopback', () => {
  it('autentica, chama RPC e entrega eventos por canal criptografado', async () => {
    const { server, host } = await setup(), client = new HostClient(host)
    cleanup.push(() => client.close())
    await client.connect()
    expect(await client.call('v9:snapshot')).toEqual({ agents: ['boo-host'] })
    const event = new Promise(resolve => client.once('event', resolve))
    server.broadcast({ channel: 'v9:event', data: { type: 'changed' } })
    expect(await event).toEqual({ channel: 'v9:event', data: { type: 'changed' } })
    expect(await client.call('v9:send', ['conv', 'teste sintético'])).toBe('Tarefa concluída no host')
    await expect(client.call('constructor')).rejects.toThrow('não está disponível')
  })
  it('recusa um token de pareamento inválido sem chamar o serviço', async () => {
    const { host } = await setup(), client = new HostClient({ ...host, token: 'x'.repeat(43) })
    cleanup.push(() => client.close())
    await expect(client.connect()).rejects.toThrow('autenticar')
  })
  it('recusa navegadores com Origin e mensagens não autenticadas', async () => {
    const { host } = await setup()
    const browser = new WebSocket(host.endpoint, { origin: 'https://example.com' })
    cleanup.push(() => browser.terminate())
    const refused = new Promise(resolve => browser.once('error', resolve))
    expect(await refused).toBeInstanceOf(Error)
    const socket = new WebSocket(host.endpoint)
    cleanup.push(() => socket.terminate())
    await new Promise(resolve => socket.once('open', resolve))
    const closed = new Promise(resolve => socket.once('close', resolve))
    socket.send(JSON.stringify({ type: 'request', method: 'v9:snapshot', args: [] }))
    await closed
  })
  it('interrupção rejeita operações pendentes e nunca as executa localmente', async () => {
    const { host, rpc } = await setup(), client = new HostClient(host)
    rpc.register('v9:send', () => new Promise(() => undefined))
    cleanup.push(() => client.close())
    await client.connect()
    const pending = expect(client.call('v9:send')).rejects.toThrow('desconectado')
    client.close(); await pending
    await expect(client.call('v9:snapshot')).rejects.toThrow('não foi executada localmente')
  })
  it('valida links e não aceita endpoints com credenciais ou outro protocolo', () => {
    expect(() => validateEndpoint('https://example.com')).toThrow()
    expect(() => validateEndpoint('ws://usuario:senha@example.com')).toThrow()
    expect(() => parsePairing('boobot://connect#token=invalido')).toThrow()
    expect(validateEndpoint('localhost:6778')).toBe('ws://localhost:6778/boobot')
  })
})
