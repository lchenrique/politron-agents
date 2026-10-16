import { ipcMain, BrowserWindow } from 'electron'
import type { WorkspaceService } from './workspace'

export function registerV9Ipc(service: WorkspaceService) {
  const invoke = (channel: string, handler: (...args: any[]) => unknown) => ipcMain.handle(`v9:${channel}`, (event, ...args) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (!owner || owner.isDestroyed()) throw new Error('Janela do Politron indisponível.')
    return handler(...args)
  })
  invoke('snapshot', () => service.snapshot())
  invoke('saveAgent', (input) => service.saveAgent(input))
  invoke('saveProject', (input) => service.saveProject(input))
  invoke('saveConversation', (input) => service.saveConversation(input))
  invoke('history', (id) => service.history(id))
  invoke('send', (id, text, model) => service.send(id, text, model))
  invoke('stop', (id) => service.stop(id))
  invoke('cancelDelegation', (id) => service.cancelDelegation(id))
  invoke('models', () => service.models())
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
    for (const channel of ['snapshot', 'saveAgent', 'saveProject', 'saveConversation', 'history', 'send', 'stop', 'cancelDelegation', 'models', 'pickFolder', 'openFolder', 'browserFrames', 'browserControl', 'browserAction']) ipcMain.removeHandler(`v9:${channel}`)
  }
}
