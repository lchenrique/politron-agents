import React, { memo, useState, useCallback, useEffect } from 'react';
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
import clsx from 'clsx';
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

  const loadSdkSessions = useCallback(async () => {
    setLoading(true);
    try {
      const sdkSessions = await window.vibeAPI.session.list();
      setSessions(sdkSessions || []);
    } catch (error) {
      console.error('[SessionModal] Failed to load sessions:', error);
    } finally {
      setLoading(false);
    }
  }, [setSessions]);

  useEffect(() => {
    if (open) {
      loadSdkSessions();
    }
  }, [open, loadSdkSessions]);

  const handleCreateSession = useCallback(async () => {
    setLoading(true);
    try {
      const newSession = await window.vibeAPI.session.create({
        directory: process.cwd()
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
  }, [addSession, onClose]);

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


  return <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Histórico de Sessões</DialogTitle>
        <DialogDescription>
          Selecione uma sessão para continuar.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button onClick={onClose}>Cancelar</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent >
        <DialogHeader className="p-8 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[hsl(var(--ide-surface-3))] flex items-center justify-center border border-white/5 shadow-inner">
                <History className="w-6 h-6 text-[hsl(var(--ide-indigo))]" />
              </div>
              <div className="flex flex-col text-left">
                <DialogTitle className="text-lg font-bold text-[hsl(var(--ide-text))] tracking-tight">Histórico de Sessões</DialogTitle>
                <DialogDescription className="text-xs text-[hsl(var(--ide-text-dim))] font-medium">
                  {sessions.length} conversas sincronizadas com Politron Cloud
                </DialogDescription>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2.5 rounded-xl hover:bg-white/5 text-[hsl(var(--ide-text-dim))] hover:text-[hsl(var(--ide-text))] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </DialogHeader>

        <Command className="rounded-none border-none shadow-none bg-transparent px-4 [&_[cmdk-input-wrapper]]:px-4">
          <CommandInput
            placeholder="Buscar por título ou comandos..."
            className="h-14 border-none ring-0 focus-visible:ring-0 text-[hsl(var(--ide-text))] placeholder:text-[hsl(var(--ide-text-dim))] [&_[cmdk-input-wrapper]]:border-none"
          />
          <CommandList className="max-h-[380px] overflow-y-auto scrollbar-none pb-4">
            <CommandEmpty className="py-20 text-center flex flex-col items-center justify-center gap-4 opacity-40">
              <MessageSquare className="w-8 h-8 text-[hsl(var(--ide-text-dim))] stroke-[1.5]" />
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[hsl(var(--ide-text-dim))]">Sem conversas</p>
            </CommandEmpty>
            <CommandGroup className="px-2 mt-2">
              {sessions.map((session, index) => {
                const isActive = session.id === activeSessionId;
                const title = (session as any).title || `Conversa ${sessions.length - index}`;
                const time = formatTime((session as any).time?.updated || (session as any).time?.created);

                return (
                  <CommandItem
                    key={session.id}
                    onSelect={() => handleSelectSession(session.id)}
                    className={clsx(
                      "flex items-center justify-between px-4 py-4 rounded-[22px] cursor-pointer group transition-all mb-2 border",
                      isActive
                        ? "bg-[hsl(var(--ide-indigo-dim))] border-[hsl(var(--ide-indigo-border))] text-[hsl(var(--ide-indigo))]"
                        : "hover:bg-[hsl(var(--ide-surface-2))] border-transparent text-[hsl(var(--ide-text-dim))] hover:text-[hsl(var(--ide-text))]"
                    )}
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className={clsx(
                        "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                        isActive
                          ? "bg-[hsl(var(--ide-indigo))] text-white shadow-lg shadow-ide-indigo/20"
                          : "bg-[hsl(var(--ide-surface-3))] border border-white/5 group-hover:bg-[hsl(var(--ide-surface-2))]"
                      )}>
                        <MessageSquare className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0 font-sans">
                        <div className="flex items-center gap-2">
                          <span className={clsx("text-sm font-bold truncate leading-none", isActive ? "text-[hsl(var(--ide-indigo))]" : "text-[hsl(var(--ide-text))] group-hover:text-white")}>
                            {title}
                          </span>
                          {isActive && <div className="w-2 h-2 rounded-full bg-[hsl(var(--ide-indigo))] animate-pulse" />}
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 opacity-60">
                          <Clock className="w-3 h-3" />
                          <p className="text-[10px] uppercase font-black tracking-tight font-mono">{time}</p>
                        </div>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => handleDeleteSession(session.id, e)}
                      className={clsx(
                        "h-10 w-10 opacity-0 group-hover:opacity-100 transition-all rounded-xl",
                        isActive ? "hover:bg-red-500/20 hover:text-red-500" : "hover:bg-red-500/10 hover:text-red-500"
                      )}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>

        <DialogFooter className="p-8 flex-row items-center justify-between sm:justify-between bg-black/20">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--ide-indigo))] animate-pulse" />
            <p className="text-[9px] text-[hsl(var(--ide-text-dim))] uppercase tracking-[0.2em] font-black italic">
              {sessions.length} Cloud Snapshots
            </p>
          </div>
          <Button
            onClick={handleCreateSession}
            disabled={loading}
            className="h-12 gap-3 px-8 rounded-2xl bg-[hsl(var(--ide-indigo))] text-white hover:opacity-90 font-bold transition-all active:scale-95 shadow-xl shadow-ide-indigo/20 border border-[hsl(var(--ide-indigo-border))]"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 stroke-[3]" />}
            Novo Chat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

SessionModal.displayName = 'SessionModal';
