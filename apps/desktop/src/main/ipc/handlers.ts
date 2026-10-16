import { ipcMain, BrowserWindow, dialog, app } from 'electron'
import * as os from 'os'
import * as path from 'path'
import { existsSync, readFileSync } from 'fs'
import { registerTerminalHandlers } from './terminal'
import { getAppWindow } from '../windows/manager'
import { openCodeSdkService } from '../services/opencode-sdk'
import { providerRouter } from '../services/provider-router'
import { sessionStore } from '../services/session-store'
import { teamStore } from '../services/team-store'
import { pipelineExecutor } from '../services/pipeline-executor'
import { gitWorktreeService } from '../services/git-worktree'
import { fileLockManager } from '../services/file-lock'
import { 
  AGENT_CATALOG, 
  GLOBAL_CEO_PROMPT, 
  TEAM_TEMPLATES, 
  getAgentBySlug, 
  getTemplateById, 
  loadAgentTemplates,
  getMarketplaceAgentByIdentity,
  OPENCODE_MARKETPLACE_AGENTS,
  type OpenCodeAgentDefinition,
} from '../services/agent-catalog'
import type { Agent, Team } from '../types/team'

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

function resolveKnownCatalogSlugFromRole(role?: string): string | undefined {
  if (!role) return undefined
  if (role === 'tech-lead') return 'tech-lead'
  if (role === 'frontend') return 'frontend-dev'
  if (role === 'backend') return 'backend-dev'
  if (role === 'qa') return 'qa-tester'
  if (role === 'devops') return 'devops-eng'
  if (role === 'design') return 'ux-designer'
  if (role === 'global-ceo' || role === 'ceo') return 'ceo'
  return undefined
}

function isGlobalCeoAgentId(agentId: string): boolean {
  return agentId === 'ceo-global' || agentId === 'global-ceo'
}

function resolvePromptPathFromAgentIdentity(
  identity?: { role?: string; catalogSlug?: string; systemPromptPath?: string },
  workspaceDirectory?: string
): string | undefined {
  if (!identity) return undefined

  const candidates: string[] = []
  const roleSlug = resolveKnownCatalogSlugFromRole(identity.role)
  if (roleSlug) candidates.push(roleSlug)
  if (identity.catalogSlug) candidates.push(identity.catalogSlug)
  if (identity.role) candidates.push(identity.role)

  if (identity.systemPromptPath) {
    const resolved = resolvePromptContent(identity.systemPromptPath, workspaceDirectory).path
    if (resolved) return identity.systemPromptPath
  }

  for (const slug of candidates) {
    const catalogPath = getAgentBySlug(slug)?.systemPromptPath
    if (catalogPath) {
      const resolved = resolvePromptContent(catalogPath, workspaceDirectory).path
      if (resolved) return catalogPath
    }
  }

  for (const slug of candidates) {
    const projectPath = `.opencode/agents/${slug}.md`
    const resolved = resolvePromptContent(projectPath, workspaceDirectory).path
    if (resolved) return projectPath
  }

  return undefined
}

function resolveAgentSystemPromptPath(agentId: string, teamId?: string, workspaceDirectory?: string): string | undefined {
  if (isGlobalCeoAgentId(agentId)) {
    return GLOBAL_CEO_PROMPT.targetPath
  }

  if (teamId) {
    const teamAgent = teamStore.getTeam(teamId)?.agents.find((agent) => agent.id === agentId)
    const resolvedPath = resolvePromptPathFromAgentIdentity({
      role: teamAgent?.role,
      catalogSlug: teamAgent?.catalogSlug,
      systemPromptPath: teamAgent?.systemPromptPath,
    }, workspaceDirectory)
    if (resolvedPath) {
      return resolvedPath
    }
  }

  for (const team of teamStore.listTeams()) {
    const teamAgent = team.agents.find((agent) => agent.id === agentId)
    const resolvedPath = resolvePromptPathFromAgentIdentity({
      role: teamAgent?.role,
      catalogSlug: teamAgent?.catalogSlug,
      systemPromptPath: teamAgent?.systemPromptPath,
    }, workspaceDirectory)
    if (resolvedPath) {
      return resolvedPath
    }
  }

  return undefined
}

