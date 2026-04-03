import { ipcMain, BrowserWindow, dialog } from 'electron'
import { getAppWindow } from '../windows/manager'
import { openCodeSdkService } from '../services/opencode-sdk'
import { sessionStore } from '../services/session-store'
import { teamStore } from '../services/team-store'
import { pipelineExecutor } from '../services/pipeline-executor'
import { gitWorktreeService } from '../services/git-worktree'
import { fileLockManager } from '../services/file-lock'
import { AGENT_CATALOG, GLOBAL_CEO_PROMPT, TEAM_TEMPLATES, getAgentBySlug, getTemplateById, loadAgentTemplates } from '../services/agent-catalog'
import type { Agent } from '../types/team'

function forwardEventToRenderer(channel: string, ...args: unknown[]): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send(channel, ...args)
  }
}

function attachPipelineState(team: any) {
  if (!team) {
    return null
  }
  const tasks = pipelineExecutor.getTasksByTeam(team.id)
  return {
    ...team,
    pipeline: {
      ...team.pipeline,
      tasks,
      status: pipelineExecutor.getPipelineStatus(team.id)
    }
  }
}

function resolveAgentSystemPromptPath(agentId: string, teamId?: string): string | undefined {
  if (agentId === 'ceo-global') {
    return GLOBAL_CEO_PROMPT.targetPath
  }

  if (teamId) {
    const teamAgent = teamStore.getTeam(teamId)?.agents.find((agent) => agent.id === agentId)
    if (teamAgent?.systemPromptPath) {
      return teamAgent.systemPromptPath
    }
  }

  for (const team of teamStore.listTeams()) {
    const teamAgent = team.agents.find((agent) => agent.id === agentId)
    if (teamAgent?.systemPromptPath) {
      return teamAgent.systemPromptPath
    }
  }

  return undefined
}

