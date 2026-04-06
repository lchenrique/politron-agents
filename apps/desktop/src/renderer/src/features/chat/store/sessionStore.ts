/**
 * Session Store - gerenciamento de sessoes SDK por contexto.
 *
 * O SDK continua sendo a fonte das sessoes reais, mas a UI precisa manter
 * a sessao ativa separada por contexto de chat para nao vazar historico entre:
 * - CEO global
 * - agentes diferentes
 * - projetos diferentes
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SdkSession {
  id: string;
  title: string;
  directory?: string;
  projectID?: string;
  parentID?: string;
  time?: {
    created: number;
    updated: number;
    compacting?: number;
  };
  summary?: {
    additions: number;
    deletions: number;
    files: number;
  };
  share?: {
    url: string;
  };
  version?: string;
}

export interface SessionContextInput {
  agentId: string | null;
  isGlobal: boolean;
  teamId?: string | null;
}

export function buildSessionContextKey(input: SessionContextInput): string | null {
  if (!input.agentId) {
    return null;
  }

  if (input.isGlobal) {
    return `global:${input.agentId}`;
  }

  return `project:${input.teamId ?? 'global'}:${input.agentId}`;
}

interface SessionState {
  sessions: SdkSession[];
  activeSessionIdByContext: Record<string, string | null>;
  sessionIdsByContext: Record<string, string[]>;
  setSessions: (sessions: SdkSession[], contextKey?: string | null) => void;
  addSession: (session: SdkSession, contextKey?: string | null) => void;
  removeSession: (sessionId: string, contextKey?: string | null) => void;
  selectSession: (contextKey: string | null, sessionId: string | null) => void;
  getActiveSession: (contextKey?: string | null) => SdkSession | null;
  getActiveSessionId: (contextKey?: string | null) => string | null;
  clearSessions: () => void;
}

function findMostRecentSession(sessions: SdkSession[]): string | null {
  if (sessions.length === 0) return null;

  const sorted = [...sessions].sort((a, b) => {
    const aTime = a.time?.updated || a.time?.created || 0;
    const bTime = b.time?.updated || b.time?.created || 0;
    return bTime - aTime;
  });

  return sorted[0].id;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionIdByContext: {},
      sessionIdsByContext: {},

      setSessions: (sessions: SdkSession[], contextKey?: string | null) => {
        const key = contextKey ?? null;

        set((state) => {
          if (!key) {
            return { sessions };
          }

          const knownIds = state.sessionIdsByContext[key] ?? [];
          const filteredSessions =
            knownIds.length > 0
              ? sessions.filter((session) => knownIds.includes(session.id))
              : [];
          const mostRecentId = findMostRecentSession(filteredSessions);

          const currentActiveId = state.activeSessionIdByContext[key] ?? null;
          const nextActiveId =
            currentActiveId && filteredSessions.some((session) => session.id === currentActiveId)
              ? currentActiveId
              : mostRecentId;

          return {
            sessions: filteredSessions,
            activeSessionIdByContext: {
              ...state.activeSessionIdByContext,
              [key]: nextActiveId,
            },
          };
        });
      },

      addSession: (session: SdkSession, contextKey?: string | null) => {
        set((state) => {
          const existingIds = contextKey ? state.sessionIdsByContext[contextKey] ?? [] : [];
          const nextIds =
            contextKey && !existingIds.includes(session.id)
              ? [...existingIds, session.id]
              : existingIds;

          if (state.sessions.some((existing) => existing.id === session.id)) {
            return contextKey
              ? {
                  activeSessionIdByContext: {
                    ...state.activeSessionIdByContext,
                    [contextKey]: session.id,
                  },
                  sessionIdsByContext: {
                    ...state.sessionIdsByContext,
                    [contextKey]: nextIds,
                  },
                }
              : state;
          }

          return {
            sessions: [session, ...state.sessions],
            activeSessionIdByContext: contextKey
              ? {
                  ...state.activeSessionIdByContext,
                  [contextKey]: session.id,
                }
              : state.activeSessionIdByContext,
            sessionIdsByContext: contextKey
              ? {
                  ...state.sessionIdsByContext,
                  [contextKey]: nextIds,
                }
              : state.sessionIdsByContext,
          };
        });
      },

      removeSession: (sessionId: string, contextKey?: string | null) => {
        set((state) => {
          const sessions = state.sessions.filter((session) => session.id !== sessionId);
          const activeSessionIdByContext = { ...state.activeSessionIdByContext };
          const sessionIdsByContext = { ...state.sessionIdsByContext };

          if (contextKey) {
            if (activeSessionIdByContext[contextKey] === sessionId) {
              activeSessionIdByContext[contextKey] = findMostRecentSession(sessions);
            }
            sessionIdsByContext[contextKey] = (sessionIdsByContext[contextKey] ?? []).filter((id) => id !== sessionId);
          } else {
            for (const key of Object.keys(activeSessionIdByContext)) {
              if (activeSessionIdByContext[key] === sessionId) {
                activeSessionIdByContext[key] = null;
              }
            }
            for (const key of Object.keys(sessionIdsByContext)) {
              sessionIdsByContext[key] = sessionIdsByContext[key].filter((id) => id !== sessionId);
            }
          }

          return {
            sessions,
            activeSessionIdByContext,
            sessionIdsByContext,
          };
        });
      },

      selectSession: (contextKey: string | null, sessionId: string | null) => {
        if (!contextKey) return;

        set((state) => ({
          activeSessionIdByContext: {
            ...state.activeSessionIdByContext,
            [contextKey]: sessionId,
          },
        }));
      },

      getActiveSession: (contextKey?: string | null) => {
        const state = get();
        const activeSessionId = contextKey ? state.activeSessionIdByContext[contextKey] ?? null : null;
        return state.sessions.find((session) => session.id === activeSessionId) || null;
      },

      getActiveSessionId: (contextKey?: string | null) => {
        if (!contextKey) return null;
        return get().activeSessionIdByContext[contextKey] ?? null;
      },

      clearSessions: () => {
        set({ sessions: [] });
      },
    }),
    {
      name: 'politron-sdk-sessions',
      partialize: (state) => ({
        activeSessionIdByContext: state.activeSessionIdByContext,
        sessionIdsByContext: state.sessionIdsByContext,
      }),
    }
  )
);

export type { SdkSession };
