import { EventEmitter } from "events"
import * as cp from "child_process"
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { basename, dirname, join, resolve, normalize } from "path"
import os from "os"
import JSON5 from "json5"
import { createOpencode } from "@opencode-ai/sdk"
import type { OpencodeClient } from "@opencode-ai/sdk/dist/v2/client"
import type { Session, GlobalEvent, Event } from "@opencode-ai/sdk/dist/gen/types.gen"
import { sessionStore, type AgentRole, type ManagedSession } from "./session-store"
import { teamStore } from "./team-store"
import { parseCeoOutput } from "./ceo-output-parser"
import { ceoCommandExecutor } from "./ceo-command-executor"
import { pipelineExecutor } from "./pipeline-executor"
import { taskToolBridge } from "./task-tool-bridge"
import { OPENCODE_MARKETPLACE_AGENTS } from "./agent-catalog"
import type { Team } from "../types/team"

type SdkStatus = "idle" | "retry" | "busy"

type ConfigScope = "global" | "project" | "custom"

interface ConfigSourceFile {
  scope: ConfigScope
  label: string
  path: string
  exists: boolean
}

interface ProviderModelSummary {
  id: string
  name: string
  family?: string
  status?: string
}

interface ProviderSummary {
  id: string
  name?: string
  api?: string
  modelCount: number
  models: ProviderModelSummary[]
  optionKeys: string[]
  env: string[]
  hasHeaders: boolean
}

interface EditableProviderOptions {
  apiKey?: string
  baseURL?: string
  enterpriseUrl?: string
  setCacheKey?: boolean
  timeout?: number
  chunkTimeout?: number
}

interface EditableProviderDraft {
  id: string
  name?: string
  api?: string
  active: boolean
  options: EditableProviderOptions
}

interface EditableConfigDraft {
  scope: ConfigScope
  targetPath: string
  exists: boolean
  defaults: {
    username?: string
    logLevel?: string
    model?: string
    small_model?: string
    default_agent?: string
    share?: string
    autoupdate?: boolean | "notify"
    snapshot?: boolean
  }
  providers: EditableProviderDraft[]
  mcpJson: string
  permissionsJson: string
  toolsJson: string
}

interface ConfigDiagnostics {
  sdkReady: boolean
  providers: ProviderSummary[]
  models: Array<{ id: string; providerID: string; name: string }>
  sources: ConfigSourceFile[]
  env: {
    OPENCODE_CONFIG?: string
    OPENCODE_CONFIG_DIR?: string
    OPENCODE_TUI_CONFIG?: string
  }
  mergedSummary: {
    username?: string
    logLevel?: string
    model?: string
    small_model?: string
    default_agent?: string
    share?: string
    autoupdate?: boolean | "notify"
    snapshot?: boolean
    disabled_providers: string[]
    enabled_providers: string[]
    providerCount: number
    mcpCount: number
    commandCount: number
    toolCount: number
    skillsPaths: number
    skillsUrls: number
    watcherIgnoreCount: number
  }
  warnings: string[]
}

interface SaveConfigDraftInput {
  scope: ConfigScope
  projectPath?: string
  defaults: EditableConfigDraft["defaults"]
  providers: EditableProviderDraft[]
  mcpJson: string
  permissionsJson: string
  toolsJson: string
}

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
  requestId?: string
  rootRequestId?: string
  sessionId?: string
  sourceSessionId?: string
  fromAgentId: string
  fromAgentName?: string
  toAgentId: string
  toAgentName?: string
  toAgentSlug?: string
  toAgentPromptPath?: string
  targetScope?: "team" | "global"
  teamId?: string
  teamName?: string
  task: string
  payload?: Record<string, string | string[]>
  files?: string[]
  branchName?: string
  model?: {
    modelID: string
    providerID: string
  }
}

type ToolInvocationData = Record<string, unknown>

type CommunicationRequestStatus =
  | "requested"
  | "in_progress"
  | "awaiting_info"
  | "completed"
  | "failed"
  | "refused"

type DecisionPipelineStage =
  | "intake"
  | "tech_assessment"
  | "execution"
  | "staffing"
  | "blocked"
  | "done"

type DecisionPipelineOutcome =
  | "can_execute_with_current_team"
  | "needs_reprioritization"
  | "needs_staffing"
  | "blocked_missing_context"
  | "hire"
  | "reject_hire_and_reuse_team"
  | "ask_one_clarification"

interface DecisionPipelineTransition {
  id: string
  timestamp: string
  stage: DecisionPipelineStage
  reason?: string
  actorAgentId?: string
  actorAgentName?: string
  targetAgentId?: string
  targetAgentName?: string
}

interface DecisionPipelineState {
  stage: DecisionPipelineStage
  outcome?: DecisionPipelineOutcome
  transitions: DecisionPipelineTransition[]
}

type CommunicationParticipantRole = "requester" | "executor" | "intermediary"

interface CommunicationParticipant {
  agentId: string
  agentName?: string
  role: CommunicationParticipantRole
}

interface CommunicationHistoryEntry {
  id: string
  timestamp: string
  kind: "handoff" | "response" | "status"
  agentId: string
  agentName?: string
  targetAgentId?: string
  targetAgentName?: string
  status: CommunicationRequestStatus
  detail?: string
}

interface CommunicationResponse {
  fromAgentId: string
  fromAgentName?: string
  toAgentId: string
  toAgentName?: string
  status: CommunicationRequestStatus
  detail?: string
  timestamp: string
}

interface CommunicationRequest {
  requestId: string
  rootRequestId: string
  requesterAgentId: string
  requesterAgentName?: string
  currentAgentId: string
  currentAgentName?: string
  teamId?: string
  teamName?: string
  task: string
  payload?: Record<string, string | string[]>
  files?: string[]
  branchName?: string
  status: CommunicationRequestStatus
  decisionPipeline: DecisionPipelineState
  participants: CommunicationParticipant[]
  history: CommunicationHistoryEntry[]
  latestResponse?: CommunicationResponse
  finalResponse?: CommunicationResponse
}

interface DelegationOrigin {
  requestId?: string
  sourceAgentId: string
  sourceSessionId?: string
  sourceAgentName?: string
  targetAgentId: string
  targetAgentName?: string
  teamId?: string
  teamName?: string
  task: string
  payload?: Record<string, string | string[]>
  files?: string[]
  branchName?: string
}

function communicationRoleWeight(role: CommunicationParticipantRole): number {
  switch (role) {
    case "requester":
      return 3
    case "intermediary":
      return 2
    default:
      return 1
  }
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

function formatPayloadValue(value: string | string[]): string {
  return Array.isArray(value) ? value.join(", ") : value
}

function formatDelegationPayload(payload?: Record<string, string | string[]>, excludedKeys: string[] = []): string[] {
  if (!payload) {
    return []
  }

  const excluded = new Set(excludedKeys.map((key) => key.toLowerCase()))
  const orderedKeys = ["desiredRole", "role", "justification", "priority", "context", "successCriteria", "mustHaves", "niceToHave"]
  const seen = new Set<string>()
  const lines: string[] = []

  for (const key of orderedKeys) {
    const normalizedKey = key.toLowerCase()
    const value = payload[key] ?? payload[normalizedKey]
    if (value == null || excluded.has(normalizedKey)) {
      continue
    }

    lines.push(`- ${key}: ${formatPayloadValue(value)}`)
    seen.add(normalizedKey)
  }

  for (const [key, value] of Object.entries(payload)) {
    const normalizedKey = key.toLowerCase()
    if (seen.has(normalizedKey) || excluded.has(normalizedKey)) {
      continue
    }

    lines.push(`- ${key}: ${formatPayloadValue(value)}`)
  }

  return lines
}

function deepMergeConfig<T extends Record<string, any>>(base: T, override: Record<string, any>): T {
  const output: Record<string, any> = Array.isArray(base) ? [...base] : { ...base }

  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue

    const existing = output[key]
    const bothObjects =
      existing &&
      value &&
      typeof existing === "object" &&
      typeof value === "object" &&
      !Array.isArray(existing) &&
      !Array.isArray(value)

    if (bothObjects) {
      output[key] = deepMergeConfig(existing, value)
    } else {
      output[key] = Array.isArray(value) ? [...value] : value
    }
  }

  return output as T
}

function safeReadJson5(filePath: string): { data: Record<string, any>; warnings: string[] } {
  try {
    const content = readFileSync(filePath, "utf8")
    const parsed = JSON5.parse(content)
    return {
      data: parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {},
      warnings: [],
    }
  } catch (error) {
    return {
      data: {},
      warnings: [`Falha ao ler ${filePath}: ${error instanceof Error ? error.message : String(error)}`],
    }
  }
}

