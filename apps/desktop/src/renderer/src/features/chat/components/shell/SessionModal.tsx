import React, { memo, useState, useCallback, useEffect, useMemo } from 'react';
import {
  MessageSquare,
  Plus,
  Trash2,
  Clock,
  Loader2,
  History,
  X
} from 'lucide-react';
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

// Get home directory via preload API
let cachedHomeDir: string = '';
async function getHomeDir(): Promise<string> {
  if (cachedHomeDir) return cachedHomeDir;
  try {
    cachedHomeDir = await window.vibeAPI.system.getHomeDir();
  } catch {
    cachedHomeDir = '';
  }
  return cachedHomeDir || '';
}

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
  const [homeDir, setHomeDir] = useState<string>('');

  const sessions = useSessionStore(state => state.sessions);
  const activeSessionId = useSessionStore(state => state.activeSessionId);
  const setSessions = useSessionStore(state => state.setSessions);
  const addSession = useSessionStore(state => state.addSession);
  const removeSession = useSessionStore(state => state.removeSession);
  const selectSession = useSessionStore(state => state.selectSession);

  const globalCeoAgent = useAtomValue(globalCeoAgentAtom);
  const activeAgentTabId = useAtomValue(activeAgentTabIdAtom);
  const activeTeam = useAtomValue(activeTeamAtom);

  // Fetch home directory on mount
  useEffect(() => {
    getHomeDir().then(setHomeDir);
  }, []);

  const sessionDirectory = useMemo(() => {
    // CEO is active when activeAgentTabId matches globalCeoAgent.id
    if (globalCeoAgent && activeAgentTabId === globalCeoAgent.id) {
      const separator = homeDir.endsWith('/') || homeDir.endsWith('\\') ? '' : '/';
      return `${homeDir}${separator}.politron/global-ceo`;
    }
    // Otherwise use the project's path
    return activeTeam?.projectPath;
  }, [globalCeoAgent, activeAgentTabId, activeTeam, homeDir]);

  const loadSdkSessions = useCallback(async () => {
    if (!sessionDirectory) return; // Wait for homeDir to be loaded
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
  }, [setSessions, sessionDirectory]);

  useEffect(() => {
    if (open) {
      loadSdkSessions();
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

  const handleDeleteSession = useCallback(async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Deseja excluir este histórico?')) return;

    setLoading(true);
    try {
      await window.vibeAPI.session.delete(sessionId);
      removeSession(sessionId);
    } catch (error) {
      console.error('[SessionModal] Failed to delete session:', error);
    } finally {
      setLoading(false);
    }
  }, [removeSession]);

  const handleSelectSession = useCallback((sessionId: string) => {
    selectSession(sessionId);
    onClose();
  }, [selectSession, onClose]);

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-[425px] p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>Histórico de Sessões</DialogTitle>
          <DialogDescription>
            Selecione uma sessão anterior para continuar ou crie uma nova.
          </DialogDescription>
        </DialogHeader>

        <Command className="rounded-none border-none shadow-none">
          <CommandInput placeholder="Filtrar sessões..." />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>Nenhuma sessão encontrada.</CommandEmpty>
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
                      "flex items-center justify-between cursor-pointer",
                      isActive && "bg-accent text-accent-foreground"
                    )}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <MessageSquare className="w-4 h-4 text-muted-foreground" />
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="truncate font-medium">{title}</span>
                        <span className="text-xs text-muted-foreground">{time}</span>
                      </div>
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => handleDeleteSession(session.id, e)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>

        <DialogFooter className="p-6 pt-0 flex sm:justify-between items-center bg-muted/50 rounded-b-lg">
          <p className="text-xs text-muted-foreground">{sessions.length} sessões registradas</p>
          <Button onClick={handleCreateSession} disabled={loading} size="sm" className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Novo Chat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

SessionModal.displayName = 'SessionModal';
