/**
 * ActiveSessionContext - Contexto simples para sessão ativa
 *
 * A sessão ativa é gerenciada pelo sessionStore.
 */

import { createContext, useContext, ReactNode } from 'react';
import { useSessionStore } from '../store/sessionStore';

interface ActiveSessionContextValue {
  activeSessionId: string | null;
  isSessionActive: boolean;
}

const ActiveSessionContext = createContext<ActiveSessionContextValue>({
  activeSessionId: null,
  isSessionActive: false,
});

export function ActiveSessionProvider({ children }: { children: ReactNode }) {
  const activeSessionId = useSessionStore(state => state.activeSessionId);

  console.log('[ActiveSessionProvider] Render with activeSessionId:', activeSessionId);

  const value: ActiveSessionContextValue = {
    activeSessionId,
    isSessionActive: activeSessionId !== null,
  };

  return (
    <ActiveSessionContext.Provider value={value}>
      {children}
    </ActiveSessionContext.Provider>
  );
}

export function useActiveSession() {
  const context = useContext(ActiveSessionContext);
  console.log('[useActiveSession] Called, context value:', context);
  return context;
}
