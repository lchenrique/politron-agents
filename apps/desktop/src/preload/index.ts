import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { WorkspaceAPI, WorkspaceEvent } from '../shared/v9'

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
  model?: { modelID: string, providerID: string }
}

interface CeoEnsureInput {
  agentId: string
  role?: string
  agentSlug?: string
  systemPrompt?: string
  systemPromptPath?: string
  workspaceDirectory?: string
}

interface CeoSendInput {
  agentId: string
  message: string
  model?: { modelID: string, providerID: string }
}

interface SdkSession {
  id: string
  title?: string
  directory?: string
  time?: {
    created: number
    updated: number
    compacting?: number
  }
}

interface ManagedSession {
  agentId: string
  status: string
  session: SdkSession
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

type PipelineTaskStatus = "backlog" | "triage" | "ready" | "in_progress" | "blocked" | "in_review" | "done" | "cancelled"

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
      ipcRenderer.invoke('vibe:team:createFromTemplate', input),
    updateAgent: (teamId: string, agentId: string, updates: Record<string, unknown>) =>
      ipcRenderer.invoke('vibe:team:updateAgent', teamId, agentId, updates)
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
    updateTaskStatus: (input: { taskId: string; status: PipelineTaskStatus; note?: string; actorAgentId?: string; actorAgentName?: string; blockedReason?: string; result?: string; observations?: string }) =>
      ipcRenderer.invoke('vibe:pipeline:updateTaskStatus', input),
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
  onAgentHandoff: (callback: EventCallback) => onChannel('vibe:agent:handoff', callback),
  onCommunicationUpdate: (callback: EventCallback) => onChannel('vibe:communication:update', callback),
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
  onTaskUpdated: (callback: EventCallback) => onChannel('vibe:task:updated', callback),
  onTaskDelegated: (callback: EventCallback) => onChannel('vibe:task:delegated', callback),
  onPipelineStatusChanged: (callback: EventCallback) => onChannel('vibe:pipeline:status-changed', callback),

  onWorktreeCreated: (callback: EventCallback) => onChannel('vibe:worktree:created', callback),
  onWorktreeRemoved: (callback: EventCallback) => onChannel('vibe:worktree:removed', callback),
  onWorktreeError: (callback: EventCallback) => onChannel('vibe:worktree:error', callback),
  onLockAcquired: (callback: EventCallback) => onChannel('vibe:lock:acquired', callback),
  onLockReleased: (callback: EventCallback) => onChannel('vibe:lock:released', callback),
  onLockDenied: (callback: EventCallback) => onChannel('vibe:lock:denied', callback),

  session: {
    list: (input?: { directory?: string }) => ipcRenderer.invoke('vibe:session:list', input),
    create: (input?: { directory?: string; agentSlug?: string; systemPrompt?: string; model?: { modelID: string; providerID: string } }) => 
      ipcRenderer.invoke('vibe:session:create', input),
    delete: (sessionId: string) => 
      ipcRenderer.invoke('vibe:session:delete', sessionId),
    get: (sessionId: string) => 
      ipcRenderer.invoke('vibe:session:get', sessionId),
    messages: (sessionId: string) => 
      ipcRenderer.invoke('vibe:session:messages', sessionId),
    prompt: (input: { 
      sessionId: string; 
      message: string; 
      agentId: string;
      teamId?: string;
      role: 'global-ceo' | 'global-agent' | 'tech-lead' | 'team-agent';
      agentSlug?: string; 
      systemPrompt?: string; 
      systemPromptPath?: string;
      workspaceDirectory?: string;
      model?: { modelID: string, providerID: string } 
    }) => 
      ipcRenderer.invoke('vibe:session:prompt', input),
    subscribe: (sessionId: string) => 
      ipcRenderer.invoke('vibe:session:subscribe', sessionId)
  },

  terminal: {
    create: (input: { rows: number; cols: number; cwd?: string }) => 
      ipcRenderer.invoke('vibe:terminal:create', input),
    write: (data: string) => 
      ipcRenderer.send('vibe:terminal:write', data),
    resize: (input: { cols: number; rows: number }) => 
      ipcRenderer.send('vibe:terminal:resize', input),
    onData: (callback: EventCallback) => onChannel('vibe:terminal:data', callback),
    onExit: (callback: EventCallback) => onChannel('vibe:terminal:exit', callback)
  },

  system: {
    getHomeDir: () => ipcRenderer.invoke('vibe:system:homedir'),
    getPlatform: () => ipcRenderer.invoke('vibe:system:platform')
  },

  opencode: {
    listModels: (): Promise<Array<{ id: string; providerID: string; name: string }>> =>
      ipcRenderer.invoke('vibe:opencode:listModels'),
    getConfigDiagnostics: (input?: { projectPath?: string }) =>
      ipcRenderer.invoke('vibe:opencode:getConfigDiagnostics', input),
    getConfigEditorData: (input?: { scope?: "global" | "project"; projectPath?: string }) =>
      ipcRenderer.invoke('vibe:opencode:getConfigEditorData', input),
    saveConfigEditorData: (input: {
      scope: "global" | "project";
      projectPath?: string;
      defaults: {
        username?: string;
        logLevel?: string;
        model?: string;
        small_model?: string;
        default_agent?: string;
        share?: string;
        autoupdate?: boolean | "notify";
        snapshot?: boolean;
      };
      providers: Array<{
        id: string;
        name?: string;
        api?: string;
        active: boolean;
        options: {
          apiKey?: string;
          baseURL?: string;
          enterpriseUrl?: string;
          setCacheKey?: boolean;
          timeout?: number;
          chunkTimeout?: number;
        };
      }>;
      mcpJson: string;
      permissionsJson: string;
      toolsJson: string;
    }) =>
      ipcRenderer.invoke('vibe:opencode:saveConfigEditorData', input),
  }
  ,
  workspace: {
    clearBoard: (input?: { scope?: "project" | "all"; teamId?: string }) =>
      ipcRenderer.invoke('vibe:workspace:clearBoard', input),
  },
}

contextBridge.exposeInMainWorld('vibeAPI', api)

const workspaceAPI: WorkspaceAPI = {
  snapshot: () => ipcRenderer.invoke('v9:snapshot'),
  saveAgent: (input) => ipcRenderer.invoke('v9:saveAgent', input),
  saveConversation: (input) => ipcRenderer.invoke('v9:saveConversation', input),
  history: (id) => ipcRenderer.invoke('v9:history', id),
  send: (id, value, model) => ipcRenderer.invoke('v9:send', id, value, model),
  stop: (id) => ipcRenderer.invoke('v9:stop', id),
  cancelDelegation: (id) => ipcRenderer.invoke('v9:cancelDelegation', id),
  models: () => ipcRenderer.invoke('v9:models'),
  pickFolder: () => ipcRenderer.invoke('v9:pickFolder'),
  openFolder: (id) => ipcRenderer.invoke('v9:openFolder', id),
  browserFrames: (id) => ipcRenderer.invoke('v9:browserFrames', id),
  browserControl: (key, human) => ipcRenderer.invoke('v9:browserControl', key, human),
  browserAction: (key, action) => ipcRenderer.invoke('v9:browserAction', key, action),
  onEvent: (callback) => {
    const listener = (_event: IpcRendererEvent, payload: WorkspaceEvent) => callback(payload)
    ipcRenderer.on('v9:event', listener)
    return () => ipcRenderer.removeListener('v9:event', listener)
  }
}
contextBridge.exposeInMainWorld('workspaceAPI', workspaceAPI)
