/**
 * Internal Agents - MiniMax Direct Provider
 * 
 * Phase 2: Dual Provider Architecture
 * Uses MiniMax API with internal tools from Phase 1
 * 
 * Key features:
 * - Anthropic SDK with MiniMax endpoint
 * - Streaming support via messages.stream()
 * - Connects to all internal tools (team, task, delegation, staffing, session)
 * - Context building (team, pipeline, session history)
 * - Event emission matching OpenCode SDK schema
 */

import { EventEmitter } from "events"
import { readFileSync, existsSync } from "fs"
import { resolve, dirname, basename, join } from "path"
import Anthropic from "@anthropic-ai/sdk"
import {
  createTeamTools,
  createTaskTools,
  createDelegationTools,
  createStaffingTools,
  createSessionTools,
  type InternalTool,
  type ToolContext,
} from "./internal-tools"
import { teamStore } from "./team-store"
import { pipelineExecutor } from "./pipeline-executor"
import { sessionStore, type AgentRole, type ManagedSession } from "./session-store"
import type { Team, Agent, AgentStatus, PipelineStatus, TaskStatus } from "./types/team"

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface InternalAgentConfig {
  /** MiniMax API key */
  apiKey: string
  /** Base URL for Anthropic-compatible API. Default: https://api.minimax.io/anthropic */
  baseURL?: string
  /** Model to use. Default: MiniMax-M2.7 */
  model?: string
  /** Maximum tokens in response. Default: 4096 */
  maxTokens?: number
  /** Workspace directory for prompt resolution */
  workspaceDirectory?: string
  /** Maximum tool use iterations. Default: 10 */
  maxToolIterations?: number
}

// Default configuration
const DEFAULT_CONFIG: Required<InternalAgentConfig> = {
  apiKey: "",
  baseURL: "https://api.minimax.io/anthropic",
  model: "MiniMax-M2.7",
  maxTokens: 4096,
  workspaceDirectory: process.cwd(),
  maxToolIterations: 10,
}

// =============================================================================
// TYPES - Match OpenCode SDK schema
// =============================================================================

export interface SendMessageInput {
  agentId: string
  message: string
  context?: AgentContext
}

export interface AgentContext {
  teamId?: string
  role?: AgentRole
  sessionHistory?: ConversationEntry[]
}

export interface ConversationEntry {
  role: "user" | "assistant"
  content: string
  timestamp: string
}

export interface StreamChunk {
  type: "text" | "tool_use" | "tool_result" | "error" | "done"
  text?: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolOutput?: unknown
  error?: string
  content?: string
}

export interface ProviderStatus {
  idle: boolean
  currentAgentId?: string
  currentMessage?: string
  lastError?: string
}

export interface Tool {
  name: string
  description: string
  input_schema: {
    type: string
    properties: Record<string, unknown>
    required: string[]
  }
}

export interface AgentConfig {
  agentId: string
  systemPromptPath?: string
  systemPrompt?: string
  role: AgentRole
  agentSlug: string
}

const BASE_ALLOWED_TOOLS: Record<AgentRole, string[]> = {
  "global-ceo": [
    "team_list",
    "team_get",
    "team_resolve",
    "tasks_list",
    "delegate_to_agent",
    "staffing_request",
  ],
  "global-agent": [
    "team_list",
    "team_get",
    "team_resolve",
  ],
  "tech-lead": [
    "team_list",
    "team_get",
    "team_resolve",
    "tasks_list",
    "tasks_ensure",
    "delegate_to_agent",
    "staffing_request",
    "session_get_active",
  ],
  "team-agent": [],
}

// Event types matching OpenCode SDK
type InternalEventType =
  | "vibe:internal:response"
  | "vibe:internal:chunk"
  | "vibe:internal:done"
  | "vibe:internal:error"

interface InternalEvent {
  type: InternalEventType
  agentId: string
  timestamp: string
  data?: Record<string, unknown>
  error?: string
}

// =============================================================================
// INTERNAL AGENT SERVICE
// =============================================================================