function findNearestProjectConfig(projectPath?: string): string | null {
  if (!projectPath) return null

  let currentDir = resolve(projectPath)
  for (;;) {
    const candidateJson = join(currentDir, "opencode.json")
    const candidateJsonc = join(currentDir, "opencode.jsonc")
    if (existsSync(candidateJson)) return candidateJson
    if (existsSync(candidateJsonc)) return candidateJsonc

    const parent = dirname(currentDir)
    if (parent === currentDir) break
    currentDir = parent
  }

  return null
}

function collectConfigSources(projectPath?: string): ConfigSourceFile[] {
  const homeDir = process.env.USERPROFILE || process.env.HOME || os.homedir()
  const globalDir = join(homeDir, ".config", "opencode")
  const globalJson = join(globalDir, "opencode.json")
  const globalJsonc = join(globalDir, "opencode.jsonc")
  const projectConfig = findNearestProjectConfig(projectPath)
  const customConfig = process.env.OPENCODE_CONFIG

  const sources: ConfigSourceFile[] = [
    {
      scope: "global",
      label: "Global",
      path: globalJson,
      exists: existsSync(globalJson),
    },
    {
      scope: "global",
      label: "Global JSONC",
      path: globalJsonc,
      exists: existsSync(globalJsonc),
    },
  ]

  if (projectConfig) {
    sources.push({
      scope: "project",
      label: "Projeto",
      path: projectConfig,
      exists: true,
    })
  }

  if (customConfig) {
    sources.push({
      scope: "custom",
      label: "Config customizada",
      path: customConfig,
      exists: existsSync(customConfig),
    })
  }

  const tuiGlobal = join(globalDir, "tui.json")
  const tuiProject = projectPath ? join(resolve(projectPath), "tui.json") : null
  const customTui = process.env.OPENCODE_TUI_CONFIG

  sources.push(
    {
      scope: "global",
      label: "TUI global",
      path: tuiGlobal,
      exists: existsSync(tuiGlobal),
    },
    ...(tuiProject
      ? [
          {
            scope: "project" as const,
            label: "TUI do projeto",
            path: tuiProject,
            exists: existsSync(tuiProject),
          },
        ]
      : []),
    ...(customTui
      ? [
          {
            scope: "custom" as const,
            label: "TUI customizada",
            path: customTui,
            exists: existsSync(customTui),
          },
        ]
      : [])
  )

  return sources
}

function resolveConfigFilePath(scope: ConfigScope, projectPath?: string): string {
  const homeDir = process.env.USERPROFILE || process.env.HOME || os.homedir()

  if (scope === "project") {
    const baseProjectPath = projectPath ? resolve(projectPath) : process.cwd()
    return join(baseProjectPath, "opencode.json")
  }

  return join(homeDir, ".config", "opencode", "opencode.json")
}

function readConfigObject(filePath: string): Record<string, any> {
  if (!existsSync(filePath)) {
    return {}
  }

  const result = safeReadJson5(filePath)
  return result.data
}

function normalizeProviderOptions(options: Record<string, any> | undefined): EditableProviderOptions {
  return {
    apiKey: typeof options?.apiKey === "string" ? options.apiKey : undefined,
    baseURL: typeof options?.baseURL === "string" ? options.baseURL : undefined,
    enterpriseUrl: typeof options?.enterpriseUrl === "string" ? options.enterpriseUrl : undefined,
    setCacheKey: typeof options?.setCacheKey === "boolean" ? options.setCacheKey : undefined,
    timeout: typeof options?.timeout === "number" ? options.timeout : undefined,
    chunkTimeout: typeof options?.chunkTimeout === "number" ? options.chunkTimeout : undefined,
  }
}

function toEditableProviderDraft(
  sdkProvider: any,
  configProvider: Record<string, any> | undefined,
  enabledProviderIds: string[],
  disabledProviderIds: string[]
): EditableProviderDraft {
  return {
    id: sdkProvider.id,
    name: typeof configProvider?.name === "string" ? configProvider.name : sdkProvider.name,
    api: typeof configProvider?.api === "string" ? configProvider.api : sdkProvider.api,
    active: disabledProviderIds.includes(sdkProvider.id)
      ? false
      : enabledProviderIds.length > 0
        ? enabledProviderIds.includes(sdkProvider.id)
        : true,
    options: normalizeProviderOptions(configProvider?.options ?? sdkProvider?.options),
  }
}

function buildEditableDefaults(config: Record<string, any>): EditableConfigDraft["defaults"] {
  return {
    username: typeof config.username === "string" ? config.username : undefined,
    logLevel: typeof config.logLevel === "string" ? config.logLevel : undefined,
    model: typeof config.model === "string" ? config.model : undefined,
    small_model: typeof config.small_model === "string" ? config.small_model : undefined,
    default_agent: typeof config.default_agent === "string" ? config.default_agent : undefined,
    share: typeof config.share === "string" ? config.share : undefined,
    autoupdate:
      typeof config.autoupdate === "boolean" || config.autoupdate === "notify"
        ? config.autoupdate
        : undefined,
    snapshot: typeof config.snapshot === "boolean" ? config.snapshot : undefined,
  }
}

function serializeEditableDefaults(defaults: EditableConfigDraft["defaults"]): Record<string, any> {
  return {
    username: defaults.username?.trim() || undefined,
    logLevel: defaults.logLevel?.trim() || undefined,
    model: defaults.model?.trim() || undefined,
    small_model: defaults.small_model?.trim() || undefined,
    default_agent: defaults.default_agent?.trim() || undefined,
    share: defaults.share?.trim() || undefined,
    autoupdate: defaults.autoupdate,
    snapshot: defaults.snapshot,
  }
}

