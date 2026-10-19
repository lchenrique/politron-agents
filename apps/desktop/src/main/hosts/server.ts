import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { WebSocketServer } from 'ws'
import { createDaemonChannel, importPublicKey, type EncryptedChannel, type Transport } from '@getpaseo/relay'
import type { HostIdentity } from './identity'
import { decode, encode, PROTOCOL, MAX_PACKET, socketTransport, type RemoteEvent, type RpcHandler } from './wire'

export class HostServer {
  private server: WebSocketServer | null = null
  private sessions = new Set<{ channel: EncryptedChannel; send: (event: RemoteEvent) => void }>()
  private transports = new Set<Transport>()
  private heartbeat: ReturnType<typeof setInterval> | null = null
  constructor(private readonly identity: HostIdentity, private readonly rpc: RpcHandler) {}
  async listen(address = '127.0.0.1', port = 6778): Promise<number> {
    if (this.server) throw new Error('Host já está em execução.')
    const server = new WebSocketServer({ host: address, port, path: '/boobot', maxPayload: MAX_PACKET * 2, perMessageDeflate: false, verifyClient: (info: { origin: string }) => !info.origin })
    this.server = server
    server.on('connection', socket => {
      if (this.transports.size >= 16) { socket.close(1013, 'Limite de conexões'); return }
      const transport = socketTransport(socket)
      void this.accept(transport)
      let alive = true
      socket.on('pong', () => { alive = true })
      const check = () => { if (!alive) socket.terminate(); else { alive = false; socket.ping() } }
      socket.on('close', () => server.off('heartbeat', check))
      server.on('heartbeat', check)
    })
    await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) }).catch(async error => { await this.close(); throw error })
    this.heartbeat = setInterval(() => server.emit('heartbeat'), 30_000); this.heartbeat.unref()
    const bound = server.address()
    if (!bound || typeof bound === 'string') throw new Error('Endereço de host indisponível.')
    return bound.port
  }
  async accept(transport: Transport): Promise<void> {
    this.transports.add(transport)
    const challenge = randomBytes(32).toString('base64url')
    let authorized = false, lastRequest = 0, eventSeq = 0
    let session: { channel: EncryptedChannel; send: (event: RemoteEvent) => void } | undefined
    const timer = setTimeout(() => transport.close(1008, 'Pareamento necessário'), 10_000); timer.unref()
    const cleanup = () => { clearTimeout(timer); this.transports.delete(transport); if (session) this.sessions.delete(session) }
    try {
      const channel = await createDaemonChannel(transport, { publicKey: importPublicKey(this.identity.publicKey), secretKey: Uint8Array.from(this.identity.secretKey) }, {
        onclose: cleanup,
        onerror: () => { transport.close(1008, 'Falha na conexão criptografada'); cleanup() },
        onmessage: data => {
          void (async () => {
            const message = decode(data)
            if (!authorized) {
              const hash = (value: string) => createHash('sha256').update(value).digest()
              if (message.type !== 'auth' || message.challenge !== challenge || message.protocol !== PROTOCOL || typeof message.token !== 'string' || !timingSafeEqual(hash(message.token), hash(this.identity.token))) throw new Error('Conexão não autorizada.')
              authorized = true; clearTimeout(timer)
              await channel.send(encode({ type: 'ready', protocol: PROTOCOL, id: this.identity.id, name: this.identity.name }))
              return
            }
            if (message.type !== 'request' || typeof message.id !== 'string' || message.id.length > 80 || typeof message.method !== 'string' || !Array.isArray(message.args) || message.args.length > 12 || !Number.isSafeInteger(message.seq) || message.seq !== lastRequest + 1) throw new Error('Solicitação remota inválida ou repetida.')
            lastRequest = Number(message.seq)
            const { id, seq } = message
            try {
              const result = await this.rpc(message.method, message.args)
              if (this.transports.has(transport)) await channel.send(encode({ type: 'response', id, seq, result: result ?? null }))
            } catch (error) {
              if (this.transports.has(transport)) await channel.send(encode({ type: 'response', id, seq, error: error instanceof Error ? error.message : 'Falha na operação do host.' }))
            }
          })().catch(() => { transport.close(1008, 'Solicitação recusada'); cleanup() })
        },
      })
      session = { channel, send: event => {
        if (authorized) void channel.send(encode({ type: 'event', seq: ++eventSeq, ...event })).catch(() => { transport.close(); cleanup() })
      } }
      this.sessions.add(session)
      await channel.send(encode({ type: 'challenge', nonce: challenge, protocol: PROTOCOL }))
    } catch { transport.close(1008, 'Falha no pareamento'); cleanup() }
  }
  broadcast(event: RemoteEvent): void { for (const session of this.sessions) session.send(event) }
  async close(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = null
    for (const transport of this.transports) transport.close(1001, 'Host encerrado')
    this.transports.clear(); this.sessions.clear()
    const server = this.server; this.server = null
    if (server) { for (const socket of server.clients) socket.terminate(); await new Promise<void>(resolve => server.close(() => resolve())) }
  }
}
