import React, { memo, useState, useCallback, useEffect, useMemo } from 'react';
import { MessageSquare, Plus, Trash2, Loader2 } from 'lucide-react';
import { useSessionStore, buildSessionContextKey } from '../../store/sessionStore';
import { cn } from "@/lib/utils";
import { useAtomValue } from 'jotai';
import { activeAgentAtom, activeAgentTeamAtom, globalAgentsAtom } from '@/hooks/atoms/workspace';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";

function formatTime(timestamp?: number): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'agora';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString();
}

interface SessionModalProps {
  open: boolean;
  onClose: () => void;
}

export const SessionModal = memo(function SessionModal({ open, onClose }: SessionModalProps) {
  const [loading, setLoading] = useState(false);

  const sessions = useSessionStore((state) => state.sessions);
  const setSessions = useSessionStore((state) => state.setSessions);
  const addSession = useSessionStore((state) => state.addSession);
  const removeSession = useSessionStore((state) => state.removeSession);
  const selectSession = useSessionStore((state) => state.selectSession);

  const globalAgents = useAtomValue(globalAgentsAtom);
  const activeAgent = useAtomValue(activeAgentAtom);
  const activeAgentTeam = useAtomValue(activeAgentTeamAtom);

  const activeAgentId = activeAgent?.id ?? null;
  const isGlobalContext = !!activeAgentId && globalAgents.some((agent) => agent.id === activeAgentId);
  const contextKey = useMemo(
    () =>
      buildSessionContextKey({
        agentId: activeAgentId,
        isGlobal: isGlobalContext,
        teamId: activeAgentTeam?.id ?? null,
      }),
    [activeAgentId, activeAgentTeam?.id, isGlobalContext]
  );
  const activeSessionId = useSessionStore((state) => state.getActiveSessionId(contextKey));
  const sessionDirectory = useMemo(
    () => (isGlobalContext ? undefined : activeAgentTeam?.projectPath || undefined),
    [activeAgentTeam?.projectPath, isGlobalContext]
  );

  const loadSdkSessions = useCallback(async () => {
    if (!contextKey) {
      setSessions([], null);
      return;
    }

    setLoading(true);
    try {
      const sdkSessions = await window.vibeAPI.session.list(
        sessionDirectory ? { directory: sessionDirectory } : undefined
      );
      setSessions(sdkSessions || [], contextKey);
    } catch (error) {
      console.error('[SessionModal] Failed to load sessions:', error);
      setSessions([], contextKey);
    } finally {
      setLoading(false);
    }
  }, [contextKey, sessionDirectory, setSessions]);

  useEffect(() => {
    if (open) {
      void loadSdkSessions();
    }
  }, [open, loadSdkSessions]);

  const handleCreateSession = useCallback(async () => {
    if (!contextKey) return;

    setLoading(true);
    try {
      const newSession = await window.vibeAPI.session.create(
        sessionDirectory ? { directory: sessionDirectory } : undefined
      );
      if (newSession?.id) {
        addSession(newSession, contextKey);
        onClose();
      }
    } catch (error) {
      console.error('[SessionModal] Failed to create session:', error);
    } finally {
      setLoading(false);
    }
  }, [addSession, contextKey, onClose, sessionDirectory]);

  const handleDeleteSession = useCallback((sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Deseja excluir este historico?')) return;

    setLoading(true);
    window.vibeAPI.session.delete(sessionId)
      .then(() => removeSession(sessionId, contextKey))
      .catch((error) => {
        console.error('[SessionModal] Failed to delete session:', error);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [contextKey, removeSession]);

  const handleSelectSession = useCallback((sessionId: string) => {
    selectSession(contextKey, sessionId);
    onClose();
  }, [contextKey, selectSession, onClose]);

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="p-0 sm:max-w-[425px]">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>Historico de Sessoes</DialogTitle>
          <DialogDescription>
            Selecione uma sessao anterior para continuar ou crie uma nova.
          </DialogDescription>
        </DialogHeader>

        <Command className="rounded-none border-none shadow-none">
          <CommandInput placeholder="Filtrar sessoes..." />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>
              {contextKey ? 'Nenhuma sessao encontrada.' : 'Sessoes indisponiveis neste contexto.'}
            </CommandEmpty>
            <CommandGroup heading="Recentes">
              {sessions.map((session, index) => {
                const isActive = session.id === activeSessionId;
                const title = (session as any).title || `Conversa ${sessions.length - index}`;
                const time = formatTime((session as any).time?.updated || (session as any).time?.created);

                return (
                  <CommandItem
                    key={session.id}
                    onSelect={() => handleSelectSession(session.id)}
                    className={cn(
                      "flex cursor-pointer items-center justify-between",
                      isActive && "bg-accent text-accent-foreground"
                    )}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium">{title}</span>
                        <span className="text-xs text-muted-foreground">{time}</span>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                      onClick={(e) => handleDeleteSession(session.id, e)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>

        <DialogFooter className="items-center bg-muted/50 p-6 pt-0 sm:justify-between">
          <p className="text-xs text-muted-foreground">{sessions.length} sessoes registradas</p>
          <Button onClick={handleCreateSession} disabled={loading || !contextKey} size="sm" className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Novo Chat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

SessionModal.displayName = 'SessionModal';
