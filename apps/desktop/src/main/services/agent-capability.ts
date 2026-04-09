/**
 * Agent Capability System
 *
 * Defines which agents can execute tasks directly vs. which are coordinators
 * that must go through the hierarchical flow.
 *
 * Entry point determines flow:
 * - Hierarchical: CEO Global, Tech Lead, HR Global → evaluate capacity → delegate/staff
 * - Direct: Team executors → can execute directly if task is in scope
 */

import { OPENCODE_MARKETPLACE_AGENTS } from "./agent-catalog"
import type { OpenCodeAgentDefinition } from "./agent-catalog"

/**
 * Agent execution modes
 */
export type AgentExecutionMode =
  /** Agent is a coordinator - must use hierarchical flow */
  | "coordinator"
  /** Agent is an executor - can use direct flow for in-scope tasks */
  | "executor"

/**
 * Scope that an executor agent can handle directly
 */
export type ExecutionScope =
  /** Frontend development tasks */
  | "frontend"
  /** Backend/API development tasks */
  | "backend"
  /** UI/UX design tasks */
  | "design"
  /** QA/testing tasks */
  | "qa"
  /** DevOps/infrastructure tasks */
  | "devops"
  /** Architecture/planning tasks */
  | "architecture"
  /** Any task (general purpose agents) */
  | "general"

/**
 * Capability definition for an agent
 */
export interface AgentCapability {
  slug: string
  mode: AgentExecutionMode
  /** Scopes this agent can handle directly (for executors) */
  directScopes?: ExecutionScope[]
  /** Human-readable description */
  description: string
}

/**
 * Well-known coordinator slugs
 */
export const COORDINATOR_SLUGS = new Set([
  "ceo",
  "hr-global",
  "tech-lead",
  "studio-producer",
  "software-architect", // can coach but not execute directly
])

/**
 * Map of executor slugs to their direct execution scopes
 */
const EXECUTOR_SCOPES: Record<string, ExecutionScope[]> = {
  "frontend-developer": ["frontend", "general"],
  "frontend-dev": ["frontend", "general"],
  "backend-architect": ["backend", "architecture", "general"],
  "backend-dev": ["backend", "general"],
  "ui-designer": ["design", "general"],
  "ux-designer": ["design", "general"],
  "reality-checker": ["qa", "general"],
  "qa-tester": ["qa", "general"],
  "devops-automator": ["devops", "general"],
  "code-reviewer": ["qa", "general"],
  "data-engineer": ["backend", "general"],
  "database-optimizer": ["backend", "general"],
  "api-tester": ["qa", "backend", "general"],
}

/**
 * All executor scopes combined
 */
const ALL_SCOPES: ExecutionScope[] = [
  "frontend",
  "backend",
  "design",
  "qa",
  "devops",
  "architecture",
  "general",
]

/**
 * Check if a slug is a coordinator
 */
export function isCoordinator(slug: string): boolean {
  const normalized = slug.toLowerCase().replace(/[_\s-]+/g, "-")
  return COORDINATOR_SLUGS.has(normalized)
}

/**
 * Check if a slug is an executor
 */
export function isExecutor(slug: string): boolean {
  return !isCoordinator(slug)
}

/**
 * Get the execution mode for an agent
 */
export function getAgentExecutionMode(slug: string): AgentExecutionMode {
  return isCoordinator(slug) ? "coordinator" : "executor"
}

/**
 * Get the scopes an executor can handle directly
 */
export function getExecutorScopes(slug: string): ExecutionScope[] {
  const normalized = slug.toLowerCase().replace(/[_\s-]+/g, "-")
  return EXECUTOR_SCOPES[normalized] ?? ["general"]
}

/**
 * Check if an executor can handle a task in a given scope
 */
export function canExecutorHandleScope(slug: string, scope: ExecutionScope): boolean {
  if (isCoordinator(slug)) return false
  const scopes = getExecutorScopes(slug)
  return scopes.includes(scope) || scopes.includes("general")
}

/**
 * Infer the execution scope from task description
 * This is a heuristic - returns the most likely scope
 */