function resolveAgentCatalogSlug(agentId: string, teamId?: string): string | undefined {
  if (isGlobalCeoAgentId(agentId)) {
    return 'ceo'
  }

  if (teamId) {
    const teamAgent = teamStore.getTeam(teamId)?.agents.find((agent) => agent.id === agentId)
    const roleSlug = resolveKnownCatalogSlugFromRole(teamAgent?.role)
    if (roleSlug) {
      return roleSlug
    }
    if (teamAgent?.catalogSlug) {
      return teamAgent.catalogSlug
    }
  }

  for (const team of teamStore.listTeams()) {
    const teamAgent = team.agents.find((agent) => agent.id === agentId)
    const roleSlug = resolveKnownCatalogSlugFromRole(teamAgent?.role)
    if (roleSlug) {
      return roleSlug
    }
    if (teamAgent?.catalogSlug) {
      return teamAgent.catalogSlug
    }
  }

  return undefined
}

function resolveFallbackCatalogSlug(input: { role?: string; agentSlug?: string }): string | undefined {
  const byRole = resolveKnownCatalogSlugFromRole(input.role)
  if (byRole) return byRole
  if (input.agentSlug) return input.agentSlug
  return undefined
}

function resolveFallbackPromptPath(input: { role?: string; agentSlug?: string }): string | undefined {
  const fallbackSlug = resolveFallbackCatalogSlug(input)
  if (!fallbackSlug) return undefined
  return getAgentBySlug(fallbackSlug)?.systemPromptPath || `.opencode/agents/${fallbackSlug}.md`
}

function buildTeamContextPrompt(teamId?: string, agentId?: string, role?: string): string | undefined {
  if (!teamId) {
    return undefined
  }

  const team = teamStore.getTeam(teamId) as Team | undefined
  if (!team) {
    return undefined
  }

  const lead = team.agents.find((agent) => agent.id === team.techLeadAgentId)
  const currentAgent = team.agents.find((agent) => agent.id === agentId)
  const isTechLead = role === 'tech-lead' || lead?.id === agentId || currentAgent?.isTeamLead
  const members = team.agents
    .map((agent) => {
      const marker = agent.id === agentId ? ' <- você' : ''
      const leadMarker = agent.isTeamLead ? ' (tech lead)' : ''
      const files = agent.currentFiles?.length ? ` | arquivos: ${agent.currentFiles.join(', ')}` : ''
      return `- ${agent.name} [${agent.catalogSlug}]${leadMarker} | status: ${agent.status}${files}${marker}`
    })
    .join('\n')

  const identityLine = isTechLead
    ? `Você é o Tech Lead deste time e deve se apresentar como responsável técnico por ${team.name}.`
    : `Você é ${currentAgent?.name ?? 'um agente do time'} e faz parte do time ${team.name}.`

  const collaborationLine = isTechLead
    ? 'Quando identificar falta de capacidade ou de perfil no time, primeiro tente mover a execução com os agentes já existentes. Só acione o RH Global se houver falta real de perfil ou capacidade sustentada. Você não pode contratar diretamente. Quando a demanda estiver clara, aja com autonomia e coloque o time em movimento sem pedir confirmação desnecessária.'
    : lead
      ? `Seu tech lead é ${lead.name}. Quando precisar coordenar ou pedir decisão, alinhe com ele.`
      : 'Ainda não existe tech lead definido para este time; ajude a organizar o trabalho e sinalize a necessidade de um responsável técnico.'

  return `

[Contexto do Time]
Time: ${team.name}
Projeto: ${team.projectName ?? team.projectPath}
Pasta: ${team.projectPath}
Tech lead: ${lead?.name ?? 'não definido'}
${identityLine}
${collaborationLine}

Membros do time:
${members || '- nenhum agente contratado ainda'}

Protocolos de colaboração:
- Você pode delegar tarefas para outro agente do mesmo time usando [DELEGATE] com team, to, task e opcionalmente files.
- Se a demanda estiver clara, não peça confirmação para passos normais do fluxo: delegue, registre e avance.
- Para operar o board, prefira as ferramentas 'tasks_ensure', 'tasks_list', 'tasks_get', 'tasks_update', 'tasks_start', 'tasks_complete', 'tasks_remove' e 'tasks_dedupe'.
- Antes de criar uma nova issue no board, use 'tasks_list' ou 'tasks_ensure' para evitar duplicatas.
- Só volte ao usuário com pergunta quando faltar informação indispensável, houver risco destrutivo ou existir um trade-off material.
- Quando precisar acionar outro agente, emita um comando executável real; não apenas descreva a intenção em texto.
- Tech leads e agentes de time não podem contratar diretamente.
- Quando faltar um perfil no time, use [DELEGATE] para acionar o RH Global com o time, o perfil desejado e a justificativa, mas apenas depois de avaliar se o time atual realmente não consegue absorver a demanda.
- Sempre que citar outro agente, use o nome e/ou slug exatos do time para evitar ambiguidade.
- Quando o usuário perguntar "quem é você?" ou algo equivalente, responda mencionando seu papel e o nome do time.
- Quando responder sobre outros agentes, use a visão do time atual e deixe claro quem é o tech lead, quem está disponível e quem já foi contratado.
- Apenas CEO Global ou RH Global podem usar [HIRE_AGENT].
- Sempre trate os colegas como membros do mesmo time, nunca como agentes genéricos soltos.
- Nunca use 'call_omo_agent' para acionar colegas do time; use apenas o protocolo local de [DELEGATE].
`.trim()
}
function stripFrontmatter(content: string): string {
  return content.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim()
}

