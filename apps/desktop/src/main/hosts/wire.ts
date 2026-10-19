import WebSocket from 'ws'
import type { Transport } from '@getpaseo/relay'

export const PROTOCOL = 1
export const MAX_PACKET = 16 * 1024 * 1024
export type RemoteEvent = { channel: 'v9:event' | 'providers:changed' | 'vibe:terminal:data' | 'vibe:terminal:exit'; data: unknown }
export type RpcHandler = (method: string, args: unknown[]) => unknown | Promise<unknown>
export const record = (input: unknown): input is Record<string, unknown> => !!input && typeof input === 'object' && !Array.isArray(input)
export function decode(input: string | ArrayBuffer): Record<string, unknown> {
  const text = typeof input === 'string' ? input : Buffer.from(input).toString('utf8')
  if (Buffer.byteLength(text) > MAX_PACKET) throw new Error('Mensagem remota excede o limite.')
  const value: unknown = JSON.parse(text)
  if (!record(value)) throw new Error('Mensagem remota inválida.')
  return value
}
export function encode(input: unknown): string {
  const text = JSON.stringify(input)
  if (Buffer.byteLength(text) > MAX_PACKET) throw new Error('Resposta remota excede 16 MB.')
  return text
}
export function socketTransport(socket: WebSocket): Transport {
  const transport: Transport = { onmessage: null, onclose: null, onerror: null,
    send(data) {
      if (socket.readyState !== WebSocket.OPEN) throw new Error('Host desconectado.')
      if (socket.bufferedAmount > MAX_PACKET * 2) { socket.close(1013, 'Cliente lento'); throw new Error('Conexão remota congestionada.') }
      socket.send(data)
    },
    close: (code, reason) => socket.close(code, reason),
  }
  socket.on('message', (data, binary) => {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)
    transport.onmessage?.({ data: binary ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer : buffer.toString('utf8'), isBinary: binary })
  })
  socket.on('close', (code, reason) => transport.onclose?.(code, reason.toString()))
  socket.on('error', () => transport.onerror?.(new Error('Falha de transporte do host.')))
  return transport
}
export function validateEndpoint(input: string): string {
  const value = input.includes('://') ? input : `ws://${input}/boobot`
  const url = new URL(value)
  if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('Use um endereço ws:// ou wss://, sem credenciais.')
  if (url.pathname === '/') url.pathname = '/boobot'
  return url.toString()
}
