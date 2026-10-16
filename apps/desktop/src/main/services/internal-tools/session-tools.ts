/**
 * Session Tools - Internal Tools for Session Management
 *
 * Phase 1: Dual Provider Architecture
 * Handlers delegate to sessionStore
 */

import { sessionStore } from "../session-store"
import type { InternalTool } from "./team-tools"

// =============================================================================
// SESSION TOOLS
// =============================================================================

export function createSessionTools(): InternalTool[] {
  return [
    {
      name: "session_get_active",
      description: "Obtém a sessão ativa de um agente",
      input_schema: {
        type: "object",
        properties: {
          agentId: { type: "string", description: "ID do agente" },
        },
        required: ["agentId"],
      },
      handler: async (args) => {
        const agentId = args.agentId as string
        const session = sessionStore.getSession(agentId)

        if (!session) {
          return { error: `Nenhuma sessão ativa para o agente: ${agentId}` }
        }

        return {
          agentId: session.agentId,
          teamId: session.teamId || null,
          role: session.role,
          status: session.status,
          workspaceDirectory: session.workspaceDirectory || null,
          agentSlug: session.agentSlug || null,
          systemPromptPath: session.systemPromptPath || null,
          lastEventAt: session.lastEventAt || null,
          hasSession: true,
        }
      },
    },
    {
      name: "session_get_history",
      description: "Obtém o histórico de todas as sessões ativas",
      input_schema: {
        type: "object",
        properties: {
          agentId: { type: "string", description: "Filtrar por ID do agente (opcional)" },
          role: {
            type: "string",
            description: "Filtrar por papel (role)",
            enum: ["global-ceo", "global-agent", "tech-lead", "team-agent"],
          },
          teamId: { type: "string", description: "Filtrar por ID do time (opcional)" },
        },
        required: [],
      },
      handler: async (args) => {
        const agentId = args.agentId as string | undefined
        const role = args.role as "global-ceo" | "global-agent" | "tech-lead" | "team-agent" | undefined
        const teamId = args.teamId as string | undefined

        let sessions = sessionStore.listSessions()

        if (agentId) {
          sessions = sessions.filter((session) => session.agentId === agentId)
        }

        if (role) {
          sessions = sessions.filter((session) => session.role === role)
        }

        if (teamId) {
          sessions = sessions.filter((session) => session.teamId === teamId)
        }

        return {
          sessions: sessions.map((session) => ({
            agentId: session.agentId,
            teamId: session.teamId || null,
            role: session.role,
            status: session.status,
            workspaceDirectory: session.workspaceDirectory || null,
            agentSlug: session.agentSlug || null,
            systemPromptPath: session.systemPromptPath || null,
            lastEventAt: session.lastEventAt || null,
          })),
          total: sessions.length,
        }
      },
    },
  ]
}
