/**
 * Entry Point Router
 *
 * Determines whether a request should follow the hierarchical flow
 * (CEO → Tech Lead → HR → Agent) or the direct flow (User → Agent directly).
 *
 * Key principle: Users can talk directly to specialist agents without
 * going through leadership. Leadership flow is used when:
 * - User explicitly talks to CEO Global or Tech Lead
 * - Staffing/hiring is needed
 * - Task requires coordination across multiple agents
 */

import type { Team } from "../types/team"
import type { Agent } from "../types/team"
import {
  isCoordinator,
  isExecutor,
  getAgentExecutionMode,
  resolveEntryPointFlow,
  inferTaskScope,
  canExecutorHandleScope,
  type AgentExecutionMode,
} from "./agent-capability"
import { matchesAgentIdentity } from "./ceo-command-executor"

/**
 * Routing decision for a request
 */
export interface RoutingDecision {
  /** Which flow to use */
  flow: "hierarchical" | "direct"
  /** The agent that should handle the request */
  targetAgent: Agent | null
  /** Reason for the routing decision */
  reason: string
  /** If true, the target agent can execute directly */
  canExecuteDirectly: boolean
  /** If true, the request should be queued as a board task */
  shouldQueueBoardTask: boolean
  /** Inferred scope of the task */
  taskScope: string
}

/**
 * Result of resolving an agent from user input
 */
export interface AgentResolution {
  /** The resolved agent */
  agent: Agent | null
  /** How the agent was matched */
  matchType: "exact" | "fuzzy" | "role" | "none"
}

/**
 * Resolve an agent in a team by various lookup methods
 */
export function resolveTeamAgent(
  team: Team,
  userInput: string
): AgentResolution {
  const normalized = normalizeForLookup(userInput)

  // 1. Exact match by ID
  const byId = team.agents.find((a) => a.id === normalized)
  if (byId) return { agent: byId, matchType: "exact" }

  // 2. Exact match by catalogSlug
  const bySlug = team.agents.find(
    (a) => normalizeForLookup(a.catalogSlug) === normalized
  )
  if (bySlug) return { agent: bySlug, matchType: "exact" }

  // 3. Exact match by name
  const byName = team.agents.find(
    (a) => normalizeForLookup(a.name) === normalized
  )
  if (byName) return { agent: byName, matchType: "exact" }

  // 4. Fuzzy match - contains in name
  const fuzzyName = team.agents.find(
    (a) =>
      normalizeForLookup(a.name).includes(normalized) ||
      normalized.includes(normalizeForLookup(a.name))
  )
  if (fuzzyName) return { agent: fuzzyName, matchType: "fuzzy" }

  // 5. Match by role
  const byRole = team.agents.find(
    (a) =>
      normalizeForLookup(a.role).includes(normalized) ||
      normalized.includes(normalizeForLookup(a.role))
  )
  if (byRole) return { agent: byRole, matchType: "role" }

  // 6. Try partial matching on slug parts
  const partialSlug = team.agents.find((a) => {
    const slugParts = a.catalogSlug.split("-")
    return slugParts.some(
      (part) =>
        normalized.includes(part) || part.includes(normalized)
    )
  })
  if (partialSlug) return { agent: partialSlug, matchType: "fuzzy" }

  return { agent: null, matchType: "none" }
}

/**
 * Determine the routing for a request based on entry point and context.
 * V2 now forces hierarchical routing even when the user addresses an executor directly.
 */
