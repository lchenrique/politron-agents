import { EventEmitter } from "events"
import * as cp from "child_process"
import { existsSync, readFileSync, mkdirSync } from "fs"
import { basename, dirname, join, resolve } from "path"
import * as os from "os"
import { createOpencode } from "@opencode-ai/sdk"
import type { OpencodeClient } from "@opencode-ai/sdk/dist/v2/client"
import type { Session, GlobalEvent, Event } from "@opencode-ai/sdk/dist/gen/types.gen"
import { sessionStore, type AgentRole, type ManagedSession } from "./session-store"
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

const GLOBAL_CEO_PATH = join(os.homedir(), '.politron', 'global-ceo')
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
  private ceoOutputBuffers: Map<string, string> = new Map()
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

    // Max 10 levels up to find the project root
    for (let i = 0; i < 10; i++) {
      // Check if ANY of the markers exist in the current directory
      for (const marker of searchMarkers) {
        if (existsSync(join(current, marker))) {
          // Extra check: if we found .opencode, but we are inside apps/desktop, 
          // we might want to keep going up if there's a higher one.
          // But usually, finding .git or .opencode is enough.
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

    const absolutePromptPath = resolve(workspaceDirectory, systemPromptPath)
    if (!existsSync(absolutePromptPath)) {
      console.warn(`[OpenCodeSdkService] Prompt file not found: ${absolutePromptPath}`)
      return undefined
    }

    const fileContent = readFileSync(absolutePromptPath, 'utf8')
    return this.stripFrontmatter(fileContent)
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

  private async resolveOpenCodeAgentName(
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

      const absolutePromptPath = resolve(workspaceDirectory, systemPromptPath)
      if (existsSync(absolutePromptPath)) {
        const fileContent = readFileSync(absolutePromptPath, "utf8")
        const match = fileContent.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/m)
        const frontmatterBlock = match?.[1]
        const nameLine = frontmatterBlock?.match(/(?:^|\r?\n)name:\s*(.+)\s*$/m)
        const rawName = nameLine?.[1]?.trim().replace(/^['"]|['"]$/g, "")
        if (rawName) {
          candidates.push(rawName)
        }
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

    return candidates[0]
  }

  private async resolveAgentConfig(
    workspaceDirectory: string,
    systemPrompt?: string,
    systemPromptPath?: string,
    agentSlug?: string
  ): Promise<ResolvedAgentConfig> {
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

    return {
      systemPrompt: this.resolveSystemPrompt(workspaceDirectory, systemPrompt, systemPromptPath)
    }
  }

  private async doInitialize(): Promise<void> {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        attempt++;
        console.log(`[OpenCodeSdkService] SDK initialization attempt ${attempt}/${maxRetries}...`)
        
        // Increased timeout (30s) and using port 0 for dynamic allocation
        const result = await createOpencode({
          port: 0,
          hostname: "127.0.0.1",
          timeout: 30000
        })

        this.client = result.client
        this.serverUrl = result.server.url
        this.isInitialized = true
        this.initPromise = null // Clear promise on success
        console.log("[OpenCodeSdkService] SDK initialized successfully, server running at:", this.serverUrl)
        return;
      } catch (error) {
        console.error(`[OpenCodeSdkService] SDK initialization attempt ${attempt} failed:`, error)
        
        if (attempt >= maxRetries) {
          this.isInitialized = false
          this.initPromise = null
          throw new Error(`Failed to initialize OpenCode SDK after ${maxRetries} attempts: ${error}`)
        }
        
        // Wait 1s before next attempt
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
    console.log(`[OpenCodeSdkService] ensureSession called for ${agentId}, workspaceDirectory from input: ${input.workspaceDirectory}`)
    if (role !== "global-ceo" && !input.workspaceDirectory?.trim()) {
      throw new Error(`Project agent ${agentId} requires an explicit workspaceDirectory`)
    }
    const effectiveWorkspaceDir = input.workspaceDirectory === ''
      ? GLOBAL_CEO_PATH
      : (input.workspaceDirectory || this.resolveWorkspaceDirectory())
    console.log(`[OpenCodeSdkService] effectiveWorkspaceDir resolved to: ${effectiveWorkspaceDir}`)

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
        console.log(`[OpenCodeSdkService] Discarding resumed session for ${agentId} because directory changed`, {
          previousDirectory: existingDirectory,
          nextDirectory: effectiveWorkspaceDir,
        })
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

      if (resolvedExistingConfig.agentSlug && existingSessionAfterDirectoryCheck.agentSlug !== resolvedExistingConfig.agentSlug) {
        console.log(`[OpenCodeSdkService] Updating resumed session agent slug for ${agentId}`, {
          previousAgentSlug: existingSessionAfterDirectoryCheck.agentSlug,
          nextAgentSlug: resolvedExistingConfig.agentSlug,
        })
        existingSessionAfterDirectoryCheck.agentSlug = resolvedExistingConfig.agentSlug
      }

      console.log(`[OpenCodeSdkService] Resuming existing session for agent: ${agentId}`)
      return existingSessionAfterDirectoryCheck
    }

    // Check if session is already being created
    const existingPromise = this.sessionCreationPromises.get(agentId)
    if (existingPromise) {
      console.log(`[OpenCodeSdkService] A session is already being created for agent: ${agentId}, waiting for it...`)
      return existingPromise
    }

    // Create a new creation promise
    const creationPromise = (async () => {
      try {
        console.log(`[OpenCodeSdkService] Creating new session for agent: ${agentId}, role: ${role}`)

        // Empty string means "global CEO" mode - use global CEO folder
        // Only use default resolution if workspaceDirectory is undefined, not empty string
        // Ensure global CEO folder exists
        if (effectiveWorkspaceDir === GLOBAL_CEO_PATH) {
          if (!existsSync(GLOBAL_CEO_PATH)) {
            mkdirSync(GLOBAL_CEO_PATH, { recursive: true })
            console.log('[OpenCodeSdkService] Created global CEO folder:', GLOBAL_CEO_PATH)
          }
        }

        console.log(`[OpenCodeSdkService] Creating session with directory: ${effectiveWorkspaceDir}`)
        const createResult = await this.client!.session.create({
          query: effectiveWorkspaceDir ? { directory: effectiveWorkspaceDir } : undefined
        })
        console.log(`[OpenCodeSdkService] Session created! Session ID: ${createResult.data?.id}, Session directory: ${createResult.data?.directory}`)

        if (!createResult.data) {
          console.error("[OpenCodeSdkService] Session creation failed", {
            agentId,
            role,
            effectiveWorkspaceDir,
            result: createResult
          })
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
          status: "idle",
          lastEventAt: new Date().toISOString()
        }

        sessionStore.setSession(managedSession)

        console.log(`[OpenCodeSdkService] Resolved agent config for ${agentId}`, {
          requestedAgentSlug: agentSlug,
          resolvedAgentSlug: resolvedAgentConfig.agentSlug,
          systemPromptPath,
          hasSystemPrompt: !!resolvedAgentConfig.systemPrompt
        })

        console.log(`[OpenCodeSdkService] Session created: ${session.id} for agent: ${agentId}`)
        return managedSession
      } finally {
        // Clean up the promise from the map once finished (success or error)
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

    const { agentId, message } = input

    const managedSession = sessionStore.getSession(agentId)
    if (!managedSession) {
      console.error(`[OpenCodeSdkService] No session found for agent: ${agentId}`)
      throw new Error(`No session found for agent: ${agentId}`)
    }

    console.log(`[OpenCodeSdkService] sendMessage for ${agentId}, message: "${message.substring(0, 50)}...", sessionId: ${managedSession.session.id}, workspaceDirectory: ${managedSession.workspaceDirectory}`)
    await this.sendMessageToSession(managedSession.session.id, message, undefined, managedSession.agentSlug, managedSession.workspaceDirectory)
  }

  private async sendMessageToSession(sessionId: string, content: string, systemPrompt?: string, agentSlug?: string, workspaceDirectory?: string): Promise<void> {
    if (!this.client) {
      throw new Error("SDK client not initialized")
    }

    const parts: PartInput[] = [{
      type: "text",
      text: content
    }]

    // Direct conversations in this app should route via body.agent only.
    // Sending an AgentPart as well makes the model treat the request like a
    // sub-agent delegation task, which leads to unexpected planning/todo behavior.
    const finalSystemPrompt = agentSlug ? undefined : systemPrompt

    console.log(`[OpenCodeSdkService] Prompting session ${sessionId}:`, {
      agent: agentSlug,
      hasSystem: !!finalSystemPrompt,
      partsCount: parts.length,
      queryDirectory: workspaceDirectory
    })

    const result = await this.client.session.promptAsync({
      body: {
        parts,
        system: finalSystemPrompt,
        agent: agentSlug
      },
      path: {
        id: sessionId
      },
      query: workspaceDirectory ? { directory: workspaceDirectory } : undefined
    })

    const status = result.response?.status
    const isSuccessfulResponse =
      typeof status === "number" ? status >= 200 && status < 300 : !!result.data

    if (!isSuccessfulResponse) {
      console.error(`[OpenCodeSdkService] Failed to send message to session ${sessionId}:`, {
        error: result.error,
        status,
        data: result.data
      })
      this.emit("vibe:agent:error", {
        sessionId,
        error: result.error
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
      console.log(`[OpenCodeSdkService] Already subscribed to session: ${agentId}`)
      return
    }

    console.log(`[OpenCodeSdkService] Subscribing to session events: ${agentId}`)
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

    console.log("[OpenCodeSdkService] Subscribing to global events")

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

          this.emit("vibe:agent:status", {
            agentId: managedSession.agentId,
            status: "idle",
            sessionId: sessionID
          })

          this.emit("vibe:agent:done", {
            agentId: managedSession.agentId,
            sessionId: sessionID
          })

          if (managedSession.role === "global-ceo") {
            const buffer = this.ceoOutputBuffers.get(sessionID)
            if (buffer) {
              const parsed = parseCeoOutput(buffer)
              for (const command of parsed.commands) {
                ceoCommandExecutor.execute(command).catch((err) => {
                  console.error("[OpenCodeSdkService] CEO command execution error:", err)
                })
                if (command.type === "ASK_HUMAN") {
                  this.emit("vibe:ceo:ask-human", {
                    question: command.payload.question as string,
                    raw: command.raw
                  })
                }
              }
              this.ceoOutputBuffers.delete(sessionID)
            }
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

          this.emit("vibe:agent:status", {
            agentId: managedSession.agentId,
            status: "error",
            sessionId: sessionID
          })
        }

        this.emit("vibe:agent:error", {
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
        console.log("[OpenCodeSdkService] Message updated", {
          sessionId: info.sessionID,
          role: info.role,
          messageId: info.id,
          allSessionIds: sessionStore.listSessions().map(s => s.session?.id)
        })
        break
      }

      case "message.part.delta": {
        const { sessionID, messageID, field, delta } = (event.properties as any)
        
        if (messageID && !this.assistantMessageIds.has(messageID)) {
          console.log("[OpenCodeSdkService] message.part.delta IGNORED - messageID not in assistantMessageIds", { sessionID, messageID, delta: delta?.substring(0, 30) });
          break
        }

        console.log("[OpenCodeSdkService] message.part.delta", { sessionID, messageID, field, delta: delta?.substring(0, 30) });
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
          // Emit reasoning/thinking event
          const managedSession = this.findManagedSessionBySessionId(sessionID)
          if (managedSession) {
            this.emit("vibe:agent:reasoning", {
              agentId: managedSession.agentId,
              sessionId: sessionID,
              text: part.text,
              isOngoing: !part.metadata?.end, // ongoing while no end time
            })
          }
        } else if (part.type === "tool") {
          // Emit tool state event
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
            
            // Determine activity based on tool name and state
            if (toolState.status === "running" || toolState.status === "pending") {
              const toolName = part.tool?.toLowerCase() || ""
              if (toolName.includes("read") || toolName.includes("glob") || toolName.includes("grep")) {
                activity = "reading"
              } else if (toolName.includes("edit") || toolName.includes("write") || toolName.includes("create")) {
                activity = "editing"
              } else if (toolName.includes("bash") || toolName.includes("shell")) {
                activity = "thinking"
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
        const { info } = event.properties
        console.log(`[OpenCodeSdkService] New session created: ${info.id}`)
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
      console.log("[OpenCodeSdkService] publishSessionText skipped", { sessionId, foundSession: !!managedSession, textLength: text?.length });
      return
    }
    
    console.log("[OpenCodeSdkService] publishSessionText", { sessionId, agentId: managedSession.agentId, agentRole: managedSession.role, text: text.substring(0, 50) });

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

    if (managedSession.role === "global-ceo") {
      this.ceoOutputBuffers.set(sessionId, nextText)
    }
  }

  async stopSession(agentId: string): Promise<void> {
    await this.ensureInitialized()

    if (!this.client) {
      throw new Error("SDK client not initialized")
    }

    const managedSession = sessionStore.getSession(agentId)
    if (!managedSession) {
      console.warn(`[OpenCodeSdkService] No session found for agent: ${agentId}`)
      return
    }

    console.log(`[OpenCodeSdkService] Stopping session for agent: ${agentId}`)

    try {
      await this.client.session.delete({
        path: {
          id: managedSession.session.id
        }
      })

      sessionStore.removeSession(agentId)
      this.sessionEventIterators.delete(agentId)

      console.log(`[OpenCodeSdkService] Session stopped for agent: ${agentId}`)
    } catch (error) {
      console.error(`[OpenCodeSdkService] Failed to stop session for agent ${agentId}:`, error)
      throw error
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

