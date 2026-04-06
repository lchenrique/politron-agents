import React, { memo, useState, useCallback, useEffect, useMemo } from 'react';
import { MessageSquare, Plus, Trash2, Loader2 } from 'lucide-react';
import { useSessionStore } from '../../store/sessionStore';
import { cn } from "@/lib/utils";
import { useAtomValue } from 'jotai';
import { globalCeoAgentAtom, activeTeamAtom, activeAgentTabIdAtom } from '@/hooks/atoms/workspace';
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

  const sessions = useSessionStore(state => state.sessions);
  const activeSessionId = useSessionStore(state => state.activeSessionId);
  const setSessions = useSessionStore(state => state.setSessions);
  const addSession = useSessionStore(state => state.addSession);
  const removeSession = useSessionStore(state => state.removeSession);
  const selectSession = useSessionStore(state => state.selectSession);

  const globalCeoAgent = useAtomValue(globalCeoAgentAtom);
  const activeAgentTabId = useAtomValue(activeAgentTabIdAtom);
  const activeTeam = useAtomValue(activeTeamAtom);

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
      const sdkSessions = await window.vibeAPI.session.list({
        directory: sessionDirectory
      });
      setSessions(sdkSessions || []);
    } catch (error) {
      console.error('[SessionModal] Failed to load sessions:', error);
    } finally {
      setLoading(false);
    }
  }, [sessionDirectory, setSessions]);

  useEffect(() => {
    if (open) {
      void loadSdkSessions();
    }
  }, [open, loadSdkSessions]);

  const handleCreateSession = useCallback(async () => {
    if (!sessionDirectory) return;

    setLoading(true);
    try {
      const newSession = await window.vibeAPI.session.create({
        directory: sessionDirectory
      });
      if (newSession?.id) {
        addSession(newSession);
        onClose();
      }
    } catch (error) {
      console.error('[SessionModal] Failed to create session:', error);
    } finally {
      setLoading(false);
    }
  }, [addSession, onClose, sessionDirectory]);

  const handleDeleteSession = useCallback((sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Deseja excluir este histórico?')) return;

    setLoading(true);
    window.vibeAPI.session.delete(sessionId)
      .then(() => removeSession(sessionId))
      .catch((error) => {
        console.error('[SessionModal] Failed to delete session:', error);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [removeSession]);

  const handleSelectSession = useCallback((sessionId: string) => {
    selectSession(sessionId);
    onClose();
  }, [selectSession, onClose]);

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="p-0 sm:max-w-[425px]">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>Histórico de Sessões</DialogTitle>
          <DialogDescription>
            {isCeoContext
              ? 'As sessões do CEO ainda não usam um diretório fixo. A configuração será adicionada em breve.'
              : 'Selecione uma sessão anterior para continuar ou crie uma nova.'}
          </DialogDescription>
        </DialogHeader>

        <Command className="rounded-none border-none shadow-none">
          <CommandInput placeholder="Filtrar sessões..." />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>
              {sessionDirectory ? 'Nenhuma sessão encontrada.' : 'Sessões indisponíveis neste contexto.'}
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
          <p className="text-xs text-muted-foreground">{sessions.length} sessões registradas</p>
          <Button onClick={handleCreateSession} disabled={loading || !sessionDirectory} size="sm" className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Novo Chat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

SessionModal.displayName = 'SessionModal';
