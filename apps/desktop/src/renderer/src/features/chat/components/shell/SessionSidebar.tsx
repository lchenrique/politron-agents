/**
 * SessionSidebar - Sidebar com lista de sessões SDK
 *
 * Funcionalidades:
 * - Lista de sessões do projeto (via SDK)
 * - Criar nova sessão SDK
 * - Trocar entre sessões
 * - Deletar sessão
 * - Ao iniciar: carrega sessões existentes e seleciona a mais recente
 */

import React, { memo, useState, useCallback, useEffect } from 'react';
import { MessageSquare, Plus, Trash2, Clock, Loader2 } from 'lucide-react';
import { useSessionStore } from '../../store/sessionStore';
import { useActiveSession } from '../../context/ActiveSessionContext';

function formatTime(timestamp?: number): string {
  if (!timestamp) return '';
  const date = new Date(timestamp); // SDK returns milliseconds
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
  
  // Store - estado reativo
  const sessions = useSessionStore(state => state.sessions);
  const activeSessionId = useSessionStore(state => state.activeSessionId);
  const setSessions = useSessionStore(state => state.setSessions);
  const addSession = useSessionStore(state => state.addSession);
  const removeSession = useSessionStore(state => state.removeSession);
  const selectSession = useSessionStore(state => state.selectSession);
  
  // Context
  const { isSessionActive } = useActiveSession();

  // Carregar sessões do SDK - NAO cria sessão nova, só carrega
  const loadSdkSessions = useCallback(async () => {
    setLoading(true);
    try {
      const sdkSessions = await window.vibeAPI.session.list();
      console.log('[SessionSidebar] Loaded SDK sessions:', sdkSessions?.length);
      // setSessions já escolhe a mais recente automaticamente
      setSessions(sdkSessions || []);
    } catch (error) {
      console.error('[SessionSidebar] Failed to load SDK sessions:', error);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [setSessions]);

  // Carregar ao montar - apenas carrega, não cria
  useEffect(() => {
    loadSdkSessions();
  }, [loadSdkSessions]);

  // Criar nova sessão SDK
  const handleCreateSession = useCallback(async () => {
    setLoading(true);
    try {
      const newSession = await window.vibeAPI.session.create({
        directory: process.cwd()
      });
      console.log('[SessionSidebar] Created new session:', newSession?.id);
      if (newSession?.id) {
        addSession(newSession);
      }
    } catch (error) {
      console.error('[SessionSidebar] Failed to create SDK session:', error);
    } finally {
      setLoading(false);
    }
  }, [addSession]);

  // Deletar sessão SDK
  const handleDeleteSession = useCallback(async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!confirm('Deletar esta sessão? Esta ação não pode ser desfeita.')) {
      return;
    }
    
    setLoading(true);
    try {
      await window.vibeAPI.session.delete(sessionId);
      console.log('[SessionSidebar] Deleted session:', sessionId);
      removeSession(sessionId);
    } catch (error) {
      console.error('[SessionSidebar] Failed to delete SDK session:', error);
    } finally {
      setLoading(false);
    }
  }, [removeSession]);

  // Selecionar sessão
  const handleSelectSession = useCallback((sessionId: string) => {
    console.log('[SessionSidebar] Selecting session:', sessionId);
    selectSession(sessionId);
  }, [selectSession]);

  return (
    <div className="w-56 h-full bg-secondary/50 border-r border-border/50 flex flex-col">
      {/* Header */}
      <div className="px-3 py-3 border-b border-border/50">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Sessões
          </h3>
          <button
            onClick={handleCreateSession}
            disabled={loading}
            className="p-1 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="Nova sessão"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto py-2">
        {loading && sessions.length === 0 && (
          <div className="px-3 py-4 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}
        
        {!loading && sessions.length === 0 && (
          <div className="px-3 py-4 text-center text-muted-foreground text-sm">
            Nenhuma sessão ainda.
            <br />
            Clique + para criar.
          </div>
        )}
        
        {sessions.map((session, index) => {
          const isActive = session.id === activeSessionId;
          
          return (
            <div
              key={session.id}
              className={`mx-2 mb-1 rounded-lg cursor-pointer transition-all duration-150 relative group ${
                isActive
                  ? 'bg-primary/20 border border-primary/30'
                  : 'hover:bg-secondary/50 border border-transparent'
              }`}
              onClick={() => handleSelectSession(session.id)}
              onMouseEnter={() => setHoveredSessionId(session.id)}
              onMouseLeave={() => setHoveredSessionId(null)}
            >
              <div className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <MessageSquare className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  }`} />
                  <span className={`text-sm truncate ${
                    isActive ? 'text-foreground' : 'text-muted-foreground'
                  }`}>
                    {/* title vem do SDK */}
                    {(session as any).title || `Sessão ${index + 1}`}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1 ml-6">
                  <Clock className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-xs text-muted-foreground/40">
                    {formatTime((session as any).time?.updated || (session as any).time?.created)}
                  </span>
                </div>
              </div>

              {/* Delete button - mostra no hover sempre (exceto se for a ativa) */}
              {hoveredSessionId === session.id && (
                <button
                  onClick={(e) => handleDeleteSession(session.id, e)}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-colors ${
                    isActive 
                      ? 'opacity-0' 
                      : 'hover:bg-muted text-muted-foreground hover:text-destructive'
                  }`}
                  title="Excluir sessão"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer com info */}
      <div className="px-3 py-2 border-t border-border/50 flex items-center justify-between">
        <span className="text-xs text-muted-foreground/60">
          {sessions.length} sessão{sessions.length !== 1 ? 'ões' : ''}
        </span>
        <button
          onClick={loadSdkSessions}
          disabled={loading}
          className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          title="Atualizar"
        >
          <Loader2 className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
});

SessionSidebar.displayName = 'SessionSidebar';