function safeStringifySection(value: unknown): string {
  if (value === undefined) {
    return ""
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return ""
  }
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

function buildAgentMarketplacePrompt(): string {
  const lines = OPENCODE_MARKETPLACE_AGENTS.map((agent) => `${agent.name} [${agent.slug}]`).join(", ")

  return `
[Mercado de agentes disponível]
Use esta lista como mercado oficial de contratação suportado pelo sistema.
Ao pedir staffing ou contratar, escolha o papel a partir desta lista e prefira usar o nome/slug exato.
${lines}
`.trim()
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
  private boardPollTimer: NodeJS.Timeout | null = null
  private boardPollRunning = false
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
  private communicationRequestsById: Map<string, CommunicationRequest> = new Map()
  private requestIdBySessionId: Map<string, string> = new Map()

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
      void this.routeAgentHandoff(event)
    })

    ceoCommandExecutor.on("agent:hired", () => {
      this.invalidateAvailableAgentsCache()
      void this.dispatchReadyBoardTasks()
    })

    ceoCommandExecutor.on("task:delegated", (event: { task?: PipelineTask; autoStart?: boolean }) => {
      this.emit("vibe:task:delegated", event)
      if (event.autoStart && event.task?.status === "ready") {
        void this.dispatchBoardTask(event.task.teamId, event.task.id)
      }
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
      const marker = agent.id === agentId ? " <- você" : ""
      const leadMarker = agent.isTeamLead ? " (tech lead)" : ""
      const files = agent.currentFiles?.length ? ` | arquivos: ${agent.currentFiles.join(", ")}` : ""
      return `- ${agent.name} [${agent.catalogSlug}]${leadMarker} | status: ${agent.status}${files}${marker}`
    }).join("\n")

    const isTechLead = role === "tech-lead" || lead?.id === agentId || currentAgent?.isTeamLead
    const identityLine = isTechLead
      ? `Voc\u00ea \u00e9 o Tech Lead deste time e deve se apresentar como respons\u00e1vel t\u00e9cnico por ${team.name}.`
      : `Voc\u00ea \u00e9 ${currentAgent?.name ?? "um agente do time"} e faz parte do time ${team.name}.`
    const collaborationLine = isTechLead
      ? "Seu papel \u00e9 coordenar, planejar, quebrar tarefas e delegar. Voc\u00ea n\u00e3o \u00e9 o executor principal de c\u00f3digo por padr\u00e3o, mas deve agir com autonomia e colocar o time em movimento quando a demanda estiver clara."
      : lead
        ? `Seu tech lead \u00e9 ${lead.name}. Quando precisar coordenar ou pedir decis\u00e3o, alinhe com ele.`
        : "Ainda n\u00e3o existe tech lead definido para este time; ajude a organizar o trabalho e sinalize a necessidade de um respons\u00e1vel t\u00e9cnico."
    const marketplacePrompt = buildAgentMarketplacePrompt()

    const directFlowInstruction = !isTechLead
      ? `
[Fluxo Direto - Agentes Executores]
- Quando o usu\u00e1rio enviar uma tarefa diretamente para voc\u00ea (sem passar por lideran\u00e7a), voc\u00ea pode executar diretamente se estiver no seu escopo de especialidade.
- Se souber fazer a tarefa, n\u00e3o precisa escalar: execute e retorne o resultado.
- Se a tarefa estiver fora do seu escopo, delegue para o agente certo do time ou escale para o Tech Lead.
- Use [DELEGATE directFlow="true"] para envio direto a outro executor sem passar pelo board.
`
      : ""

    const techLeadFlowInstruction = isTechLead
      ? `
[Fluxo Hier\u00e1rquico - Tech Lead]
- Quando receber uma demanda, avalie se o time atual consegue executar.
- Se faltar capacidade/especialidade, acione o RH Global via [DELEGATE] com staffing request estruturado.
- Se o time conseguir, delegue diretamente ao agente respons\u00e1vel.
`
      : ""

    return `

[Contexto do Time]
Time: ${team.name}
Projeto: ${team.projectName ?? team.projectPath}
Pasta: ${team.projectPath}
Tech lead: ${lead?.name ?? "n\u00e3o definido"}
${identityLine}
${collaborationLine}

Regra de idioma:
- Toda resposta vis\u00edvel ao usu\u00e1rio final deve ser em portugu\u00eas do Brasil.
- A comunica\u00e7\u00e3o interna entre agentes pode usar ingl\u00eas quando for mais eficiente.
- Se houver delega\u00e7\u00e3o, a tarefa pode ser passada em linguagem t\u00e9cnica, mas a resposta final ao usu\u00e1rio continua em pt-BR.

Membros do time:
${members || "- nenhum agente contratado ainda"}
${directFlowInstruction}
${techLeadFlowInstruction}
Protocolos de colabora\u00e7\u00e3o:
- Voc\u00ea pode delegar tarefas para outro agente do mesmo time usando [DELEGATE] com team, to, task e opcionalmente files.
- Voc\u00ea pode usar [DELEGATE directFlow="true"] para enviar uma tarefa diretamente a um executor sem criar issue no board.
- Lideran\u00e7a coordena e valida; implementa\u00e7\u00e3o deve ficar com os agentes executores do time.
- Global CTO/CEO e Tech Lead s\u00f3 podem editar c\u00f3digo em casos estritamente necess\u00e1rios e excepcionais.
- Se a demanda estiver clara, n\u00e3o pe\u00e7a confirma\u00e7\u00e3o para passos normais do fluxo: registre a issue, delegue e avance.
- Para operar o board, prefira as ferramentas 'tasks_ensure', 'tasks_list', 'tasks_get', 'tasks_update', 'tasks_start', 'tasks_complete', 'tasks_remove' e 'tasks_dedupe'.
- Antes de criar uma nova issue no board, use 'tasks_list' ou 'tasks_ensure' para evitar duplicatas.
- S\u00f3 interrompa para perguntar algo ao usu\u00e1rio quando faltar informa\u00e7\u00e3o indispens\u00e1vel, houver risco destrutivo ou existir um trade-off material entre caminhos.
- Quando precisar acionar outro agente, fa\u00e7a isso com comando execut\u00e1vel real, n\u00e3o apenas descrevendo o pr\u00f3ximo passo em texto.
- Tech leads e agentes de time n\u00e3o podem contratar diretamente.
- Quando faltar um perfil no time, use [DELEGATE] para acionar o RH Global com um pedido estruturado contendo team, desiredRole, justification, priority e successCriteria.
- Antes de pedir contrata\u00e7\u00e3o, tente usar os agentes j\u00e1 existentes do time; contrata\u00e7\u00e3o \u00e9 exce\u00e7\u00e3o, n\u00e3o fluxo padr\u00e3o.
- Nunca envie um pedido de contrata\u00e7\u00e3o vazio ou apenas [DELEGATE] + hire_agent.
- Sempre que citar outro agente, use o nome e/ou slug exatos do time para evitar ambiguidade.
- Quando o usu\u00e1rio perguntar "quem \u00e9 voc\u00ea?" ou algo equivalente, responda mencionando seu papel e o nome do time.
- Quando responder sobre outros agentes, use a vis\u00e3o do time atual e deixe claro quem \u00e9 o tech lead, quem est\u00e1 dispon\u00edvel e quem j\u00e1 foi contratado.
- Apenas CEO Global ou RH Global podem usar [HIRE_AGENT].
- Nunca use 'call_omo_agent' para acionar colegas do time; use apenas o protocolo local de [DELEGATE].
- Sempre trate os colegas como membros do mesmo time, nunca como agentes gen\u00e9ricos soltos.
- Fluxo padr\u00e3o de staffing: CEO Global recebe a demanda, Tech Lead avalia a capacidade, RH Global contrata e o novo agente assume a execu\u00e7\u00e3o no board.
- Se faltar perfil no time, escolha o desiredRole a partir do mercado oficial abaixo e envie o pedido j\u00e1 com esse papel definido.

${marketplacePrompt}
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
      return `- ${team.name} | tech lead: ${lead?.name ?? "n\u00e3o definido"} | membros: ${memberNames || "nenhum"}`
    }).join("\n")
    const marketplacePrompt = buildAgentMarketplacePrompt()
    return `

[Vis\u00e3o do Workspace]
Voc\u00ea faz parte de um workspace com m\u00faltiplos times.
Times ativos:
${teamsSummary}

[Fluxo Hier\u00e1rquico]
- Este fluxo \u00e9 usado quando o usu\u00e1rio fala com CEO Global ou Tech Lead.
- O Tech Lead avalia se o time atual consegue executar.
- Se faltar capacidade/especialidade, aciona o RH Global para contratar.
- O novo agente entra no time e recebe a tarefa.

[Fluxo Direto]
- Quando o usu\u00e1rio fala diretamente com um agente espec\u00edfico (Frontend, Backend, QA, Designer, etc.), o sistema pode enviar a tarefa diretamente.
- Agentes executores podem receber tarefas sem passar pela lideran\u00e7a se a tarefa estiver no escopo deles.
- Se o agente n\u00e3o souber fazer, ele delega ou escala para o Tech Lead.

Regras:
- Antes de pedir ajuda, tente delegar ao agente mais apropriado do time.
- Global CTO e Tech Lead devem evitar executar c\u00f3digo como caminho normal.
- Se for preciso editar c\u00f3digo, trate isso como exce\u00e7\u00e3o estritamente necess\u00e1ria.
- A coordena\u00e7\u00e3o deve sempre favorecer delega\u00e7\u00e3o, planejamento e valida\u00e7\u00e3o.
- Quando o pedido do usu\u00e1rio estiver claro, a lideran\u00e7a deve agir com autonomia e acionar o fluxo sem pedir aprova\u00e7\u00f5es intermedi\u00e1rias.
- Perguntas ao usu\u00e1rio devem ser raras e limitadas a bloqueios reais de contexto, risco destrutivo ou decis\u00f5es com consequ\u00e3ncias relevantes.
- Para tarefas de board, use as ferramentas 'tasks_*' para consultar, criar sem duplicar e atualizar o andamento.
- Se a a\u00e7\u00e3o depender de outro agente, a resposta deve conter [DELEGATE] ou [HIRE_AGENT] quando aplic\u00e1vel; texto descritivo sozinho n\u00e3o aciona o fluxo.
- Apenas CEO Global ou RH Global podem executar [HIRE_AGENT].
- Se faltar perfil em um time, o Tech Lead deve usar [DELEGATE] para acionar o RH Global com team, desiredRole, justification, priority e successCriteria, mas s\u00f3 depois de verificar que o time atual realmente n\u00e3o consegue absorver a demanda.
- Pedidos vazios ou gen\u00e9ricos de contrata\u00e7\u00e3o devem ser bloqueados antes do envio.
- Mantenha as mensagens curtas, objetivas e espec\u00edficas ao papel de cada agente.
- Fluxo padr\u00e3o de staffing: CEO Global recebe a demanda, Tech Lead avalia a capacidade, RH Global contrata e o novo agente assume a execu\u00e7\u00e3o no board.
- Quando a necessidade de contrata\u00e7\u00e3o estiver clara, n\u00e3o pe\u00e7a confirma\u00e7\u00e3o redundante sobre cargo se ele j\u00e1 puder ser escolhido da lista oficial abaixo.
- Use [DELEGATE directFlow="true"] para enviar tarefa diretamente a um executor sem passar pelo board.

Regra de idioma:
- Toda resposta vis\u00edvel ao usu\u00e1rio final deve ser em portugu\u00eas do Brasil.
- A comunica\u00e7\u00e3o interna entre agentes pode usar ingl\u00eas quando for mais eficiente.
- Se houver delega\u00e7\u00e3o, a tarefa pode ser passada em linguagem t\u00e9cnica, mas a resposta final ao usu\u00e1rio continua em pt-BR.

