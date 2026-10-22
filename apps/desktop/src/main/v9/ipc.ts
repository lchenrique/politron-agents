import { ipcMain, BrowserWindow } from 'electron'
import type { AppService } from './workspace'
import { VoiceService } from './voice'
import type { HostRouting } from '../hosts/rpc'

export function registerV9Ipc(service: AppService, routing?: HostRouting) {
  const voice = new VoiceService()
  // Carrega o reconhecedor de portugues em paralelo com a inicializacao do app.
  void voice.prewarmTranscription().catch(() => undefined)
  const invoke = (channel: string, handler: (...args: any[]) => unknown) => {
    routing?.register(`v9:${channel}`, handler)
    ipcMain.handle(`v9:${channel}`, (event, ...args) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (!owner || owner.isDestroyed()) throw new Error('Janela do Boobot indisponível.')
    return routing ? routing.invoke(`v9:${channel}`, args, () => handler(...args), event.sender) : handler(...args)
  })
  }
  invoke('snapshot', () => service.snapshot())
  invoke('settingsPreferences', () => service.settingsPreferences())
  invoke('saveAgent', (input) => service.saveAgent(input))
  invoke('saveAssistantPreferences', (input) => service.saveAssistantPreferences(input))
  invoke('saveTerminalAccess', (enabled) => service.saveTerminalAccess(enabled))
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
  invoke('answerQuestion', (id, answer) => service.answerQuestion(id, answer))
  invoke('setVisibleConversation', (id) => service.setVisibleConversation(id))
  invoke('getVisibleConversation', () => service.getVisibleConversation())
  invoke('respondToAgent', (id, text, agentId) => service.respondToAgent(id, text, agentId))
  invoke('hasClaudeCredential', () => service.hasClaudeCredential())
  invoke('saveClaudeCredential', (key) => service.saveClaudeCredential(key))
  invoke('clearClaudeCredential', () => service.clearClaudeCredential())
  invoke('openRouterDecisionStatus', () => service.openRouterDecisionStatus())
  invoke('openRouterDecisionModels', (key) => service.openRouterDecisionModels(key))
  invoke('saveOpenRouterDecision', (key, modelId) => service.saveOpenRouterDecision(key, modelId))
  invoke('saveOpenRouterDecisionModel', (modelId) => service.saveOpenRouterDecisionModel(modelId))
  invoke('clearOpenRouterDecision', () => service.clearOpenRouterDecision())
  invoke('history', (id) => service.history(id))
  invoke('historyPage', (id, beforeCursor, limit) => service.historyPage(id, beforeCursor, limit))
  invoke('searchHistory', (id, query, limit) => service.searchHistory(id, query, limit))
  invoke('historyAround', (id, cursor, limit) => service.historyAround(id, cursor, limit))
  invoke('send', (id, text, model, effort, planMode) => service.send(id, text, model, effort, undefined, false, true, planMode))
  invoke('stop', (id) => service.stop(id))
  invoke('voiceStatus', () => voice.status())
  invoke('pitVoices', () => voice.pitVoices())
  invoke('setPitVoice', (voiceId, agentId) => voice.setPitVoice(voiceId, agentId))
  invoke('pitVoiceSample', (voiceId) => voice.pitVoiceSample(voiceId))
  invoke('voiceInstall', (mode) => voice.install(mode))
  invoke('voiceTranscribe', (wav) => voice.transcribe(wav))
  invoke('voiceSpeak', (text, speed, agentId) => voice.speak(text, speed, agentId))
  invoke('voiceNew', (agentId) => voice.newVoice(agentId))
  invoke('voiceResetAgent', (agentId) => voice.resetAgentVoice(agentId))
  invoke('voiceSetProvider', (provider) => voice.setProvider(provider))
  invoke('voiceSaveOpenRouterKey', (key) => voice.saveOpenRouterKey(key))
  invoke('voiceClearOpenRouterKey', () => voice.clearOpenRouterKey())
  invoke('cancelDelegation', (id) => service.cancelDelegation(id))
  invoke('models', (runtime) => service.models(runtime))
  invoke('pickFolder', () => service.pickFolder())
  invoke('openFolder', (id) => service.openFolder(id))
  invoke('browserFrames', (id) => service.browserFrames(id))
  invoke('browserControl', (key, human) => service.browserControl(key, human))
  invoke('browserAction', (key, action) => service.browserAction(key, action))
  const send = (event: unknown) => {
    if (routing && !routing.publish({ channel: 'v9:event', data: event })) return
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send('v9:event', event)
  }
  service.on('workspace-event', send)
  return () => {
    service.off('workspace-event', send)
    voice.close()
    ipcMain.removeHandler('v9:clearClaudeCredential')
    for (const channel of ['snapshot', 'settingsPreferences', 'saveAgent', 'saveAssistantPreferences', 'saveTerminalAccess', 'saveConversation', 'saveWorkspace', 'createWorktree', 'archiveWorkspace', 'deleteWorkspace', 'deleteConversation', 'deleteAgent', 'workspaceDiff', 'listProjectFiles', 'readProjectFile', 'writeProjectFile', 'respondApproval', 'answerQuestion', 'setVisibleConversation', 'getVisibleConversation', 'respondToAgent', 'hasClaudeCredential', 'saveClaudeCredential', 'openRouterDecisionStatus', 'openRouterDecisionModels', 'saveOpenRouterDecision', 'saveOpenRouterDecisionModel', 'clearOpenRouterDecision', 'history', 'historyPage', 'searchHistory', 'historyAround', 'send', 'stop', 'voiceStatus', 'pitVoices', 'setPitVoice', 'pitVoiceSample', 'voiceInstall', 'voiceTranscribe', 'voiceSpeak', 'voiceNew', 'voiceResetAgent', 'voiceSetProvider', 'voiceSaveOpenRouterKey', 'voiceClearOpenRouterKey', 'cancelDelegation', 'models', 'pickFolder', 'openFolder', 'browserFrames', 'browserControl', 'browserAction']) ipcMain.removeHandler(`v9:${channel}`)
  }
}
