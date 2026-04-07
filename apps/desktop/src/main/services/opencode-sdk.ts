import { EventEmitter } from "events"
import * as cp from "child_process"
import { existsSync, readFileSync } from "fs"
import { basename, dirname, join, resolve, normalize } from "path"
import { createOpencode } from "@opencode-ai/sdk"
import type { OpencodeClient } from "@opencode-ai/sdk/dist/v2/client"
import type { Session, GlobalEvent, Event } from "@opencode-ai/sdk/dist/gen/types.gen"
import { sessionStore, type AgentRole, type ManagedSession } from "./session-store"
import { teamStore } from "./team-store"
import { parseCeoOutput } from "./ceo-output-parser"
import { ceoCommandExecutor } from "./ceo-command-executor"
import type { Team } from "../types/team"

type SdkStatus = "idle" | "retry" | "busy"

interface EnsureSessionInput {
  agentId: string
  teamId?: string
  role: AgentRole
  agentSlug?: string
  workspaceDirectory?: string
  systemPrompt?: string
  systemPromptPath?: string
}

interface SendMessageInput {
  agentId: string
  message: string
  model?: {
    modelID: string
    providerID: string
  }
}

interface TextPartInput {
  type: "text"
  text: string
}

interface FilePartInput {
  type: "file"
  file: {
    content?: string
    path: string
  }
}

interface AgentPartInput {
  type: "agent"
  name: string
}

interface SubtaskPartInput {
  type: "subtask"
  value: string
}

type PartInput = TextPartInput | FilePartInput | AgentPartInput | SubtaskPartInput

interface ResolvedAgentConfig {
  agentSlug?: string
  systemPrompt?: string
}

interface AgentHandoffEvent {
  team: Team
  sessionId?: string
  sourceSessionId?: string
  fromAgentId: string
  fromAgentName?: string
  toAgentId: string
  toAgentName?: string
  teamId?: string
  teamName?: string
  task: string
  files?: string[]
  branchName?: string
  model?: {
    modelID: string
    providerID: string
  }
}

type ToolInvocationData = Record<string, unknown>

interface DelegationOrigin {
  sourceAgentId: string
  sourceSessionId?: string
  sourceAgentName?: string
  targetAgentId: string
  targetAgentName?: string
  teamId?: string
  teamName?: string
  task: string
  files?: string[]
  branchName?: string
}

function stripCommandMarkupFromText(text: string): string {
  if (!text.trim()) {
    return text
  }

  const commandStartMatch = text.match(/\[(CREATE_TEAM|DELEGATE|HIRE_AGENT|PAUSE_TEAM|RESUME_TEAM|ASK_HUMAN)\]/i)
  const invokeStartIndex = text.search(/<invoke\b/i)
  const taskStartIndex = text.search(/<task\b/i)
  const parameterStartIndex = text.search(/<parameter\b/i)

  const candidateIndexes = [commandStartMatch?.index, invokeStartIndex, taskStartIndex, parameterStartIndex].filter(
    (value): value is number => typeof value === "number" && value >= 0
  )

  if (candidateIndexes.length === 0) {
    return text
  }

  const firstMarkerIndex = Math.min(...candidateIndexes)
  return text.slice(0, firstMarkerIndex).trimEnd()
}

// Agent slug aliases for backward compatibility with legacy project agent names.
// Only map to the SAME persona type - never redirect to an unrelated identity.
const AGENT_SLUG_ALIASES: Record<string, string> = {
  "frontend-dev": "frontend-developer",
  "backend-dev": "backend-architect",
  "qa-tester": "reality-checker",
  "devops-eng": "devops-automator",
  "ux-designer": "ui-designer",
}

function normalizeAgentLookupValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
}

function matchesTeamAgentIdentity(agent: { name: string; catalogSlug?: string; role?: string }, value: string): boolean {
  const lookup = normalizeAgentLookupValue(value)
  const name = normalizeAgentLookupValue(agent.name)
  const slug = normalizeAgentLookupValue(agent.catalogSlug || "")
  const role = normalizeAgentLookupValue(agent.role || "")

  return (
    name === lookup ||
    slug === lookup ||
    role === lookup ||
    name.includes(lookup) ||
    slug.includes(lookup) ||
    lookup.includes(slug)
  )
}

// Local workspace personas sometimes need to be mounted on top of a native SDK
// agent name. This keeps the workspace identity intact while avoiding
// "Agent not found" errors from the SDK registry.
const SDK_AGENT_NAME_BY_LOCAL_SLUG: Record<string, string> = {
  "tech-lead": "Software Architect",
}

const SKILL_TO_TEAM_AGENT_HINT: Record<string, string> = {
  "frontend-design": "frontend-developer",
}

class OpenCodeSdkService extends EventEmitter {
  private client: OpencodeClient | null = null
  private serverUrl: string | null = null
  private isInitialized = false
  private initPromise: Promise<void> | null = null
  private globalEventIterator: AsyncIterator<GlobalEvent> | null = null
  private sessionEventIterators: Map<string, AsyncIterator<Event>> = new Map()
  private activeSubscriptions = false
  private commandOutputBuffers: Map<string, string> = new Map()
  private sessionTextBuffers: Map<string, string> = new Map()
  private assistantMessageIds: Set<string> = new Set()
  private sessionCreationPromises: Map<string, Promise<ManagedSession>> = new Map()
  private availableAgentsPromise: Promise<Map<string, string>> | null = null
  private consumedDelegationSessions: Set<string> = new Set()
  private delegationOriginsBySessionId: Map<string, DelegationOrigin> = new Map()

  /**
   * Invalidate the cached agent map so the next lookup refetches from SDK.
   * Call this when new agents may have been registered (e.g., after hiring a team agent).
   */
  invalidateAvailableAgentsCache(): void {
    this.availableAgentsPromise = null
  }