function resolvePromptContent(systemPromptPath: string, workspaceDirectory?: string): { content?: string; path?: string } {
  const candidates = new Set<string>()

  if (path.isAbsolute(systemPromptPath)) {
    candidates.add(systemPromptPath)
  } else {
    candidates.add(path.resolve(systemPromptPath))
    candidates.add(path.resolve(process.cwd(), systemPromptPath))
    candidates.add(path.resolve(process.cwd(), '..', systemPromptPath))
    candidates.add(path.resolve(process.cwd(), '..', '..', systemPromptPath))
    candidates.add(path.resolve(app.getAppPath(), systemPromptPath))
    candidates.add(path.resolve(app.getAppPath(), '..', systemPromptPath))
    candidates.add(path.resolve(app.getAppPath(), '..', '..', systemPromptPath))
    if (workspaceDirectory) {
      candidates.add(path.resolve(workspaceDirectory, systemPromptPath))
    }
  }

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue
    }
    try {
      return {
        content: stripFrontmatter(readFileSync(candidate, 'utf8')),
        path: candidate
      }
    } catch (error) {
      console.warn('[handlers] Failed to read prompt file:', candidate, error)
    }
  }

  return {}
}

export function registerHandlers(): void {
  registerTerminalHandlers()

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
      systemPromptPath:
        input.systemPromptPath || resolveAgentSystemPromptPath(input.agentId, input.teamId, input.workspaceDirectory),
    })
  })

  ipcMain.handle('vibe:agent:send', async (_, { agentId, message, model }) => {
    await openCodeSdkService.initialize()
    await openCodeSdkService.sendMessage({ agentId, message, model })
  })

  ipcMain.handle('vibe:agent:stop', async (_, agentId) => {
    await openCodeSdkService.stopSession(agentId)
  })

  ipcMain.handle('vibe:agent:subscribe', async (_, agentId) => {
    await openCodeSdkService.subscribeToSession(agentId)
  })

  ipcMain.handle('vibe:agent:updateConfig', async (_, { teamId, agentId, updates }) => {
    return teamStore.updateAgent(teamId, agentId, updates)
  })

  ipcMain.handle('vibe:opencode:listAgents', async () => {
    return openCodeSdkService.listAgents()
  })

  ipcMain.handle('vibe:ceo:ensure', async (_, input) => {
    return await openCodeSdkService.ensureSession({
      ...input,
      role: 'global-ceo',
      workspaceDirectory: input.workspaceDirectory,
      systemPromptPath: input.systemPromptPath || GLOBAL_CEO_PROMPT.targetPath,
    })
  })

  ipcMain.handle('vibe:ceo:send', async (_, { agentId, message, model }) => {
    await openCodeSdkService.initialize()
    await openCodeSdkService.sendMessage({ agentId, message, model })
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
      catalogSlug: 'tech-lead',
      systemPromptPath: getAgentBySlug('tech-lead')?.systemPromptPath || '',
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
    const fullAgent: Agent = {
      id: crypto.randomUUID(),
      name: input.agent.name,
      role: input.agent.role,
      catalogSlug: input.agent.catalogSlug,
      systemPromptPath: input.agent.systemPromptPath || '',
      status: 'idle',
      color: input.agent.color || 'hsl(239 84% 67%)',
      currentFiles: [],
      hiredAt: new Date().toISOString(),
    }
    return teamStore.addAgentToTeam(input.teamId, fullAgent)
  })

  /**
   * HR Global Staffing Handler
   * 
   * Handles staffing requests from Tech Leads when a team lacks specific capabilities.
   * HR Global evaluates:
   * 1. Is the staffing request valid (has team, desiredRole, justification)?
   * 2. Can any existing agent in the team handle the task?
   * 3. Which marketplace agent best fits the need?
   * 4. Should the request be approved, rejected, or deferred?
   * 
   * Returns: { success: boolean, agent?: Agent, message: string, action: string }
   * action can be: "hired" | "rejected" | "deferred" | "no_match"
   */
  ipcMain.handle('vibe:hr:staffing', async (_, input: {
    teamId: string
    desiredRole: string
    justification: string
    priority?: string
    successCriteria?: string[]
    taskDescription?: string
    requesterAgentId?: string
    requesterAgentName?: string
  }) => {
    const { teamId, desiredRole, justification, priority, successCriteria, taskDescription, requesterAgentId, requesterAgentName } = input

    // Validate required fields
    if (!teamId) {
      return { success: false, message: 'Team ID is required', action: 'rejected' }
    }
    if (!desiredRole) {
      return { success: false, message: 'Desired role is required for staffing', action: 'deferred' }
    }
    if (!justification) {
      return { success: false, message: 'Justification is required for staffing decision', action: 'deferred' }
    }

    const team = teamStore.getTeam(teamId)
    if (!team) {
      return { success: false, message: `Team not found: ${teamId}`, action: 'rejected' }
    }

    // Step 1: Check if any existing agent in the team can handle this
    const teamHasCapability = team.agents.some(agent => {
      // Map desired role to agent capability
      const roleSlug = resolveKnownCatalogSlugFromRole(desiredRole)
      if (roleSlug) {
        return agent.catalogSlug === roleSlug || agent.role === desiredRole.toLowerCase()
      }
      // Fuzzy match on role name
      return agent.name.toLowerCase().includes(desiredRole.toLowerCase()) ||
             agent.role.toLowerCase().includes(desiredRole.toLowerCase())
    })

    if (teamHasCapability) {
      return {
        success: true,
        message: `Team "${team.name}" already has capability for "${desiredRole}". Consider delegating first before hiring.`,
        action: 'rejected',
        agent: undefined,
      }
    }

    // Step 2: Find matching marketplace agent
    let matchedAgent = getMarketplaceAgentByIdentity(desiredRole)

    if (!matchedAgent) {
      // Try broader search in marketplace
      const allMatches = OPENCODE_MARKETPLACE_AGENTS.filter(agent => {
        const searchText = `${agent.name} ${agent.role} ${agent.slug}`.toLowerCase()
        return searchText.includes(desiredRole.toLowerCase())
      })

      if (allMatches.length === 0) {
        return {
          success: false,
          message: `No marketplace agent found matching "${desiredRole}". Available roles: ${OPENCODE_MARKETPLACE_AGENTS.map(a => a.name).join(', ')}`,
          action: 'no_match',
          agent: undefined,
        }
      }

      // If multiple matches, prefer the first one that matches role
      const roleMatch = allMatches.find(a => 
        a.role.toLowerCase().includes(desiredRole.toLowerCase()) ||
        a.slug.toLowerCase().includes(desiredRole.toLowerCase())
      )
      
      if (!roleMatch) {
        return {
          success: false,
          message: `Ambiguous staffing request. Did you mean: ${allMatches.map(a => a.name).join(', ')}?`,
          action: 'deferred',
          agent: undefined,
        }
      }
      
      // Use the role-matched agent
      matchedAgent = roleMatch
    }

    // Step 3: Create the new agent
    const newAgent: Agent = {
      id: crypto.randomUUID(),
      name: matchedAgent.name,
      role: matchedAgent.role,
      catalogSlug: matchedAgent.slug,
      systemPromptPath: matchedAgent.systemPromptPath || `.opencode/agents/${matchedAgent.slug}.md`,
      status: 'idle',
      color: matchedAgent.color,
      currentFiles: [],
      hiredAt: new Date().toISOString(),
    }

    // Add to team
    const updatedTeam = teamStore.addAgentToTeam(teamId, newAgent)
    if (!updatedTeam) {
      return { success: false, message: 'Failed to add agent to team', action: 'rejected' }
    }

    // Step 4: If task description provided, create a task for the new agent
    if (taskDescription) {
      const title = taskDescription.slice(0, 90)
      const pipelineTask = pipelineExecutor.ensureTask({
        teamId,
        agentId: newAgent.id,
        title,
        description: taskDescription,
        requesterAgentId,
        requesterAgentName,
        responsibleAgentRole: newAgent.role,
        priority,
        context: justification,
        acceptanceCriteria: successCriteria,
        files: [],
        dependsOn: [],
        status: 'ready',
      })

      // Emit event for board visibility
      forwardEventToRenderer('vibe:task:added', pipelineTask.task)
    }

    // Emit hiring event
    forwardEventToRenderer('vibe:agent:hired', { team: updatedTeam, agent: newAgent })

    return {
      success: true,
      message: `Staffing approved: ${newAgent.name} hired for team "${team.name}". Justification: ${justification}`,
      action: 'hired',
      agent: newAgent,
    }
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

  ipcMain.handle('vibe:pipeline:updateTaskStatus', async (_, input) => {
    const task = pipelineExecutor.updateTaskStatus(input.taskId, input.status, input)
    if (!task) {
      return { success: false, error: 'Unable to update task status' }
    }
    return { success: true, task }
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

  ipcMain.handle('vibe:agent-template:list', async (_, projectPath?: string) => {
    // Use provided projectPath or fall back to looking relative to app root
    // In development, app runs from apps/desktop, so we need to go up to project root
    let agentsDir: string
    
    if (projectPath) {
      agentsDir = path.join(projectPath, '.opencode', 'agents')
    } else {
      // Try multiple possible locations for .opencode/agents
      const possiblePaths = [
        path.join(process.cwd(), '.opencode', 'agents'),
        path.join(process.cwd(), '..', '.opencode', 'agents'),
        path.join(app.getAppPath(), '.opencode', 'agents'),
        path.join(app.getAppPath(), '..', '.opencode', 'agents'),
        path.join(app.getAppPath(), '..', '..', '.opencode', 'agents'),
      ]
      
      // Find the first path that exists
      agentsDir = possiblePaths.find(p => existsSync(p)) || possiblePaths[0]
    }
    
    return loadAgentTemplates(agentsDir)
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
  ipcMain.handle('vibe:session:list', async (_, input?: { directory?: string }) => {
    await openCodeSdkService.initialize()
    const client = openCodeSdkService.getClient()
    if (!client) {
      throw new Error('SDK client not initialized')
    }
    const result = await client.session.list(input?.directory ? { query: { directory: input.directory } } : {})
    return result.data || []
  })

  ipcMain.handle('vibe:session:create', async (_, input?: { directory?: string; agentSlug?: string; systemPrompt?: string }) => {
    await openCodeSdkService.initialize()
    const client = openCodeSdkService.getClient()
    if (!client) {
      throw new Error('SDK client not initialized')
    }
    const workspaceDirectory = input?.directory?.trim()
    const result = await client.session.create({
      query: workspaceDirectory ? { directory: workspaceDirectory } : undefined
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

  ipcMain.handle(
    'vibe:session:prompt',
    async (
      _,
      {
        sessionId,
        message,
        agentId,
        teamId,
        role,
        agentSlug,
        systemPrompt,
        systemPromptPath,
        workspaceDirectory,
        model,
      }: {
        sessionId: string
        message: string
        agentId: string
        teamId?: string
        role: 'global-ceo' | 'global-agent' | 'tech-lead' | 'team-agent'
        agentSlug?: string
        systemPrompt?: string
        systemPromptPath?: string
        workspaceDirectory?: string
        model?: { modelID: string, providerID: string }
      }
    ) => {
    await openCodeSdkService.initialize()
    const client = openCodeSdkService.getClient()
    if (!client) {
      throw new Error('SDK client not initialized')
    }

    // =============================================================================
    // PROVIDER ROUTING - CEO, Tech Lead, RH always use MiniMax Direct
    // These are internal agents that REQUIRE MiniMax API key
    // =============================================================================
    const INTERNAL_AGENTS = ['global-ceo', 'tech-lead', 'hr-global', 'global-agent']
    const isInternalAgent = INTERNAL_AGENTS.includes(role)

    if (isInternalAgent) {
      // Internal agents MUST use MiniMax - no fallback, no feature flags
      if (!process.env.MINIMAX_API_KEY) {
        throw new Error(`MINIMAX_API_KEY is required for internal agent role: ${role}`)
      }
      
      console.log('[vibe:session:prompt] Using MiniMax Direct for internal agent:', role)

      // Use providerRouter.sendMessage() with useMiniMax=true for internal agents
      // This bypasses feature flags and ensures MiniMax is used directly
      // Events will be forwarded to renderer via providerRouter.subscribe() at line 1083
      await providerRouter.sendMessage({
        agentId,
        message,
        context: {
          teamId,
          role,
        }
      }, true) // useMiniMax = true

      return { success: true, provider: 'minimax' }
    }

    const sessionResult = await client.session.get({ path: { id: sessionId } })
    const session = sessionResult.data
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    const resolvedCatalogSlug =
      resolveAgentCatalogSlug(agentId, teamId) ||
      resolveFallbackCatalogSlug({ role, agentSlug }) ||
      agentSlug
    const resolvedSystemPromptPath =
      resolveAgentSystemPromptPath(agentId, teamId, workspaceDirectory) ||
      systemPromptPath ||
      resolveFallbackPromptPath({ role, agentSlug: resolvedCatalogSlug || agentSlug })
    const promptResolution = resolvedSystemPromptPath
      ? resolvePromptContent(resolvedSystemPromptPath, workspaceDirectory)
      : {}
    const forcedSystemPrompt = promptResolution.content
    const resolvedPromptConfig = await openCodeSdkService.resolvePromptConfig({
      workspaceDirectory: workspaceDirectory || '',
      systemPrompt: forcedSystemPrompt || systemPrompt,
      systemPromptPath: resolvedSystemPromptPath,
      agentSlug: resolvedCatalogSlug,
    })
    const teamContextPrompt = buildTeamContextPrompt(teamId, agentId, role)

    // Use the exact SDK agent name when we can resolve it, but always reinforce
    // identity with the local prompt file from `.opencode/agents`.
    const finalSystemPrompt = [forcedSystemPrompt || resolvedPromptConfig.systemPrompt || systemPrompt, teamContextPrompt]
      .filter(Boolean)
      .join('\n\n')
    const finalAgentSlug = resolvedPromptConfig.agentSlug

    // Never silently fall back to default SDK persona.
    if (!finalSystemPrompt) {
      throw new Error(
        `[vibe:session:prompt] Prompt file not found for ${resolvedSystemPromptPath || "(undefined)"}. ` +
          `Cannot continue without the agent identity prompt.`
      )
    }

    sessionStore.setSession({
      agentId,
      teamId,
      role,
      session,
      workspaceDirectory,
      agentSlug: finalAgentSlug,
      systemPrompt: finalSystemPrompt,
      systemPromptPath: resolvedSystemPromptPath,
      status: 'idle',
      lastEventAt: new Date().toISOString(),
    })

    const parts = [{ type: "text" as const, text: message }]

    // DEBUG: Log what we're about to send
    console.log('[vibe:session:prompt] Sending to SDK:', {
      hasAgent: !!finalAgentSlug,
      finalAgentSlug,
      systemPromptLength: finalSystemPrompt?.length,
      resolvedCatalogSlug,
      resolvedSystemPromptPath,
    })

    // Only pass `agent` to the SDK when we have a valid, resolved SDK agent name.
    // Otherwise let the SDK use its default behavior with just the system prompt.
    const promptBody: {
      parts: typeof parts
      system: string
      agent?: string
      model?: typeof model
    } = {
      parts,
      system: finalSystemPrompt,
    }

    // Prefer the exact resolved agent name from the workspace prompt.
    // Falling back to `general` here could place the session into a generic
    // persona that still emits unrelated platform tools like `call_omo_agent`.
    if (finalAgentSlug?.trim()) {
      promptBody.agent = finalAgentSlug
    }

    if (model) {
      promptBody.model = model
    }

    // DEBUG: Log exact body being sent
    console.log('[vibe:session:prompt] Exact promptBody:', {
      hasAgent: !!promptBody.agent,
      agent: promptBody.agent,
      systemLength: promptBody.system?.length,
    })

    const result = await client.session.promptAsync({
      body: promptBody,
      path: {
        id: sessionId
      },
      query: workspaceDirectory ? { directory: workspaceDirectory } : undefined
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

  // Subscribe to providerRouter chunks and forward tool events to renderer
  // This handles InternalAgentService (MiniMax) tool events
  providerRouter.subscribe((chunk) => {
    const agentId = chunk.agentId || 'internal-agent'
    if (chunk.type === 'tool_use' || chunk.type === 'tool_result') {
      forwardEventToRenderer('vibe:agent:tool', {
        agentId,
        tool: chunk.toolName,
        title: chunk.toolName,
        state: chunk.type === 'tool_use' ? 'running' : 'completed',
        input: chunk.toolInput,
        output: chunk.type === 'tool_result' ? (typeof chunk.toolOutput === 'string' ? chunk.toolOutput : JSON.stringify(chunk.toolOutput)) : undefined,
      })
    } else if (chunk.type === 'text' && chunk.text) {
      forwardEventToRenderer('vibe:agent:chunk', {
        agentId,
        message: { content: { text: chunk.text } },
      })
    } else if (chunk.type === 'done') {
      forwardEventToRenderer('vibe:agent:status', {
        agentId,
        status: 'done',
      })
      forwardEventToRenderer('vibe:agent:done', {
        agentId,
      })
    } else if (chunk.type === 'error') {
      forwardEventToRenderer('vibe:agent:status', {
        agentId,
        status: 'error',
      })
      forwardEventToRenderer('vibe:agent:error', {
        agentId,
        error: chunk.error || chunk.content || 'Erro desconhecido no agente interno.',
      })
    }
  })

  openCodeSdkService.on('vibe:agent:handoff', (...args) => {
    forwardEventToRenderer('vibe:agent:handoff', ...args)
  })

  openCodeSdkService.on('vibe:task:delegated', (...args) => {
    forwardEventToRenderer('vibe:task:delegated', ...args)
  })

  openCodeSdkService.on('vibe:communication:update', (...args) => {
    forwardEventToRenderer('vibe:communication:update', ...args)
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
    // Invalidate the agent map cache so new agents are discoverable by the SDK.
    openCodeSdkService.invalidateAvailableAgentsCache()
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

  pipelineExecutor.on('task:updated', (...args) => {
    forwardEventToRenderer('vibe:task:updated', ...args)
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

  // System info handlers
  ipcMain.handle('vibe:system:homedir', () => {
    return os.homedir()
  })

  ipcMain.handle('vibe:system:platform', () => {
    return os.platform()
  })

  // Dynamic model listing from OpenCode providers
  ipcMain.handle('vibe:opencode:listModels', async () => {
    try {
      return await openCodeSdkService.listModels()
    } catch (error) {
      console.error('[handlers] listModels error:', error)
      return []
    }
  })

  ipcMain.handle('vibe:opencode:getConfigDiagnostics', async (_event, input?: { projectPath?: string }) => {
    try {
      return await openCodeSdkService.getConfigDiagnostics(input)
    } catch (error) {
      console.error('[handlers] getConfigDiagnostics error:', error)
      return {
        sdkReady: false,
        providers: [],
        models: [],
        sources: [],
        env: {},
        mergedSummary: {
          disabled_providers: [],
          enabled_providers: [],
          providerCount: 0,
          mcpCount: 0,
          commandCount: 0,
          toolCount: 0,
          skillsPaths: 0,
          skillsUrls: 0,
          watcherIgnoreCount: 0,
        },
      warnings: [error instanceof Error ? error.message : String(error)],
      }
    }
  })

  ipcMain.handle('vibe:opencode:getConfigEditorData', async (_event, input?: { scope?: "global" | "project"; projectPath?: string }) => {
    try {
      return await openCodeSdkService.getConfigEditorData(input)
    } catch (error) {
      console.error('[handlers] getConfigEditorData error:', error)
      return {
        scope: input?.scope ?? (input?.projectPath ? "project" : "global"),
        targetPath: "",
        exists: false,
        defaults: {},
        providers: [],
        models: [],
        mcpJson: "",
        permissionsJson: "",
        toolsJson: "",
        warnings: [error instanceof Error ? error.message : String(error)],
      }
    }
  })

  ipcMain.handle('vibe:opencode:saveConfigEditorData', async (_event, input: { scope: "global" | "project"; projectPath?: string; defaults: any; providers: any[]; mcpJson: string; permissionsJson: string; toolsJson: string }) => {
    try {
      return await openCodeSdkService.saveConfigEditorData(input)
    } catch (error) {
      console.error('[handlers] saveConfigEditorData error:', error)
      return {
        success: false,
        targetPath: "",
        warnings: [error instanceof Error ? error.message : String(error)],
      }
    }
  })

  ipcMain.handle('vibe:workspace:clearBoard', async (_event, input?: { scope?: "project" | "all"; teamId?: string }) => {
    try {
      if (input?.scope === "project") {
        if (!input.teamId) {
          throw new Error("teamId is required for project board reset")
        }

        const deleted = pipelineExecutor.clearTasksByTeam(input.teamId)
        return { success: true, deleted }
      }

      const deleted = pipelineExecutor.clearAllTasks()
      return { success: true, deleted }
    } catch (error) {
      console.error('[handlers] clearBoard error:', error)
      return {
        success: false,
        deleted: 0,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })

  // Update agent config (e.g. chosen LLM model)
  ipcMain.handle('vibe:team:updateAgent', (_event, teamId: string, agentId: string, updates: Partial<Agent>) => {
    return teamStore.updateAgent(teamId, agentId, updates)
  })
}

