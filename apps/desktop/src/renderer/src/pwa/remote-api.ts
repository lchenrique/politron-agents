import type { ProvidersAPI, ProviderId, ProviderInfo, ProviderSnapshot } from '../../../shared/providers'
import { ASSISTANT_ID, type Agent, type AppAPI, type Message, type Model, type SendOptions, type Snapshot, type VoiceStatus, type WorkspaceEvent } from '../../../shared/v9'
import { assistantPlaceholder } from '../features/app/appShellShared'
import { readImageAttachment, request, rpc, uploadImageAttachment, type RemoteStatus } from './api'

const capabilitiesChanged = new Set<(capabilities: string[]) => void>()
const eventListeners = new Set<(event: WorkspaceEvent) => void>()
const binary = { codex: 'codex', claude: 'claude', pi: 'pi', opencode: 'opencode', antigravity: 'antigravity' } as const
let capabilities: string[] = []
let activeConversationId: string | null = null
let pollTimer: number | undefined
let polling = false
let previousSnapshot = ''
let previousMessages = new Map<string, string>()
let wasOnline = false

const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback
const number = (value: unknown, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback
const optionalNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined
const bool = (value: unknown, fallback = false) => typeof value === 'boolean' ? value : fallback
const oneOf = <T extends string>(value: unknown, values: readonly T[], fallback: T): T =>
  typeof value === 'string' && values.includes(value as T) ? value as T : fallback
const runtimes = ['codex', 'claude', 'pi', 'opencode', 'antigravity'] as const
const efforts = ['low', 'medium', 'high', 'xhigh', 'max'] as const
const runStatuses = ['queued', 'running', 'waiting', 'completed', 'interrupted', 'failed', 'cancelled'] as const

function safeAgent(input: unknown): Agent {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  return {
    ...assistantPlaceholder,
    id: text(value.id, ASSISTANT_ID), name: text(value.name, 'Assistente'), alias: text(value.alias),
    description: text(value.description), instructions: '', runtime: oneOf(value.runtime, runtimes, 'codex'),
    model: text(value.model), color: text(value.color, '#6366f1'),
    avatar: text(value.avatar).startsWith('data:image/') ? text(value.avatar) : '',
    role: value.role === 'chief' ? 'chief' : 'agent', temporary: bool(value.temporary),
    temporaryStatus: oneOf(value.temporaryStatus, ['available', 'working', 'retired'] as const, 'available'),
    temporaryWorkspaceId: text(value.temporaryWorkspaceId), temporaryTask: '',
    pitsShape: value.pitsShape as Agent['pitsShape'], pitsHeadAccessory: value.pitsHeadAccessory as Agent['pitsHeadAccessory'],
    pitsFaceAccessory: value.pitsFaceAccessory as Agent['pitsFaceAccessory'], pitsAccessoryColors: value.pitsAccessoryColors as Agent['pitsAccessoryColors'],
    pitsEyeColor: text(value.pitsEyeColor), pitsCheekColor: text(value.pitsCheekColor), pitsAccentColor: text(value.pitsAccentColor) || undefined, pitsHeadset: bool(value.pitsHeadset, true), pitsAura: bool(value.pitsAura), pitsBlush: bool(value.pitsBlush),
    pitsAnimate: bool(value.pitsAnimate), pitsSpeed: optionalNumber(value.pitsSpeed), pitsAmplitude: optionalNumber(value.pitsAmplitude),
    pitsBodyWidth: optionalNumber(value.pitsBodyWidth), pitsBodyHeight: optionalNumber(value.pitsBodyHeight), pitsEyeSize: optionalNumber(value.pitsEyeSize),
    pitsEyeSpacing: optionalNumber(value.pitsEyeSpacing), pitsMouthSize: optionalNumber(value.pitsMouthSize),
    canWrite: bool(value.canWrite, true), computerUse: bool(value.computerUse),
    approvalMode: oneOf(value.approvalMode, ['ask', 'automatic', 'bypass'] as const, 'ask'),
    effort: oneOf(value.effort, efforts, 'medium'), revision: number(value.revision, 1), createdAt: text(value.createdAt),
  }
}

function normalizeSnapshot(input: unknown): Snapshot {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const agents = Array.isArray(value.agents) ? value.agents.map(safeAgent) : []
  const assistant = value.assistant ? safeAgent(value.assistant) : assistantPlaceholder
  const workspaces = Array.isArray(value.workspaces) ? value.workspaces.map(raw => {
    const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    return {
      id: text(item.id), name: text(item.name, 'Workspace'), kind: oneOf(item.kind, ['local', 'worktree', 'free'] as const, 'local'),
      path: '', branch: typeof item.branch === 'string' ? item.branch : null, baseBranch: null,
      parentWorkspaceId: typeof item.parentWorkspaceId === 'string' ? item.parentWorkspaceId : null,
      instructions: '', defaultAgentIds: Array.isArray(item.defaultAgentIds) ? item.defaultAgentIds.filter((id): id is string => typeof id === 'string') : [],
      changes: number(item.changes), archived: bool(item.archived), createdAt: text(item.createdAt),
    }
  }) : []
  const conversations = Array.isArray(value.conversations) ? value.conversations.map(raw => {
    const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    return {
      id: text(item.id), kind: oneOf(item.kind, ['direct', 'group'] as const, 'direct'), name: text(item.name, 'Nova sessão'),
      agentIds: Array.isArray(item.agentIds) ? item.agentIds.filter((id): id is string => typeof id === 'string') : [],
      workspaceId: text(item.workspaceId), titleAuto: bool(item.titleAuto),
      responseMode: oneOf(item.responseMode, ['broadcast', 'leader', 'auto', 'discussion'] as const, 'leader'),
      leaderAgentId: typeof item.leaderAgentId === 'string' ? item.leaderAgentId : null,
      revision: number(item.revision, 1), archived: bool(item.archived), createdAt: text(item.createdAt),
    }
  }) : []
  const runs = Array.isArray(value.runs) ? value.runs.map(raw => {
    const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    const runtime = item.agent && typeof item.agent === 'object' ? (item.agent as Record<string, unknown>).runtime : undefined
    const agent = safeAgent({ id: item.agentId, runtime })
    return {
      id: text(item.id), conversationId: text(item.conversationId), agentId: text(item.agentId), rootId: text(item.rootId, text(item.id)),
      parentId: typeof item.parentId === 'string' ? item.parentId : null, ancestry: [],
      status: oneOf(item.status, runStatuses, 'completed'), threadId: typeof item.threadId === 'string' ? item.threadId : null,
      turnId: typeof item.turnId === 'string' ? item.turnId : null, messageId: '', input: '', planMode: false, agent,
      workspaceId: text(item.workspaceId), workspacePath: '', createdAt: text(item.createdAt),
    }
  }) : []
  const approvals = Array.isArray(value.approvals) ? value.approvals.map(raw => {
    const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    const details = item.details && typeof item.details === 'object' ? item.details as Record<string, unknown> : {}
    return {
      id: text(item.id), runId: text(item.runId), conversationId: '', agentId: '',
      kind: oneOf(item.kind, ['write', 'browser', 'command', 'delegation', 'agent-change', 'question', 'plan'] as const, 'write'),
      details: { action: text(details.action) }, status: oneOf(item.status, ['pending', 'approved', 'denied', 'interrupted'] as const, 'pending'),
      createdAt: text(item.createdAt), resolvedAt: null,
    }
  }) : []
  return { assistant, agents, workspaces, conversations, messages: [], runs, fileChanges: [], approvals, terminalEnabled: false,
    steeringRuntimes: Array.isArray(value.steeringRuntimes) ? value.steeringRuntimes.filter((item): item is Agent['runtime'] => runtimes.includes(item as typeof runtimes[number])) : [],
    imageRuntimes: Array.isArray(value.imageRuntimes) ? value.imageRuntimes.filter((item): item is Agent['runtime'] => runtimes.includes(item as typeof runtimes[number])) : [] }
}

export function setPwaCapabilities(next: string[]) {
  capabilities = [...new Set(next.filter(value => typeof value === 'string'))]
  for (const listener of capabilitiesChanged) listener(capabilities)
}
export const getPwaCapabilities = () => capabilities
export function onPwaCapabilitiesChanged(listener: (value: string[]) => void) {
  capabilitiesChanged.add(listener)
  return () => { capabilitiesChanged.delete(listener) }
}

async function poll() {
  if (polling || document.hidden || eventListeners.size === 0) return
  polling = true
  try {
    const [rawSnapshot, rawHistory] = await Promise.all([
      rpc<unknown>('v9:snapshot'),
      activeConversationId ? rpc<{ messages?: unknown[] }>('v9:historyPage', activeConversationId, null, 100) : Promise.resolve(null),
    ])
    const snapshot = normalizeSnapshot(rawSnapshot)
    const snapshotSignature = JSON.stringify(snapshot)
    if (previousSnapshot && snapshotSignature !== previousSnapshot) emit({ type: 'changed' })
    previousSnapshot = snapshotSignature
    if (rawHistory && Array.isArray(rawHistory.messages)) {
      const nextMessages = new Map<string, string>()
      for (const message of rawHistory.messages) {
        if (!message || typeof message !== 'object') continue
        const item = message as { id?: unknown; status?: unknown; text?: unknown; attachments?: unknown }
        if (typeof item.id !== 'string') continue
        const signature = JSON.stringify([item.status, item.text, item.attachments])
        nextMessages.set(item.id, signature)
        if (previousMessages.size && previousMessages.get(item.id) !== signature) emit({ type: 'message', message: message as Message })
      }
      previousMessages = nextMessages
    }
    if (!wasOnline) emit({ type: 'changed', reason: 'connection-restored' })
    wasOnline = true
  } catch {
    wasOnline = false
  } finally { polling = false }
}
function emit(event: WorkspaceEvent) { for (const listener of eventListeners) listener(event) }
function startPolling() {
  if (pollTimer !== undefined) return
  void poll()
  pollTimer = window.setInterval(() => void poll(), 5000)
}

const app = {
  snapshot: async () => normalizeSnapshot(await rpc<unknown>('v9:snapshot')),
  saveConversation: (input: Parameters<AppAPI['saveConversation']>[0]) => rpc('v9:saveConversation', input),
  sidebarLayout: () => rpc<Awaited<ReturnType<AppAPI['sidebarLayout']>>>('v9:sidebarLayout'),
  saveSidebarLayout: (input: Parameters<AppAPI['saveSidebarLayout']>[0]) => rpc<Awaited<ReturnType<AppAPI['saveSidebarLayout']>>>('v9:saveSidebarLayout', input),
  workspaceDiff: (id: string) => rpc<string>('v9:workspaceDiff', id),
  listProjectFiles: (id: string, directory = '') => rpc<Awaited<ReturnType<AppAPI['listProjectFiles']>>>('v9:listProjectFiles', id, directory),
  readProjectFile: (id: string, path: string) => rpc<Awaited<ReturnType<AppAPI['readProjectFile']>>>('v9:readProjectFile', id, path),
  writeProjectFile: (id: string, path: string, content: string, hash: string) => rpc<Awaited<ReturnType<AppAPI['writeProjectFile']>>>('v9:writeProjectFile', id, path, content, hash),
  respondApproval: (id: string, approved: boolean) => rpc<void>('v9:respondApproval', id, approved),
  answerQuestion: (id: string, answer: string) => rpc<void>('v9:answerQuestion', id, answer),
  respondToAgent: (id: string, value: string, agentId: string) => rpc<string>('v9:respondToAgent', id, value, agentId),
  history: (id: string) => rpc<Awaited<ReturnType<AppAPI['history']>>>('v9:history', id),
  historyPage: (id: string, cursor?: number | string | null, limit?: number) => rpc<Awaited<ReturnType<AppAPI['historyPage']>>>('v9:historyPage', id, cursor, limit),
  historyAround: (id: string, cursor: number, limit?: number) => rpc<Awaited<ReturnType<AppAPI['historyAround']>>>('v9:historyAround', id, cursor, limit),
  searchHistory: (id: string, query: string, limit?: number) => rpc<Awaited<ReturnType<AppAPI['searchHistory']>>>('v9:searchHistory', id, query, limit),
  send: (id: string, value: string, model?: string, effort?: Agent['effort'], planMode?: boolean, options?: SendOptions) => rpc<void>('v9:send', id, value, model, effort, planMode, options),
  cancelQueuedMessage: (messageId: string) => rpc<void>('v9:cancelQueuedMessage', messageId),
  sendQueuedNow: (messageId: string) => rpc<void>('v9:sendQueuedNow', messageId),
  uploadAttachment: (conversationId: string, name: string, mimeType: string, bytes: Uint8Array) => uploadImageAttachment(conversationId, name, mimeType, bytes),
  readAttachment: (conversationId: string, id: string) => readImageAttachment(conversationId, id),
  stop: (id: string) => rpc<void>('v9:stop', id),
  cancelDelegation: (id: string) => rpc<void>('v9:cancelDelegation', id),
  startMission: (input: Parameters<AppAPI['startMission']>[0]) => rpc<Awaited<ReturnType<AppAPI['startMission']>>>('v9:startMission', input),
  missionAction: (id: string, action: Parameters<AppAPI['missionAction']>[1], value?: string) => rpc<Awaited<ReturnType<AppAPI['missionAction']>>>('v9:missionAction', id, action, value),
  voiceStatus: () => rpc<VoiceStatus>('v9:voiceStatus'),
  voiceSpeak: async (value: string, speed?: number, agentId?: string) => {
    const result = await rpc<{ audioBase64?: string }>('v9:voiceSpeak', value, speed, agentId)
    if (!result.audioBase64) throw new Error('O host não retornou o áudio da resposta.')
    const binary = atob(result.audioBase64), bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
    return bytes
  },
  voiceTranscribe: (wav: Uint8Array) => rpc<string>('v9:voiceTranscribe', Array.from(wav)),
  models: (runtime?: Agent['runtime']) => rpc<Model[]>('v9:models', runtime),
  setVisibleConversation: async (id: string | null) => { activeConversationId = id; previousMessages = new Map(); void poll() },
  getVisibleConversation: async () => activeConversationId,
  onEvent: (listener: (event: WorkspaceEvent) => void) => {
    eventListeners.add(listener); startPolling()
    return () => { eventListeners.delete(listener); if (!eventListeners.size && pollTimer !== undefined) { clearInterval(pollTimer); pollTimer = undefined } }
  },
} as unknown as AppAPI

const providerNames: Record<ProviderId, string> = { codex: 'Codex', claude: 'Claude', pi: 'Pi', opencode: 'OpenCode', antigravity: 'Antigravity' }
async function listProviders(): Promise<ProviderSnapshot> {
  const models = await app.models()
  const providers = (Object.keys(providerNames) as ProviderId[]).map(id => {
    const providerModels = models.filter(model => model.runtime === id).map(model => ({
      id: model.id.slice(id.length + 1), name: model.name, description: model.description,
      isDefault: model.isDefault, supportedEfforts: model.supportedEfforts, defaultEffort: model.defaultEffort,
    }))
    const ready = providerModels.length > 0
    return { id, name: providerNames[id], binary: binary[id], found: ready, version: null, path: null,
      models: providerModels, modelSource: ready ? 'runtime' as const : undefined,
      modelReason: ready ? undefined : 'O host não retornou modelos disponíveis para este agente.', executable: ready, operational: ready }
  }) satisfies ProviderInfo[]
  return { providers, checkedAt: new Date().toISOString() }
}
const providers: ProvidersAPI = {
  list: listProviders,
  refresh: listProviders,
  detect: async () => (await listProviders()).providers,
  onChanged: () => () => undefined,
}

if (typeof window !== 'undefined' && !('vibeAPI' in window)) {
  Object.assign(window, { appAPI: app, providersAPI: providers })
}

export async function syncPwaStatus() {
  const status = await request<RemoteStatus>('/api/status')
  setPwaCapabilities(status.capabilities || [])
  return status
}
