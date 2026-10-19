import { randomBytes, randomUUID } from 'node:crypto'
import { generateKeyPair, exportPublicKey, importPublicKey } from '@getpaseo/relay'
import type { HostSettings } from '../../shared/hosts'
import { record, validateEndpoint } from './wire'

export interface HostIdentity { id: string; name: string; publicKey: string; secretKey: number[]; token: string }
export interface SavedHost { id: string; name: string; endpoint: string; publicKey: string; token: string; ssh?: string }
export interface HostsData { identity: HostIdentity; selectedId: string; settings: HostSettings; hosts: SavedHost[] }
export const defaultSettings: HostSettings = { enabled: false, address: '127.0.0.1', port: 6778, advertisedUrl: 'ws://127.0.0.1:6778/boobot', relayUrl: '' }
export function createIdentity(name: string): HostIdentity {
  const keys = generateKeyPair()
  return { id: randomUUID(), name, publicKey: exportPublicKey(keys.publicKey), secretKey: [...keys.secretKey], token: randomBytes(32).toString('base64url') }
}
export function pairingLink(identity: HostIdentity, endpoint: string): string {
  return 'boobot://connect#' + new URLSearchParams({ v: '1', id: identity.id, name: identity.name, endpoint: validateEndpoint(endpoint), key: identity.publicKey, token: identity.token }).toString()
}
export function parsePairing(input: string): Omit<SavedHost, 'ssh'> {
  if (typeof input !== 'string' || input.length > 8000) throw new Error('Link de pareamento inválido.')
  const link = new URL(input.trim())
  if (link.protocol !== 'boobot:' || link.hostname !== 'connect') throw new Error('Cole um link de conexão do Boobot.')
  const data = new URLSearchParams(link.hash.slice(1))
  const id = data.get('id'), name = data.get('name'), publicKey = data.get('key'), token = data.get('token')
  if (data.get('v') !== '1' || !id || !name || !publicKey || !token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Link de pareamento incompleto ou incompatível.')
  importPublicKey(publicKey)
  return { id, name: name.slice(0, 100), publicKey, token, endpoint: validateEndpoint(data.get('endpoint') || '') }
}
export function validateSettings(input: unknown): HostSettings {
  if (!record(input) || typeof input.enabled !== 'boolean' || !['127.0.0.1', '0.0.0.0'].includes(String(input.address)) || !Number.isInteger(input.port) || Number(input.port) < 0 || Number(input.port) > 65535 || typeof input.advertisedUrl !== 'string' || typeof input.relayUrl !== 'string') throw new Error('Configuração de host inválida.')
  return { enabled: input.enabled, address: input.address as HostSettings['address'], port: Number(input.port), advertisedUrl: validateEndpoint(input.advertisedUrl), relayUrl: input.relayUrl ? validateEndpoint(input.relayUrl) : '' }
}

export function validateStoredData(input: unknown): HostsData {
  if (!record(input) || !record(input.identity) || !Array.isArray(input.hosts) || typeof input.selectedId !== 'string') throw new Error('Dados de hosts inválidos. O arquivo foi preservado.')
  const identity = input.identity
  if (typeof identity.id !== 'string' || typeof identity.name !== 'string' || typeof identity.publicKey !== 'string' || typeof identity.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(identity.token) || !Array.isArray(identity.secretKey) || identity.secretKey.length !== 32 || !identity.secretKey.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) throw new Error('Identidade do host inválida. O arquivo foi preservado.')
  importPublicKey(identity.publicKey)
  const hosts = input.hosts.map(host => {
    if (!record(host) || typeof host.id !== 'string' || typeof host.name !== 'string' || typeof host.publicKey !== 'string' || typeof host.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(host.token) || host.ssh !== undefined && typeof host.ssh !== 'string') throw new Error('Conexão de host inválida. O arquivo foi preservado.')
    importPublicKey(host.publicKey)
    return { id: host.id, name: host.name.slice(0,100), publicKey: host.publicKey, token: host.token, endpoint: validateEndpoint(String(host.endpoint)), ssh: host.ssh as string | undefined }
  })
  if (new Set(hosts.map(host => host.id)).size !== hosts.length || hosts.some(host => host.id === 'local' || host.id === identity.id)) throw new Error('Identificadores de host inválidos.')
  return { identity: identity as unknown as HostIdentity, hosts, settings: validateSettings(input.settings), selectedId: input.selectedId === 'local' || hosts.some(host => host.id === input.selectedId) ? input.selectedId : 'local' }
}
