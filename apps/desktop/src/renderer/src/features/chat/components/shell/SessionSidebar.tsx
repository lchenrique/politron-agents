/**
 * SessionSidebar - Sidebar com lista de sessoes SDK por contexto.
 *
 * Regras:
 * - Nunca usa process.cwd() para criar sessoes
 * - CEO global ainda nao usa diretorio fixo
 * - Agentes de projeto usam sempre activeTeam.projectPath
 */

import React, { memo, useState, useCallback, useEffect, useMemo } from 'react';
import { MessageSquare, Plus, Trash2, Clock, Loader2 } from 'lucide-react';
import { useAtomValue } from 'jotai';
import { activeAgentTabIdAtom, activeTeamAtom, globalCeoAgentAtom } from '@/hooks/atoms/workspace';
import { useSessionStore } from '../../store/sessionStore';
import { useActiveSession } from '../../context/ActiveSessionContext';

function formatTime(timestamp?: number): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'agora';
  if (diffMins < 60) return `${diffMins}m atrás`;
  if (diffHours < 24) return `${diffHours}h atrás`;
  if (diffDays < 7) return `${diffDays}d atrás`;
  return date.toLocaleDateString();
}

export const SessionSidebar = memo(function SessionSidebar() {
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const sessions = useSessionStore((state) => state.sessions);
  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const setSessions = useSessionStore((state) => state.setSessions);
  const addSession = useSessionStore((state) => state.addSession);
  const removeSession = useSessionStore((state) => state.removeSession);
  const selectSession = useSessionStore((state) => state.selectSession);

  const globalCeoAgent = useAtomValue(globalCeoAgentAtom);
  const activeAgentTabId = useAtomValue(activeAgentTabIdAtom);
  const activeTeam = useAtomValue(activeTeamAtom);

  useActiveSession();

  const isCeoContext = !!globalCeoAgent && activeAgentTabId === globalCeoAgent.id;
  const sessionDirectory = useMemo(() => {
    if (isCeoContext) {
      return '';
    }

    return activeTeam?.projectPath ?? '';
  }, [activeTeam?.projectPath, isCeoContext]);

  const loadSdkSessions = useCallback(async () => {
    if (!sessionDirectory) {
      setSessions([]);
      return;
    }

    setLoading(true);
    try {
      const sdkSessions = await window.vibeAPI.session.list({ directory: sessionDirectory });
      setSessions(sdkSessions || []);
    } catch (error) {
      console.error('[SessionSidebar] Failed to load SDK sessions:', error);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [sessionDirectory, setSessions]);

  useEffect(() => {
    void loadSdkSessions();
  }, [loadSdkSessions]);

  const handleCreateSession = useCallback(async () => {
    if (!sessionDirectory) return;

    setLoading(true);
    try {
      const newSession = await window.vibeAPI.session.create({
        directory: sessionDirectory,
      });
      if (newSession?.id) {
        addSession(newSession);
      }
    } catch (error) {
      console.error('[SessionSidebar] Failed to create SDK session:', error);
    } finally {
      setLoading(false);
    }
  }, [addSession, sessionDirectory]);

  const handleDeleteSession = useCallback((sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm('Deletar esta sessão? Esta ação não pode ser desfeita.')) {
      return;
    }

    setLoading(true);
    window.vibeAPI.session.delete(sessionId)
      .then(() => removeSession(sessionId))
      .catch((error) => {
        console.error('[SessionSidebar] Failed to delete SDK session:', error);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [removeSession]);

  const handleSelectSession = useCallback((sessionId: string) => {
    selectSession(sessionId);
  }, [selectSession]);

  return (
    <div className="flex h-full w-56 flex-col border-r border-border/50 bg-secondary/50">
      <div className="border-b border-border/50 px-3 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Sessões
          </h3>
          <button
            onClick={handleCreateSession}
            disabled={loading || !sessionDirectory}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
            title="Nova sessão"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {loading && sessions.length === 0 && (
          <div className="flex items-center justify-center px-3 py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && !sessionDirectory && (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
            {isCeoContext ? (
              <>
                As sessões do CEO ainda não usam diretório fixo.
                <br />
                A configuração do escritório do CEO será adicionada em breve.
              </>
            ) : (
              'Selecione um contexto com pasta válida.'
            )}
          </div>
        )}

        {!loading && sessionDirectory && sessions.length === 0 && (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
            Nenhuma sessão ainda.
            <br />
            Clique em + para criar.
          </div>
        )}

        {sessions.map((session, index) => {
          const isActive = session.id === activeSessionId;

          return (
            <div
              key={session.id}
              className={`group relative mx-2 mb-1 cursor-pointer rounded-lg border transition-all duration-150 ${
                isActive
                  ? 'border-primary/30 bg-primary/20'
                  : 'border-transparent hover:bg-secondary/50'
              }`}
              onClick={() => handleSelectSession(session.id)}
              onMouseEnter={() => setHoveredSessionId(session.id)}
              onMouseLeave={() => setHoveredSessionId(null)}
            >
              <div className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <MessageSquare className={`h-4 w-4 shrink-0 ${
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  }`} />
                  <span className={`truncate text-sm ${
                    isActive ? 'text-foreground' : 'text-muted-foreground'
                  }`}>
                    {(session as any).title || `Sessão ${index + 1}`}
                  </span>
                </div>
                <div className="mt-1 ml-6 flex items-center gap-2">
                  <Clock className="h-3 w-3 text-muted-foreground/40" />
                  <span className="text-xs text-muted-foreground/40">
                    {formatTime((session as any).time?.updated || (session as any).time?.created)}
                  </span>
                </div>
              </div>

              {hoveredSessionId === session.id && (
                <button
                  onClick={(e) => handleDeleteSession(session.id, e)}
                  className={`absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 transition-colors ${
                    isActive
                      ? 'opacity-0'
                      : 'text-muted-foreground hover:bg-muted hover:text-destructive'
                  }`}
                  title="Excluir sessão"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-border/50 px-3 py-2">
        <span className="text-xs text-muted-foreground/60">
          {sessions.length} sessão{sessions.length !== 1 ? 'ões' : ''}
        </span>
        <button
          onClick={loadSdkSessions}
          disabled={loading || !sessionDirectory}
          className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          title="Atualizar"
        >
          <Loader2 className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
});

SessionSidebar.displayName = 'SessionSidebar';
