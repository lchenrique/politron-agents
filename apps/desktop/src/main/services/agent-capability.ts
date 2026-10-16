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
 * 
 * FIX: Added extensive Portuguese keyword support for Brazilian Portuguese
 */
export function inferTaskScope(taskDescription: string): ExecutionScope {
  const text = taskDescription.toLowerCase()

  // FRONTEND indicators (English + Portuguese)
  const frontendPatterns = [
    // English
    /\b(frontend|front-end|front end|react|vue|angular|html|css|interface|ui|tela|pagina|page|component|button|modal|sidebar|layout|style)\b/,
    // Portuguese
    /\b(tela|página|pagina|componente|botao|botão|modal|sidebar|barra|layout|estilo|css|html|frontend|front-end|front end|interface|usuário|usuario|input|form|campo|grid|responsivo|react|vue|angular|sidebar|menu|nav|navegação|navegacao|header|cabeçalho|cabecalho|footer|rodapé|rodape)\b/,
    // UI actions
    /\b(exibir|mostrar|renderizar|render|aparecer|desaparecer|clicar|click|scroll|animação|animacao|transição|transicao|efeito|drag|arrastar|toque|touch)\b/,
  ]
  
  for (const pattern of frontendPatterns) {
    if (pattern.test(text)) {
      return "frontend"
    }
  }

  // DESIGN indicators (English + Portuguese)
  const designPatterns = [
    // English
    /\b(design|design|ui|ux|figma|prototipo|wireframe|mockup|layout visual|estilo|cor|pallete|font)\b/,
    // Portuguese
    /\b(design|design|ui|ux|figma|protótipo|prototipo|wireframe|mockup|estilo visual|cor|cores|paleta|fonte|font|typography|grid visual|composição|composicao|layout visual|marca|brand|identidade|design system|design system)\b/,
  ]
  
  for (const pattern of designPatterns) {
    if (pattern.test(text)) {
      return "design"
    }
  }

  // QA indicators (English + Portuguese)
  const qaPatterns = [
    // English
    /\b(qa|test|teste|testing|verificar|validar|criterio|critério|bug|erro|falha|coverage|integration|e2e|unit)\b/,
    // Portuguese
    /\b(teste|testar|testes|teste unitário|teste de integração|teste e2e|teste de ponta a ponta|qa|qualidade|verificar|validar|critério|criterio|aceite|bug|erro|falha|regressão|regressao|coverage|cobertura|unittest|integration|funcional|aceite|aceitar|rejeitar|critério de aceite)\b/,
  ]
  
  for (const pattern of qaPatterns) {
    if (pattern.test(text)) {
      return "qa"
    }
  }

  // DEVOPS indicators (English + Portuguese)
  const devopsPatterns = [
    // English
    /\b(devops|deploy|docker|kubernetes|k8s|ci|cd|pipeline|infrastructure|infra|server|nginx|cloud|aws|gcp|azure)\b/,
    // Portuguese
    /\b(devops|deploy|deployar|implantar|docker|kubernetes|k8s|ci|cd|pipeline|infraestrutura|infra|server|servidor|nginx|cloud|nuvem|aws|gcp|azure|github|gitlab|jenkins|github actions|github actions|workflow|automação|automacao|script|bash|shell|terminal|procfile|environment|variável|variavel|ambiente|produção|producao|homologação|homologacao)\b/,
  ]
  
  for (const pattern of devopsPatterns) {
    if (pattern.test(text)) {
      return "devops"
    }
  }

  // BACKEND indicators (English + Portuguese)
  const backendPatterns = [
    // English
    /\b(backend|back-end|back end|api|rest|graphql|database|db|sql|postgres|mysql|mongodb|server|endpoint|auth|jwt|token|controller|service|model|schema)\b/,
    // Portuguese
    /\b(backend|back-end|back end|api|rest|graphql|banco de dados|bd|sql|postgres|mysql|mongodb|server|servidor|endpoint|autenticação|autenticacao|jwt|token|controller|service|serviço|model|modelo|schema|validação|validacao|regras de negócio|regras de negocio|lógica|logica|camada|rota|route|verb|request|response|header|body|param|query)\b/,
  ]
  
  for (const pattern of backendPatterns) {
    if (pattern.test(text)) {
      return "backend"
    }
  }

  // ARCHITECTURE indicators (English + Portuguese)
  const architecturePatterns = [
    // English
    /\b(architect|arquitetura|architecture|design pattern|microservice|monolith|schema|model|design system|component design)\b/,
    // Portuguese
    /\b(arquitetura|arquiteto|architecture|design pattern|padrão de projeto|padroes|micro-serviço|microservico|monolito|schema|modelo|design system|sistema de design|componente|component design|especificação|especificacao|abstração|abstracao|interface|contrato|api design|modelagem)\b/,
  ]
  
  for (const pattern of architecturePatterns) {
    if (pattern.test(text)) {
      return "architecture"
    }
  }

  // Specific task verbs that indicate scope (Portuguese focused)
  const taskVerbs: Record<string, ExecutionScope> = {
    // Portuguese verbs
    "criar": "frontend",        // criar tela
    "implementar": "backend",   // implementar função
    "desenvolver": "general",   // desenvolver feature
    "desenhar": "design",      // desenhar interface
    "testar": "qa",             // testar fluxo
    "corrigir": "qa",           // corrigir bug
    "ajustar": "frontend",     // ajustar estilo
    "adicionar": "frontend",    // adicionar campo
    "remover": "frontend",     // remover botão
    "configurar": "devops",    // configurar deploy
    "migrar": "backend",        // migrar banco
    "otimizar": "backend",      // otimizar query
    "criar endpoint": "backend", // criar endpoint
    "criar componente": "frontend", // criar componente
    "escrever teste": "qa",      // escrever teste
    "revisar código": "qa",      // revisar código (code review)
  }

  // Check for task verb patterns
  for (const [verb, scope] of Object.entries(taskVerbs)) {
    if (text.includes(verb)) {
      return scope
    }
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
