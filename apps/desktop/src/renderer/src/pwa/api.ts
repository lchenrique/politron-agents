import type { MessageAttachment, RunStatus } from '../../../shared/v9'

export type RemoteBoo = {
  id: string; name: string; alias?: string; color: string
  pitsShape?: string; pitsHeadAccessory?: string; pitsFaceAccessory?: string
  pitsAccessoryColors?: Record<string, string[]>; pitsEyeColor?: string; pitsCheekColor?: string
  pitsBodyWidth?: number; pitsBodyHeight?: number; pitsEyeSize?: number
  pitsEyeSpacing?: number; pitsMouthSize?: number; pitsBlush?: boolean
  pitsAura?: boolean; pitsAnimate?: boolean; pitsSpeed?: number; pitsAmplitude?: number
}
export type RemoteWorkspace = { id: string; name: string; kind?: string; branch?: string; archived?: boolean }
export type RemoteConversation = { id: string; workspaceId: string; name: string; kind?: string; agentIds?: string[]; archived?: boolean }
export type RemoteRun = { id: string; conversationId?: string; workspaceId?: string; agentId?: string; status: string; input?: string }
export type RemoteApproval = { id: string; kind: string; runId?: string; status: string; details?: { action?: string; path?: string } }
export type RemoteSnapshot = { agents: RemoteBoo[]; workspaces: RemoteWorkspace[]; conversations: RemoteConversation[]; runs: RemoteRun[]; approvals: RemoteApproval[] }
export type RemoteMessage = { id: string; role: string; text: string; author?: string; agentId?: string; createdAt?: string; status?: RunStatus }
export type RemoteStatus = { paired: boolean; host?: { id: string; name: string }; capabilities?: string[]; readOnly?: boolean; attachmentsEnabled?: boolean }

export async function request<T = unknown>(path: string, body?: object): Promise<T> {
  const response = await fetch(path, body ? {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-Boobot-PWA': '1' }, body: JSON.stringify(body),
  } : { cache: 'no-store', credentials: 'same-origin' })
  const data: unknown = await response.json()
  if (!response.ok) {
    const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {}
    const error = new Error(typeof payload.error === 'string' ? payload.error : 'Não foi possível conectar ao host.')
    Object.assign(error, { status: response.status })
    throw error
  }
  return data as T
}
export async function uploadImageAttachment(conversationId: string, name: string, mimeType: string, bytes: Uint8Array): Promise<MessageAttachment> {
  const supported = ['image/png', 'image/jpeg', 'image/webp']
  if (!supported.includes(mimeType) || bytes.byteLength === 0 || bytes.byteLength > 20 * 1024 * 1024) throw new Error('Envie uma imagem PNG, JPEG ou WebP de até 20 MB.')
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const response = await fetch(`/api/attachments?conversationId=${encodeURIComponent(conversationId)}&name=${encodeURIComponent(name)}`, {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': mimeType, 'X-Boobot-PWA': '1' }, body: new Blob([buffer], { type: mimeType }),
  })
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {}
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Não foi possível enviar a imagem ao host.')
  }
  return data as MessageAttachment
}

export async function readImageAttachment(conversationId: string, id: string): Promise<{ mimeType: string; bytes: Uint8Array }> {
  const response = await fetch(`/api/attachments/${encodeURIComponent(id)}?conversationId=${encodeURIComponent(conversationId)}`, {
    credentials: 'same-origin', cache: 'no-store', headers: { 'X-Boobot-PWA': '1' },
  })
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null)
    const error = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
    throw new Error(typeof error.error === 'string' ? error.error : 'Não foi possível carregar a imagem.')
  }
  const mimeType = (response.headers.get('Content-Type') || '').split(';')[0]
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) throw new Error('O host retornou um tipo de imagem inválido.')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > 20 * 1024 * 1024) throw new Error('A imagem excede o limite permitido.')
  return { mimeType, bytes }
}

export async function rpc<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
  const response = await request<{ result: T }>('/api/rpc', { method, args })
  return response.result
}
