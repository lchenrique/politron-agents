import { EventEmitter } from "events"
import * as cp from "child_process"
import { existsSync, readFileSync } from "fs"
import { basename, dirname, join, resolve } from "path"
import { createOpencode } from "@opencode-ai/sdk"
import type { OpencodeClient } from "@opencode-ai/sdk/dist/v2/client"
import type { Session, GlobalEvent, Event } from "@opencode-ai/sdk/dist/gen/types.gen"
import { sessionStore, type AgentRole, type ManagedSession } from "./session-store"
import { teamStore } from "./team-store"
import { parseCeoOutput } from "./ceo-output-parser"
import { ceoCommandExecutor } from "./ceo-command-executor"

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

const AGENT_SLUG_ALIASES: Record<string, string> = {
  "frontend-dev": "frontend-developer",
  "backend-dev": "backend-architect",
  "qa-tester": "reality-checker",
  "devops-eng": "devops-automator",
  "ux-designer": "ui-designer",
  "studio-producer": "software-architect",
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

  constructor() {
    super()
    this.setMaxListeners(100)
  }

  async initialize(): Promise<void> {
    await this.ensureInitialized()
  }

  private resolveWorkspaceDirectory(): string {
    const searchMarkers = [".git", "AGENTS.md", ".opencode"]
    let current = __dirname
    
    console.log(`[OpenCodeSdkService] Resolving workspace root starting from: ${current}`)

    for (let i = 0; i < 10; i++) {
      for (const marker of searchMarkers) {
        if (existsSync(join(current, marker))) {
          console.log(`[OpenCodeSdkService] Found marker "${marker}" at: ${current}`)
          return current
        }
      }

      const parent = dirname(current)
      if (parent === current) break
      current = parent
    }

    console.log(`[OpenCodeSdkService] Fallback to process.cwd(): ${process.cwd()}`)
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

  private getPromptResolutionPaths(workspaceDirectory: string, systemPromptPath?: string): string[] {
    if (!systemPromptPath) {
      return []
    }

    const candidates = new Set<string>()

    if (systemPromptPath === resolve(systemPromptPath)) {
      candidates.add(systemPromptPath)
      return Array.from(candidates)
    }

    candidates.add(resolve(workspaceDirectory, systemPromptPath))
    candidates.add(resolve(this.resolveWorkspaceDirectory(), systemPromptPath))

    return Array.from(candidates)
  }

  private resolveSystemPrompt(
    workspaceDirectory: string,
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
    const availableAgents = await this.getAvailableAgentMap()
    const candidates: string[] = []

    if (agentSlug) {
      candidates.push(agentSlug)
      const aliasedSlug = AGENT_SLUG_ALIASES[agentSlug]
      if (aliasedSlug) {
        candidates.push(aliasedSlug)
      }
    }

    if (systemPromptPath) {
      const normalizedPath = systemPromptPath.replace(/\\/g, "/")
      const fileSlug = basename(normalizedPath, ".md")
      candidates.push(fileSlug)
      const aliasedFileSlug = AGENT_SLUG_ALIASES[fileSlug]
      if (aliasedFileSlug) {
        candidates.push(aliasedFileSlug)
      }

      for (const absolutePromptPath of this.getPromptResolutionPaths(workspaceDirectory, systemPromptPath)) {
        if (!existsSync(absolutePromptPath)) {
          continue
        }

        const fileContent = readFileSync(absolutePromptPath, "utf8")
        const match = fileContent.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/m)
        const frontmatterBlock = match?.[1]
        const nameLine = frontmatterBlock?.match(/(?:^|\r?\n)name:\s*(.+)\s*$/m)
        const rawName = nameLine?.[1]?.trim().replace(/^['"]|['"]$/g, "")
        if (rawName) {
          candidates.push(rawName)
        }
        break
      }
    }

    for (const candidate of candidates) {
      for (const key of this.toAgentLookupKeys(candidate)) {
        const resolved = availableAgents.get(key)
        if (resolved) {
          return resolved
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
    if (resolvedSystemPrompt) {
      return {
        systemPrompt: resolvedSystemPrompt
      }
    }

    const resolvedAgentName = await this.resolveOpenCodeAgentName(workspaceDirectory, systemPromptPath, agentSlug)

    if (resolvedAgentName) {
      return {
        agentSlug: resolvedAgentName
      }
    }

    if (agentSlug) {
      return {
        agentSlug
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
        console.log(`[OpenCodeSdkService] SDK initialization attempt ${attempt}/${maxRetries}...`)
        
        const result = await createOpencode({
          port: 0,
          hostname: "127.0.0.1",
          timeout: 30000
        })

        this.client = result.client
        this.serverUrl = result.server.url
        this.isInitialized = true
        this.initPromise = null
        console.log("[OpenCodeSdkService] SDK initialized successfully, server running at:", this.serverUrl)
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

      existingSessionAfterDirectoryCheck.workspaceDirectory = effectiveWorkspaceDir
      existingSessionAfterDirectoryCheck.agentSlug = resolvedExistingConfig.agentSlug
      existingSessionAfterDirectoryCheck.systemPrompt = resolvedExistingConfig.systemPrompt
      existingSessionAfterDirectoryCheck.systemPromptPath =
        systemPromptPath || existingSessionAfterDirectoryCheck.systemPromptPath

      return existingSessionAfterDirectoryCheck
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
      managedSession.agentSlug ? undefined : managedSession.systemPrompt,
      managedSession.agentSlug,
      managedSession.workspaceDirectory,
      model
    )
  }

  private async sendMessageToSession(sessionId: string, content: string, systemPrompt?: string, agentSlug?: string, workspaceDirectory?: string, model?: { modelID: string, providerID: string }): Promise<void> {
    if (!this.client) {
      throw new Error("SDK client not initialized")
    }

    console.log('[OpenCodeSdkService] sendMessageToSession called', {
      sessionId,
      agentSlug,
      workspaceDirectory,
      contentPreview: content.substring(0, 100)
    })

    const parts: PartInput[] = [{
      type: "text",
      text: content
    }]

    const finalSystemPrompt = agentSlug ? undefined : systemPrompt

    try {
      const result = await this.client.session.promptAsync({
        body: {
          parts,
          system: finalSystemPrompt,
          agent: agentSlug,
          model: model
        },
        path: {
          id: sessionId
        },
        query: workspaceDirectory ? { directory: workspaceDirectory } : undefined
      })

      console.log('[OpenCodeSdkService] promptAsync response', {
        status: result.response?.status,
        hasData: !!result.data,
        error: result.error
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
            for (const command of parsed.commands) {
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
            this.commandOutputBuffers.delete(sessionID)
          }

          this.sessionTextBuffers.delete(sessionID)
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

  private publishSessionText(sessionId: string, text: string, replace: boolean): void {
    const managedSession = this.findManagedSessionBySessionId(sessionId)
    if (!managedSession || !text) {
      return
    }
    
    const currentText = this.sessionTextBuffers.get(sessionId) || ""
    const nextText = replace ? text : currentText + text

    this.sessionTextBuffers.set(sessionId, nextText)

    this.emit("vibe:agent:chunk", {
      agentId: managedSession.agentId,
      sessionId,
      message: {
        content: {
          text: nextText
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
