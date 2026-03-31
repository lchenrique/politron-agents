import { EventEmitter } from "events"
import * as cp from "child_process"
import { existsSync, readFileSync } from "fs"
import { dirname, join, resolve } from "path"
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
  value: string
}

interface SubtaskPartInput {
  type: "subtask"
  value: string
}

type PartInput = TextPartInput | FilePartInput | AgentPartInput | SubtaskPartInput



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

  constructor() {
    super()
    this.setMaxListeners(100)
  }

  async initialize(): Promise<void> {
    await this.ensureInitialized()
  }

  private resolveWorkspaceDirectory(): string {
    const searchMarkers = [".git", "AGENTS.md", "AGENTS.MD", "AGENT.md", "AGENT.MD"]
    let current = process.cwd()

    while (true) {
      if (searchMarkers.some((marker) => existsSync(join(current, marker)))) {
        return current
      }

      const parent = dirname(current)
      if (parent === current) {
        return process.cwd()
      }
      current = parent
    }
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

  private async doInitialize(): Promise<void> {
    try {
      // Use port 4101 to avoid conflict with OpenCode Desktop (which uses 4096)
      const result = await createOpencode({
        port: 4101,
        hostname: "127.0.0.1"
      })
      this.client = result.client
      this.serverUrl = result.server.url
      this.isInitialized = true
      console.log("[OpenCodeSdkService] SDK initialized, server running at:", this.serverUrl)
    } catch (error) {
      this.isInitialized = false
      this.initPromise = null
      throw new Error(`Failed to initialize OpenCode SDK: ${error}`)
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

    const { agentId, teamId, role, systemPrompt, systemPromptPath } = input

    const existingSession = sessionStore.getSession(agentId)
    if (existingSession) {
      console.log(`[OpenCodeSdkService] Resuming existing session for agent: ${agentId}`)
      return existingSession
    }

    console.log(`[OpenCodeSdkService] Creating new session for agent: ${agentId}, role: ${role}`)

    const workspaceDirectory = this.resolveWorkspaceDirectory()

    const createResult = await this.client.session.create({
      query: {
        directory: workspaceDirectory
      }
    })

    if (createResult.data) {
      const session: Session = createResult.data

      const managedSession: ManagedSession = {
        agentId,
        teamId,
        role,
        session,
        status: "idle",
        lastEventAt: new Date().toISOString()
      }

      sessionStore.setSession(managedSession)

      const resolvedSystemPrompt = this.resolveSystemPrompt(
        workspaceDirectory,
        systemPrompt,
        systemPromptPath
      )

      if (resolvedSystemPrompt) {
        await this.sendMessageToSession(session.id, resolvedSystemPrompt, resolvedSystemPrompt)
      }

      console.log(`[OpenCodeSdkService] Session created: ${session.id} for agent: ${agentId}`)
      return managedSession
    }

    console.error("[OpenCodeSdkService] Session creation failed", {
      agentId,
      role,
      workspaceDirectory,
      result: createResult
    })

    throw new Error(`Failed to create session for agent: ${agentId}`)
  }

  async sendMessage(input: SendMessageInput): Promise<void> {
    await this.ensureInitialized()

    if (!this.client) {
      throw new Error("SDK client not initialized")
    }

    const { agentId, message } = input

    const managedSession = sessionStore.getSession(agentId)
    if (!managedSession) {
      throw new Error(`No session found for agent: ${agentId}`)
    }

    await this.sendMessageToSession(managedSession.session.id, message, message)
  }

  private async sendMessageToSession(sessionId: string, message: string, content: string): Promise<void> {
    if (!this.client) {
      throw new Error("SDK client not initialized")
    }

    const parts: PartInput[] = [
      {
        type: "text",
        text: content
      }
    ]

    const result = await this.client.session.promptAsync({
      body: {
        parts
      },
      path: {
        id: sessionId
      }
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
        console.log("[OpenCodeSdkService] Message updated", {
          sessionId: info.sessionID,
          role: info.role,
          messageId: info.id
        })
        break
      }

      case "message.part.delta": {
        const { sessionID, field, delta } = event.properties

        if (field === "text" && delta) {
          this.publishSessionText(sessionID, delta, false)
        }
        break
      }

      case "message.part.updated": {
        const { sessionID, part } = event.properties

        if (part.type === "text") {
          this.publishSessionText(sessionID, part.text, true)
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
        const { file } = event.properties
        this.emit("vibe:pipeline:update", {
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
