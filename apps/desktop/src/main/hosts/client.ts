import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import { createClientChannel, type EncryptedChannel } from '@getpaseo/relay'
import type { SavedHost } from './identity'
import { decode, encode, MAX_PACKET, PROTOCOL, socketTransport, type RemoteEvent } from './wire'

export class HostClient extends EventEmitter {
  private socket: WebSocket | null = null
  private channel: EncryptedChannel | null = null
  private authorized = false
  private requestSeq = 0
  private eventSeq = 0
  private pending = new Map<string, { seq: number; resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  constructor(readonly host: SavedHost) { super() }
  async connect(endpoint = this.host.endpoint): Promise<void> {
    this.requestSeq = 0; this.eventSeq = 0
    const socket = new WebSocket(endpoint, { maxPayload: MAX_PACKET * 2, perMessageDeflate: false, handshakeTimeout: 10_000 })
    this.socket = socket
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { this.close(); reject(new Error('Tempo limite para conectar ao host.')) }, 12_000)
      const fail = (error?: unknown) => {
        clearTimeout(timer)
        const reason = error instanceof Error ? error.message.replaceAll(this.host.token, '[credencial]').slice(0, 240) : ''
        reject(new Error('Não foi possível autenticar/conectar ao host.' + (reason ? ` ${reason}` : '')))
      }
      socket.once('error', fail)
      socket.once('close', () => { if (!this.authorized) fail() })
      socket.once('open', () => {
        void createClientChannel(socketTransport(socket), this.host.publicKey, {
          onclose: () => { fail(); this.disconnected() },
          onerror: error => { fail(error); this.close() },
          onmessage: data => {
            try {
              const message = decode(data)
              if (!this.authorized) {
                if (message.type === 'challenge' && typeof message.nonce === 'string' && message.protocol === PROTOCOL) {
                  void this.channel?.send(encode({ type: 'auth', protocol: PROTOCOL, challenge: message.nonce, token: this.host.token })).catch(fail)
                } else if (message.type === 'ready' && message.protocol === PROTOCOL && message.id === this.host.id) {
                  this.authorized = true; clearTimeout(timer); socket.off('error', fail); resolve()
                } else throw new Error('Host incompatível.')
                return
              }
              if (message.type === 'response' && typeof message.id === 'string') {
                const pending = this.pending.get(message.id)
                if (!pending || pending.seq !== message.seq) return
                clearTimeout(pending.timer); this.pending.delete(message.id)
                if (typeof message.error === 'string') pending.reject(new Error(message.error)); else pending.resolve(message.result)
              } else if (message.type === 'event' && Number.isSafeInteger(message.seq) && Number(message.seq) === this.eventSeq + 1 && typeof message.channel === 'string') {
                this.eventSeq++
                this.emit('event', { channel: message.channel, data: message.data } as RemoteEvent)
              } else throw new Error('Evento remoto inválido ou repetido.')
            } catch { this.close() }
          },
        }).then(channel => { this.channel = channel }).catch(fail)
      })
    }).catch(error => { this.close(); throw error })
  }
  call(method: string, args: unknown[] = []): Promise<unknown> {
    if (!this.authorized || !this.channel) return Promise.reject(new Error('Host desconectado. A operação não foi executada localmente.'))
    const id = randomUUID(), seq = ++this.requestSeq
    let packet: string
    try { packet = encode({ type: 'request', id, seq, method, args }) } catch (error) { this.requestSeq--; return Promise.reject(error) }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('O host não respondeu. A tarefa pode continuar nele; consulte o estado antes de reenviar.')) }, method === 'v9:send' || method === 'v9:respondToAgent' ? 1_200_000 : 60_000)
      this.pending.set(id, { seq, resolve, reject, timer })
      void this.channel!.send(packet).catch(() => { clearTimeout(timer); this.pending.delete(id); reject(new Error('Falha no envio ao host.')) })
    })
  }
  private disconnected(): void {
    const wasConnected = this.authorized; this.authorized = false
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Host desconectado. A tarefa pode continuar no host.')) }
    this.pending.clear()
    if (wasConnected) this.emit('disconnected')
  }
  close(): void { this.disconnected(); this.channel = null; this.socket?.terminate(); this.socket = null }
}
