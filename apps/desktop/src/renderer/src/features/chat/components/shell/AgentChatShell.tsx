/**
 * AgentChatShell - Main chat container
 *
 * Performance:
 * - Uses the OpenCode transcript bridge instead of local mock timers
 * - Keeps shell rendering cheap while the bridge translates IPC events to blocks
 * - Relies on turn-based virtualization for better stability during streaming
 */

import React, { memo, useState } from 'react';
import { TranscriptViewport } from './TranscriptViewport';
import { PromptInput } from '../input/PromptInput';
import { SessionModal } from './SessionModal';
import { useChatStore } from '../../store/chatStore';
import { useOpencodeTranscriptBridge } from '../../hooks/useOpencodeTranscriptBridge';
import { recordChatRender } from '../../perf/chatPerf';
import { History, FolderOpen, Users, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAtomValue } from 'jotai';
import { activeTeamAtom, projectsAtom, globalCeoAgentAtom } from '@/hooks/atoms';

export const AgentChatShell = memo(function AgentChatShell() {
  recordChatRender('AgentChatShell');
  const clearChat = useChatStore((state) => state.clearChat);
  const { activeAgent, header, sendMessage } = useOpencodeTranscriptBridge();
  const [modalOpen, setModalOpen] = useState(false);
  const projects = useAtomValue(projectsAtom);
  const activeTeam = useAtomValue(activeTeamAtom);
  const globalCeoAgent = useAtomValue(globalCeoAgentAtom);
  const hasProjectSelected = !!activeTeam?.projectPath;
  const hasProjects = projects.length > 0;
  
  // CEO is active when it's the selected agent
  const isCeoActive = activeAgent?.id === globalCeoAgent?.id;

  return (
    <div className="flex flex-col h-full w-full bg-background text-foreground overflow-hidden font-sans">
      <header className="px-5 py-3 flex items-center justify-between border-b border-border bg-secondary/10">
        <div className="flex items-center gap-3">
          {/* History Modal Toggle */}
          <Button
            onClick={() => setModalOpen(true)}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <History className="w-4 h-4 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-medium pr-1">Sessões</span>
          </Button>

          <div className="w-px h-4 bg-border mx-1" />

          <div className="flex flex-col">
            <h2 className="text-sm font-semibold text-foreground">{header.title}</h2>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{header.subtitle}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={() => clearChat()}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            Novo Chat
          </Button>
        </div>
      </header>

      {/* Main content: Chat Viewport */}
      <div className="flex-1 overflow-hidden relative">
        {!hasProjects ? (
          <EmptyStateScreen />
        ) : !hasProjectSelected && !isCeoActive ? (
          <WelcomeScreen />
        ) : (
          <TranscriptViewport />
        )}
      </div>

      {/* Input Area - Show when: has project OR CEO is active */}
      {(hasProjectSelected || isCeoActive) && (
        <div className="p-4 py-6 bg-linear-to-t from-background via-background to-transparent flex flex-col items-center">
          <div className="w-full max-w-4xl px-4">
            <PromptInput
              onSend={sendMessage}
              selectedModel={activeAgent?.catalogSlug || 'opencode-agent'}
            />
            <div className="mt-3 text-[10px] text-muted-foreground/60 text-center uppercase tracking-[0.2em] font-medium">
              Politron OpenCode — IA Experimental
            </div>
          </div>
        </div>
      )}

      {/* Floating Modal for Sessions */}
      <SessionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
});

const EmptyStateScreen = () => (
  <div className="h-full flex flex-col items-center justify-center p-8 text-center">
    <div className="w-20 h-20 rounded-2xl bg-ide-surface border border-ide-border flex items-center justify-center mb-6">
      <FolderOpen className="w-10 h-10 text-ide-text-dim" />
    </div>
    <h3 className="text-xl font-semibold text-ide-text mb-2">Bem-vindo ao Politron</h3>
    <p className="text-ide-text-dim text-sm max-w-md mb-8">
      Você ainda não tem nenhum projeto. Clique no botão <strong className="text-ide-text">"+"</strong> na barra lateral esquerda para criar seu primeiro projeto e começar a trabalhar com seus agentes de IA.
    </p>
    <div className="flex items-center gap-6 text-xs text-ide-text-dim">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-ide-surface border border-ide-border flex items-center justify-center">
          <Users className="w-4 h-4" />
        </div>
        <span>Crie equipes</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-ide-surface border border-ide-border flex items-center justify-center">
          <Rocket className="w-4 h-4" />
        </div>
        <span>Automatize tarefas</span>
      </div>
    </div>
  </div>
);

const WelcomeScreen = () => {
  return (
    <div className="h-full flex flex-col items-center justify-center p-8 text-center">
      <div className="w-20 h-20 rounded-2xl bg-ide-indigo/10 border border-ide-indigo/20 flex items-center justify-center mb-6">
        <FolderOpen className="w-10 h-10 text-ide-indigo" />
      </div>
      <h3 className="text-xl font-semibold text-ide-text mb-2">Selecione um projeto</h3>
      <p className="text-ide-text-dim text-sm max-w-md mb-8">
        Escolha um projeto na barra lateral esquerda para visualizar o terminal e conversar com os agentes especializados.
      </p>
      <div className="flex items-center gap-2 text-xs text-ide-text-dim bg-ide-surface/50 px-4 py-2 rounded-lg border border-ide-border">
        <span className="text-ide-indigo">←</span>
        <span>Clique em um dos projetos listados</span>
      </div>
    </div>
  );
};

AgentChatShell.displayName = 'AgentChatShell';
