import { ipcMain, BrowserWindow, dialog } from 'electron'
import type { AppService } from './workspace'
import { VoiceService } from './voice'
import type { HostRouting } from '../hosts/rpc'

export function registerV9Ipc(service: AppService, routing?: HostRouting) {
  const voice = new VoiceService()
  // Carrega o reconhecedor de portugues em paralelo com a inicializacao do app.
  void voice.prewarmTranscription().catch(() => undefined)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- registros dinâmicos de migração/IPC/eventos de runtime; tipar exigiria refatoração fora do escopo
  const invoke = (channel: string, handler: (...args: any[]) => unknown) => {
    routing?.register(`v9:${channel}`, handler)
    ipcMain.handle(`v9:${channel}`, (event, ...args) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (!owner || owner.isDestroyed()) throw new Error('Janela do Boobot indisponível.')
    const result = routing ? routing.invoke(`v9:${channel}`, args, () => handler(...args), event.sender) : handler(...args)
    if (channel === 'snapshot' && routing?.remote) return Promise.resolve(result).then(value =>
      value && typeof value === 'object' ? { ...(value as Record<string, unknown>), imageRuntimes: [] } : value)
    return result
  })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- registros dinâmicos de migração/IPC/eventos de runtime; tipar exigiria refatoração fora do escopo
  const invokeLocal = (channel: string, handler: (...args: any[]) => unknown) => ipcMain.handle(`v9:${channel}`, (event, ...args) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (!owner || owner.isDestroyed()) throw new Error('Janela do Boobot indisponível.')
    if (routing?.remote) throw new Error('Anexos de imagem ainda não são transferidos para hosts remotos.')
    return handler(...args)
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- registros dinâmicos de migração/IPC/eventos de runtime; tipar exigiria refatoração fora do escopo
  const invokeDesktopOnly = (channel: string, handler: (...args: any[]) => unknown) => ipcMain.handle(`v9:${channel}`, (event, ...args) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (!owner || owner.isDestroyed()) throw new Error('Janela do Boobot indisponível.')
    if (routing?.remote) throw new Error('Compartilhamento de aba Brave disponível somente no host local.')
    return handler(...args)
  })
  const invokeBoardDesktop = (channel: string, handler: Parameters<typeof invoke>[1]) => ipcMain.handle(`v9:${channel}`, (event, ...args) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (!owner || owner.isDestroyed()) throw new Error('Janela do Boobot indisponível.')
    if (routing?.remote) throw new Error('O board pode ser alterado somente no desktop.')
    return handler(...args)
  })
  invokeDesktopOnly('externalBrowserStatus', (owner) => service.externalBrowserStatus(owner))
  invokeDesktopOnly('setExternalBrowserGrant', (owner, enabled) => service.setExternalBrowserGrant(owner, enabled === true))
  invokeDesktopOnly('saveExternalBrowserAlways', enabled => service.saveExternalBrowserAlways(enabled))
  invoke('snapshot', () => service.snapshot())
  invoke('boardSnapshot', () => service.boardSnapshot())
  invokeBoardDesktop('saveBoardTeam', input => service.saveBoardTeam(input))
  invokeBoardDesktop('deleteBoardTeam', teamId => service.deleteBoardTeam(teamId))
  invokeBoardDesktop('createBoardTask', input => service.createBoardTask(input))
  invokeBoardDesktop('updateBoardTask', (taskId, input) => service.updateBoardTask(taskId, input))
  invokeBoardDesktop('assignBoardTask', (taskId, assigneeAgentId, reviewerAgentId) => service.assignBoardTask(taskId, assigneeAgentId, reviewerAgentId))
  invokeBoardDesktop('reassignBoardTask', (taskId, assigneeAgentId, reviewerAgentId) => service.reassignBoardTask(taskId, assigneeAgentId, reviewerAgentId))
  invokeBoardDesktop('boardTaskAction', (taskId, action, note) => service.boardTaskAction(taskId, action, note))
  invokeBoardDesktop('addBoardEvidence', (taskId, evidence) => service.addBoardEvidence(taskId, evidence))
  invoke('settingsPreferences', () => service.settingsPreferences())
  invoke('saveAgent', (input) => service.saveAgent(input))
  invoke('marketplaceTeams', () => service.marketplaceTeams())
  invoke('hireTeam', (input) => service.hireTeam(input))
  invoke('saveAssistantPreferences', (input) => service.saveAssistantPreferences(input))
  invoke('approvalGrants', (agentId) => service.approvalGrants(agentId))
  invoke('removeApprovalGrant', (grantId, agentId) => service.removeApprovalGrant(grantId, agentId))
  invoke('saveTerminalAccess', (enabled) => service.saveTerminalAccess(enabled))
  invoke('saveConversation', (input) => service.saveConversation(input))
  invoke('sidebarLayout', () => service.sidebarLayout())
  invoke('saveSidebarLayout', (input) => service.saveSidebarLayout(input))
  invoke('saveWorkspace', (input) => service.saveWorkspace(input))
  invoke('createWorktree', (input) => service.createWorktree(input))
  invoke('createProjectFolder', (input) => service.createProjectFolder(input))
  invoke('cloneRepository', (input) => service.cloneRepository(input))
  invoke('cancelClone', () => service.cancelClone())
  invoke('archiveWorkspace', (id, preserveDirtyWorktree) => service.archiveWorkspace(id, preserveDirtyWorktree))
  invoke('deleteWorkspace', (id) => service.deleteWorkspace(id))
  invoke('deleteConversation', (id) => service.deleteConversation(id))
  invoke('deleteAgent', (id) => service.deleteAgent(id))
  invoke('workspaceDiff', (id) => service.workspaceDiff(id))
  invoke('listProjectFiles', (id, directory) => service.listProjectFiles(id, directory))
  invoke('readProjectFile', (id, filePath) => service.readProjectFile(id, filePath))
  invoke('writeProjectFile', (id, filePath, content, expectedHash) => service.writeProjectFile(id, filePath, content, expectedHash))
  invoke('respondApproval', (id, approved, alwaysAllow) => service.respondApproval(id, approved, false, alwaysAllow === true))
  invoke('reviewPlan', (id, decision, feedback) => service.reviewPlan(id, decision, feedback))
  // Host remoto e PWA chegam por HostRpc.dispatch; aprovações desktopOnly (navegador real) são recusadas ali.
  routing?.register('v9:respondApproval', (id: string, approved: boolean, alwaysAllow?: boolean) => service.respondApproval(id, approved, true, alwaysAllow === true))
  routing?.register('v9:reviewPlan', (id: string, decision: Parameters<AppService['reviewPlan']>[1], feedback?: string) => service.reviewPlan(id, decision, feedback, true))
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
  invoke('send', (id, text, model, effort, planMode, options) => service.send(id, text, model, effort, undefined, false, true, planMode, options))
  invoke('cancelQueuedMessage', (messageId) => service.cancelQueuedMessage(messageId))
  invoke('sendQueuedNow', (messageId) => service.sendQueuedNow(messageId))
  invokeLocal('uploadAttachment', (conversationId, name, mimeType, bytes) => service.uploadAttachment(conversationId, name, mimeType, bytes))
  invokeLocal('readAttachment', (conversationId, id) => service.readAttachment(conversationId, id))
  invoke('stop', (id) => service.stop(id))
  invoke('voiceStatus', () => voice.status())
  invoke('pitVoices', () => voice.pitVoices())
  invoke('setPitVoice', (voiceId, agentId) => voice.setPitVoice(voiceId, agentId))
  invoke('pitVoiceSample', (voiceId) => voice.pitVoiceSample(voiceId))
  invoke('pocketVoices', () => voice.pocketVoices())
  invoke('setPocketVoice', (voiceId, agentId) => voice.setPocketVoice(voiceId, agentId))
  invoke('optimizePocketVoice', (voiceId) => voice.optimizePocketVoice(voiceId))
  invoke('importPocketVoice', async () => {
    const selected = await dialog.showOpenDialog({
      title: 'Importar uma voz local para Boo',
      properties: ['openFile'],
      filters: [{ name: 'Voz de referência', extensions: ['wav', 'mp3', 'safetensors'] }],
    })
    if (selected.canceled || selected.filePaths.length !== 1) return null
    return voice.importPocketVoice(selected.filePaths[0])
  })
  invoke('voiceInstall', (mode) => voice.install(mode))
  invoke('voiceTranscribe', (wav) => voice.transcribe(wav))
  invoke('voiceSpeak', (text, speed, agentId) => voice.speak(text, speed, agentId))
  invoke('voiceNew', (agentId) => voice.newVoice(agentId))
  invoke('voiceResetAgent', (agentId) => voice.resetAgentVoice(agentId))
  invoke('voiceSetProvider', (provider) => voice.setProvider(provider))
  invoke('voiceSaveOpenRouterKey', (key) => voice.saveOpenRouterKey(key))
  invoke('voiceClearOpenRouterKey', () => voice.clearOpenRouterKey())
  invoke('cancelDelegation', (id) => service.cancelDelegation(id))
  invoke('startMission', (input) => service.startMission(input))
  invoke('missionAction', (id, action, text) => service.missionAction(id, action, text))
  invoke('saveRoutine', (input) => service.saveRoutine(input))
  invoke('deleteRoutine', (id) => service.deleteRoutine(id))
  invoke('runRoutine', (id) => service.runRoutine(id))
  invoke('models', (runtime) => service.models(runtime))
  invoke('pickFolder', () => service.pickFolder())
  invoke('openFolder', (id) => service.openFolder(id))
  invoke('agentTerminalSessions', (conversationId, workspaceId) => service.agentTerminalSessions(conversationId, workspaceId))
  invoke('agentTerminalStop', (sessionId, conversationId, workspaceId) => service.agentTerminalStop(sessionId, conversationId, workspaceId))
  // Fora da RPC: com host remoto selecionado o roteamento recusa, então nunca abre janela no host remoto.
  invoke('openExternalTerminal', (workspaceId) => service.openExternalTerminal(workspaceId))
  const send = (event: unknown) => {
    if (routing && !routing.publish({ channel: 'v9:event', data: event })) return
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send('v9:event', event)
  }
  service.on('workspace-event', send)
  return () => {
    service.off('workspace-event', send)
    voice.close()
    ipcMain.removeHandler('v9:clearClaudeCredential')
    for (const channel of ['snapshot', 'boardSnapshot', 'saveBoardTeam', 'deleteBoardTeam', 'createBoardTask', 'updateBoardTask', 'assignBoardTask', 'reassignBoardTask', 'boardTaskAction', 'addBoardEvidence', 'settingsPreferences', 'saveAgent', 'marketplaceTeams', 'hireTeam', 'saveAssistantPreferences', 'saveTerminalAccess', 'saveConversation', 'sidebarLayout', 'saveSidebarLayout', 'saveWorkspace', 'createWorktree', 'createProjectFolder', 'cloneRepository', 'cancelClone', 'archiveWorkspace', 'deleteWorkspace', 'deleteConversation', 'deleteAgent', 'workspaceDiff', 'listProjectFiles', 'readProjectFile', 'writeProjectFile', 'respondApproval', 'answerQuestion', 'setVisibleConversation', 'getVisibleConversation', 'respondToAgent', 'hasClaudeCredential', 'saveClaudeCredential', 'openRouterDecisionStatus', 'openRouterDecisionModels', 'saveOpenRouterDecision', 'saveOpenRouterDecisionModel', 'clearOpenRouterDecision', 'history', 'historyPage', 'searchHistory', 'historyAround', 'send', 'stop', 'voiceStatus', 'pitVoices', 'setPitVoice', 'pitVoiceSample', 'pocketVoices', 'setPocketVoice', 'importPocketVoice', 'optimizePocketVoice', 'voiceInstall', 'voiceTranscribe', 'voiceSpeak', 'voiceNew', 'voiceResetAgent', 'voiceSetProvider', 'voiceSaveOpenRouterKey', 'voiceClearOpenRouterKey', 'cancelDelegation', 'startMission', 'missionAction', 'saveRoutine', 'deleteRoutine', 'runRoutine', 'models', 'pickFolder', 'openFolder', 'agentTerminalSessions', 'agentTerminalStop', 'openExternalTerminal', 'externalBrowserStatus', 'setExternalBrowserGrant']) ipcMain.removeHandler(`v9:${channel}`)
  }
}
