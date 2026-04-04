/**
 * AgentChatShell - Main chat container
 *
 * Performance:
 * - Uses the OpenCode transcript bridge instead of local mock timers
 * - Keeps shell rendering cheap while the bridge translates IPC events to blocks
 * - Relies on turn-based virtualization for better stability during streaming
 */

import React, { memo, useState } from "react";
import { History, FolderOpen, Rocket, Users } from "lucide-react";
import { useAtomValue } from "jotai";
import { Button } from "@/components/ui/button";
import { activeTeamAtom, globalCeoAgentAtom, projectsAtom } from "@/hooks/atoms";
import { PromptInput } from "../input/PromptInput";
import { SessionModal } from "./SessionModal";
import { TranscriptViewport } from "./TranscriptViewport";
import { useOpencodeTranscriptBridge } from "../../hooks/useOpencodeTranscriptBridge";
import { useChatStore } from "../../store/chatStore";
import { recordChatRender } from "../../perf/chatPerf";

export const AgentChatShell = memo(function AgentChatShell() {
  recordChatRender("AgentChatShell");
  const clearChat = useChatStore((state) => state.clearChat);
  const { activeAgent, header, sendMessage } = useOpencodeTranscriptBridge();
  const [modalOpen, setModalOpen] = useState(false);
  const projects = useAtomValue(projectsAtom);
  const activeTeam = useAtomValue(activeTeamAtom);
  const globalCeoAgent = useAtomValue(globalCeoAgentAtom);
  const hasProjectSelected = !!activeTeam?.projectPath;
  const hasProjects = projects.length > 0;
  const hasActiveAgent = !!activeAgent;
  const isCeoActive = activeAgent?.id === globalCeoAgent?.id;
  const shouldShowSelectionState = hasProjects && !hasActiveAgent;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background font-sans text-foreground">
      <header className="flex items-center justify-between border-b border-border bg-secondary/10 px-5 py-3">
        <div className="flex items-center gap-3">
          <Button
            onClick={() => setModalOpen(true)}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <History className="h-4 w-4 transition-transform group-hover:scale-110" />
            <span className="pr-1 text-xs font-medium">Sessões</span>
          </Button>

          <div className="mx-1 h-4 w-px bg-border" />

          <div className="flex flex-col">
            <h2 className="text-sm font-semibold text-foreground">{header.title}</h2>
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {header.subtitle}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={() => clearChat()} variant="outline" size="sm" className="gap-2">
            Novo Chat
          </Button>
        </div>
      </header>

      <div className="relative flex-1 overflow-hidden">
        {!hasProjects ? (
          <EmptyStateScreen />
        ) : shouldShowSelectionState ? (
          <WelcomeScreen hasProjectSelected={hasProjectSelected} />
        ) : (
          <TranscriptViewport />
        )}
      </div>

      {hasActiveAgent && (
        <div className="flex flex-col items-center bg-linear-to-t from-background via-background to-transparent p-4 py-6">
          <div className="w-full max-w-4xl px-4">
            <PromptInput
              onSend={sendMessage}
              selectedModel={activeAgent?.catalogSlug || "opencode-agent"}
            />
            <div className="mt-3 text-center text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/60">
              Politron OpenCode - IA Experimental
            </div>
          </div>
        </div>
      )}

      <SessionModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
});

const EmptyStateScreen = () => (
  <div className="flex h-full flex-col items-center justify-center p-8 text-center">
    <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-ide-border bg-ide-surface">
      <FolderOpen className="h-10 w-10 text-ide-text-dim" />
    </div>
    <h3 className="mb-2 text-xl font-semibold text-ide-text">Bem-vindo ao Politron</h3>
    <p className="mb-8 max-w-md text-sm text-ide-text-dim">
      Você ainda não tem nenhum projeto. Clique no botão <strong className="text-ide-text">"+"</strong> na barra
      lateral esquerda para criar seu primeiro projeto e começar a trabalhar com seus agentes de IA.
    </p>
    <div className="flex items-center gap-6 text-xs text-ide-text-dim">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-ide-border bg-ide-surface">
          <Users className="h-4 w-4" />
        </div>
        <span>Crie equipes</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-ide-border bg-ide-surface">
          <Rocket className="h-4 w-4" />
        </div>
        <span>Automatize tarefas</span>
      </div>
    </div>
  </div>
);

const WelcomeScreen = ({ hasProjectSelected }: { hasProjectSelected: boolean }) => (
  <div className="flex h-full flex-col items-center justify-center p-8 text-center">
    <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-ide-indigo/20 bg-ide-indigo/10">
      <FolderOpen className="h-10 w-10 text-ide-indigo" />
    </div>
    <h3 className="mb-2 text-xl font-semibold text-ide-text">Selecione um contexto</h3>
    <p className="mb-8 max-w-md text-sm text-ide-text-dim">
      {hasProjectSelected
        ? "Escolha um agente do projeto na barra lateral ou volte para conversar com o CEO Global."
        : "Escolha o CEO Global ou entre em um projeto para selecionar um agente do time e começar a conversar."}
    </p>
    <div className="flex items-center gap-2 rounded-lg border border-ide-border bg-ide-surface/50 px-4 py-2 text-xs text-ide-text-dim">
      <span className="text-ide-indigo">←</span>
      <span>
        {hasProjectSelected
          ? "Clique em um agente listado na barra lateral"
          : "Clique no CEO ou em um projeto listado na barra lateral"}
      </span>
    </div>
  </div>
);

AgentChatShell.displayName = "AgentChatShell";
