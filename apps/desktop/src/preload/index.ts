import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

interface AgentEnsureInput {
  agentId: string
  teamId?: string
  role: string
  agentSlug?: string
  systemPrompt?: string
  systemPromptPath?: string
  workspaceDirectory?: string
}

interface AgentSendInput {
  agentId: string
  message: string
}

interface CeoEnsureInput {
  agentId: string
  agentSlug?: string
  systemPrompt?: string
  systemPromptPath?: string
  workspaceDirectory?: string
}

interface CeoSendInput {
  agentId: string
  message: string
}

interface ManagedSession {
  agentId: string
  status: string
}

type EventCallback = (data: any) => void

function onChannel(channel: string, callback: EventCallback): () => void {
  const listener = (_event: IpcRendererEvent, data: any) => callback(data)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

export interface TeamTemplate {
  id: string
  name: string
  description: string
  icon: string
  agentSlugs: string[]
  suggestedTechLeadSlug?: string
  pipelineDescription: string
}

interface TeamCreateFromTemplateInput {
  templateId: string
  teamName?: string
  projectPath?: string
}

const api = {
  windowControls: {
    minimize: () => ipcRenderer.invoke('vibe:window:minimize'),
    maximize: () => ipcRenderer.invoke('vibe:window:maximize'),
    close: () => ipcRenderer.invoke('vibe:window:close'),
    setZoom: (level: number) => ipcRenderer.invoke('vibe:window:setZoom', level),
    getZoom: () => ipcRenderer.invoke('vibe:window:getZoom'),
  },
  platform: process.platform,
  dialog: {
    pickProjectFolder: (): Promise<string | null> =>
      ipcRenderer.invoke('vibe:dialog:pickProjectFolder')
  },

  agent: {
    ensure: (input: AgentEnsureInput): Promise<ManagedSession> => 
      ipcRenderer.invoke('vibe:agent:ensure', input),
    send: (input: AgentSendInput): Promise<void> => 
      ipcRenderer.invoke('vibe:agent:send', input),
    stop: (agentId: string): Promise<void> => 
      ipcRenderer.invoke('vibe:agent:stop', agentId),
    subscribe: (agentId: string): Promise<void> => 
      ipcRenderer.invoke('vibe:agent:subscribe', agentId)
  },

  ceo: {
    ensure: (input: CeoEnsureInput): Promise<ManagedSession> => 
      ipcRenderer.invoke('vibe:ceo:ensure', input),
    send: (input: CeoSendInput): Promise<void> => 
      ipcRenderer.invoke('vibe:ceo:send', input),
    subscribe: (): Promise<void> => 
      ipcRenderer.invoke('vibe:ceo:subscribe')
  },

  team: {
    create: (input: { name: string, projectPath: string, projectName?: string, projectColor?: string, templateId?: string }) => 
      ipcRenderer.invoke('vibe:team:create', input),
    delete: (teamId: string) => 
      ipcRenderer.invoke('vibe:team:delete', teamId),
    get: (teamId: string) => 
      ipcRenderer.invoke('vibe:team:get', teamId),
    list: () => 
      ipcRenderer.invoke('vibe:team:list'),
    hire: (input: { teamId: string, agent: any }) => 
      ipcRenderer.invoke('vibe:team:hire', input),
    fire: (input: { teamId: string, agentId: string }) => 
      ipcRenderer.invoke('vibe:team:fire', input),
    setTechLead: (input: { teamId: string, agentId: string }) => 
      ipcRenderer.invoke('vibe:team:setTechLead', input),
    pause: (teamId: string) => 
      ipcRenderer.invoke('vibe:team:pause', teamId),
    resume: (teamId: string) => 
      ipcRenderer.invoke('vibe:team:resume', teamId),
    createFromTemplate: (input: TeamCreateFromTemplateInput) => 
      ipcRenderer.invoke('vibe:team:createFromTemplate', input)
  },

  template: {
    list: () => 
      ipcRenderer.invoke('vibe:template:list'),
    get: (templateId: string) => 
      ipcRenderer.invoke('vibe:template:get', templateId)
  },

  agentTemplate: {
    list: () => 
      ipcRenderer.invoke('vibe:agent-template:list')
  },

  pipeline: {
    addTask: (input: { teamId: string, agentId: string, description: string, files: string[], dependsOn: string[], branchName?: string }) => 
      ipcRenderer.invoke('vibe:pipeline:addTask', input),
    start: (taskId: string) => 
      ipcRenderer.invoke('vibe:pipeline:start', taskId),
    getStatus: (teamId: string) => 
      ipcRenderer.invoke('vibe:pipeline:getStatus', teamId),
    getTasks: (teamId: string) => 
      ipcRenderer.invoke('vibe:pipeline:getTasks', teamId)
  },

  worktree: {
    create: (input: { basePath: string, teamSlug: string, agentSlug: string, branchName: string, agentId: string, teamId: string }) => 
      ipcRenderer.invoke('vibe:worktree:create', input),
    remove: (worktreePath: string) => 
      ipcRenderer.invoke('vibe:worktree:remove', worktreePath),
    list: (basePath: string) => 
      ipcRenderer.invoke('vibe:worktree:list', basePath),
    merge: (input: { worktreePath: string, branchName: string, targetBranch?: string }) => 
      ipcRenderer.invoke('vibe:worktree:merge', input)
  },

  lock: {
    acquire: (input: { filePath: string, agentId: string }) => 
      ipcRenderer.invoke('vibe:lock:acquire', input),
    release: (input: { filePath: string, agentId: string }) => 
      ipcRenderer.invoke('vibe:lock:release', input),
    check: (filePath: string) => 
      ipcRenderer.invoke('vibe:lock:check', filePath),
    list: () => 
      ipcRenderer.invoke('vibe:lock:list')
  },

  onAgentChunk: (callback: EventCallback) => onChannel('vibe:agent:chunk', callback),
  onAgentReasoning: (callback: EventCallback) => onChannel('vibe:agent:reasoning', callback),
  onAgentTool: (callback: EventCallback) => onChannel('vibe:agent:tool', callback),
  onAgentActivity: (callback: EventCallback) => onChannel('vibe:agent:activity', callback),
  onAgentStatus: (callback: EventCallback) => onChannel('vibe:agent:status', callback),
  onAgentDone: (callback: EventCallback) => onChannel('vibe:agent:done', callback),
  onAgentError: (callback: EventCallback) => onChannel('vibe:agent:error', callback),
  onCeoAskHuman: (callback: EventCallback) => onChannel('vibe:ceo:ask-human', callback),
  onPipelineUpdate: (callback: EventCallback) => onChannel('vibe:pipeline:update', callback),

  onTeamCreated: (callback: EventCallback) => onChannel('vibe:team:created', callback),
  onTeamDeleted: (callback: EventCallback) => onChannel('vibe:team:deleted', callback),
  onTeamUpdated: (callback: EventCallback) => onChannel('vibe:team:updated', callback),
  onTeamAgentAdded: (callback: EventCallback) => onChannel('vibe:team:agent-added', callback),
  onTeamAgentRemoved: (callback: EventCallback) => onChannel('vibe:team:agent-removed', callback),
  onTeamTechLeadChanged: (callback: EventCallback) => onChannel('vibe:team:techlead-changed', callback),
  onTeamPaused: (callback: EventCallback) => onChannel('vibe:team:paused', callback),
  onTeamResumed: (callback: EventCallback) => onChannel('vibe:team:resumed', callback),
  onTaskAdded: (callback: EventCallback) => onChannel('vibe:task:added', callback),
  onTaskStarted: (callback: EventCallback) => onChannel('vibe:task:started', callback),
  onTaskCompleted: (callback: EventCallback) => onChannel('vibe:task:completed', callback),
  onTaskFailed: (callback: EventCallback) => onChannel('vibe:task:failed', callback),
  onTaskBlocked: (callback: EventCallback) => onChannel('vibe:task:blocked', callback),
  onPipelineStatusChanged: (callback: EventCallback) => onChannel('vibe:pipeline:status-changed', callback),

  onWorktreeCreated: (callback: EventCallback) => onChannel('vibe:worktree:created', callback),
  onWorktreeRemoved: (callback: EventCallback) => onChannel('vibe:worktree:removed', callback),
  onWorktreeError: (callback: EventCallback) => onChannel('vibe:worktree:error', callback),
  onLockAcquired: (callback: EventCallback) => onChannel('vibe:lock:acquired', callback),
  onLockReleased: (callback: EventCallback) => onChannel('vibe:lock:released', callback),
  onLockDenied: (callback: EventCallback) => onChannel('vibe:lock:denied', callback)
}

contextBridge.exposeInMainWorld('vibeAPI', api)