export function registerHandlers(): void {
  ipcMain.handle('vibe:window:minimize', () => {
    const win = getAppWindow()
    win?.minimize()
  })

  ipcMain.handle('vibe:window:maximize', () => {
    const win = getAppWindow()
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })

  ipcMain.handle('vibe:window:close', () => {
    const win = getAppWindow()
    win?.close()
  })

  ipcMain.handle('vibe:window:setZoom', (_, level: number) => {
    const win = getAppWindow()
    win?.webContents.setZoomLevel(level)
  })

  ipcMain.handle('vibe:window:getZoom', () => {
    const win = getAppWindow()
    return win?.webContents.getZoomLevel() ?? 0
  })

  ipcMain.handle('vibe:platform:info', () => {
    return { platform: process.platform }
  })

  ipcMain.handle('vibe:dialog:pickProjectFolder', async () => {
    const win = getAppWindow()
    const result = await dialog.showOpenDialog(win ?? undefined, {
      title: 'Selecionar pasta do projeto',
      properties: ['openDirectory', 'createDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })

  ipcMain.handle('vibe:agent:ensure', async (_, input) => {
    return await openCodeSdkService.ensureSession({
      ...input,
      workspaceDirectory: input.workspaceDirectory,
      systemPromptPath: input.systemPromptPath || resolveAgentSystemPromptPath(input.agentId, input.teamId),
    })
  })

  ipcMain.handle('vibe:agent:send', async (_, input) => {
    await openCodeSdkService.sendMessage(input)
  })

  ipcMain.handle('vibe:agent:stop', async (_, agentId) => {
    await openCodeSdkService.stopSession(agentId)
  })

  ipcMain.handle('vibe:agent:subscribe', async (_, agentId) => {
    await openCodeSdkService.subscribeToSession(agentId)
  })

  ipcMain.handle('vibe:ceo:ensure', async (_, input) => {
    return await openCodeSdkService.ensureSession({
      ...input,
      role: 'global-ceo',
      workspaceDirectory: input.workspaceDirectory,
      systemPromptPath: input.systemPromptPath || GLOBAL_CEO_PROMPT.targetPath,
    })
  })

  ipcMain.handle('vibe:ceo:send', async (_, input) => {
    await openCodeSdkService.sendMessage(input)
  })

  ipcMain.handle('vibe:ceo:subscribe', async () => {
    await openCodeSdkService.subscribeToGlobalEvents()
  })

  ipcMain.handle('vibe:team:create', async (_, input) => {
    const team = teamStore.createTeam(input)

    const leadAgent = {
      id: crypto.randomUUID(),
      name: 'Tech Lead',
      role: 'tech-lead',
      catalogSlug: 'studio-producer',
      systemPromptPath: getAgentBySlug('studio-producer')?.systemPromptPath || '',
      status: 'idle' as const,
      color: input.projectColor || 'hsl(239 84% 67%)',
      currentFiles: [],
      hiredAt: new Date().toISOString(),
      isTeamLead: true,
    }

    teamStore.addAgentToTeam(team.id, leadAgent)
    teamStore.setTechLead(team.id, leadAgent.id)

    return attachPipelineState(teamStore.getTeam(team.id))
  })

  ipcMain.handle('vibe:team:delete', async (_, teamId) => {
    return teamStore.deleteTeam(teamId)
  })

  ipcMain.handle('vibe:team:get', async (_, teamId) => {
    const team = teamStore.getTeam(teamId)
    return team ? attachPipelineState(team) : null
  })

  ipcMain.handle('vibe:team:list', async () => {
    return teamStore.listTeams().map(attachPipelineState)
  })

  ipcMain.handle('vibe:team:hire', async (_, input) => {
    return teamStore.addAgentToTeam(input.teamId, input.agent as Agent)
  })

  ipcMain.handle('vibe:team:fire', async (_, input) => {
    return teamStore.removeAgentFromTeam(input.teamId, input.agentId)
  })

  ipcMain.handle('vibe:team:setTechLead', async (_, input) => {
    return teamStore.setTechLead(input.teamId, input.agentId)
  })

  ipcMain.handle('vibe:team:pause', async (_, teamId) => {
    return teamStore.pauseTeam(teamId)
  })

  ipcMain.handle('vibe:team:resume', async (_, teamId) => {
    return teamStore.resumeTeam(teamId)
  })

  ipcMain.handle('vibe:pipeline:addTask', async (_, input) => {
    return pipelineExecutor.addTask(input)
  })

  ipcMain.handle('vibe:pipeline:start', async (_, taskId) => {
    const check = pipelineExecutor.canStartTask(taskId)
    if (!check.canStart) {
      return { success: false, error: check.reason }
    }
    const task = pipelineExecutor.startTask(taskId)
    return { success: true, task }
  })

  ipcMain.handle('vibe:pipeline:getStatus', async (_, teamId) => {
    return pipelineExecutor.getPipelineStatus(teamId)
  })

  ipcMain.handle('vibe:pipeline:getTasks', async (_, teamId) => {
    return pipelineExecutor.getTasksByTeam(teamId)
  })

  ipcMain.handle('vibe:task:complete', async (_, taskId) => {
    return pipelineExecutor.completeTask(taskId)
  })

  ipcMain.handle('vibe:task:fail', async (_, { taskId, error }) => {
    return pipelineExecutor.failTask(taskId, error)
  })

  ipcMain.handle('vibe:worktree:create', async (_, input) => {
    return await gitWorktreeService.createWorktree(input)
  })

  ipcMain.handle('vibe:worktree:remove', async (_, worktreePath) => {
    return await gitWorktreeService.removeWorktree(worktreePath)
  })

  ipcMain.handle('vibe:worktree:list', async (_, basePath) => {
    return await gitWorktreeService.listWorktrees(basePath)
  })

  ipcMain.handle('vibe:worktree:merge', async (_, { worktreePath, branchName, targetBranch }) => {
    return await gitWorktreeService.mergeBranch(worktreePath, branchName, targetBranch)
  })

  ipcMain.handle('vibe:lock:acquire', async (_, { filePath, agentId }) => {
    return fileLockManager.acquireLock(filePath, agentId)
  })

  ipcMain.handle('vibe:lock:release', async (_, { filePath, agentId }) => {
    return fileLockManager.releaseLock(filePath, agentId)
  })

  ipcMain.handle('vibe:lock:check', async (_, filePath) => {
    return fileLockManager.checkLock(filePath)
  })

  ipcMain.handle('vibe:lock:list', async () => {
    return fileLockManager.getAllLocks()
  })

  ipcMain.handle('vibe:template:list', async () => {
    return TEAM_TEMPLATES
  })

  ipcMain.handle('vibe:template:get', async (_, templateId) => {
    return getTemplateById(templateId) || null
  })

  ipcMain.handle('vibe:agent-template:list', async () => {
    return loadAgentTemplates()
  })

  ipcMain.handle('vibe:team:createFromTemplate', async (_, { templateId, teamName, projectPath }) => {
    const template = getTemplateById(templateId)
    if (!template) {
      return { success: false, error: 'Template not found' }
    }

    const techLeadSlug = template.suggestedTechLeadSlug || template.agentSlugs[0]
    const techLead = getAgentBySlug(techLeadSlug)

    const team = teamStore.createTeam({
      name: teamName || template.name,
      projectPath: projectPath || '',
      projectName: teamName || template.name,
      projectColor: techLead?.color || 'hsl(239 84% 67%)',
      templateId: template.id,
    })

    if (techLead) {
      const leadAgent = {
        id: crypto.randomUUID(),
        name: techLead.name,
        role: techLead.role,
        catalogSlug: techLead.slug,
        systemPromptPath: techLead.systemPromptPath || '',
        status: 'idle' as const,
        color: techLead.color,
        currentFiles: [],
        hiredAt: new Date().toISOString(),
        isTeamLead: true,
      }
      teamStore.addAgentToTeam(team.id, leadAgent)
      teamStore.setTechLead(team.id, leadAgent.id)
    }

    for (const agentSlug of template.agentSlugs) {
      if (agentSlug === techLeadSlug) continue
      const agentEntry = getAgentBySlug(agentSlug)
      if (agentEntry) {
        const agent = {
          id: crypto.randomUUID(),
          name: agentEntry.name,
          role: agentEntry.role,
          catalogSlug: agentEntry.slug,
          systemPromptPath: agentEntry.systemPromptPath || '',
          status: 'idle' as const,
          color: agentEntry.color,
          currentFiles: [],
          hiredAt: new Date().toISOString(),
        }
        teamStore.addAgentToTeam(team.id, agent)
      }
    }

    return { success: true, team: attachPipelineState(teamStore.getTeam(team.id)) }
  })

  // Session management handlers - SDK sessions
  ipcMain.handle('vibe:session:list', async () => {
    await openCodeSdkService.initialize()
    const client = openCodeSdkService.getClient()
    if (!client) {
      throw new Error('SDK client not initialized')
    }
    const result = await client.session.list({})
    return result.data || []
  })

  ipcMain.handle('vibe:session:create', async (_, input?: { directory?: string; agentSlug?: string; systemPrompt?: string }) => {
    await openCodeSdkService.initialize()
    const client = openCodeSdkService.getClient()
    if (!client) {
      throw new Error('SDK client not initialized')
    }
    const workspaceDirectory = input?.directory || process.cwd()
    const result = await client.session.create({
      query: { directory: workspaceDirectory }
    })
    return result.data
  })

  ipcMain.handle('vibe:session:delete', async (_, sessionId: string) => {
    await openCodeSdkService.initialize()
    const client = openCodeSdkService.getClient()
    if (!client) {
      throw new Error('SDK client not initialized')
    }
    const result = await client.session.delete({ path: { id: sessionId } })
    return result.data ?? result
  })

  ipcMain.handle('vibe:session:get', async (_, sessionId: string) => {
    await openCodeSdkService.initialize()
    const client = openCodeSdkService.getClient()
    if (!client) {
      throw new Error('SDK client not initialized')
    }
    const result = await client.session.get({ path: { id: sessionId } })
    return result.data
  })

  ipcMain.handle('vibe:session:messages', async (_, sessionId: string) => {
    await openCodeSdkService.initialize()
    const client = openCodeSdkService.getClient()
    if (!client) {
      throw new Error('SDK client not initialized')
    }
    const result = await client.session.messages({ path: { id: sessionId } })
    return result.data || []
  })

  ipcMain.handle('vibe:session:prompt', async (_, { sessionId, message, agentSlug, systemPrompt }: { sessionId: string; message: string; agentSlug?: string; systemPrompt?: string }) => {
    await openCodeSdkService.initialize()
    const client = openCodeSdkService.getClient()
    if (!client) {
      throw new Error('SDK client not initialized')
    }
    
    const parts = [{ type: "text" as const, text: message }]
    const finalSystemPrompt = agentSlug ? undefined : systemPrompt

    const result = await client.session.promptAsync({
      body: {
        parts,
        system: finalSystemPrompt,
        agent: agentSlug
      },
      path: {
        id: sessionId
      }
    })

    const status = result.response?.status
    const isSuccessfulResponse =
      typeof status === "number" ? status >= 200 && status < 300 : !!result.data

    if (!isSuccessfulResponse) {
      throw new Error(`Failed to prompt session: ${result.error}`)
    }
    
    return { success: true }
  })

  ipcMain.handle('vibe:session:subscribe', async (_, sessionId: string) => {
    // Subscribe to events for a specific session
    // The SDK's global event subscription already handles this via sessionID in events
    await openCodeSdkService.subscribeToGlobalEvents()
  })

  openCodeSdkService.on('vibe:agent:chunk', (...args) => {
    forwardEventToRenderer('vibe:agent:chunk', ...args)
  })

  openCodeSdkService.on('vibe:agent:reasoning', (...args) => {
    forwardEventToRenderer('vibe:agent:reasoning', ...args)
  })

  openCodeSdkService.on('vibe:agent:tool', (...args) => {
    forwardEventToRenderer('vibe:agent:tool', ...args)
  })

  openCodeSdkService.on('vibe:agent:activity', (...args) => {
    forwardEventToRenderer('vibe:agent:activity', ...args)
  })

  openCodeSdkService.on('vibe:agent:status', (...args) => {
    forwardEventToRenderer('vibe:agent:status', ...args)
  })

  openCodeSdkService.on('vibe:agent:done', (...args) => {
    forwardEventToRenderer('vibe:agent:done', ...args)
  })

  openCodeSdkService.on('vibe:agent:error', (...args) => {
    forwardEventToRenderer('vibe:agent:error', ...args)
  })

  openCodeSdkService.on('vibe:ceo:ask-human', (...args) => {
    forwardEventToRenderer('vibe:ceo:ask-human', ...args)
  })

  openCodeSdkService.on('vibe:pipeline:update', (...args) => {
    forwardEventToRenderer('vibe:pipeline:update', ...args)
  })

  teamStore.on('team:created', (...args) => {
    forwardEventToRenderer('vibe:team:created', ...args)
  })

  teamStore.on('team:deleted', (...args) => {
    forwardEventToRenderer('vibe:team:deleted', ...args)
  })

  teamStore.on('team:updated', (...args) => {
    forwardEventToRenderer('vibe:team:updated', ...args)
  })

  teamStore.on('team:agent-added', (...args) => {
    forwardEventToRenderer('vibe:team:agent-added', ...args)
  })

  teamStore.on('team:agent-removed', (...args) => {
    forwardEventToRenderer('vibe:team:agent-removed', ...args)
  })

  teamStore.on('team:techlead-changed', (...args) => {
    forwardEventToRenderer('vibe:team:techlead-changed', ...args)
  })

  teamStore.on('team:paused', (...args) => {
    forwardEventToRenderer('vibe:team:paused', ...args)
  })

  teamStore.on('team:resumed', (...args) => {
    forwardEventToRenderer('vibe:team:resumed', ...args)
  })

  pipelineExecutor.on('task:added', (...args) => {
    forwardEventToRenderer('vibe:task:added', ...args)
  })

  pipelineExecutor.on('task:started', (...args) => {
    forwardEventToRenderer('vibe:task:started', ...args)
  })

  pipelineExecutor.on('task:completed', (...args) => {
    forwardEventToRenderer('vibe:task:completed', ...args)
  })

  pipelineExecutor.on('task:failed', (...args) => {
    forwardEventToRenderer('vibe:task:failed', ...args)
  })

  pipelineExecutor.on('task:blocked', (...args) => {
    forwardEventToRenderer('vibe:task:blocked', ...args)
  })

  pipelineExecutor.on('pipeline:status-changed', (...args) => {
    forwardEventToRenderer('vibe:pipeline:status-changed', ...args)
  })

  gitWorktreeService.on('worktree:created', (...args) => {
    forwardEventToRenderer('vibe:worktree:created', ...args)
  })

  gitWorktreeService.on('worktree:removed', (...args) => {
    forwardEventToRenderer('vibe:worktree:removed', ...args)
  })

  gitWorktreeService.on('worktree:error', (...args) => {
    forwardEventToRenderer('vibe:worktree:error', ...args)
  })

  fileLockManager.on('lock:acquired', (...args) => {
    forwardEventToRenderer('vibe:lock:acquired', ...args)
  })

  fileLockManager.on('lock:released', (...args) => {
    forwardEventToRenderer('vibe:lock:released', ...args)
  })

  fileLockManager.on('lock:denied', (...args) => {
    forwardEventToRenderer('vibe:lock:denied', ...args)
  })
}
