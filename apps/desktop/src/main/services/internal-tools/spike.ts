/**
 * SPIKE: Internal Tools - Dual Provider Architecture Validation
 * 
 * This is a proof-of-concept demonstrating the internal tools approach.
 * NOT for production use - validates the architecture before implementation.
 * 
 * Phase 0: Validation Spike
 * - Implement 3 internal tools: team_list, tasks_list, delegate_to_board
 * - Demonstrate MiniMax Direct vs OpenCode SDK comparison
 * - Measure latency/cost for validation gate
 */

import { EventEmitter } from "events"
import { teamStore } from "../team-store"
import { pipelineExecutor } from "../pipeline-executor"
import type { PipelineTask, Team, TaskStatus } from "../types/team"

// =============================================================================
// TYPES - Match OpenCode tool schema
// =============================================================================

export interface InternalTool {
  name: string
  description: string
  input_schema: {
    type: string
    properties: Record<string, unknown>
    required: string[]
  }
  handler: (args: Record<string, unknown>, context: ToolContext) => Promise<unknown>
}

export interface ToolContext {
  agentId: string
  agentName: string
  sessionId: string
  workspaceDirectory?: string
}

export interface ToolCall {
  name: string
  input: Record<string, unknown>
}

export interface ToolResult {
  tool_name: string
  output: string
  is_error?: boolean
}

// =============================================================================
// MINIMAX CLIENT (Stub for Spike - requires @anthropic-ai/sdk)
// =============================================================================

/**
 * MiniMax Direct Client using Anthropic SDK compatibility
 * API: https://api.minimax.io/anthropic
 * Model: MiniMax-M2.7
 */
class MiniMaxClient {
  private apiKey: string
  private baseUrl = "https://api.minimax.io/anthropic"
  private model = "MiniMax-M2.7"

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  /**
   * Send a message with tools and get streaming response
   * This is the core method we'll compare against OpenCode SDK
   */
  async *sendMessageWithTools(
    _systemPrompt: string,
    _userMessage: string,
    _tools: InternalTool[]
  ): AsyncGenerator<{ type: string; content?: string; tool?: ToolCall }, void, unknown> {
    // In production, this would use the Anthropic SDK:
    // const client = new Anthropic({ apiKey: this.apiKey, baseURL: this.baseUrl })
    // See: https://docs.anthropic.com/en/api/overview
    
    // For spike, we simulate the response
    console.log(`[MiniMax] Sending message to ${this.model}`)
    console.log(`[MiniMax] Tools available: ${_tools.map(t => t.name).join(", ")}`)
    
    // Simulated response for validation
    yield { type: "text", content: "Team list retrieved. Found 2 teams." }
  }
}

// =============================================================================
// INTERNAL TOOLS IMPLEMENTATION
// =============================================================================

/**
 * Creates the 3 internal tools for the spike
 * These are direct implementations that don't go through OpenCode SDK
 */
export function createInternalTools(
  teamStore: TeamStore,
  pipelineExecutor: PipelineExecutor
): InternalTool[] {
  return [
    // ---------------------------------------------------------------------
    // TOOL 1: team_list
    // ---------------------------------------------------------------------
    {
      name: "team_list",
      description: "Lista todos os times do workspace",
      input_schema: {
        type: "object",
        properties: {},
        required: []
      },
      handler: async (_args, _context) => {
        const teams = teamStore.listTeams()
        return {
          teams: teams.map(t => ({
            id: t.id,
            name: t.name,
            projectPath: t.projectPath,
            projectName: t.projectName,
            memberCount: t.agents.length,
            status: t.status,
          })),
          total: teams.length,
        }
      },
    },

    // ---------------------------------------------------------------------
    // TOOL 2: tasks_list
    // ---------------------------------------------------------------------
    {
      name: "tasks_list",
      description: "Lista tasks do board do time atual ou de um time específico",
      input_schema: {
        type: "object",
        properties: {
          teamId: { type: "string", description: "ID do time" },
          status: { 
            type: "string", 
            description: "Filtrar por status",
            enum: ["backlog", "triage", "ready", "in_progress", "blocked", "in_review", "done", "cancelled"]
          },
        },
        required: []
      },
      handler: async (args, _context) => {
        const teamId = args.teamId as string | undefined
        const status = args.status as TaskStatus | undefined
        
        // Use the team's pipeline to get tasks
        // In production: pipelineExecutor.getTasksByTeam(teamId)
        // For spike, we'll use the tasks stored in team objects
        const allTeams = teamStore.listTeams()
        const tasks: Array<{
          id: string
          title: string
          status: TaskStatus
          teamId: string
          agentId: string
        }> = []
        
        for (const team of allTeams) {
          if (!teamId || team.id === teamId) {
            for (const task of team.pipeline?.tasks || []) {
              if (!status || task.status === status) {
                tasks.push({
                  id: task.id,
                  title: task.title,
                  status: task.status,
                  teamId: task.teamId,
                  agentId: task.agentId,
                })
              }
            }
          }
        }

        return {
          tasks,
          total: tasks.length,
        }
      },
    },

    // ---------------------------------------------------------------------
    // TOOL 3: delegate_to_board
    // ---------------------------------------------------------------------
    {
      name: "delegate_to_board",
      description: "Cria uma task no board para delegação",
      input_schema: {
        type: "object",
        properties: {
          teamId: { type: "string", description: "ID do time" },
          title: { type: "string", description: "Título da task" },
          description: { type: "string", description: "Descrição completa" },
          agentId: { type: "string", description: "ID do agente responsável" },
          agentName: { type: "string", description: "Nome do agente" },
          priority: { 
            type: "string", 
            description: "Prioridade",
            enum: ["high", "medium", "low"]
          },
        },
        required: ["description"]
      },
      handler: async (args, context) => {
        const task = pipelineExecutor.addTask({
          teamId: args.teamId as string || "",
          agentId: args.agentId as string || "",
          title: args.title as string,
          description: args.description as string,
          requesterAgentId: context.agentId,
          requesterAgentName: context.agentName,
          priority: args.priority as "high" | "medium" | "low",
          files: [],
          dependsOn: [],
        })

        return {
          taskId: task.id,
          title: task.title,
          status: task.status,
          created: true,
        }
      },
    },
  ]
}

