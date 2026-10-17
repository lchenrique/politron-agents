import { ipcMain, BrowserWindow } from 'electron'
import type { AppService } from './workspace'

export function registerV9Ipc(service: AppService) {
  const invoke = (channel: string, handler: (...args: any[]) => unknown) => ipcMain.handle(`v9:${channel}`, (event, ...args) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (!owner || owner.isDestroyed()) throw new Error('Janela do Politron indisponível.')
    return handler(...args)
  })
  invoke('snapshot', () => service.snapshot())
  invoke('saveAgent', (input) => service.saveAgent(input))
  invoke('saveAssistantPreferences', (input) => service.saveAssistantPreferences(input))
  invoke('saveConversation', (input) => service.saveConversation(input))
  invoke('saveWorkspace', (input) => service.saveWorkspace(input))
  invoke('createWorktree', (input) => service.createWorktree(input))
  invoke('archiveWorkspace', (id, preserveDirtyWorktree) => service.archiveWorkspace(id, preserveDirtyWorktree))
  invoke('deleteWorkspace', (id) => service.deleteWorkspace(id))
  invoke('deleteConversation', (id) => service.deleteConversation(id))
  invoke('deleteAgent', (id) => service.deleteAgent(id))
  invoke('workspaceDiff', (id) => service.workspaceDiff(id))
  invoke('listProjectFiles', (id, directory) => service.listProjectFiles(id, directory))
  invoke('readProjectFile', (id, filePath) => service.readProjectFile(id, filePath))
  invoke('writeProjectFile', (id, filePath, content, expectedHash) => service.writeProjectFile(id, filePath, content, expectedHash))
  invoke('respondApproval', (id, approved) => service.respondApproval(id, approved))
  invoke('setVisibleConversation', (id) => service.setVisibleConversation(id))
  invoke('hasClaudeCredential', () => service.hasClaudeCredential())
  invoke('saveClaudeCredential', (key) => service.saveClaudeCredential(key))
  invoke('history', (id) => service.history(id))
  invoke('send', (id, text, model, effort) => service.send(id, text, model, effort))
  invoke('stop', (id) => service.stop(id))
  invoke('cancelDelegation', (id) => service.cancelDelegation(id))
  invoke('models', (runtime) => service.models(runtime))
  invoke('pickFolder', () => service.pickFolder())
  invoke('openFolder', (id) => service.openFolder(id))
  invoke('browserFrames', (id) => service.browserFrames(id))
  invoke('browserControl', (key, human) => service.browserControl(key, human))
  invoke('browserAction', (key, action) => service.browserAction(key, action))
  const send = (event: unknown) => {
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send('v9:event', event)
  }
  service.on('workspace-event', send)
  return () => {
    service.off('workspace-event', send)
    for (const channel of ['snapshot', 'saveAgent', 'saveAssistantPreferences', 'saveConversation', 'saveWorkspace', 'createWorktree', 'archiveWorkspace', 'deleteWorkspace', 'deleteConversation', 'deleteAgent', 'workspaceDiff', 'listProjectFiles', 'readProjectFile', 'writeProjectFile', 'respondApproval', 'setVisibleConversation', 'hasClaudeCredential', 'saveClaudeCredential', 'history', 'send', 'stop', 'cancelDelegation', 'models', 'pickFolder', 'openFolder', 'browserFrames', 'browserControl', 'browserAction']) ipcMain.removeHandler(`v9:${channel}`)
  }
}
