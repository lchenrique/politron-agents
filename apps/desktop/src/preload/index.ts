import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { AppAPI, WorkspaceEvent } from '../shared/v9'

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
    setZoom: (level: number) => ipcRenderer.invoke('vibe:window:setZoom', level),
    getZoom: () => ipcRenderer.invoke('vibe:window:getZoom'),
  },
  platform: process.platform,

  terminal: {
    create: (input: { rows: number; cols: number; workspaceId: string }) =>
      ipcRenderer.invoke('vibe:terminal:create', input),
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
  saveAgent: (input) => ipcRenderer.invoke('v9:saveAgent', input),
  saveProject: (input) => ipcRenderer.invoke('v9:saveProject', input),
  saveConversation: (input) => ipcRenderer.invoke('v9:saveConversation', input),
  createLocalWorkspace: (input) => ipcRenderer.invoke('v9:createLocalWorkspace', input),
  createWorktree: (input) => ipcRenderer.invoke('v9:createWorktree', input),
  archiveWorkspace: (id, preserveDirtyWorktree) => ipcRenderer.invoke('v9:archiveWorkspace', id, preserveDirtyWorktree),
  workspaceDiff: (id) => ipcRenderer.invoke('v9:workspaceDiff', id),
  respondApproval: (id, approved) => ipcRenderer.invoke('v9:respondApproval', id, approved),
  setVisibleConversation: (id) => ipcRenderer.invoke('v9:setVisibleConversation', id),
  history: (id) => ipcRenderer.invoke('v9:history', id),
  send: (id, value, model) => ipcRenderer.invoke('v9:send', id, value, model),
  stop: (id) => ipcRenderer.invoke('v9:stop', id),
  cancelDelegation: (id) => ipcRenderer.invoke('v9:cancelDelegation', id),
  models: (runtime) => ipcRenderer.invoke('v9:models', runtime),
  hasClaudeCredential: () => ipcRenderer.invoke('v9:hasClaudeCredential'),
  saveClaudeCredential: (key) => ipcRenderer.invoke('v9:saveClaudeCredential', key),
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
