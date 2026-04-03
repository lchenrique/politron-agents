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
import { useSessionStore, type SdkSession } from '../../store/sessionStore';
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
    <div className="w-56 h-full bg-zinc-900/50 border-r border-zinc-800/50 flex flex-col">
      {/* Header */}
      <div className="px-3 py-3 border-b border-zinc-800/50">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Sessões
          </h3>
          <button
            onClick={handleCreateSession}
            disabled={loading}
            className="p-1 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
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
            <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
          </div>
        )}
        
        {!loading && sessions.length === 0 && (
          <div className="px-3 py-4 text-center text-zinc-500 text-sm">
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
                  ? 'bg-indigo-500/20 border border-indigo-500/30'
                  : 'hover:bg-zinc-800/50 border border-transparent'
              }`}
              onClick={() => handleSelectSession(session.id)}
              onMouseEnter={() => setHoveredSessionId(session.id)}
              onMouseLeave={() => setHoveredSessionId(null)}
            >
              <div className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <MessageSquare className={`w-4 h-4 flex-shrink-0 ${
                    isActive ? 'text-indigo-400' : 'text-zinc-500'
                  }`} />
                  <span className={`text-sm truncate ${
                    isActive ? 'text-zinc-100' : 'text-zinc-300'
                  }`}>
                    {/* title vem do SDK */}
                    {(session as any).title || `Sessão ${index + 1}`}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1 ml-6">
                  <Clock className="w-3 h-3 text-zinc-600" />
                  <span className="text-xs text-zinc-600">
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
                      : 'hover:bg-zinc-700 text-zinc-500 hover:text-red-400'
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
      <div className="px-3 py-2 border-t border-zinc-800/50 flex items-center justify-between">
        <span className="text-xs text-zinc-600">
          {sessions.length} sessão{sessions.length !== 1 ? 'ões' : ''}
        </span>
        <button
          onClick={loadSdkSessions}
          disabled={loading}
          className="text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
          title="Atualizar"
        >
          <Loader2 className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
});