export function inferTaskScope(taskDescription: string): ExecutionScope {
  const text = taskDescription.toLowerCase()

  // Frontend indicators
  if (
    /\b(frontend|front-end|front end|react|vue|angular|html|css|interface|ui|tela|pagina|page|component|button|modal|sidebar|layout|style)\b/.test(
      text
    )
  ) {
    return "frontend"
  }

  // Design indicators
  if (/\b(design|design|ui|ux|figma|prototipo|wireframe|mockup|layout visual|estilo|cor|pallete|font)\b/.test(text)) {
    return "design"
  }

  // QA indicators
  if (/\b(qa|test|teste|testing|verificar|validar|criterio|critério|bug|erro|falha|coverage|integration|e2e|unit)\b/.test(text)) {
    return "qa"
  }

  // DevOps indicators
  if (/\b(devops|deploy|docker|kubernetes|k8s|ci|cd|pipeline|infrastructure|infra|server|nginx|cloud|aws|gcp|azure)\b/.test(text)) {
    return "devops"
  }

  // Backend indicators
  if (
    /\b(backend|back-end|back end|api|rest|graphql|database|db|sql|postgres|mysql|mongodb|server|endpoint|auth|jwt|token|controller|service|model|schema)\b/.test(
      text
    )
  ) {
    return "backend"
  }

  // Architecture indicators
  if (
    /\b(architect|arquitetura|architecture|design pattern|microservice|monolith|schema|model|design system|component design)\b/.test(
      text
    )
  ) {
    return "architecture"
  }

  return "general"
}

/**
 * Get capability definition for an agent by slug
 */
export function getAgentCapability(slug: string): AgentCapability {
  const normalized = slug.toLowerCase().replace(/[_\s-]+/g, "-")

  if (isCoordinator(normalized)) {
    return {
      slug: normalized,
      mode: "coordinator",
      description: getCoordinatorDescription(normalized),
    }
  }

  return {
    slug: normalized,
    mode: "executor",
    directScopes: getExecutorScopes(normalized),
    description: getExecutorDescription(normalized),
  }
}

function getCoordinatorDescription(slug: string): string {
  switch (slug) {
    case "ceo":
      return "CEO Global - coordena estratégia e delega para times"
    case "hr-global":
      return "RH Global - gerencia contratação e alocação de agentes"
    case "tech-lead":
      return "Tech Lead - avalia capacidade técnica e coordena fluxo hierárquico"
    case "studio-producer":
      return "Studio Producer - coordena produção e recursos"
    case "software-architect":
      return "Software Architect - define padrões e arquitetura, não executa código"
    default:
      return `Coordinator: ${slug}`
  }
}

function getExecutorDescription(slug: string): string {
  const scopes = getExecutorScopes(slug)
  const scopeStr = scopes.filter((s) => s !== "general").join(", ") || "tarefas gerais"
  return `Executor - pode executar diretamente tarefas de: ${scopeStr}`
}

/**
 * Resolve which flow should be used based on entry point
 *
 * @param entryPointAgentSlug - The slug of the agent that received the request
 * @param targetAgentSlug - Optional slug of the target agent (for delegation)
 * @returns "hierarchical" or "direct"
 */
export function resolveEntryPointFlow(
  entryPointAgentSlug: string,
  targetAgentSlug?: string
): "hierarchical" | "direct" {
  const entryMode = getAgentExecutionMode(entryPointAgentSlug)

  // If entry point is a coordinator, always use hierarchical
  if (entryMode === "coordinator") {
    return "hierarchical"
  }

  // If we're delegating TO a coordinator, use hierarchical
  if (targetAgentSlug && isCoordinator(targetAgentSlug)) {
    return "hierarchical"
  }

  // Otherwise, it's a direct execution flow
  return "direct"
}

/**
 * Build a human-readable description of available agents for a team
 */
export function buildTeamAgentsDescription(agents: Array<{ name: string; catalogSlug: string; role: string }>): string {
  return agents
    .map((agent) => {
      const cap = getAgentCapability(agent.catalogSlug)
      return `- ${agent.name} [${agent.catalogSlug}]: ${cap.description}`
    })
    .join("\n")
}

/**
 * Build a description of available marketplace agents for staffing
 */
export function buildMarketplaceAgentsDescription(): string {
  const agents = OPENCODE_MARKETPLACE_AGENTS.map((agent) => {
    const cap = getAgentCapability(agent.slug)
    return `- ${agent.name} [${agent.slug}]: ${cap.description}`
  })

  return `[Agentes dispon\u00edveis para contrata\u00e7\u00e3o]\n${agents.join("\n")}`
}
