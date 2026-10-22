import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { AppAPI, WorkspaceEvent } from '../shared/v9'
import type { RealtimeAPI } from '../shared/realtime'
import type { ProvidersAPI } from '../shared/providers'
import type { SkillsAPI } from '../shared/skills'
import type { UpdatesAPI } from '../shared/updates'

type EventCallback = (data: any) => void

function onChannel(channel: string, callback: EventCallback): () => void {
  const listener = (_event: IpcRendererEvent, data: any) => callback(data)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api = {
  windowControls: {
    minimize: () => ipcRenderer.invoke('vibe:window:minimize'),
    maximize: () => ipcRenderer.invoke('vibe:window:maximize'),
    close: () => ipcRenderer.invoke('vibe:window:close'),
    showMain: () => ipcRenderer.invoke('vibe:window:showMain'),
    showMascot: () => ipcRenderer.invoke('vibe:window:showMascot'),
    closeMascot: () => ipcRenderer.invoke('vibe:window:closeMascot'),
    setZoom: (level: number) => ipcRenderer.invoke('vibe:window:setZoom', level),
    getZoom: () => ipcRenderer.invoke('vibe:window:getZoom'),
  },
  platform: process.platform,

  terminal: {
    create: (input: { rows: number; cols: number; workspaceId: string }) =>
      ipcRenderer.invoke('vibe:terminal:create', input),
    close: () => ipcRenderer.invoke('vibe:terminal:close'),
    write: (data: string) =>
      ipcRenderer.send('vibe:terminal:write', data),
    resize: (input: { cols: number; rows: number }) =>
      ipcRenderer.send('vibe:terminal:resize', input),
    onData: (callback: EventCallback) => onChannel('vibe:terminal:data', callback),
    onExit: (callback: EventCallback) => onChannel('vibe:terminal:exit', callback)
  },
}

contextBridge.exposeInMainWorld('vibeAPI', api)

const appAPI: AppAPI = {
  snapshot: () => ipcRenderer.invoke('v9:snapshot'),
  settingsPreferences: () => ipcRenderer.invoke('v9:settingsPreferences'),
  saveAgent: (input) => ipcRenderer.invoke('v9:saveAgent', input),
  saveAssistantPreferences: (input) => ipcRenderer.invoke('v9:saveAssistantPreferences', input),
  saveTerminalAccess: (enabled) => ipcRenderer.invoke('v9:saveTerminalAccess', enabled),
  saveConversation: (input) => ipcRenderer.invoke('v9:saveConversation', input),
  saveWorkspace: (input) => ipcRenderer.invoke('v9:saveWorkspace', input),
  createWorktree: (input) => ipcRenderer.invoke('v9:createWorktree', input),
  archiveWorkspace: (id, preserveDirtyWorktree) => ipcRenderer.invoke('v9:archiveWorkspace', id, preserveDirtyWorktree),
  deleteWorkspace: (id) => ipcRenderer.invoke('v9:deleteWorkspace', id),
  deleteConversation: (id) => ipcRenderer.invoke('v9:deleteConversation', id),
  deleteAgent: (id) => ipcRenderer.invoke('v9:deleteAgent', id),
  workspaceDiff: (id) => ipcRenderer.invoke('v9:workspaceDiff', id),
  listProjectFiles: (id, directory) => ipcRenderer.invoke('v9:listProjectFiles', id, directory),
  readProjectFile: (id, filePath) => ipcRenderer.invoke('v9:readProjectFile', id, filePath),
  writeProjectFile: (id, filePath, content, hash) => ipcRenderer.invoke('v9:writeProjectFile', id, filePath, content, hash),
  respondApproval: (id, approved) => ipcRenderer.invoke('v9:respondApproval', id, approved),
  answerQuestion: (id, answer) => ipcRenderer.invoke('v9:answerQuestion', id, answer),
  setVisibleConversation: (id) => ipcRenderer.invoke('v9:setVisibleConversation', id),
  getVisibleConversation: () => ipcRenderer.invoke('v9:getVisibleConversation'),
  respondToAgent: (id, text, agentId) => ipcRenderer.invoke('v9:respondToAgent', id, text, agentId),
  history: (id) => ipcRenderer.invoke('v9:history', id),
  historyPage: (id, beforeCursor, limit) => ipcRenderer.invoke('v9:historyPage', id, beforeCursor, limit),
  searchHistory: (id, query, limit) => ipcRenderer.invoke('v9:searchHistory', id, query, limit),
  historyAround: (id, cursor, limit) => ipcRenderer.invoke('v9:historyAround', id, cursor, limit),
  send: (id, value, model, effort, planMode) => ipcRenderer.invoke('v9:send', id, value, model, effort, planMode),
  stop: (id) => ipcRenderer.invoke('v9:stop', id),
  voiceStatus: () => ipcRenderer.invoke('v9:voiceStatus'),
  pitVoices: () => ipcRenderer.invoke('v9:pitVoices'),
  setPitVoice: (voiceId, agentId) => ipcRenderer.invoke('v9:setPitVoice', voiceId, agentId),
  pitVoiceSample: (voiceId) => ipcRenderer.invoke('v9:pitVoiceSample', voiceId),
  voiceInstall: (mode) => ipcRenderer.invoke('v9:voiceInstall', mode),
  voiceTranscribe: (wav) => ipcRenderer.invoke('v9:voiceTranscribe', wav),
  voiceSpeak: (text, speed, agentId) => ipcRenderer.invoke('v9:voiceSpeak', text, speed, agentId),
  voiceNew: (agentId) => ipcRenderer.invoke('v9:voiceNew', agentId),
  voiceResetAgent: (agentId) => ipcRenderer.invoke('v9:voiceResetAgent', agentId),
  voiceSetProvider: (provider) => ipcRenderer.invoke('v9:voiceSetProvider', provider),
  voiceSaveOpenRouterKey: (key) => ipcRenderer.invoke('v9:voiceSaveOpenRouterKey', key),
  voiceClearOpenRouterKey: () => ipcRenderer.invoke('v9:voiceClearOpenRouterKey'),
  cancelDelegation: (id) => ipcRenderer.invoke('v9:cancelDelegation', id),
  models: (runtime) => ipcRenderer.invoke('v9:models', runtime),
  hasClaudeCredential: () => ipcRenderer.invoke('v9:hasClaudeCredential'),
  saveClaudeCredential: (key) => ipcRenderer.invoke('v9:saveClaudeCredential', key),
  clearClaudeCredential: () => ipcRenderer.invoke('v9:clearClaudeCredential'),
  openRouterDecisionStatus: () => ipcRenderer.invoke('v9:openRouterDecisionStatus'),
  openRouterDecisionModels: (key?: string) => ipcRenderer.invoke('v9:openRouterDecisionModels', key),
  saveOpenRouterDecision: (key, modelId) => ipcRenderer.invoke('v9:saveOpenRouterDecision', key, modelId),
  saveOpenRouterDecisionModel: (modelId) => ipcRenderer.invoke('v9:saveOpenRouterDecisionModel', modelId),
  clearOpenRouterDecision: () => ipcRenderer.invoke('v9:clearOpenRouterDecision'),
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
contextBridge.exposeInMainWorld('appAPI', appAPI)

const updatesAPI: UpdatesAPI = {
  status: () => ipcRenderer.invoke('updates:status'),
  check: () => ipcRenderer.invoke('updates:check'),
  setChannel: channel => ipcRenderer.invoke('updates:setChannel', channel),
  install: () => ipcRenderer.invoke('updates:install'),
  onChanged: callback => onChannel('updates:changed', callback),
}
contextBridge.exposeInMainWorld('updatesAPI', updatesAPI)

const realtimeAPI: RealtimeAPI = {
  status: () => ipcRenderer.invoke('realtime:status'),
  saveKey: (provider, key) => ipcRenderer.invoke('realtime:saveKey', provider, key),
  clearKey: provider => ipcRenderer.invoke('realtime:clearKey', provider),
  saveSettings: settings => ipcRenderer.invoke('realtime:saveSettings', settings),
  geminiModels: () => ipcRenderer.invoke('realtime:geminiModels'),
  installLocalModels: () => ipcRenderer.invoke('realtime:installLocalModels'),
  installParakeet: () => ipcRenderer.invoke('realtime:installParakeet'),
  installPiperVoice: voice => ipcRenderer.invoke('realtime:installPiperVoice', voice),
  start: (mode, conversationId, agentId) => ipcRenderer.invoke('realtime:start', mode, conversationId, agentId),
  pushAudio: chunk => ipcRenderer.send('realtime:audio', chunk),
  interrupt: () => ipcRenderer.invoke('realtime:interrupt'),
  stop: () => ipcRenderer.invoke('realtime:stop'),
  onEvent: callback => onChannel('realtime:event', callback),
}
contextBridge.exposeInMainWorld('realtimeAPI', realtimeAPI)

const providersAPI: ProvidersAPI = {
  list: () => ipcRenderer.invoke('providers:list'),
  refresh: () => ipcRenderer.invoke('providers:refresh'),
  detect: () => ipcRenderer.invoke('providers:detect'),
  onChanged: callback => onChannel('providers:changed', callback),
}
contextBridge.exposeInMainWorld('providersAPI', providersAPI)

const skillsAPI: SkillsAPI = {
  list: () => ipcRenderer.invoke('skills:list'),
  addFromFolder: () => ipcRenderer.invoke('skills:addFromFolder'),
  remove: id => ipcRenderer.invoke('skills:remove', id),
  readContent: id => ipcRenderer.invoke('skills:readContent', id),
}
contextBridge.exposeInMainWorld('skillsAPI', skillsAPI)

const hostsAPI: import('../shared/hosts').HostsAPI = {
  snapshot: () => ipcRenderer.invoke('hosts:snapshot'),
  configure: input => ipcRenderer.invoke('hosts:configure', input),
  add: input => ipcRenderer.invoke('hosts:add', input),
  select: id => ipcRenderer.invoke('hosts:select', id),
  remove: id => ipcRenderer.invoke('hosts:remove', id),
  copyPairing: () => ipcRenderer.invoke('hosts:copyPairing'),
  revoke: () => ipcRenderer.invoke('hosts:revoke'),
  browse: path => ipcRenderer.invoke('hosts:browse', path),
  resolveFolder: (id, path) => ipcRenderer.invoke('hosts:resolveFolder', id, path),
  onChanged: callback => onChannel('hosts:changed', callback),
  onFolderRequest: callback => onChannel('hosts:folderRequest', callback),
}
contextBridge.exposeInMainWorld('hostsAPI', hostsAPI)