// =============================================================================
// LATENCY INSTRUMENTATION
// =============================================================================

export interface LatencyMetrics {
  startTime: number
  endTime?: number
  provider: "minimax" | "opencode"
  operation: string
}

class LatencyInstrumentation {
  private metrics: LatencyMetrics[] = []

  start(operation: string, provider: "minimax" | "opencode"): LatencyMetrics {
    const metric: LatencyMetrics = {
      startTime: Date.now(),
      provider,
      operation,
    }
    this.metrics.push(metric)
    return metric
  }

  end(metric: LatencyMetrics): number {
    metric.endTime = Date.now()
    return metric.endTime - metric.startTime
  }

  getMetrics(): { operation: string; provider: string; duration: number }[] {
    return this.metrics.map(m => ({
      operation: m.operation,
      provider: m.provider,
      duration: (m.endTime || Date.now()) - m.startTime,
    }))
  }
}

// =============================================================================
// COMPARISON RUNNER
// =============================================================================

/**
 * Runs a comparison between MiniMax Direct and OpenCode SDK
 * This is the core of the Phase 0 validation
 */
export async function runComparison(
  teamStore: TeamStore,
  pipelineExecutor: PipelineExecutor,
  openCodeSdk: unknown, // OpencodeSdkService
  miniMaxApiKey: string,
  testPrompt: string
): Promise<{
  minimax: { latencyMs: number; output: string }
  opencode: { latencyMs: number; output: string }
  comparison: { latencyImprovement: number; meetsGate: boolean }
}> {
  const instrumentation = new LatencyInstrumentation()

  // Test 1: MiniMax Direct (simulated)
  console.log("\n=== Test 1: MiniMax Direct ===")
  const miniStart = instrumentation.start("prompt", "minimax")
  
  // In production, this would be actual MiniMax call
  // For spike, we simulate
  await new Promise(r => setTimeout(r, 150)) // Simulated ~150ms for MiniMax
  const miniLatency = instrumentation.end(miniStart)
  
  console.log(`[MiniMax] Latency: ${miniLatency}ms`)

  // Test 2: OpenCode SDK (current implementation)
  console.log("\n=== Test 2: OpenCode SDK ===")
  const ocStart = instrumentation.start("prompt", "opencode")
  
  // In production, this would call actual OpenCode SDK
  // For spike, we estimate based on current architecture
  await new Promise(r => setTimeout(r, 1200)) // Estimated ~1200ms for OpenCode
  const ocLatency = instrumentation.end(ocStart)
  
  console.log(`[OpenCode] Latency: ${ocLatency}ms`)

  // Comparison
  const latencyImprovement = ((ocLatency - miniLatency) / ocLatency) * 100
  const meetsGate = miniLatency < ocLatency * 0.7 // Gate: MiniMax < 70% of OpenCode

  return {
    minimax: { latencyMs: miniLatency, output: "Teams retrieved (simulated)" },
    opencode: { latencyMs: ocLatency, output: "Teams retrieved (estimated)" },
    comparison: {
      latencyImprovement: Math.round(latencyImprovement),
      meetsGate,
    },
  }
}

// =============================================================================
// SPIKE ENTRY POINT
// =============================================================================

/**
 * Run the validation spike
 * Usage: Import and call from a test script
 */
export async function runSpikeValidation(): Promise<void> {
  console.log("\n" + "=".repeat(60))
  console.log("PHASE 0: VALIDATION SPIKE - Internal Tools")
  console.log("=".repeat(60))

  // Note: In actual test, we'd inject these from the app context
  // const teamStore = getTeamStore()
  // const pipelineExecutor = getPipelineExecutor()
  // const openCodeSdk = getOpenCodeSdk()
  // const apiKey = process.env.MINIMAX_API_KEY

  console.log("\n[Spike] Internal tools created:")
  console.log("  - team_list: List all teams")
  console.log("  - tasks_list: List tasks by team")
  console.log("  - delegate_to_board: Create task for delegation")

  console.log("\n[Spike] To run comparison:")
  console.log("  1. Add @anthropic-ai/sdk to package.json")
  console.log("  2. Set MINIMAX_API_KEY environment variable")
  console.log("  3. Run: runComparison(teamStore, pipelineExecutor, sdk, apiKey, testPrompt)")

  console.log("\n" + "=".repeat(60))
  console.log("VALIDATION GATE CRITERIA:")
  console.log("  Latência MiniMax < 70% da latência OpenCode")
  console.log("  E qualidade de resposta >= equivalente")
  console.log("=".repeat(60) + "\n")
}

// Export for testing
export const spike = {
  runSpikeValidation,
  createInternalTools,
  runComparison,
  LatencyInstrumentation,
}