export function determineRouting(params: {
  /** The team context (optional) */
  team?: Team
  /** The agent that received the request (entry point) */
  entryPointAgentId?: string
  /** The slug of the entry point agent */
  entryPointAgentSlug?: string
  /** User's requested agent/target */
  requestedTarget?: string
  /** Task description */
  taskDescription?: string
  /** Whether the user explicitly asked for leadership */
  explicitLeadership?: boolean
  /** Whether user is directly messaging an agent (bypassing hierarchy) */
  isDirectMessage?: boolean
}): RoutingDecision {
  const {
    team,
    entryPointAgentId,
    entryPointAgentSlug,
    requestedTarget,
    taskDescription = "",
    explicitLeadership = false,
    isDirectMessage = false,
  } = params

  // Default decision
  const defaultDecision: RoutingDecision = {
    flow: "hierarchical",
    targetAgent: null,
    reason: "Fallback to hierarchical flow",
    canExecuteDirectly: false,
    shouldQueueBoardTask: true,
    taskScope: inferTaskScope(taskDescription),
  }

  // Even when the user talks directly to an executor, V2 requires hierarchical routing.
  if (isDirectMessage && entryPointAgentId) {
    const directAgent = team?.agents.find((a) => a.id === entryPointAgentId)
    
    if (directAgent) {
      const agentMode = getAgentExecutionMode(directAgent.catalogSlug)
      
      // Coordinators still route hierarchically even in "direct" user messages
      if (agentMode === "coordinator") {
        return {
          ...defaultDecision,
          flow: "hierarchical",
          targetAgent: directAgent,
          reason: `Direct message to coordinator ${directAgent.catalogSlug} - using hierarchical flow`,
          canExecuteDirectly: false,
          shouldQueueBoardTask: false,
        }
      }

      const taskScope = inferTaskScope(taskDescription)
      const canHandle = canExecutorHandleScope(directAgent.catalogSlug, taskScope as any)

      return {
        flow: "hierarchical",
        targetAgent: directAgent,
        reason: `Direct user message to executor ${directAgent.catalogSlug} - routing through hierarchical flow`,
        canExecuteDirectly: false,
        shouldQueueBoardTask: !canHandle,
        taskScope,
      }
    }
  }

  // If entry point is a coordinator, use hierarchical
  if (entryPointAgentSlug && isCoordinator(entryPointAgentSlug)) {
    return {
      ...defaultDecision,
      flow: "hierarchical",
      reason: `Entry point ${entryPointAgentSlug} is a coordinator - using hierarchical flow`,
    }
  }

  // If user explicitly asked for leadership
  if (explicitLeadership) {
    return {
      ...defaultDecision,
      flow: "hierarchical",
      reason: "User explicitly requested leadership involvement",
    }
  }

  // If no team context, use hierarchical (can't determine)
  if (!team) {
    return {
      ...defaultDecision,
      flow: "hierarchical",
      reason: "No team context - cannot determine direct execution eligibility",
    }
  }

  // Try to resolve the requested target in the team
  if (requestedTarget) {
    const resolution = resolveTeamAgent(team, requestedTarget)

    if (resolution.agent) {
      const agent = resolution.agent
      const agentMode = getAgentExecutionMode(agent.catalogSlug)

      // If target is a coordinator, use hierarchical
      if (agentMode === "coordinator") {
        return {
          flow: "hierarchical",
          targetAgent: agent,
          reason: `Target ${agent.catalogSlug} is a coordinator`,
          canExecuteDirectly: false,
          shouldQueueBoardTask: false,
          taskScope: inferTaskScope(taskDescription),
        }
      }

      const taskScope = inferTaskScope(taskDescription)
      const canHandle = canExecutorHandleScope(agent.catalogSlug, taskScope as any)

      return {
        flow: "hierarchical",
        targetAgent: agent,
        reason: `Target ${agent.catalogSlug} is an executor (matched by ${resolution.matchType}) - routing through hierarchical flow`,
        canExecuteDirectly: false,
        shouldQueueBoardTask: !canHandle,
        taskScope,
      }
    }

    // Couldn't find the requested agent in team
    // Fall back to hierarchical so Tech Lead can handle
    return {
      ...defaultDecision,
      reason: `Could not resolve ${requestedTarget} in team - falling back to hierarchical`,
    }
  }

  // No explicit target - check if entry point can execute directly
  if (entryPointAgentId) {
    const entryAgent = team.agents.find((a) => a.id === entryPointAgentId)

    if (entryAgent && isExecutor(entryAgent.catalogSlug)) {
      const taskScope = inferTaskScope(taskDescription)
      const canHandle = canExecutorHandleScope(entryAgent.catalogSlug, taskScope as any)

      return {
        flow: "hierarchical",
        targetAgent: entryAgent,
        reason: canHandle
          ? `Entry point ${entryAgent.catalogSlug} is executor-capable, but V2 requires hierarchical routing`
          : `Entry point ${entryAgent.catalogSlug} cannot handle ${taskScope} - using hierarchical`,
        canExecuteDirectly: false,
        shouldQueueBoardTask: !canHandle,
        taskScope,
      }
    }

    // Entry point is coordinator or not found
    return {
      ...defaultDecision,
      targetAgent: entryAgent ?? null,
      reason: `Entry point is a coordinator or not found in team - using hierarchical`,
    }
  }

  return defaultDecision
}

