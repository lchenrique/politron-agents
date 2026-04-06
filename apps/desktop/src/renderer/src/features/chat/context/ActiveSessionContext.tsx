import { createContext, useContext, type ReactNode, useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { activeAgentAtom, activeAgentTeamAtom, globalAgentsAtom } from '@/hooks/atoms/workspace';
import { buildSessionContextKey, useSessionStore } from '../store/sessionStore';

interface ActiveSessionContextValue {
  activeSessionId: string | null;
  contextKey: string | null;
  isSessionActive: boolean;
}

const ActiveSessionContext = createContext<ActiveSessionContextValue>({
  activeSessionId: null,
  contextKey: null,
  isSessionActive: false,
});

export function ActiveSessionProvider({ children }: { children: ReactNode }) {
  const activeAgent = useAtomValue(activeAgentAtom);
  const activeAgentTeam = useAtomValue(activeAgentTeamAtom);
  const globalAgents = useAtomValue(globalAgentsAtom);

  const contextKey = useMemo(() => {
    const activeAgentId = activeAgent?.id ?? null;
    const isGlobal = !!activeAgentId && globalAgents.some((agent) => agent.id === activeAgentId);

    return buildSessionContextKey({
      agentId: activeAgentId,
      isGlobal,
      teamId: activeAgentTeam?.id ?? null,
    });
  }, [activeAgent?.id, activeAgentTeam?.id, globalAgents]);

  const activeSessionId = useSessionStore((state) => state.getActiveSessionId(contextKey));

  const value: ActiveSessionContextValue = {
    activeSessionId,
    contextKey,
    isSessionActive: activeSessionId !== null,
  };

  return (
    <ActiveSessionContext.Provider value={value}>
      {children}
    </ActiveSessionContext.Provider>
  );
}

export function useActiveSession() {
  return useContext(ActiveSessionContext);
}
