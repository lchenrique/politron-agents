/**
 * Session Store - Gerenciamento de sessões SDK
 *
 * As sessões são gerenciadas pelo SDK OpenCode por workspace/diretório.
 * Este store mantém apenas o tracking da sessão ativa localmente.
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

interface SessionState {
  // Sessoes SDK (cache local)
  sessions: SdkSession[];
  // Session ativa no momento
  activeSessionId: string | null;
  
  // Actions
  setSessions: (sessions: SdkSession[]) => void;
  addSession: (session: SdkSession) => void;
  removeSession: (sessionId: string) => void;
  selectSession: (sessionId: string | null) => void;
  getActiveSession: () => SdkSession | null;
  getActiveSessionId: () => string | null;
  clearSessions: () => void;
}

function findMostRecentSession(sessions: SdkSession[]): string | null {
  if (sessions.length === 0) return null;
  
  // Ordenar por time.updated decrescente (mais recente primeiro)
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
      activeSessionId: null,

      setSessions: (sessions: SdkSession[]) => {
        // Encontrar a sessão mais recente para selecionar por padrão
        const mostRecentId = findMostRecentSession(sessions);
        
        set({ 
          sessions,
          // Manter sessão ativa se existir na lista, senão usar a mais recente
          activeSessionId: get().activeSessionId && sessions.some(s => s.id === get().activeSessionId) 
            ? get().activeSessionId 
            : mostRecentId
        });
      },

      addSession: (session: SdkSession) => {
        set((state) => {
          // Não duplicar
          if (state.sessions.some(s => s.id === session.id)) return state;
          return {
            sessions: [session, ...state.sessions],
            activeSessionId: session.id, // Nova sessão vira ativa
          };
        });
      },

      removeSession: (sessionId: string) => {
        set((state) => {
          const newSessions = state.sessions.filter(s => s.id !== sessionId);
          let newActiveId = state.activeSessionId;
          if (state.activeSessionId === sessionId) {
            // Selecionar a mais recente entre as restantes
            newActiveId = findMostRecentSession(newSessions);
          }
          return {
            sessions: newSessions,
            activeSessionId: newActiveId,
          };
        });
      },

      selectSession: (sessionId: string | null) => {
        set({ activeSessionId: sessionId });
      },

      getActiveSession: () => {
        const state = get();
        return state.sessions.find(s => s.id === state.activeSessionId) || null;
      },

      getActiveSessionId: () => {
        return get().activeSessionId;
      },

      clearSessions: () => {
        set({ sessions: [], activeSessionId: null });
      },
    }),
    {
      name: 'politron-sdk-sessions',
      partialize: (state) => ({
        // Não persistir sessions - elas vem do SDK
        // Apenas persistir a sessão ativa
        activeSessionId: state.activeSessionId,
      }),
    }
  )
);

// Tipo para exportar
export type { SdkSession };