/**
 * Normalize a string for agent lookup
 */
export function normalizeForLookup(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/[_\s\/]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Check if a message suggests the user wants to talk to leadership
 */
export function isLeadershipRequest(message: string): boolean {
  const normalized = normalizeForLookup(message).toLowerCase()
  const leadershipTerms = [
    "ceo",
    "tech lead",
    "tech-lead",
    "rh global",
    "hr global",
    "coordenador",
    "lider",
    "chefia",
    "geree",
    "gerir",
    "preciso de ajuda",
    "quem \u00e9 o l\u00edder",
    "quem \u00e9 o tech lead",
    "falar com",
  ]

  return leadershipTerms.some((term) => normalized.includes(term))
}

/**
 * Check if a message suggests direct execution request
 */
export function isDirectExecutionRequest(message: string): boolean {
  const normalized = normalizeForLookup(message).toLowerCase()
  const directTerms = [
    "faz",
    "fazer",
    "implementa",
    "implementar",
    "cria",
    "criar",
    "desenvolve",
    "desenvolver",
    "escreve",
    "escrever",
    "codifica",
    "codificar",
    "testa",
    "testar",
    "desenha",
    "desenhar",
    "projeta",
    "projetar",
  ]

  const agentMentions = [
    "frontend",
    "backend",
    "designer",
    "qa",
    "devops",
    "arquiteto",
    "developer",
    "dev",
  ]

  const hasDirectVerb = directTerms.some((term) => normalized.includes(term))
  const hasAgentMention = agentMentions.some((term) =>
    normalized.includes(term)
  )

  return hasDirectVerb && hasAgentMention
}

/**
 * Extract potential agent name from user message
 */
export function extractAgentMention(
  message: string
): string | null {
  const normalized = normalizeForLookup(message)
  const agentPatterns = [
    /(?:frontend|front-end|front end)[\s-]?(?:dev|developer|engineer)?/i,
    /(?:backend|back-end|back end)[\s-]?(?:dev|developer|engineer)?/i,
    /(?:ui|ux|design)[\s-]?(?:designer|dev|developer)?/i,
    /(?:qa|test|tester)[\s-]?(?:engineer|dev)?/i,
    /(?:devops|dev-ops)[\s-]?(?:engineer|automator)?/i,
    /(?:fullstack|full-stack)[\s-]?(?:dev|developer)?/i,
    /(?:arquiteto|arquitect)[\s-]?(?:de software|software)?/i,
  ]

  for (const pattern of agentPatterns) {
    const match = message.match(pattern)
    if (match) {
      return match[0]
    }
  }

  // Also try to find agent by name in team
  return null
}

/**
 * Determine if the request should use direct execution flow
 * This is a convenience wrapper around determineRouting for common cases
 */
export function shouldUseDirectFlow(params: {
  team?: Team
  entryPointAgentId?: string
  entryPointAgentSlug?: string
  requestedTarget?: string
  taskDescription?: string
}): boolean {
  const decision = determineRouting(params)
  return decision.flow === "direct"
}