  constructor() {
    super()
    this.setMaxListeners(100)

    ceoCommandExecutor.on("agent:handoff", (event: AgentHandoffEvent) => {
      this.emit("vibe:agent:handoff", event)
      void this.handleAgentHandoff(event)
    })

    ceoCommandExecutor.on("task:delegated", (event) => {
      this.emit("vibe:task:delegated", event)
    })
  }

  async initialize(): Promise<void> {
    await this.ensureInitialized()
  }

  private resolveWorkspaceDirectory(): string {
    const searchMarkers = [".git", "AGENTS.md", ".opencode"]
    let current = __dirname

    for (let i = 0; i < 10; i++) {
      for (const marker of searchMarkers) {
        if (existsSync(join(current, marker))) {
          return current
        }
      }

      const parent = dirname(current)
      if (parent === current) break
      current = parent
    }

    return process.cwd()
  }

  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized && this.client) {
      return
    }

    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = this.doInitialize()
    return this.initPromise
  }

  private stripFrontmatter(content: string): string {
    return content.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim()
  }

  private getPromptResolutionPaths(workspaceDirectory?: string, systemPromptPath?: string): string[] {
    if (!systemPromptPath) {
      return []
    }

    const candidates = new Set<string>()
    const normalizedPromptPath = normalize(systemPromptPath)
    const promptFileName = basename(normalizedPromptPath)
    const rootDir = this.resolveWorkspaceDirectory() || process.cwd()
    const effectiveWorkspace = workspaceDirectory || rootDir

    if (systemPromptPath === resolve(systemPromptPath)) {
      candidates.add(systemPromptPath)
      return Array.from(candidates)
    }

    // Canonical Politron paths first: ensures team identity always comes from
    // the local `.opencode/agents` prompts instead of SDK default personas.
    candidates.add(resolve(rootDir, normalizedPromptPath))
    candidates.add(resolve(rootDir, ".opencode", "agents", promptFileName))

    // Then try runtime directories that can vary between dev/prod launches.
    candidates.add(resolve(effectiveWorkspace, normalizedPromptPath))
    candidates.add(resolve(process.cwd(), normalizedPromptPath))
    candidates.add(resolve(process.cwd(), "..", normalizedPromptPath))
    candidates.add(resolve(process.cwd(), "..", "..", normalizedPromptPath))
    candidates.add(resolve(__dirname, normalizedPromptPath))
    candidates.add(resolve(__dirname, "..", normalizedPromptPath))
    candidates.add(resolve(__dirname, "..", "..", normalizedPromptPath))

    return Array.from(candidates)
  }

  private resolveSystemPrompt(
    workspaceDirectory: string | undefined,
    systemPrompt?: string,
    systemPromptPath?: string
  ): string | undefined {
    if (systemPrompt?.trim()) {
      return systemPrompt.trim()
    }

    if (!systemPromptPath) {
      return undefined
    }

    for (const absolutePromptPath of this.getPromptResolutionPaths(workspaceDirectory, systemPromptPath)) {
      if (!existsSync(absolutePromptPath)) {
        continue
      }

      const fileContent = readFileSync(absolutePromptPath, 'utf8')
      return this.stripFrontmatter(fileContent)
    }

    console.warn(
      `[OpenCodeSdkService] Prompt file not found for "${systemPromptPath}" in workspace "${workspaceDirectory}"`
    )
    return undefined
  }

  private buildTeamContextPrompt(teamId?: string, agentId?: string, role?: AgentRole): string | undefined {
    if (!teamId) {
      return undefined
    }

    const team = teamStore.getTeam(teamId)
    if (!team) {
      return undefined
    }

    const lead = team.agents.find((agent) => agent.id === team.techLeadAgentId)
    const currentAgent = team.agents.find((agent) => agent.id === agentId)
    const members = team.agents.map((agent) => {
      const marker = agent.id === agentId ? " <- vocÃª" : ""
      const leadMarker = agent.isTeamLead ? " (tech lead)" : ""
      const files = agent.currentFiles?.length ? ` | arquivos: ${agent.currentFiles.join(", ")}` : ""
      return `- ${agent.name} [${agent.catalogSlug}]${leadMarker} | status: ${agent.status}${files}${marker}`
    }).join("\n")

    const isTechLead = role === "tech-lead" || lead?.id === agentId || currentAgent?.isTeamLead
    const identityLine = isTechLead
      ? `VocÃª Ã© o Tech Lead deste time e deve se apresentar como responsÃ¡vel tÃ©cnico por ${team.name}.`
      : `VocÃª Ã© ${currentAgent?.name ?? "um agente do time"} e faz parte do time ${team.name}.`
    const collaborationLine = lead
      ? `Seu tech lead Ã© ${lead.name}. Quando precisar coordenar ou pedir decisÃ£o, alinhe com ele.`
      : `Ainda nÃ£o existe tech lead definido para este time; ajude a organizar o trabalho e sinalize a necessidade de um responsÃ¡vel tÃ©cnico.`

    return `

[Contexto do Time]
Time: ${team.name}
Projeto: ${team.projectName ?? team.projectPath}
Pasta: ${team.projectPath}
Tech lead: ${lead?.name ?? "nÃ£o definido"}
${identityLine}
${collaborationLine}

Regra de idioma:
- Toda resposta visível ao usuário final deve ser em português do Brasil.
- A comunicação interna entre agentes pode usar inglês quando for mais eficiente.
- Se houver delegação, a tarefa pode ser passada em linguagem técnica, mas a resposta final ao usuário continua em pt-BR.

Membros do time:
${members || "- nenhum agente contratado ainda"}

Protocolos de colaboraÃ§Ã£o:
- VocÃª pode delegar tarefas para outro agente do mesmo time usando [DELEGATE] com team, to, task e opcionalmente files.
- Se o agente correto nÃ£o existir, vocÃª pode solicitar contrataÃ§Ã£o usando [HIRE_AGENT] com team, role e agentSlug.
- Sempre que citar outro agente, use o nome e/ou slug exatos do time para evitar ambiguidade.
- Quando o usuÃ¡rio perguntar "quem Ã© vocÃª?" ou algo equivalente, responda mencionando seu papel e o nome do time.
- Quando responder sobre outros agentes, use a visÃ£o do time atual e deixe claro quem Ã© o tech lead, quem estÃ¡ disponÃ­vel e quem jÃ¡ foi contratado.
- Nunca use 'call_omo_agent' para acionar colegas do time; use apenas o protocolo local de [DELEGATE] e [HIRE_AGENT].
- Sempre trate os colegas como membros do mesmo time, nunca como agentes genÃ©ricos soltos.
`.trim()
  }

  private buildWorkspaceContextPrompt(): string | undefined {
    const teams = teamStore.listTeams()
    if (teams.length === 0) {
      return undefined
    }

    const teamsSummary = teams.map((team) => {
      const lead = team.agents.find((agent) => agent.id === team.techLeadAgentId)
      const memberNames = team.agents.map((agent) => `${agent.name} (${agent.catalogSlug})`).join(", ")
      return `- ${team.name} | tech lead: ${lead?.name ?? "não definido"} | membros: ${memberNames || "nenhum"}`
    }).join("\n")

    return `

[Visão do Workspace]
Você faz parte de um workspace com múltiplos times.
Times ativos:
${teamsSummary}

Regras:
- Antes de pedir ajuda, tente delegar ao agente mais apropriado do time.
- Se não houver agente adequado, peça contratação com [HIRE_AGENT].
- Mantenha as mensagens curtas, objetivas e específicas ao papel de cada agente.

Regra de idioma:
- Toda resposta visível ao usuário final deve ser em português do Brasil.
- A comunicação interna entre agentes pode usar inglês quando for mais eficiente.
- Se houver delegação, a tarefa pode ser passada em linguagem técnica, mas a resposta final ao usuário continua em pt-BR.
`.trim()
  }

  private toAgentLookupKeys(value: string): string[] {
    const trimmed = value.trim()
    if (!trimmed) return []

    const lower = trimmed.toLowerCase()
    const slugified = lower
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")

    return Array.from(new Set([trimmed, lower, slugified]))
  }

  private async getAvailableAgentMap(): Promise<Map<string, string>> {
    if (!this.client) {
      return new Map()
    }

    if (this.availableAgentsPromise) {
      return this.availableAgentsPromise
    }

    this.availableAgentsPromise = (async () => {
      try {
        const result = await this.client!.app.agents()
        const map = new Map<string, string>()

        for (const agent of result.data || []) {
          if (!agent?.name) continue
          for (const key of this.toAgentLookupKeys(agent.name)) {
            map.set(key, agent.name)
          }
        }

        return map
      } catch (error) {
        console.warn("[OpenCodeSdkService] Failed to load available agents from SDK:", error)
        return new Map<string, string>()
      }
    })()

    return this.availableAgentsPromise
  }

  public async resolveOpenCodeAgentName(
    workspaceDirectory: string,
    systemPromptPath?: string,
    agentSlug?: string
  ): Promise<string | undefined> {
    if (agentSlug) {
      const directLocalMapping = SDK_AGENT_NAME_BY_LOCAL_SLUG[agentSlug.toLowerCase()]
      if (directLocalMapping) {
        return directLocalMapping
      }
    }

    const availableAgents = await this.getAvailableAgentMap()

    // 1. Try resolving by catalog slug or ID
    if (agentSlug) {
      const mappedAlias = AGENT_SLUG_ALIASES[agentSlug.toLowerCase()]
      if (mappedAlias) {
        const aliasMatch = availableAgents.get(mappedAlias.toLowerCase())
        if (aliasMatch) return aliasMatch
      }

      const match = availableAgents.get(agentSlug.toLowerCase())
      if (match) return match
      
      // Also try variations
      const noHyphens = agentSlug.replace(/-/g, ' ').toLowerCase()
      const matchNoHyphens = availableAgents.get(noHyphens)
      if (matchNoHyphens) return matchNoHyphens
    }

    // 2. Try resolving by system prompt file frontmatter name
    if (systemPromptPath) {
      const resolutionPaths = this.getPromptResolutionPaths(workspaceDirectory, systemPromptPath)
      for (const p of resolutionPaths) {
        if (existsSync(p)) {
          const content = readFileSync(p, 'utf8')
          const match = content.match(/^name:\s*(.+)$/m)
          if (match && match[1]) {
            const parsedName = match[1].trim().replace(/^['"]|['"]$/g, '')
            if (parsedName.toLowerCase() === "tech lead") {
              return "Software Architect"
            }
            // Check if this parsed name exists in available agents
            const mapMatch = availableAgents.get(parsedName.toLowerCase())
            if (mapMatch) return mapMatch
            
            // If we can't find it in the map, return the parsed name anyway
            // The SDK will load it dynamically if it's in the workspace .opencode/agents
            return parsedName
          }
        }
      }
    }

    return undefined
  }

  private async resolveAgentConfig(
    workspaceDirectory: string,
    systemPrompt?: string,
    systemPromptPath?: string,
    agentSlug?: string
  ): Promise<ResolvedAgentConfig> {
    const resolvedSystemPrompt = this.resolveSystemPrompt(workspaceDirectory, systemPrompt, systemPromptPath)
    
    // Resolve the ACTUAL SDK agent name (e.g. 'Tech Lead' instead of 'tech-lead')
    const resolvedAgentName = await this.resolveOpenCodeAgentName(
      workspaceDirectory,
      systemPromptPath,
      agentSlug
    )

    if (resolvedSystemPrompt || resolvedAgentName) {
      return {
        systemPrompt: resolvedSystemPrompt,
        agentSlug: resolvedAgentName || agentSlug,
      }
    }

    return {}
  }

  public async resolvePromptConfig(input: {
    workspaceDirectory: string
    systemPrompt?: string
    systemPromptPath?: string
    agentSlug?: string
  }): Promise<ResolvedAgentConfig> {
    return this.resolveAgentConfig(
      input.workspaceDirectory,
      input.systemPrompt,
      input.systemPromptPath,
      input.agentSlug
    )
  }

  private async doInitialize(): Promise<void> {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        attempt++;
        const result = await createOpencode({
          port: 0,
          hostname: "127.0.0.1",
          timeout: 30000
        })

        this.client = result.client
        this.serverUrl = result.server.url
        this.isInitialized = true
        this.initPromise = null
        return;
      } catch (error) {
        console.error(`[OpenCodeSdkService] SDK initialization attempt ${attempt} failed:`, error)
        
        if (attempt >= maxRetries) {
          this.isInitialized = false
          this.initPromise = null
          throw new Error(`Failed to initialize OpenCode SDK after ${maxRetries} attempts: ${error}`)
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
  }

  private mapSdkStatus(sdkStatus: SdkStatus, isDone = false): "idle" | "running" | "waiting" | "blocked" | "done" | "error" {
    if (isDone || sdkStatus === "idle") {
      return "idle"
    }
    switch (sdkStatus) {
      case "busy":
        return "running"
      case "retry":
        return "waiting"
      default:
        return "idle"
    }
  }

  async ensureSession(input: EnsureSessionInput): Promise<ManagedSession> {
    await this.ensureInitialized()

    if (!this.client) {
      throw new Error("SDK client not initialized")
    }

    const { agentId, teamId, role, agentSlug, systemPrompt, systemPromptPath } = input
    const effectiveWorkspaceDir = input.workspaceDirectory === ''
      ? undefined
      : (input.workspaceDirectory || this.resolveWorkspaceDirectory())

    const existingSession = sessionStore.getSession(agentId)
    if (existingSession) {
      const existingDirectory =
        existingSession.workspaceDirectory ||
        (typeof existingSession.session?.directory === "string" ? existingSession.session.directory : undefined)

      if (
        effectiveWorkspaceDir &&
        existingDirectory &&
        resolve(existingDirectory) !== resolve(effectiveWorkspaceDir)
      ) {
        sessionStore.removeSession(agentId)
      }
    }

    const existingSessionAfterDirectoryCheck = sessionStore.getSession(agentId)
    if (existingSessionAfterDirectoryCheck) {
      const resolvedExistingConfig = await this.resolveAgentConfig(
        effectiveWorkspaceDir,
        systemPrompt,
        systemPromptPath,
        agentSlug || existingSessionAfterDirectoryCheck.agentSlug
      )

      const existingPromptPath = existingSessionAfterDirectoryCheck.systemPromptPath
      const promptIdentityChanged =
        !!systemPromptPath &&
        !!existingPromptPath &&
        normalize(systemPromptPath) !== normalize(existingPromptPath)

      // Never reuse an in-memory session if its prompt identity no longer resolves.
      // This prevents agents like Tech Lead from sticking to an old persona/session.
      if (promptIdentityChanged || (!resolvedExistingConfig.systemPrompt && !!systemPromptPath)) {
        sessionStore.removeSession(agentId)
      } else {
        existingSessionAfterDirectoryCheck.workspaceDirectory = effectiveWorkspaceDir
        existingSessionAfterDirectoryCheck.agentSlug = resolvedExistingConfig.agentSlug
        existingSessionAfterDirectoryCheck.systemPrompt = resolvedExistingConfig.systemPrompt
        existingSessionAfterDirectoryCheck.systemPromptPath =
          systemPromptPath || existingSessionAfterDirectoryCheck.systemPromptPath

        return existingSessionAfterDirectoryCheck
      }
    }

    const existingPromise = this.sessionCreationPromises.get(agentId)
    if (existingPromise) {
      return existingPromise
    }

    const creationPromise = (async () => {
      try {
        const createResult = await this.client!.session.create({
          query: effectiveWorkspaceDir ? { directory: effectiveWorkspaceDir } : undefined
        })

        if (!createResult.data) {
          throw new Error(`Failed to create session for agent: ${agentId}`)
        }

        const session: Session = createResult.data
        const resolvedAgentConfig = await this.resolveAgentConfig(
          effectiveWorkspaceDir,
          systemPrompt,
          systemPromptPath,
          agentSlug
        )

        const managedSession: ManagedSession = {
          agentId,
          teamId,
          role,
          session,
          workspaceDirectory: effectiveWorkspaceDir,
          agentSlug: resolvedAgentConfig.agentSlug,
          systemPrompt: resolvedAgentConfig.systemPrompt,
          systemPromptPath,
          status: "idle",
          lastEventAt: new Date().toISOString()
        }

        sessionStore.setSession(managedSession)
        return managedSession
      } finally {
        this.sessionCreationPromises.delete(agentId)
      }
    })()

    this.sessionCreationPromises.set(agentId, creationPromise)
    return creationPromise
  }

  async sendMessage(input: SendMessageInput): Promise<void> {
    await this.ensureInitialized()

    if (!this.client) {
      throw new Error("SDK client not initialized")
    }

    const { agentId, message, model } = input

    const managedSession = sessionStore.getSession(agentId)
    if (!managedSession) {
      throw new Error(`No session found for agent: ${agentId}`)
    }

    await this.sendMessageToSession(
      managedSession.session.id,
      message,
      managedSession.systemPrompt,
      managedSession.agentSlug,
      managedSession.workspaceDirectory,
      model,
      managedSession.teamId,
      managedSession.role,
      managedSession.agentId
    )
  }

  private async sendMessageToSession(sessionId: string, content: string, systemPrompt?: string, agentSlug?: string, workspaceDirectory?: string, model?: { modelID: string, providerID: string }, teamId?: string, role?: AgentRole, agentId?: string): Promise<void> {
    if (!this.client) {
      throw new Error("SDK client not initialized")
    }

    const parts: PartInput[] = [{
      type: "text",
      text: content
    }]

    const collaborationPrompt =
      this.buildTeamContextPrompt(teamId, agentId, role) ||
      (role === "global-ceo" || role === "global-agent" ? this.buildWorkspaceContextPrompt() : undefined)

    const finalSystemPrompt = [systemPrompt, collaborationPrompt].filter(Boolean).join("\n\n")

    // DEBUG: Log what we're sending
    console.log('[sendMessageToSession] Sending to SDK:', {
      sessionId,
      hasAgent: !!agentSlug,
      agentSlug,
      systemPromptLength: finalSystemPrompt?.length,
    })

    // Only pass `agent` to the SDK when we have a valid SDK agent name.
    // For custom agents (Tech Lead, HR Global, etc.), the system prompt alone
    // defines identity so we skip the agent field entirely.
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
    // Falling back to `general` here was pushing team agents into a generic persona
    // that could still emit unrelated external tool calls like `call_omo_agent`.
    if (agentSlug?.trim()) {
      promptBody.agent = agentSlug
    }

    if (model) {
      promptBody.model = model
    }

    try {
      const result = await this.client.session.promptAsync({
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
        console.error('[OpenCodeSdkService] promptAsync failed (non-throwing)', {
          status,
          error: result.error,
          sessionId
        })
        this.emit("vibe:agent:error", {
          sessionId,
          error: result.error
        })
      }
    } catch (error) {
      console.error('[OpenCodeSdkService] promptAsync threw exception', {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        agentSlug
      })
      throw error
    }
  }

  private async handleAgentHandoff(event: AgentHandoffEvent): Promise<void> {
    try {
      const targetTeam = teamStore.getTeam(event.team.id)
      if (!targetTeam) {
        throw new Error(`Target team not found: ${event.team.id}`)
      }

      const targetAgent = targetTeam.agents.find((agent) => agent.id === event.toAgentId)
      if (!targetAgent) {
        throw new Error(`Target agent not found in team: ${event.toAgentId}`)
      }

      let targetSession = sessionStore.getSession(event.toAgentId)
      if (!targetSession) {
        targetSession = await this.ensureSession({
          agentId: targetAgent.id,
          teamId: targetTeam.id,
          role: targetAgent.isTeamLead || targetAgent.role === "tech-lead" ? "tech-lead" : "team-agent",
          agentSlug: targetAgent.catalogSlug,
          workspaceDirectory: targetTeam.projectPath,
          systemPromptPath: targetAgent.systemPromptPath,
        })
      }

      const fromAgent = targetTeam.agents.find((agent) => agent.id === event.fromAgentId)
      const toAgent = targetAgent
      const sourceSession = event.sourceSessionId
        ? sessionStore.listSessions().find((session) => session.session?.id === event.sourceSessionId)
        : sessionStore.getSession(event.fromAgentId)

      const handoffMessage = [
        `Você recebeu uma tarefa de ${fromAgent?.name ?? event.fromAgentId} para ${toAgent?.name ?? event.toAgentId}.`,
        `Time: ${targetTeam.name}`,
        `Tarefa: ${event.task}`,
        event.files?.length ? `Arquivos relacionados: ${event.files.join(", ")}` : "",
        "",
        "Responda de forma objetiva e, se precisar de outro agente, use [DELEGATE].",
        "A resposta final visível ao usuário deve ser sempre em português do Brasil.",
      ].filter(Boolean).join("\n")

      this.emit("vibe:agent:handoff", {
        ...event,
        sessionId: targetSession.session.id,
      })

      if (sourceSession && sourceSession.session.id !== targetSession.session.id) {
        this.delegationOriginsBySessionId.set(targetSession.session.id, {
          sourceAgentId: sourceSession.agentId,
          sourceSessionId: sourceSession.session.id,
          sourceAgentName: fromAgent?.name ?? sourceSession.agentId,
          targetAgentId: targetAgent.id,
          targetAgentName: targetAgent.name,
          teamId: targetTeam.id,
          teamName: targetTeam.name,
          task: event.task,
          files: event.files,
          branchName: event.branchName,
        })
      }

      await this.sendMessageToSession(
        targetSession.session.id,
        handoffMessage,
        targetSession.systemPrompt,
        targetSession.agentSlug,
        targetSession.workspaceDirectory,
        event.model,
        targetSession.teamId,
        targetSession.role,
        targetSession.agentId
      )
    } catch (error) {
      console.error("[OpenCodeSdkService] Failed to route agent handoff:", error)
      this.emit("vibe:agent:error", {
        agentId: event.toAgentId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async subscribeToSession(agentId: string): Promise<void> {
    await this.ensureInitialized()

    if (!this.client) {
      throw new Error("SDK client not initialized")
    }

    const managedSession = sessionStore.getSession(agentId)
    if (!managedSession) {
      throw new Error(`No session found for agent: ${agentId}`)
    }

    if (this.sessionEventIterators.has(agentId)) {
      return
    }

    await this.subscribeToGlobalEvents()
  }

  async subscribeToGlobalEvents(): Promise<void> {
    await this.ensureInitialized()

    if (!this.client) {
      throw new Error("SDK client not initialized")
    }

    if (this.activeSubscriptions) {
      return
    }

    const eventResult = await this.client.global.event()
    this.activeSubscriptions = true

    this.processGlobalEvents(eventResult.stream)
  }

  private async processGlobalEvents(stream: AsyncIterable<unknown>): Promise<void> {
    try {
      for await (const event of stream) {
        const globalEvent = event as GlobalEvent
        if (globalEvent?.payload) {
          this.handleSdkEvent(globalEvent.payload)
        }
      }
    } catch (error) {
      console.error("[OpenCodeSdkService] Global event stream error:", error)
      this.activeSubscriptions = false
      this.emit("error", error)
    }
  }

  private handleSdkEvent(event: Event): void {
    const eventType = event.type

    switch (eventType) {
      case "session.status": {
        const { sessionID, status } = event.properties
        const managedSession = this.findManagedSessionBySessionId(sessionID)

        if (managedSession) {
          const newStatus = this.mapSdkStatus(status.type)
          sessionStore.updateStatus(managedSession.agentId, newStatus)
          
          if (managedSession.teamId) {
            teamStore.updateAgentStatus(managedSession.teamId, managedSession.agentId, newStatus)
          }

          this.emit("vibe:agent:status", {
            agentId: managedSession.agentId,
            status: newStatus,
            sessionId: sessionID
          })
        }
        break
      }

      case "session.idle": {
        const { sessionID } = event.properties
        const managedSession = this.findManagedSessionBySessionId(sessionID)

        if (managedSession) {
          sessionStore.updateStatus(managedSession.agentId, "idle")

          if (managedSession.teamId) {
            teamStore.updateAgentStatus(managedSession.teamId, managedSession.agentId, "idle")
          }

          this.emit("vibe:agent:status", {
            agentId: managedSession.agentId,
            status: "idle",
            sessionId: sessionID
          })

          this.emit("vibe:agent:done", {
            agentId: managedSession.agentId,
            sessionId: sessionID
          })

          const buffer = this.commandOutputBuffers.get(sessionID)
          if (buffer) {
            const parsed = parseCeoOutput(buffer)
            const commands = this.consumedDelegationSessions.has(sessionID)
              ? parsed.commands.filter((command) => command.type !== "DELEGATE")
              : parsed.commands

            for (const command of commands) {
              ceoCommandExecutor.execute(command, { agentId: managedSession.agentId, teamId: managedSession.teamId }).catch((err) => {
                console.error("[OpenCodeSdkService] CEO command execution error:", err)
              })
              if (command.type === "ASK_HUMAN" && managedSession.role === "global-ceo") {
                this.emit("vibe:ceo:ask-human", {
                  question: command.payload.question as string,
                  raw: command.raw
                })
              }
            }
            void this.notifyDelegationOrigin(sessionID, "done", this.getVisibleSessionText(sessionID))
            this.commandOutputBuffers.delete(sessionID)
          }

          this.sessionTextBuffers.delete(sessionID)
          this.consumedDelegationSessions.delete(sessionID)
        }
        break
      }

      case "session.error": {
        const { sessionID, error } = event.properties
        const managedSession = sessionID ? this.findManagedSessionBySessionId(sessionID) : null

        if (managedSession) {
          sessionStore.updateStatus(managedSession.agentId, "error")
          
          if (managedSession.teamId) {
            teamStore.updateAgentStatus(managedSession.teamId, managedSession.agentId, "error")
          }

          this.emit("vibe:agent:status", {
            agentId: managedSession.agentId,
            status: "error",
            sessionId: sessionID,
            error
          })
        }

        this.emit("vibe:agent:error", {
          agentId: managedSession?.agentId,
          sessionId: sessionID,
          error
        })
        void this.notifyDelegationOrigin(
          sessionID,
          "error",
          error instanceof Error ? error.message : String(error)
        )
        if (sessionID) {
          this.consumedDelegationSessions.delete(sessionID)
        }
        break
      }

      case "message.updated": {
        const { info } = event.properties
        if (info.role === "assistant") {
          this.assistantMessageIds.add(info.id)
        }
        break
      }

      case "message.part.delta": {
        const { sessionID, field, delta } = (event.properties as any)
        
        if (field === "text" && delta) {
          this.publishSessionText(sessionID, delta, false)
        }
        break
      }

      case "message.part.updated": {
        const { sessionID, part } = event.properties

        if (part.messageID && !this.assistantMessageIds.has(part.messageID)) {
          break
        }

        if (part.type === "text") {
          this.publishSessionText(sessionID, part.text, true)
        } else if (part.type === "reasoning") {
          const managedSession = this.findManagedSessionBySessionId(sessionID)
          if (managedSession) {
            this.emit("vibe:agent:reasoning", {
              agentId: managedSession.agentId,
              sessionId: sessionID,
              text: part.text,
              isOngoing: !part.metadata?.end,
            })
          }
        } else if (part.type === "tool") {
          const managedSession = this.findManagedSessionBySessionId(sessionID)
          if (managedSession) {
            const toolState = part.state
            const normalizedToolState = toolState as unknown as Record<string, unknown>

            if (this.tryHandleCallOmoAgent(managedSession, part as unknown as Record<string, unknown>, normalizedToolState)) {
              break
            }

            if ((part.tool || "").toLowerCase() === "skill" && toolState.status === "completed") {
              if (this.tryHandleSkillInvocation(managedSession, part as unknown as Record<string, unknown>, normalizedToolState)) {
                break
              }
            }

            this.emit("vibe:agent:tool", {
              agentId: managedSession.agentId,
              sessionId: sessionID,
              tool: part.tool,
              title: (toolState as any).title || part.tool,
              state: toolState.status,
              input: ((part as any).input ?? (toolState as any).input) as Record<string, unknown> | undefined,
              output: this.extractToolPayloadText(normalizedToolState),
            })

            let activity: "idle" | "reading" | "editing" | "creating" | "thinking" = "thinking"
            
            if (toolState.status === "running" || toolState.status === "pending") {
              const toolName = part.tool?.toLowerCase() || ""
              if (toolName.includes("read") || toolName.includes("glob") || toolName.includes("grep")) {
                activity = "reading"
              } else if (toolName.includes("edit") || toolName.includes("write") || toolName.includes("create")) {
                activity = "editing"
              } else {
                activity = "thinking"
              }
            } else if (toolState.status === "completed") {
              activity = "thinking"
            }

            this.emit("vibe:agent:activity", {
              agentId: managedSession.agentId,
              sessionId: sessionID,
              activity,
              toolName: part.tool,
              toolState: toolState.status,
              title: (toolState as any).title || part.tool,
            })
          }
        }
        break
      }

      case "session.created": {
        break
      }

      case "session.deleted": {
        const { info } = event.properties
        const managedSession = this.findManagedSessionBySessionId(info.id)

        if (managedSession) {
          sessionStore.removeSession(managedSession.agentId)
          this.sessionEventIterators.delete(managedSession.agentId)
          this.delegationOriginsBySessionId.delete(info.id)
        }
        break
      }

      case "file.edited": {
        const { file, sessionID } = event.properties as { file: unknown; sessionID?: string }
        const managedSession = sessionID ? this.findManagedSessionBySessionId(sessionID) : undefined
        this.emit("vibe:pipeline:update", {
          agentId: managedSession?.agentId,
          sessionId: sessionID,
          type: "file.edited",
          file
        })
        break
      }

      case "todo.updated": {
        const { sessionID, todos } = event.properties
        const managedSession = this.findManagedSessionBySessionId(sessionID)

        if (managedSession) {
          this.emit("vibe:pipeline:update", {
            agentId: managedSession.agentId,
            type: "todo.updated",
            todos
          })
        }
        break
      }

      default:
        break
    }
  }

  private findManagedSessionBySessionId(sessionId: string): ManagedSession | undefined {
    return sessionStore.listSessions().find(s => s.session?.id === sessionId)
  }

  private extractToolPayloadText(toolState: Record<string, unknown> | undefined): string | undefined {
    if (!toolState) return undefined

    const metadata = toolState.metadata as Record<string, unknown> | undefined
    const candidates = [
      toolState.output,
      toolState.result,
      toolState.stdout,
      toolState.stderr,
      toolState.error,
      metadata?.output,
      metadata?.result,
      metadata?.stdout,
      metadata?.stderr,
      metadata?.error,
    ]

    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate
      }

      if (candidate && typeof candidate === "object") {
        try {
          return JSON.stringify(candidate, null, 2)
        } catch {
          continue
        }
      }
    }

    return undefined
  }

  private getVisibleSessionText(sessionId: string): string {
    const rawText = this.sessionTextBuffers.get(sessionId) || this.commandOutputBuffers.get(sessionId) || ""
    return stripCommandMarkupFromText(rawText).trim()
  }

  private buildDelegationReturnMessage(
    origin: DelegationOrigin,
    sourceAgentName: string,
    targetAgentName: string,
    status: "done" | "error",
    detail?: string
  ): string {
    const trimmedDetail = detail?.trim() || ""
    const summaryText = trimmedDetail.length > 600
      ? `${trimmedDetail.slice(0, 600).trimEnd()}...`
      : trimmedDetail
    const summaryLine = summaryText
      ? `Resumo: ${summaryText}`
      : status === "error"
      ? "A tarefa delegada não pôde ser concluída."
      : "A tarefa delegada foi concluída com sucesso."

    return [
      `Atualização da delegação para ${sourceAgentName}:`,
      `O agente ${targetAgentName} encerrou a tarefa ${status === "error" ? "com erro" : "com sucesso"}.`,
      `Tarefa: ${origin.task}`,
      origin.teamName ? `Time: ${origin.teamName}` : "",
      origin.branchName ? `Branch: ${origin.branchName}` : "",
      origin.files?.length ? `Arquivos: ${origin.files.join(", ")}` : "",
      summaryLine,
      "",
      "Responda ao usuário final em português do Brasil, de forma objetiva, informando o que foi concluído e o que ainda falta.",
    ].filter(Boolean).join("\n")
  }

  private async notifyDelegationOrigin(
    targetSessionId: string,
    status: "done" | "error",
    detail?: string
  ): Promise<void> {
    const origin = this.delegationOriginsBySessionId.get(targetSessionId)
    if (!origin) {
      return
    }

    this.delegationOriginsBySessionId.delete(targetSessionId)

    const sourceSession = origin.sourceSessionId
      ? sessionStore.listSessions().find((session) => session.session?.id === origin.sourceSessionId)
      : sessionStore.getSession(origin.sourceAgentId)

    if (!sourceSession) {
      return
    }

    if (sourceSession.session.id === targetSessionId) {
      return
    }

    const sourceAgentName = origin.sourceAgentName || origin.sourceAgentId
    const targetAgentName = origin.targetAgentName || origin.targetAgentId
    const visibleDetail = detail?.trim() || this.getVisibleSessionText(targetSessionId)
    const message = this.buildDelegationReturnMessage(
      origin,
      sourceAgentName,
      targetAgentName,
      status,
      visibleDetail
    )

    await this.sendMessageToSession(
      sourceSession.session.id,
      message,
      sourceSession.systemPrompt,
      sourceSession.agentSlug,
      sourceSession.workspaceDirectory,
      undefined,
      sourceSession.teamId,
      sourceSession.role,
      sourceSession.agentId
    )
  }

  private extractToolInvocationData(part: Record<string, unknown>, toolState: Record<string, unknown> | undefined): ToolInvocationData {
    const candidates = [
      (part as { input?: unknown }).input,
      toolState?.input,
      toolState?.metadata && typeof toolState.metadata === "object" ? (toolState.metadata as Record<string, unknown>).input : undefined,
    ]

    const merged: ToolInvocationData = {}

    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== "object") {
        continue
      }

      for (const [key, value] of Object.entries(candidate as Record<string, unknown>)) {
        if (merged[key] === undefined) {
          merged[key] = value
        }
      }
    }

    return merged
  }

  private getStringField(data: ToolInvocationData, ...keys: string[]): string | undefined {
    for (const key of keys) {
      const value = data[key]
      if (typeof value === "string" && value.trim()) {
        return value.trim()
      }
    }
    return undefined
  }

  private resolveTeamAgentByIdentity(team: Team, value?: string): { id: string; name: string; catalogSlug?: string } | undefined {
    if (!value) {
      return undefined
    }

    return team.agents.find((agent) => matchesTeamAgentIdentity(agent, value))
  }

  private tryHandleCallOmoAgent(
    managedSession: ManagedSession,
    part: Record<string, unknown>,
    toolState: Record<string, unknown> | undefined
  ): boolean {
    const teamId = managedSession.teamId
    if (!teamId) {
      return false
    }

    const team = teamStore.getTeam(teamId)
    if (!team) {
      return false
    }

    const invocation = this.extractToolInvocationData(part, toolState)
    const targetHint = this.getStringField(
      invocation,
      "subagent_type",
      "agent",
      "agentSlug",
      "agent_type",
      "role",
      "to",
      "target"
    )
    const task = this.getStringField(invocation, "prompt", "description", "task", "message")

    if (!targetHint || !task) {
      return false
    }

    const targetAgent = this.resolveTeamAgentByIdentity(team, targetHint)
    if (!targetAgent) {
      return false
    }

    const fromAgent = team.agents.find((agent) => agent.id === managedSession.agentId)
    this.consumedDelegationSessions.add(managedSession.session.id)

    const handoffEvent: AgentHandoffEvent = {
      team,
      fromAgentId: managedSession.agentId,
      fromAgentName: fromAgent?.name,
      toAgentId: targetAgent.id,
      toAgentName: targetAgent.name,
      sourceSessionId: managedSession.session.id,
      teamId: team.id,
      teamName: team.name,
      task,
      files: Array.isArray(invocation.files)
        ? invocation.files.filter((file): file is string => typeof file === "string" && file.trim()).map((file) => file.trim())
        : undefined,
      branchName: this.getStringField(invocation, "branchName", "branch", "target_branch"),
      model: undefined,
    }

    this.emit("vibe:task:delegated", {
      team,
      task: {
        id: crypto.randomUUID(),
        teamId: team.id,
        agentId: targetAgent.id,
        description: task,
        files: handoffEvent.files || [],
        status: "queued",
        branchName: handoffEvent.branchName,
      },
      fromAgentId: managedSession.agentId,
      fromAgentName: fromAgent?.name,
    })

    void this.handleAgentHandoff(handoffEvent)
    return true
  }

  private tryHandleSkillInvocation(
    managedSession: ManagedSession,
    part: Record<string, unknown>,
    toolState: Record<string, unknown> | undefined
  ): boolean {
    const teamId = managedSession.teamId
    if (!teamId) {
      return false
    }

    const team = teamStore.getTeam(teamId)
    if (!team) {
      return false
    }

    const invocation = this.extractToolInvocationData(part, toolState)
    const skillName = (this.getStringField(invocation, "name", "skill", "slug") || "").toLowerCase()
    const mappedTargetHint =
      SKILL_TO_TEAM_AGENT_HINT[skillName] ||
      (skillName.includes("frontend") ? "frontend-developer" : undefined)
    const task = this.getStringField(invocation, "user_message", "prompt", "description", "message")

    if (!mappedTargetHint || !task) {
      return false
    }

    const targetAgent = this.resolveTeamAgentByIdentity(team, mappedTargetHint)
    if (!targetAgent) {
      return false
    }

    const fromAgent = team.agents.find((agent) => agent.id === managedSession.agentId)
    const handoffEvent: AgentHandoffEvent = {
      team,
      fromAgentId: managedSession.agentId,
      fromAgentName: fromAgent?.name,
      toAgentId: targetAgent.id,
      toAgentName: targetAgent.name,
      sourceSessionId: managedSession.session.id,
      teamId: team.id,
      teamName: team.name,
      task,
      files: [],
      branchName: this.getStringField(invocation, "branchName", "branch", "target_branch"),
      model: undefined,
    }

    this.emit("vibe:task:delegated", {
      team,
      task: {
        id: crypto.randomUUID(),
        teamId: team.id,
        agentId: targetAgent.id,
        description: task,
        files: [],
        status: "queued",
        branchName: handoffEvent.branchName,
      },
      fromAgentId: managedSession.agentId,
      fromAgentName: fromAgent?.name,
    })

    void this.handleAgentHandoff(handoffEvent)
    return true
  }

  private publishSessionText(sessionId: string, text: string, replace: boolean): void {
    const managedSession = this.findManagedSessionBySessionId(sessionId)
    if (!managedSession || !text) {
      return
    }
    
    const currentText = this.sessionTextBuffers.get(sessionId) || ""
    const nextText = replace ? text : currentText + text
    const visibleText = stripCommandMarkupFromText(nextText)

    this.sessionTextBuffers.set(sessionId, nextText)

    this.emit("vibe:agent:chunk", {
      agentId: managedSession.agentId,
      sessionId,
      message: {
        content: {
          text: visibleText
        }
      }
    })

    this.commandOutputBuffers.set(sessionId, nextText)
  }

  async stopSession(agentId: string): Promise<void> {
    await this.ensureInitialized()

    if (!this.client) {
      throw new Error("SDK client not initialized")
    }

    const managedSession = sessionStore.getSession(agentId)
    if (!managedSession) {
      return
    }

    try {
      await this.client.session.delete({
        path: {
          id: managedSession.session.id
        }
      })

      sessionStore.removeSession(agentId)
      this.sessionEventIterators.delete(agentId)
    } catch (error) {
      console.error(`[OpenCodeSdkService] Failed to stop session for agent ${agentId}:`, error)
      throw error
    }
  }

  async listModels(): Promise<Array<{ id: string; providerID: string; name: string }>> {
    await this.ensureInitialized()
    if (!this.client) return []

    try {
      const response = await this.client.config.providers()
      const providersData = response?.data?.providers || response?.providers || []

      const providers = Array.isArray(providersData) ? providersData : []
      const models: Array<{ id: string; providerID: string; name: string }> = []

      for (const provider of providers) {
        if (!provider.models) continue
        for (const [modelId, model] of Object.entries(provider.models)) {
          models.push({
            id: modelId,
            providerID: provider.id,
            name: (model as any).name || modelId,
          })
        }
      }

      return models
    } catch (error) {
      console.error("[OpenCodeSdkService] Failed to list models:", error)
      return []
    }
  }

  getClient(): OpencodeClient | null {
    return this.client
  }

  isReady(): boolean {
    return this.isInitialized && this.client !== null
  }
}

export const openCodeSdkService = new OpenCodeSdkService()