export class InternalAgentService extends EventEmitter {
  private config: Required<InternalAgentConfig>
  private client: Anthropic | null = null
  private tools: InternalTool[] = []
  private toolMap: Map<string, InternalTool> = new Map()
  private status: ProviderStatus = { idle: true }

  // Agent configurations (loaded from internal-tools)
  private agentConfigs: Map<string, AgentConfig> = new Map()
  // Session history per agent
  private sessionHistories: Map<string, ConversationEntry[]> = new Map()

  constructor(config: Partial<InternalAgentConfig>) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config } as Required<InternalAgentConfig>

    if (!this.config.apiKey) {
      throw new Error("InternalAgentService requires apiKey in config")
    }

    this.initializeClient()
    this.loadTools()
    this.loadAgentConfigs()

    console.log("[InternalAgentService] Initialized with config:", {
      baseURL: this.config.baseURL,
      model: this.config.model,
      toolCount: this.tools.length,
    })
  }

  private initializeClient(): void {
    this.client = new Anthropic({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
    })
  }

  private loadTools(): void {
    // Load all tools from Phase 1
    const teamTools = createTeamTools()
    const taskTools = createTaskTools()
    const delegationTools = createDelegationTools()
    const staffingTools = createStaffingTools()
    const sessionTools = createSessionTools()

    this.tools = [
      ...teamTools,
      ...taskTools,
      ...delegationTools,
      ...staffingTools,
      ...sessionTools,
    ]

    // Build tool map for quick lookup
    for (const tool of this.tools) {
      this.toolMap.set(tool.name, tool)
    }

    console.log(`[InternalAgentService] Loaded ${this.tools.length} tools`)
    console.log(`[InternalAgentService] Tools: ${this.tools.map(t => t.name).join(", ")}`)
  }

  /**
   * Reload tools dynamically (useful when tools are updated)
   */
  reloadTools(): void {
    this.tools = []
    this.toolMap.clear()
    this.loadTools()
    console.log(`[InternalAgentService] Reloaded ${this.tools.length} tools`)
  }

  private canonicalizeAgentId(agentId: string): string {
    return agentId === "global-ceo" ? "ceo-global" : agentId
  }

  private getAgentConfig(agentId: string): AgentConfig {
    const canonicalAgentId = this.canonicalizeAgentId(agentId)
    return this.agentConfigs.get(canonicalAgentId) || this.getDefaultAgentConfig(canonicalAgentId)
  }

  private resolveEffectiveRole(agentId: string, context?: AgentContext): AgentRole {
    return context?.role || this.getAgentConfig(agentId).role
  }

  private getAllowedToolNames(agentId: string, context?: AgentContext): Set<string> {
    const agentConfig = this.getAgentConfig(agentId)
    const role = this.resolveEffectiveRole(agentId, context)
    const allowedTools = new Set(BASE_ALLOWED_TOOLS[role] ?? [])

    if (role === "global-agent" && agentConfig.agentSlug === "hr-global") {
      allowedTools.add("list_catalog")
      allowedTools.add("hire_from_catalog")
    }

    return allowedTools
  }

  private getAllowedTools(agentId: string, context?: AgentContext): InternalTool[] {
    const allowedToolNames = this.getAllowedToolNames(agentId, context)
    return this.tools.filter((tool) => allowedToolNames.has(tool.name))
  }

  private loadAgentConfigs(): void {
    // Define agent configurations
    // These map agent IDs to their system prompts
    this.agentConfigs = new Map([
      [
        "ceo-global",
        {
          agentId: "ceo-global",
          systemPromptPath: ".opencode/agents/ceo.md",
          role: "global-ceo",
          agentSlug: "ceo",
        },
      ],
      [
        "global-cto",
        {
          agentId: "global-cto",
          systemPromptPath: ".opencode/agents/global-cto.md",
          role: "global-agent",
          agentSlug: "global-cto",
        },
      ],
      [
        "hr-global",
        {
          agentId: "hr-global",
          systemPromptPath: ".opencode/agents/hr-global.md",
          role: "global-agent",
          agentSlug: "hr-global",
        },
      ],
      [
        "tech-lead",
        {
          agentId: "tech-lead",
          systemPromptPath: ".opencode/agents/tech-lead.md",
          role: "tech-lead",
          agentSlug: "tech-lead",
        },
      ],
    ])
  }

  // =============================================================================
  // PUBLIC API - AgentProvider interface
  // =============================================================================

  /**
   * Check if a message needs tools (contains action words)
   */
  private messageNeedsTools(message: string): boolean {
    const actionWords = [
      'criar', 'implementar', 'deletar', 'remover', 'alterar', 'modificar',
      'delegar', 'contratar', 'adicionar', 'listar', 'buscar', 'procurar',
      'executar', 'rodar', 'rodar', 'start', 'stop', 'pausar', 'resumir',
      'tarefa', 'task', 'time', 'team', 'agente', 'projeto'
    ]
    const lowerMessage = message.toLowerCase()
    return actionWords.some(word => lowerMessage.includes(word))
  }

  /**
   * Send a message and get streaming response
   */
  async sendMessage(input: SendMessageInput): Promise<void> {
    const { message, context } = input
    const agentId = this.canonicalizeAgentId(input.agentId)

    this.status = {
      idle: false,
      currentAgentId: agentId,
      currentMessage: message,
    }

    // Emit start event
    this.emitInternalEvent("vibe:internal:response", {
      agentId,
      messagePreview: message.slice(0, 100),
    })

    try {
      this.syncManagedSession(agentId, context)
      sessionStore.updateStatus(agentId, "running")

      // Get or create conversation history
      let history = this.sessionHistories.get(agentId)
      if (!history) {
        history = []
        this.sessionHistories.set(agentId, history)
      }

      // Add user message to history
      history.push({
        role: "user",
        content: message,
        timestamp: new Date().toISOString(),
      })

      // Build system prompt with context
      const systemPrompt = this.buildSystemPrompt(agentId, context)

      // Convert tools to Anthropic format
      const anthropicTools = this.buildAnthropicTools(agentId, context)

      // Convert history to Anthropic format
      const anthropicMessages = this.buildAnthropicMessages(history)

      // For CEO (global-ceo) always use tools since they need them for coordination
      // Others use tools only when message needs it
      const effectiveRole = this.resolveEffectiveRole(agentId, context)
      const allowedTools = this.getAllowedTools(agentId, context)
      const useTools =
        allowedTools.length > 0 &&
        (effectiveRole === "global-ceo" || effectiveRole === "tech-lead" || this.messageNeedsTools(message))

      if (useTools) {
        console.log(`[InternalAgentService] Using tools for message: "${message.slice(0, 50)}..."`)
        await this.executeWithStreaming(
          agentId,
          systemPrompt,
          anthropicMessages,
          anthropicTools,
          history
        )
      } else {
        console.log(`[InternalAgentService] No tools needed for message: "${message.slice(0, 50)}..."`)
        await this.executeWithoutTools(
          agentId,
          systemPrompt,
          anthropicMessages,
          history
        )
      }

      this.status = { idle: true, currentAgentId: agentId }
      sessionStore.updateStatus(agentId, "idle")

      this.emit("chunk", {
        type: "done",
      } satisfies StreamChunk)

      // Emit done event
      this.emitInternalEvent("vibe:internal:done", { agentId })
    } catch (error) {
      this.emit("chunk", {
        type: "error",
        error: error instanceof Error ? error.message : String(error),
      } satisfies StreamChunk)

      this.status = {
        idle: true,
        currentAgentId: agentId,
        lastError: error instanceof Error ? error.message : String(error),
      }

      this.emitInternalEvent("vibe:internal:error", {
        agentId,
        error: error instanceof Error ? error.message : String(error),
      })

      sessionStore.updateStatus(agentId, "error")

      throw error
    }
  }

  /**
   * Subscribe to streaming chunks
   * Returns unsubscribe function
   */
  subscribe(handler: (chunk: StreamChunk) => void): () => void {
    this.on("chunk", handler)
    return () => this.off("chunk", handler)
  }

  /**
   * Get current provider status
   */
  getStatus(): ProviderStatus {
    return { ...this.status }
  }

  /**
   * Get available tools
   */
  getAvailableTools(agentId?: string, context?: AgentContext): Tool[] {
    const tools = agentId ? this.getAllowedTools(agentId, context) : this.tools
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }))
  }

  // =============================================================================
  // TOOL EXECUTION
  // =============================================================================

  /**
   * Execute a tool call and return result
   */
  private async executeTool(
    name: string,
    input: Record<string, unknown>,
    context: ToolContext
  ): Promise<unknown> {
    const allowedToolNames = this.getAllowedToolNames(context.agentId, {
      role: context.role,
    })
    if (!allowedToolNames.has(name)) {
      return { error: `Tool not allowed for role ${context.role ?? "unknown"}: ${name}` }
    }

    const tool = this.toolMap.get(name)
    if (!tool) {
      return { error: `Tool not found: ${name}` }
    }

    try {
      const result = await tool.handler(input, context)
      return result
    } catch (error) {
      return {
        error: `Tool execution error: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  private syncManagedSession(agentId: string, context?: AgentContext): void {
    const agentConfig = this.getAgentConfig(agentId)
    const managedSession: ManagedSession = {
      agentId,
      teamId: context?.teamId,
      role: this.resolveEffectiveRole(agentId, context),
      session: {
        provider: "internal",
      },
      workspaceDirectory: this.config.workspaceDirectory,
      status: "idle",
      agentSlug: agentConfig.agentSlug,
      systemPromptPath: agentConfig.systemPromptPath,
      lastEventAt: new Date().toISOString(),
    }

    if (sessionStore.hasSession(agentId)) {
      sessionStore.replaceSession(managedSession)
      return
    }

    sessionStore.setSession(managedSession)
  }

  // =============================================================================
  // SYSTEM PROMPT BUILDING
  // =============================================================================

  /**
   * Build system prompt with context
   */
  private buildSystemPrompt(agentId: string, context?: AgentContext): string {
    const agentConfig = this.getAgentConfig(agentId)

    // Load system prompt from file
    let systemPrompt = agentConfig.systemPrompt || ""
    if (agentConfig.systemPromptPath && !systemPrompt) {
      const resolvedPath = this.resolvePromptPath(
        agentConfig.systemPromptPath,
        this.config.workspaceDirectory
      )
      if (existsSync(resolvedPath)) {
        systemPrompt = readFileSync(resolvedPath, "utf8").trim()
      }
    }

    // Build context sections
    const parts: string[] = [systemPrompt]

    // Add team context if available
    if (context?.teamId) {
      const teamContext = this.buildTeamContextPrompt(
        context.teamId,
        agentId,
        context.role
      )
      if (teamContext) {
        parts.push(teamContext)
      }
    }

    // Add workspace context (all teams)
    const workspaceContext = this.buildWorkspaceContextPrompt()
    if (workspaceContext) {
      parts.push(workspaceContext)
    }

    // Add tools reference
    const toolsRef = this.buildToolsReference(agentId, context)
    parts.push(toolsRef)

    return parts.filter(Boolean).join("\n\n")
  }

  private getDefaultAgentConfig(agentId: string): AgentConfig {
    return {
      agentId,
      role: "team-agent" as AgentRole,
      agentSlug: agentId,
    }
  }

  private resolvePromptPath(promptPath: string, workspaceDir: string): string {
    const normalizedPromptPath = promptPath
    return join(workspaceDir, normalizedPromptPath)
  }

  /**
   * Build team context prompt (from opencode-sdk.ts)
   */
  private buildTeamContextPrompt(
    teamId: string,
    agentId?: string,
    role?: AgentRole
  ): string | undefined {
    const team = teamStore.getTeam(teamId)
    if (!team) {
      return undefined
    }

    const lead = team.agents.find((a) => a.id === team.techLeadAgentId)
    const currentAgent = team.agents.find((a) => a.id === agentId)

    const members = team.agents
      .map((a) => {
        const marker = a.id === agentId ? " <- você" : ""
        const leadMarker = a.isTeamLead ? " (tech lead)" : ""
        const files = a.currentFiles?.length
          ? ` | arquivos: ${a.currentFiles.join(", ")}`
          : ""
        return `- ${a.name} [${a.catalogSlug}]${leadMarker} | status: ${a.status}${files}${marker}`
      })
      .join("\n")

    const isTechLead = role === "tech-lead" || lead?.id === agentId || currentAgent?.isTeamLead
    const identityLine = isTechLead
      ? `Você é o Tech Lead deste time e deve se apresentar como responsável técnico por ${team.name}.`
      : `Você é ${currentAgent?.name ?? "um agente do time"} e faz parte do time ${team.name}.`
    const collaborationLine = isTechLead
      ? "Seu papel é coordenar, planejar, quebrar tarefas e delegar. Você não é o executor principal de código por padrão, mas deve agir com autonomia e colocar o time em movimento quando a demanda estiver clara."
      : lead
      ? `Seu tech lead é ${lead.name}. Quando precisar coordenar ou pedir decisão, alinhe com ele.`
      : "Ainda não existe tech lead definido para este time; ajude a organizar o trabalho e sinalize a necessidade de um responsável técnico."

    return `

[Contexto do Time]
Time: ${team.name}
Projeto: ${team.projectName ?? team.projectPath}
Pasta: ${team.projectPath}
Tech lead: ${lead?.name ?? "não definido"}
${identityLine}
${collaborationLine}

Membros do time:
${members || "- nenhum agente contratado ainda"}
`.trim()
  }

  /**
   * Build workspace context prompt (from opencode-sdk.ts)
   */
  private buildWorkspaceContextPrompt(): string | undefined {
    const teams = teamStore.listTeams()
    if (teams.length === 0) {
      return undefined
    }

    const teamsSummary = teams
      .map((team) => {
        const lead = team.agents.find((a) => a.id === team.techLeadAgentId)
        const memberNames = team.agents
          .map((a) => `${a.name} (${a.catalogSlug})`)
          .join(", ")
        return `- ${team.name} [ID: ${team.id}] | tech lead: ${lead?.name ?? "não definido"} | membros: ${memberNames || "nenhum"}`
      })
      .join("\n")

    return `

[Visão do Workspace]
Você faz parte de um workspace com múltiplos times.
Times ativos (use o ID para operações):
${teamsSummary}

IMPORTANTE: Para qualquer operação de time (tasks_*, team_*), você DEVE usar o ID do time (ex: team.id), não o nome. O ID é o valor entre colchetes após o nome do time.
`.trim()
  }

  /**
   * Build tools reference section
   */
  private buildToolsReference(agentId: string, context?: AgentContext): string {
    const toolLines = this.getAllowedTools(agentId, context).map(
      (t) => `- ${t.name}: ${t.description}`
    ).join("\n")

    return `

[Ferramentas Disponíveis]
Você pode usar as seguintes ferramentas para interacting com o sistema:

${toolLines}

Para usar uma ferramenta, inclua um bloco tool_use na sua resposta.
`.trim()
  }

  // =============================================================================
  // ANTHROPIC API
  // =============================================================================

  /**
   * Build Anthropic tools format
   */
  private buildAnthropicTools(agentId: string, context?: AgentContext): Anthropic.Tool[] {
    return this.getAllowedTools(agentId, context).map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema as Anthropic.ToolInputSchema,
    }))
  }

  /**
   * Build Anthropic messages format
   */
  private buildAnthropicMessages(
    history: ConversationEntry[]
  ): Anthropic.MessageParam[] {
    return history.map((entry) => ({
      role: entry.role === "user" ? "user" : "assistant",
      content: entry.content,
    }))
  }

  /**
   * Execute without tools - for simple messages that don't need tool use
   */
  private async executeWithoutTools(
    agentId: string,
    systemPrompt: string,
    messages: Anthropic.MessageParam[],
    history: ConversationEntry[]
  ): Promise<void> {
    console.log(`[InternalAgentService] executeWithoutTools: Calling API without tools`)

    const response = await this.client!.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      system: systemPrompt,
      messages,
    })

    // Collect text from response
    let responseText = ""
    for (const block of response.content) {
      if (block.type === "text") {
        responseText += block.text
      }
    }

    // Send full text at once - frontend handles animation
    if (responseText) {
      const chunk: StreamChunk = {
        type: "text",
        text: responseText,
      }
      this.emit("chunk", chunk)

      // Add to history
      messages.push({
        role: "assistant",
        content: responseText,
      })
      history.push({
        role: "assistant",
        content: responseText,
      })
    }
  }

  /**
   * Execute with simulated streaming - get full response then emit chunks gradually
   * This gives the appearance of streaming without requiring API support
   */
  private async executeWithStreaming(
    agentId: string,
    systemPrompt: string,
    messages: Anthropic.MessageParam[],
    tools: Anthropic.Tool[],
    history: ConversationEntry[]
  ): Promise<void> {
    let iteration = 0
    const maxIterations = this.config.maxToolIterations

    // Build tool context for execution
    const buildToolContext = (): ToolContext => ({
      agentId,
      agentName: agentId,
      sessionId: `session-${agentId}`,
      workspaceDirectory: this.config.workspaceDirectory,
      role: this.getAgentConfig(agentId).role,
      agentSlug: this.getAgentConfig(agentId).agentSlug,
    })

    while (iteration < maxIterations) {
      iteration++

      console.log(`[InternalAgentService] Iteration ${iteration}: Calling API with ${tools.length} tools`)

      // Use messages.create (not streaming) for reliability
      const response = await this.client!.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        system: systemPrompt,
        messages,
        tools,
      })

      console.log(`[InternalAgentService] Response stop_reason: ${response.stop_reason}`)

      // Collect text and tool uses from response
      let responseText = ""
      const toolUseBlocks: Anthropic.ToolUseBlock[] = []

      for (const block of response.content) {
        if (block.type === "text") {
          responseText += block.text
        } else if (block.type === "tool_use") {
          toolUseBlocks.push(block)
        }
      }

      // Emit full text at once (frontend handles its own streaming display)
      if (responseText) {
        const chunk: StreamChunk = {
          type: "text",
          text: responseText,
        }
        this.emit("chunk", chunk)

        // Add to history
        messages.push({
          role: "assistant",
          content: responseText,
        })
        history.push({
          role: "assistant",
          content: responseText,
        })
      }

      // If no tool use, we're done
      if (toolUseBlocks.length === 0) {
        console.log(`[InternalAgentService] No tool calls, finishing`)
        return
      }

      // Execute tool calls
      for (const toolUse of toolUseBlocks) {
        const toolName = toolUse.name
        const toolInput = toolUse.input as Record<string, unknown>

        console.log(`[InternalAgentService] Executing tool: ${toolName}`)

        // Emit tool_use chunk
        const toolChunk: StreamChunk = {
          type: "tool_use",
          toolName,
          toolInput,
        }
        this.emit("chunk", toolChunk)

        // Execute tool
        const toolResult = await this.executeTool(toolName, toolInput, buildToolContext())

        // Emit tool_result chunk
        const resultChunk: StreamChunk = {
          type: "tool_result",
          toolName,
          toolOutput: toolResult,
        }
        this.emit("chunk", resultChunk)

        // Add tool result to messages
        const resultText =
          typeof toolResult === "string"
            ? toolResult
            : JSON.stringify(toolResult, null, 2)

        messages.push({
          role: "user",
          content: resultText,
        })
      }
    }

    // Max iterations reached
    if (iteration >= maxIterations) {
      console.warn(`[InternalAgentService] Max tool iterations reached: ${maxIterations}`)
    }
  }

  // =============================================================================
  // EVENT EMISSION
  // =============================================================================

  private emitInternalEvent(
    type: InternalEventType,
    data: Record<string, unknown>
  ): void {
    const event: InternalEvent = {
      type,
      agentId: data.agentId as string,
      timestamp: new Date().toISOString(),
      data,
      error: data.error as string | undefined,
    }
    this.emit(type, event)
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create an InternalAgentService instance
 */
export function createInternalAgentService(
  config: Partial<InternalAgentConfig>
): InternalAgentService {
  return new InternalAgentService(config)
}

// =============================================================================
// DEFAULT EXPORT
// =============================================================================

export default InternalAgentService