${marketplacePrompt}
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
        const taskBridge = await taskToolBridge.ensureStarted()
        process.env.POLITRON_TASK_TOOL_URL = taskBridge.url
        process.env.POLITRON_TASK_TOOL_TOKEN = taskBridge.token

        const result = await createOpencode({
          port: 0,
          hostname: "127.0.0.1",
          timeout: 30000
        })

        this.client = result.client
        this.serverUrl = result.server.url
        this.isInitialized = true
        this.initPromise = null
        this.startBoardPolling()
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

  private startBoardPolling(): void {
    if (this.boardPollTimer) {
      return
    }

    this.boardPollTimer = setInterval(() => {
      void this.dispatchReadyBoardTasks()
    }, 2500)

    this.boardPollTimer.unref?.()
  }

  private async dispatchReadyBoardTasks(): Promise<void> {
    if (this.boardPollRunning) {
      return
    }

    this.boardPollRunning = true
    try {
      const teams = teamStore.listTeams()
      for (const team of teams) {
        if (team.status !== "active") {
          continue
        }
        const readyTasks = pipelineExecutor.getReadyTasks(team.id)
        for (const task of readyTasks) {
          await this.dispatchBoardTask(task.teamId, task.id)
        }
      }
    } catch (error) {
      console.error("[OpenCodeSdkService] Failed to dispatch board tasks:", error)
    } finally {
      this.boardPollRunning = false
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

  private async routeAgentHandoff(event: AgentHandoffEvent): Promise<void> {
    try {
      if (this.shouldQueueAgentHandoff(event)) {
        await this.queueBoardIssueFromHandoff(event)
        return
      }

      await this.deliverAgentHandoff(event)
    } catch (error) {
      console.error("[OpenCodeSdkService] Failed to route agent handoff:", error)
      this.emit("vibe:agent:error", {
        agentId: event.toAgentId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // Backwards-compatible direct handoff path used by tests and rare explicit calls.
  private async handleAgentHandoff(event: AgentHandoffEvent): Promise<void> {
    await this.deliverAgentHandoff(event)
  }

  private shouldQueueAgentHandoff(event: AgentHandoffEvent): boolean {
    // Global targets are never queued - they get direct handoff
    if (event.targetScope === "global") {
      return false
    }

    // Direct flow means: deliver immediately, don't queue for board
    // The agent will execute directly
    const isDirectFlow = event.payload?.directFlow === "true"
    if (isDirectFlow) {
      return false
    }

    const targetTeam = teamStore.getTeam(event.team.id)
    if (!targetTeam) {
      return false
    }

    const targetAgent = targetTeam.agents.find((agent) => agent.id === event.toAgentId)
    if (!targetAgent) {
      return false
    }

    // Tech Leads get direct handoff, other team agents get queued
    return !targetAgent.isTeamLead && targetAgent.role !== "tech-lead"
  }

  private async queueBoardIssueFromHandoff(event: AgentHandoffEvent): Promise<void> {
    const targetTeam = teamStore.getTeam(event.team.id)
    if (!targetTeam) {
      throw new Error(`Target team not found: ${event.team.id}`)
    }

    const targetAgent = targetTeam.agents.find((agent) => agent.id === event.toAgentId)
    if (!targetAgent) {
      throw new Error(`Target agent not found: ${event.toAgentId}`)
    }

    const requester = targetTeam.agents.find((agent) => agent.id === event.fromAgentId)
    const title =
      typeof event.payload?.title === "string" && event.payload.title.trim()
        ? event.payload.title.trim()
        : event.task.slice(0, 90)
    const task = pipelineExecutor.ensureTask({
      teamId: targetTeam.id,
      agentId: targetAgent.id,
      title,
      description: event.task,
      requesterAgentId: requester?.id ?? event.fromAgentId,
      requesterAgentName: requester?.name ?? event.fromAgentName,
      createdByAgentId: requester?.id ?? event.fromAgentId,
      createdByAgentName: requester?.name ?? event.fromAgentName,
      responsibleAgentRole: targetAgent.role,
      priority: event.payload?.priority ? formatPayloadValue(event.payload.priority) : undefined,
      context: event.payload?.context ? formatPayloadValue(event.payload.context) : undefined,
      acceptanceCriteria: event.payload?.successCriteria
        ? Array.isArray(event.payload.successCriteria)
          ? event.payload.successCriteria.map((item) => String(item))
          : [formatPayloadValue(event.payload.successCriteria)]
        : [],
      files: event.files ?? [],
      dependsOn: [],
      branchName: event.branchName,
      status: "ready",
      artifacts: [],
      observations: event.payload?.notes ? formatPayloadValue(event.payload.notes) : undefined,
    }).task

    this.emit("vibe:task:delegated", {
      team: targetTeam,
      task,
      fromAgentId: requester?.id ?? event.fromAgentId,
      fromAgentName: requester?.name ?? event.fromAgentName,
    })

    this.emit("vibe:pipeline:update", {
      teamId: targetTeam.id,
      task,
      status: pipelineExecutor.getPipelineStatus(targetTeam.id),
    })
  }

  private async dispatchBoardTask(teamId: string, taskId: string): Promise<void> {
    const team = teamStore.getTeam(teamId)
    if (!team) {
      return
    }

    const task = pipelineExecutor.getTask(taskId)
    if (!task || task.teamId !== teamId || task.status !== "ready") {
      return
    }

    const targetAgent = team.agents.find((agent) => agent.id === task.agentId)
    if (!targetAgent) {
      pipelineExecutor.blockTask(task.id)
      return
    }

    const sourceSession = task.createdByAgentId
      ? sessionStore.getSession(task.createdByAgentId)
      : task.requesterAgentId
      ? sessionStore.getSession(task.requesterAgentId)
      : undefined

    let targetSession = sessionStore.getSession(targetAgent.id)
    if (!targetSession) {
      targetSession = await this.ensureSession({
        agentId: targetAgent.id,
        teamId: team.id,
        role: targetAgent.isTeamLead || targetAgent.role === "tech-lead" ? "tech-lead" : "team-agent",
        agentSlug: targetAgent.catalogSlug,
        workspaceDirectory: team.projectPath,
        systemPromptPath: targetAgent.systemPromptPath,
      })
    }

    const startedTask = pipelineExecutor.startTask(task.id)
    if (!startedTask) {
      return
    }

    const syntheticHandoff: AgentHandoffEvent = {
      team,
      requestId: startedTask.id,
      rootRequestId: startedTask.id,
      sourceSessionId: sourceSession?.session.id,
      fromAgentId: task.createdByAgentId ?? task.requesterAgentId ?? targetAgent.id,
      fromAgentName: task.createdByAgentName ?? task.requesterAgentName,
      toAgentId: targetAgent.id,
      toAgentName: targetAgent.name,
      toAgentSlug: targetAgent.catalogSlug,
      toAgentPromptPath: targetAgent.systemPromptPath,
      targetScope: "team",
      teamId: team.id,
      teamName: team.name,
      task: startedTask.description,
      files: startedTask.files,
      branchName: startedTask.branchName,
    }

    const requesterName = task.requesterAgentName ?? task.createdByAgentName ?? task.requesterAgentId ?? "time"
    const boardMessage = [
      `Nova issue do board atribuída a você em ${team.name}.`,
      `Issue: ${startedTask.title ?? startedTask.description}`,
      `Request ID: ${startedTask.id}`,
      `Solicitante: ${requesterName}`,
      `Prioridade: ${startedTask.priority ?? "não informada"}`,
      startedTask.context ? `Contexto: ${startedTask.context}` : "",
      startedTask.acceptanceCriteria?.length
        ? `Critérios de aceite: ${startedTask.acceptanceCriteria.join(" | ")}`
        : "",
      startedTask.files.length ? `Arquivos relacionados: ${startedTask.files.join(", ")}` : "",
      "",
      "A issue já está marcada como in_progress no board. Trabalhe de forma autônoma e atualize o issue ao concluir.",
      "Use `tasks_update` para registrar progresso ou bloqueios com contexto objetivo.",
      "Use `tasks_complete` quando concluir a execução desta issue.",
    ].filter(Boolean).join("\n")

    this.emit("vibe:agent:handoff", {
      ...syntheticHandoff,
      sessionId: targetSession.session.id,
    })

    if (sourceSession) {
      this.delegationOriginsBySessionId.set(targetSession.session.id, {
        requestId: startedTask.id,
        sourceAgentId: sourceSession.agentId,
        sourceSessionId: sourceSession.session.id,
        sourceAgentName: task.createdByAgentName ?? task.requesterAgentName ?? sourceSession.agentId,
        targetAgentId: targetAgent.id,
        targetAgentName: targetAgent.name,
        teamId: team.id,
        teamName: team.name,
        task: startedTask.description,
        payload: {
          title: startedTask.title,
          context: startedTask.context,
          priority: startedTask.priority,
          successCriteria: startedTask.acceptanceCriteria ?? [],
          requesterAgentId: task.requesterAgentId,
          requesterAgentName: task.requesterAgentName,
        },
        files: startedTask.files,
        branchName: startedTask.branchName,
      })
    }

    try {
      await this.sendMessageToSession(
        targetSession.session.id,
        boardMessage,
        targetSession.systemPrompt,
        targetSession.agentSlug,
        targetSession.workspaceDirectory,
        undefined,
        targetSession.teamId,
        targetSession.role,
        targetSession.agentId
      )
    } catch (error) {
      pipelineExecutor.failTask(task.id, error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  private async deliverAgentHandoff(event: AgentHandoffEvent): Promise<void> {
    try {
      const targetTeam = teamStore.getTeam(event.team.id)
      if (!targetTeam) {
        throw new Error(`Target team not found: ${event.team.id}`)
      }

      const isGlobalTarget = event.targetScope === "global"
      const targetAgent = isGlobalTarget
        ? {
            id: event.toAgentId,
            name: event.toAgentName ?? event.toAgentId,
            catalogSlug: event.toAgentSlug ?? event.toAgentId,
            systemPromptPath: event.toAgentPromptPath ?? "",
            isTeamLead: false,
            role: "global",
          }
        : targetTeam.agents.find((agent) => agent.id === event.toAgentId)
      if (!targetAgent) {
        throw new Error(`Target agent not found: ${event.toAgentId}`)
      }

      let targetSession = sessionStore.getSession(event.toAgentId)
      if (!targetSession) {
        targetSession = await this.ensureSession({
          agentId: targetAgent.id,
          teamId: isGlobalTarget ? undefined : targetTeam.id,
          role: isGlobalTarget
            ? (event.toAgentSlug === "ceo" ? "global-ceo" : "global-agent")
            : targetAgent.isTeamLead || targetAgent.role === "tech-lead"
            ? "tech-lead"
            : "team-agent",
          agentSlug: targetAgent.catalogSlug,
          workspaceDirectory: isGlobalTarget ? "" : targetTeam.projectPath,
          systemPromptPath: targetAgent.systemPromptPath,
        })
      }

      const fromAgent = targetTeam.agents.find((agent) => agent.id === event.fromAgentId)
      const toAgent = targetAgent
      const sourceSession = event.sourceSessionId
        ? sessionStore.listSessions().find((session) => session.session?.id === event.sourceSessionId)
        : sessionStore.getSession(event.fromAgentId)
      const isStaffingRequest =
        isGlobalTarget &&
        (event.toAgentSlug === "hr-global" || /rh global/i.test(event.toAgentName ?? ""))
      const staffingRole =
        event.payload?.desiredRole ||
        event.payload?.role ||
        event.payload?.position ||
        event.payload?.profile ||
        event.payload?.requestedRole
      const staffingJustification =
        event.payload?.justification ||
        event.payload?.reason ||
        event.payload?.context ||
        event.payload?.why

      const missingStaffingFields = isStaffingRequest
        ? [
            !event.payload?.team ? "team" : null,
            !staffingRole ? "desiredRole" : null,
            !staffingJustification ? "justification" : null,
          ].filter((value): value is string => Boolean(value))
        : []

      const communicationRequest = this.registerCommunicationHandoff({
        event,
        sourceSession,
        targetSession,
        fromAgentName: fromAgent?.name ?? event.fromAgentName,
        toAgentName: toAgent?.name ?? event.toAgentName,
      })

      const delegationPayloadLines = formatDelegationPayload(event.payload, [
        "team",
        "to",
        "target",
        "agent",
        "agentId",
        "agentSlug",
        ...(isStaffingRequest
          ? ["desiredRole", "role", "justification", "priority", "context", "successCriteria", "mustHaves", "niceToHave"]
          : []),
      ])
      const staffingPayloadLines = isStaffingRequest
        ? [
            "Solicitação estruturada:",
            `- team: ${targetTeam.name}`,
            `- desiredRole: ${staffingRole ?? "não informado"}`,
            `- justification: ${staffingJustification ?? "não informada"}`,
            ...(event.payload?.priority ? [`- priority: ${formatPayloadValue(event.payload.priority)}`] : []),
            ...(event.payload?.successCriteria
              ? [`- successCriteria: ${formatPayloadValue(event.payload.successCriteria)}`]
              : []),
            ...(event.payload?.mustHaves ? [`- mustHaves: ${formatPayloadValue(event.payload.mustHaves)}`] : []),
            ...(missingStaffingFields.length
              ? [
                  `- campos faltantes detectados: ${missingStaffingFields.join(", ")}`,
                  "- se a necessidade ainda fizer sentido, peça uma única clarificação objetiva ao solicitante antes de contratar.",
                ]
              : []),
          ]
        : []

      const decisionPipelineGuidanceLines = this.buildDecisionPipelineGuidanceLines(
        communicationRequest.decisionPipeline.stage,
        targetSession.role,
        isStaffingRequest
      )

      const handoffMessage = [
        isGlobalTarget
          ? `Você recebeu uma solicitação de ${fromAgent?.name ?? event.fromAgentId} relacionada ao time ${targetTeam.name}.`
          : `Você recebeu uma tarefa de ${fromAgent?.name ?? event.fromAgentId} para ${toAgent?.name ?? event.toAgentId}.`,
        `Request ID: ${communicationRequest.requestId}`,
        `Pipeline stage: ${communicationRequest.decisionPipeline.stage}`,
        `Solicitante original: ${communicationRequest.requesterAgentName ?? communicationRequest.requesterAgentId}`,
        `Time: ${targetTeam.name}`,
        `Tarefa: ${event.task}`,
        event.files?.length ? `Arquivos relacionados: ${event.files.join(", ")}` : "",
        ...delegationPayloadLines,
        ...staffingPayloadLines,
        ...decisionPipelineGuidanceLines,
        "",
        isGlobalTarget
          ? "Se a solicitação for válida para o seu papel, prossiga usando o protocolo apropriado."
          : "Responda de forma objetiva, aja com autonomia e, se precisar de outro agente, use [DELEGATE] sem esperar confirma\u00e7\u00e3o extra para o fluxo normal.",
        "Regra obrigatória: esta solicitação precisa ter retorno bidirecional.",
        "Quando concluir, atualizar, recusar ou depender de mais informações, devolva um retorno formal para quem solicitou.",
        "Se você envolver outros agentes, continue coordenando até que o desfecho volte ao solicitante original.",
        "A resposta final visível ao usuário deve ser sempre em português do Brasil.",
      ].filter(Boolean).join("\n")

      this.emit("vibe:agent:handoff", {
        ...event,
        requestId: communicationRequest.requestId,
        rootRequestId: communicationRequest.rootRequestId,
        sessionId: targetSession.session.id,
      })

      if (sourceSession && sourceSession.session.id !== targetSession.session.id) {
        this.delegationOriginsBySessionId.set(targetSession.session.id, {
          requestId: communicationRequest.requestId,
          sourceAgentId: sourceSession.agentId,
          sourceSessionId: sourceSession.session.id,
          sourceAgentName: fromAgent?.name ?? sourceSession.agentId,
          targetAgentId: targetAgent.id,
          targetAgentName: targetAgent.name,
          teamId: targetTeam.id,
          teamName: targetTeam.name,
          task: event.task,
          payload: event.payload,
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
            const executableCommands = commands.filter((command) =>
              this.shouldExecuteStructuredCommand(command, managedSession)
            )

            for (const command of executableCommands) {
              const enrichedCommand = this.enrichCommandWithCommunicationContext(command, managedSession, sessionID)
              ceoCommandExecutor.execute(enrichedCommand, {
                agentId: managedSession.agentId,
                teamId: managedSession.teamId,
                role: managedSession.role,
                agentSlug: managedSession.agentSlug,
              }).catch((err) => {
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
        this.requestIdBySessionId.delete(info.id)
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

  private cloneCommunicationRequest(request: CommunicationRequest): CommunicationRequest {
    return {
      ...request,
      decisionPipeline: {
        ...request.decisionPipeline,
        transitions: request.decisionPipeline.transitions.map((transition) => ({ ...transition })),
      },
      participants: request.participants.map((participant) => ({ ...participant })),
      history: request.history.map((entry) => ({ ...entry })),
      latestResponse: request.latestResponse ? { ...request.latestResponse } : undefined,
      finalResponse: request.finalResponse ? { ...request.finalResponse } : undefined,
    }
  }

  private emitCommunicationUpdate(request: CommunicationRequest): void {
    this.emit("vibe:communication:update", this.cloneCommunicationRequest(request))
  }

  private upsertCommunicationParticipant(
    participants: CommunicationParticipant[],
    nextParticipant: CommunicationParticipant
  ): CommunicationParticipant[] {
    const index = participants.findIndex((participant) => participant.agentId === nextParticipant.agentId)
    if (index === -1) {
      return [...participants, nextParticipant]
    }

    const current = participants[index]
    const updated = [...participants]
    updated[index] = {
      ...current,
      agentName: nextParticipant.agentName || current.agentName,
      role:
        communicationRoleWeight(nextParticipant.role) > communicationRoleWeight(current.role)
          ? nextParticipant.role
          : current.role,
    }
    return updated
  }

  private detectCommunicationStatus(
    defaultStatus: "done" | "error",
    detail?: string
  ): CommunicationRequestStatus {
    const normalized = (detail || "").trim().toLowerCase()

    if (defaultStatus === "error") {
      return "failed"
    }

    if (!normalized) {
      return "completed"
    }

    if (/(aguardando|preciso de mais informa|mais informa|need more info|awaiting|pendente de resposta)/i.test(normalized)) {
      return "awaiting_info"
    }

    if (/(recusad|negad|indeferid|reprovad|refused|declined|cannot approve|can't approve)/i.test(normalized)) {
      return "refused"
    }

    if (/(em andamento|in progress|ongoing)/i.test(normalized)) {
      return "in_progress"
    }

    return "completed"
  }

  private detectDecisionPipelineOutcome(detail?: string): DecisionPipelineOutcome | undefined {
    const normalized = (detail || "").trim().toLowerCase()
    if (!normalized) {
      return undefined
    }

    if (normalized.includes("can_execute_with_current_team")) {
      return "can_execute_with_current_team"
    }
    if (normalized.includes("needs_reprioritization")) {
      return "needs_reprioritization"
    }
    if (normalized.includes("needs_staffing")) {
      return "needs_staffing"
    }
    if (normalized.includes("blocked_missing_context")) {
      return "blocked_missing_context"
    }
    if (normalized.includes("reject_hire_and_reuse_team")) {
      return "reject_hire_and_reuse_team"
    }
    if (normalized.includes("ask_one_clarification")) {
      return "ask_one_clarification"
    }
    if (/\[hire_agent\]|(^|\s)hire($|\s)|contratad|contratação aprovada/i.test(normalized)) {
      return "hire"
    }

    return undefined
  }

  private enrichCommandWithCommunicationContext(
    command: CeoCommand,
    managedSession: ManagedSession,
    sessionID: string
  ): CeoCommand {
    if (command.type !== "HIRE_AGENT") {
      return command
    }

    const requestId = this.requestIdBySessionId.get(sessionID)
    if (!requestId) {
      return command
    }

    const request = this.communicationRequestsById.get(requestId)
    if (!request) {
      return command
    }

    const payload = { ...(request.payload ?? {}), ...command.payload }
    const desiredRole = payload.desiredRole ?? payload.role

    if (!payload.team && request.teamName) {
      payload.team = request.teamName
    }
    if (!payload.role && desiredRole) {
      payload.role = desiredRole
    }
    if (!payload.desiredRole && desiredRole) {
      payload.desiredRole = desiredRole
    }
    if (!payload.task && request.task) {
      payload.task = request.task
    }
    if (!payload.files && request.files?.length) {
      payload.files = request.files
    }
    if (!payload.branchName && request.branchName) {
      payload.branchName = request.branchName
    }
    if (!payload.requesterAgentId && request.requesterAgentId) {
      payload.requesterAgentId = request.requesterAgentId
    }
    if (!payload.requesterAgentName && request.requesterAgentName) {
      payload.requesterAgentName = request.requesterAgentName
    }
    if (!payload.context && request.payload?.context) {
      payload.context = request.payload.context
    }
    if (!payload.priority && request.payload?.priority) {
      payload.priority = request.payload.priority
    }
    if (!payload.successCriteria && request.payload?.successCriteria) {
      payload.successCriteria = request.payload.successCriteria
    }
    if (!payload.title && typeof request.task === "string" && request.task.trim()) {
      payload.title = request.task.slice(0, 90)
    }

    if (!payload.createdByAgentName) {
      payload.createdByAgentName =
        managedSession.agentSlug === "hr-global" ? "RH Global" : managedSession.agentSlug
    }

    return {
      ...command,
      payload,
    }
  }

  private shouldExecuteStructuredCommand(command: CeoCommand, managedSession: ManagedSession): boolean {
    if (command.type !== "HIRE_AGENT") {
      return true
    }

    return managedSession.role === "global-ceo" || managedSession.agentSlug === "hr-global"
  }

  private inferDecisionPipelineStageFromHandoff(
    event: AgentHandoffEvent,
    targetAgent: { isTeamLead?: boolean; role?: string; catalogSlug?: string }
  ): DecisionPipelineStage {
    if (event.targetScope === "global" && targetAgent.catalogSlug === "hr-global") {
      return "staffing"
    }

    if (targetAgent.isTeamLead || targetAgent.role === "tech-lead") {
      return "tech_assessment"
    }

    return "execution"
  }

  private inferDecisionPipelineStageFromResponse(
    request: CommunicationRequest,
    sourceSession: ManagedSession,
    origin: DelegationOrigin,
    status: CommunicationRequestStatus,
    outcome?: DecisionPipelineOutcome
  ): DecisionPipelineStage {
    if (status === "awaiting_info" || status === "failed" || status === "refused") {
      return "blocked"
    }

    if (sourceSession.agentId === request.requesterAgentId && status === "completed") {
      return "done"
    }

    if (outcome === "needs_staffing" || origin.targetAgentId === "hr-global") {
      return "staffing"
    }

    if (outcome === "needs_reprioritization" || outcome === "blocked_missing_context") {
      return "blocked"
    }

    if (sourceSession.role === "tech-lead") {
      return "tech_assessment"
    }

    return "execution"
  }

  private appendDecisionPipelineTransition(
    state: DecisionPipelineState | undefined,
    stage: DecisionPipelineStage,
    input: Omit<DecisionPipelineTransition, "id" | "timestamp" | "stage">
  ): DecisionPipelineState {
    const transitions = state?.transitions ? [...state.transitions] : []
    const lastStage = transitions[transitions.length - 1]?.stage

    if (lastStage !== stage) {
      transitions.push({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        stage,
        ...input,
      })
    }

    return {
      stage,
      outcome: state?.outcome,
      transitions,
    }
  }

  private buildDecisionPipelineGuidanceLines(
    stage: DecisionPipelineStage,
    targetRole: ManagedSession["role"],
    isStaffingRequest: boolean
  ): string[] {
    if (stage === "tech_assessment" && targetRole === "tech-lead") {
      return [
        "Pipeline obrigatório desta demanda: avalie e escolha um desfecho explícito.",
        "- Se o time atual consegue executar: responda e avance com `can_execute_with_current_team`, registrando issue pronta no board e movendo a execução.",
        "- Se realmente faltar perfil/capacidade: responda e avance com `needs_staffing`, acionando o RH Global com `[DELEGATE]` estruturado.",
        "- Se houver conflito real de prioridade: use `needs_reprioritization`.",
        "- Se faltar contexto indispensável: use `blocked_missing_context` e faça no máximo uma pergunta objetiva.",
      ]
    }

    if (stage === "staffing" && isStaffingRequest) {
      return [
        "Pipeline obrigatório de staffing: devolva um desfecho explícito.",
        "- `hire`: contratar e seguir com `[HIRE_AGENT]` quando a necessidade estiver clara.",
        "- `reject_hire_and_reuse_team`: negar contratação quando o time atual ainda conseguir absorver a demanda.",
        "- `ask_one_clarification`: pedir uma única clarificação objetiva quando faltar informação indispensável.",
      ]
    }

    if (stage === "execution") {
      return [
        "Pipeline atual: execution.",
        "- Execute a tarefa atribuída, atualize status com objetividade e devolva um retorno claro para quem solicitou.",
      ]
    }

    return []
  }

  private registerCommunicationHandoff(input: {
    event: AgentHandoffEvent
    sourceSession?: ManagedSession
    targetSession: ManagedSession
    fromAgentName?: string
    toAgentName?: string
  }): CommunicationRequest {
    const { event, sourceSession, targetSession, fromAgentName, toAgentName } = input
    const inheritedRequestId =
      event.requestId || (sourceSession ? this.requestIdBySessionId.get(sourceSession.session.id) : undefined)
    const existingRequest = inheritedRequestId ? this.communicationRequestsById.get(inheritedRequestId) : undefined
    const requestId = existingRequest?.requestId || inheritedRequestId || crypto.randomUUID()
    const rootRequestId = existingRequest?.rootRequestId || event.rootRequestId || requestId
    const requesterAgentId = existingRequest?.requesterAgentId || event.fromAgentId
    const requesterAgentName = existingRequest?.requesterAgentName || fromAgentName || event.fromAgentName
    const stage = this.inferDecisionPipelineStageFromHandoff(event, {
      isTeamLead: targetSession.role === "tech-lead",
      role: targetSession.role === "tech-lead" ? "tech-lead" : targetSession.role,
      catalogSlug: targetSession.agentSlug,
    })
    const decisionPipeline = this.appendDecisionPipelineTransition(existingRequest?.decisionPipeline, stage, {
      reason: event.task,
      actorAgentId: event.fromAgentId,
      actorAgentName: fromAgentName || event.fromAgentName,
      targetAgentId: event.toAgentId,
      targetAgentName: toAgentName || event.toAgentName,
    })

    const participantsWithSender = this.upsertCommunicationParticipant(existingRequest?.participants ?? [], {
      agentId: event.fromAgentId,
      agentName: fromAgentName || event.fromAgentName,
      role: requesterAgentId === event.fromAgentId ? "requester" : "intermediary",
    })
    const participants = this.upsertCommunicationParticipant(participantsWithSender, {
      agentId: event.toAgentId,
      agentName: toAgentName || event.toAgentName,
      role: requesterAgentId === event.toAgentId ? "requester" : "executor",
    })

    const historyEntry: CommunicationHistoryEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      kind: "handoff",
      agentId: event.fromAgentId,
      agentName: fromAgentName || event.fromAgentName,
      targetAgentId: event.toAgentId,
      targetAgentName: toAgentName || event.toAgentName,
      status: existingRequest ? "in_progress" : "requested",
      detail: event.task,
    }

    const request: CommunicationRequest = {
      requestId,
      rootRequestId,
      requesterAgentId,
      requesterAgentName,
      currentAgentId: event.toAgentId,
      currentAgentName: toAgentName || event.toAgentName,
      teamId: event.teamId || existingRequest?.teamId,
      teamName: event.teamName || existingRequest?.teamName,
      task: existingRequest?.task || event.task,
      payload: existingRequest?.payload || event.payload,
      files: event.files || existingRequest?.files,
      branchName: event.branchName || existingRequest?.branchName,
      status: existingRequest ? "in_progress" : "requested",
      decisionPipeline,
      participants,
      history: [...(existingRequest?.history ?? []), historyEntry],
      latestResponse: existingRequest?.latestResponse,
      finalResponse: existingRequest?.finalResponse,
    }

    if (sourceSession) {
      this.requestIdBySessionId.set(sourceSession.session.id, requestId)
    }
    this.requestIdBySessionId.set(targetSession.session.id, requestId)
    this.communicationRequestsById.set(requestId, request)
    this.emitCommunicationUpdate(request)
    return request
  }

  private registerCommunicationResponse(
    targetSessionId: string,
    sourceSession: ManagedSession,
    origin: DelegationOrigin,
    status: "done" | "error",
    detail?: string
  ): CommunicationRequest | undefined {
    const requestId = origin.requestId || this.requestIdBySessionId.get(targetSessionId)
    if (!requestId) {
      return undefined
    }

    const request = this.communicationRequestsById.get(requestId)
    if (!request) {
      return undefined
    }

    const normalizedStatus = this.detectCommunicationStatus(status, detail)
    const outcome = this.detectDecisionPipelineOutcome(detail)
    const stage = this.inferDecisionPipelineStageFromResponse(
      request,
      sourceSession,
      origin,
      normalizedStatus,
      outcome
    )
    const timestamp = new Date().toISOString()
    const response: CommunicationResponse = {
      fromAgentId: origin.targetAgentId,
      fromAgentName: origin.targetAgentName,
      toAgentId: sourceSession.agentId,
      toAgentName: origin.sourceAgentName || sourceSession.agentId,
      status: normalizedStatus,
      detail,
      timestamp,
    }

    const historyEntry: CommunicationHistoryEntry = {
      id: crypto.randomUUID(),
      timestamp,
      kind: "response",
      agentId: origin.targetAgentId,
      agentName: origin.targetAgentName,
      targetAgentId: sourceSession.agentId,
      targetAgentName: origin.sourceAgentName || sourceSession.agentId,
      status: normalizedStatus,
      detail,
    }

    const isReturningToRequester = sourceSession.agentId === request.requesterAgentId
    const participants = this.upsertCommunicationParticipant(request.participants, {
      agentId: sourceSession.agentId,
      agentName: isReturningToRequester ? request.requesterAgentName : origin.sourceAgentName,
      role: isReturningToRequester ? "requester" : "intermediary",
    })

    const updated: CommunicationRequest = {
      ...request,
      currentAgentId: sourceSession.agentId,
      currentAgentName: isReturningToRequester ? request.requesterAgentName : origin.sourceAgentName,
      status:
        isReturningToRequester
          ? normalizedStatus
          : normalizedStatus === "completed"
          ? "in_progress"
          : normalizedStatus,
      decisionPipeline: {
        ...this.appendDecisionPipelineTransition(request.decisionPipeline, stage, {
          reason: detail,
          actorAgentId: origin.targetAgentId,
          actorAgentName: origin.targetAgentName,
          targetAgentId: sourceSession.agentId,
          targetAgentName: isReturningToRequester ? request.requesterAgentName : origin.sourceAgentName,
        }),
        outcome: outcome ?? request.decisionPipeline.outcome,
      },
      participants,
      history: [...request.history, historyEntry],
      latestResponse: response,
      finalResponse: isReturningToRequester ? response : request.finalResponse,
    }

    this.requestIdBySessionId.delete(targetSessionId)
    this.requestIdBySessionId.set(sourceSession.session.id, requestId)
    this.communicationRequestsById.set(requestId, updated)
    this.emitCommunicationUpdate(updated)
    return updated
  }

  private buildDelegationReturnMessage(
    origin: DelegationOrigin,
    sourceAgentName: string,
    targetAgentName: string,
    status: CommunicationRequestStatus,
    detail?: string
  ): string {
    const trimmedDetail = detail?.trim() || ""
    const summaryText = trimmedDetail.length > 600
      ? `${trimmedDetail.slice(0, 600).trimEnd()}...`
      : trimmedDetail
    const summaryLine = summaryText
      ? `Resumo: ${summaryText}`
      : status === "failed"
      ? "A tarefa delegada não pôde ser concluída."
      : status === "refused"
      ? "A solicitação delegada foi recusada."
      : status === "awaiting_info"
      ? "A solicitação delegada depende de mais informações."
      : "A tarefa delegada foi concluída com sucesso."

    return [
      `Atualização da delegação para ${sourceAgentName}:`,
      `O agente ${targetAgentName} encerrou a tarefa com status "${status}".`,
      `Tarefa: ${origin.task}`,
      origin.teamName ? `Time: ${origin.teamName}` : "",
      origin.branchName ? `Branch: ${origin.branchName}` : "",
      origin.files?.length ? `Arquivos: ${origin.files.join(", ")}` : "",
      summaryLine,
      "",
      "Responda ao usuário final em português do Brasil, de forma objetiva, informando o status atual, o que foi concluído e o que ainda falta.",
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
    const rawDetail = detail?.trim() || this.getVisibleSessionText(targetSessionId)
    const parsedDetail = rawDetail ? parseCeoOutput(rawDetail) : { commands: [], remainingText: "" }
    const visibleDetail = parsedDetail.remainingText.trim() || rawDetail
    const communicationRequest = this.registerCommunicationResponse(
      targetSessionId,
      sourceSession,
      origin,
      status,
      visibleDetail
    )
    const normalizedStatus = communicationRequest?.latestResponse?.status || this.detectCommunicationStatus(status, visibleDetail)
    const message = this.buildDelegationReturnMessage(
      origin,
      sourceAgentName,
      targetAgentName,
      normalizedStatus,
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

    void this.routeAgentHandoff(handoffEvent)
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

    void this.routeAgentHandoff(handoffEvent)
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

  async getConfigDiagnostics(input?: { projectPath?: string }): Promise<ConfigDiagnostics> {
    await this.ensureInitialized()

    const warnings: string[] = []
    const sources = collectConfigSources(input?.projectPath)
    const mergedConfig: Record<string, any> = {}

    const homeDir = process.env.USERPROFILE || process.env.HOME || os.homedir()
    const globalConfigPath = join(homeDir, ".config", "opencode", "opencode.json")
    const globalConfigPathJsonc = join(homeDir, ".config", "opencode", "opencode.jsonc")
    const projectConfigPath = findNearestProjectConfig(input?.projectPath)
    const customConfigPath = process.env.OPENCODE_CONFIG

    const parseAndMerge = (filePath: string | null) => {
      if (!filePath || !existsSync(filePath)) return
      const result = safeReadJson5(filePath)
      warnings.push(...result.warnings)
      if (Object.keys(result.data).length > 0) {
        const next = deepMergeConfig(mergedConfig, result.data)
        Object.keys(mergedConfig).forEach((key) => delete mergedConfig[key])
        Object.assign(mergedConfig, next)
      }
    }

    parseAndMerge(globalConfigPath)
    parseAndMerge(globalConfigPathJsonc)
    parseAndMerge(projectConfigPath)
    parseAndMerge(customConfigPath ?? null)

    let providers: ProviderSummary[] = []
    let models: Array<{ id: string; providerID: string; name: string }> = []

    try {
      const response = await this.client!.config.providers()
      const providersData = response?.data?.providers || response?.providers || []
      const providerList = Array.isArray(providersData) ? providersData : []

      providers = providerList.map((provider: any) => {
        const providerModels = provider.models ? Object.entries(provider.models) : []
        return {
          id: provider.id,
          name: provider.name,
          api: provider.api,
          modelCount: providerModels.length,
          models: providerModels.map(([modelId, model]: [string, any]) => ({
            id: modelId,
            name: model?.name || modelId,
            family: model?.family,
            status: model?.status,
          })),
          optionKeys: provider.options ? Object.keys(provider.options) : [],
          env: Array.isArray(provider.env) ? provider.env : [],
          hasHeaders: Boolean(provider.headers && Object.keys(provider.headers).length > 0),
        }
      })

      models = providerList.flatMap((provider: any) => {
        if (!provider.models) return []
        return Object.entries(provider.models).map(([modelId, model]: [string, any]) => ({
          id: modelId,
          providerID: provider.id,
          name: model?.name || modelId,
        }))
      })
    } catch (error) {
      warnings.push(`Não foi possível ler providers do SDK: ${error instanceof Error ? error.message : String(error)}`)
    }

    return {
      sdkReady: this.isReady(),
      providers,
      models,
      sources,
      env: {
        OPENCODE_CONFIG: process.env.OPENCODE_CONFIG,
        OPENCODE_CONFIG_DIR: process.env.OPENCODE_CONFIG_DIR,
        OPENCODE_TUI_CONFIG: process.env.OPENCODE_TUI_CONFIG,
      },
      mergedSummary: {
        username: mergedConfig.username,
        logLevel: mergedConfig.logLevel,
        model: mergedConfig.model,
        small_model: mergedConfig.small_model,
        default_agent: mergedConfig.default_agent,
        share: mergedConfig.share,
        autoupdate: mergedConfig.autoupdate,
        snapshot: mergedConfig.snapshot,
        disabled_providers: Array.isArray(mergedConfig.disabled_providers) ? mergedConfig.disabled_providers : [],
        enabled_providers: Array.isArray(mergedConfig.enabled_providers) ? mergedConfig.enabled_providers : [],
        providerCount: providers.length,
        mcpCount: mergedConfig.mcp && typeof mergedConfig.mcp === "object" ? Object.keys(mergedConfig.mcp).length : 0,
        commandCount: mergedConfig.command && typeof mergedConfig.command === "object" ? Object.keys(mergedConfig.command).length : 0,
        toolCount: mergedConfig.tools && typeof mergedConfig.tools === "object" ? Object.keys(mergedConfig.tools).length : 0,
        skillsPaths: Array.isArray(mergedConfig.skills?.paths) ? mergedConfig.skills.paths.length : 0,
        skillsUrls: Array.isArray(mergedConfig.skills?.urls) ? mergedConfig.skills.urls.length : 0,
        watcherIgnoreCount: Array.isArray(mergedConfig.watcher?.ignore) ? mergedConfig.watcher.ignore.length : 0,
      },
      warnings,
    }
  }

  async getConfigEditorData(input?: { scope?: ConfigScope; projectPath?: string }): Promise<EditableConfigDraft & { models: Array<{ id: string; providerID: string; name: string }>; warnings: string[] }> {
    await this.ensureInitialized()

    const scope = input?.scope ?? (input?.projectPath ? "project" : "global")
    const targetPath = resolveConfigFilePath(scope, input?.projectPath)
    const warnings: string[] = []
    const config = readConfigObject(targetPath)
    const providersConfig = config.provider && typeof config.provider === "object" && !Array.isArray(config.provider)
      ? config.provider as Record<string, any>
      : {}
    const enabledProviderIds = Array.isArray(config.enabled_providers)
      ? config.enabled_providers.filter((value: unknown): value is string => typeof value === "string")
      : []
    const disabledProviderIds = Array.isArray(config.disabled_providers)
      ? config.disabled_providers.filter((value: unknown): value is string => typeof value === "string")
      : []

    let sdkProviders: any[] = []
    let models: Array<{ id: string; providerID: string; name: string }> = []

    try {
      const response = await this.client!.config.providers()
      const providersData = response?.data?.providers || response?.providers || []
      sdkProviders = Array.isArray(providersData) ? providersData : []
      models = sdkProviders.flatMap((provider: any) => {
        if (!provider.models) return []
        return Object.entries(provider.models).map(([modelId, model]: [string, any]) => ({
          id: modelId,
          providerID: provider.id,
          name: model?.name || modelId,
        }))
      })
    } catch (error) {
      warnings.push(`Não foi possível ler providers do SDK: ${error instanceof Error ? error.message : String(error)}`)
    }

    const providers = sdkProviders.map((provider: any) =>
      toEditableProviderDraft(provider, providersConfig[provider.id], enabledProviderIds, disabledProviderIds)
    )

    return {
      scope,
      targetPath,
      exists: existsSync(targetPath),
      defaults: buildEditableDefaults(config),
      providers,
      models,
      mcpJson: safeStringifySection(config.mcp),
      permissionsJson: safeStringifySection(config.permission),
      toolsJson: safeStringifySection(config.tools),
      warnings,
    }
  }

  async saveConfigEditorData(input: SaveConfigDraftInput): Promise<{ success: true; targetPath: string; warnings: string[] }> {
    await this.ensureInitialized()

    const warnings: string[] = []
    const targetPath = resolveConfigFilePath(input.scope, input.projectPath)
    const existingConfig = readConfigObject(targetPath)
    const nextConfig: Record<string, any> = deepMergeConfig(existingConfig, {})

    for (const [key, value] of Object.entries(serializeEditableDefaults(input.defaults))) {
      if (value === undefined || value === "") {
        delete nextConfig[key]
      } else {
        nextConfig[key] = value
      }
    }

    const existingProviders = nextConfig.provider && typeof nextConfig.provider === "object" && !Array.isArray(nextConfig.provider)
      ? nextConfig.provider as Record<string, any>
      : {}

    const updatedProviders = { ...existingProviders }
    const activeProviderIds: string[] = []
    const inactiveProviderIds: string[] = []

    for (const provider of input.providers) {
      const previous = updatedProviders[provider.id] && typeof updatedProviders[provider.id] === "object"
        ? updatedProviders[provider.id] as Record<string, any>
        : {}
      const trimmedName = provider.name?.trim()
      const trimmedApi = provider.api?.trim()
      const trimmedApiKey = provider.options.apiKey?.trim()
      const trimmedBaseUrl = provider.options.baseURL?.trim()
      const trimmedEnterpriseUrl = provider.options.enterpriseUrl?.trim()

      updatedProviders[provider.id] = {
        ...previous,
        id: provider.id,
        name: trimmedName || previous.name,
        api: trimmedApi || previous.api,
        options: {
          ...(previous.options && typeof previous.options === "object" && !Array.isArray(previous.options) ? previous.options : {}),
          ...(trimmedApiKey ? { apiKey: trimmedApiKey } : {}),
          ...(trimmedBaseUrl ? { baseURL: trimmedBaseUrl } : {}),
          ...(trimmedEnterpriseUrl ? { enterpriseUrl: trimmedEnterpriseUrl } : {}),
          ...(provider.options.setCacheKey !== undefined ? { setCacheKey: provider.options.setCacheKey } : {}),
          ...(provider.options.timeout !== undefined ? { timeout: provider.options.timeout } : {}),
          ...(provider.options.chunkTimeout !== undefined ? { chunkTimeout: provider.options.chunkTimeout } : {}),
        },
      }

      if (provider.active) {
        activeProviderIds.push(provider.id)
      } else {
        inactiveProviderIds.push(provider.id)
      }
    }

    nextConfig.provider = updatedProviders

    const parseSection = (section: string, sectionName: string): unknown | undefined => {
      if (!section.trim()) {
        return undefined
      }

      try {
        return JSON5.parse(section)
      } catch (error) {
        throw new Error(`Seção ${sectionName} inválida: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    const nextMcp = parseSection(input.mcpJson, "MCP")
    const nextPermission = parseSection(input.permissionsJson, "permissions")
    const nextTools = parseSection(input.toolsJson, "tools")

    if (nextMcp === undefined) {
      delete nextConfig.mcp
    } else {
      nextConfig.mcp = nextMcp
    }

    if (nextPermission === undefined) {
      delete nextConfig.permission
    } else {
      nextConfig.permission = nextPermission
    }

    if (nextTools === undefined) {
      delete nextConfig.tools
    } else {
      nextConfig.tools = nextTools
    }

    const previousEnabled = Array.isArray(existingConfig.enabled_providers)
      ? existingConfig.enabled_providers.filter((value: unknown): value is string => typeof value === "string")
      : []
    const previousDisabled = Array.isArray(existingConfig.disabled_providers)
      ? existingConfig.disabled_providers.filter((value: unknown): value is string => typeof value === "string")
      : []

    const enabledSet = new Set(previousEnabled)
    const disabledSet = new Set(previousDisabled)

    for (const id of activeProviderIds) {
      enabledSet.add(id)
      disabledSet.delete(id)
    }

    for (const id of inactiveProviderIds) {
      disabledSet.add(id)
      enabledSet.delete(id)
    }

    nextConfig.enabled_providers = Array.from(enabledSet)
    nextConfig.disabled_providers = Array.from(disabledSet)

    mkdirSync(dirname(targetPath), { recursive: true })
    writeFileSync(targetPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8")

    warnings.push(`Config salva em ${targetPath}`)

    return {
      success: true,
      targetPath,
      warnings,
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
