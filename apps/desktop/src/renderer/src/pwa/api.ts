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
export type RemoteMessage = { id: string; role: string; text: string; author?: string; agentId?: string; createdAt?: string; status?: string }
export type RemoteStatus = { paired: boolean; host?: { id: string; name: string }; capabilities?: string[]; readOnly?: boolean }

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
export async function rpc<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
  const response = await request<{ result: T }>('/api/rpc', { method, args })
  return response.result
}
