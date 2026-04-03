import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useAtomValue } from 'jotai';
import {
  activeAgentAtom,
  activeAgentTeamAtom,
  globalCeoAgentAtom,
  workspaceAtom,
} from '@/hooks/atoms';
import type { Agent, Team } from '@/types/workspace';
import type {
  AssistantMessageBlock,
  BlockStatus,
  FileChangesBlock,
  TerminalBlock,
  ThinkingBlock,
  ToolCallBlock,
  ToolResultBlock,
  UserMessageBlock,
} from '../types/block.types';
import {
  AgentEventAdapter,
  type TranscriptSnapshot,
  useChatActions,
  useChatStore,
} from '../store/chatStore';
import {
  measureChatBridgeOperation,
  recordChatBridgeEvent,
} from '../perf/chatPerf';
import { useActiveSession } from '../context/ActiveSessionContext';

type AgentChunkEvent = {
  agentId: string;
  sessionId?: string;
  message?: { content?: { text?: string } };
};

type AgentReasoningEvent = {
  agentId: string;
  sessionId?: string;
  text?: string;
  isOngoing?: boolean;
};

type AgentToolEvent = {
  agentId: string;
  sessionId?: string;
  tool?: string;
  title?: string;
  state?: 'pending' | 'running' | 'completed' | 'error';
  input?: Record<string, unknown>;
  output?: string;
};

type AgentActivityEvent = {
  agentId: string;
  sessionId?: string;
  activity: 'idle' | 'reading' | 'editing' | 'creating' | 'thinking';
  toolName?: string;
  title?: string;
};

type AgentStatusEvent = {
  agentId: string;
  sessionId?: string;
  status: Agent['status'];
};

type AgentDoneEvent = {
  agentId: string;
  sessionId?: string;
};

type AgentErrorEvent = {
  agentId?: string;
  sessionId?: string;
  error?: unknown;
};

type PipelineUpdateEvent = {
  agentId?: string;
  sessionId?: string;
  type: string;
  file?: {
    path?: string;
    filePath?: string;
  } | string;
};

type ActiveAgentContext = {
  agent: Agent;
  team: Team | null;
  isCeo: boolean;
};

type RuntimeState = {
  currentTurnByAgent: Map<string, string>;
  thinkingBlockByAgent: Map<string, string>;
  thinkingSettledByAgent: Set<string>;
  assistantBlockByAgent: Map<string, string>;
  toolCallBlocksByAgent: Map<string, Map<string, string>>;
  toolResultBlocksByAgent: Map<string, Map<string, string>>;
  terminalBlocksByAgent: Map<string, string>;
  fileChangesBlocksByAgent: Map<string, string>;
  filePathsByAgent: Map<string, Set<string>>;
  bufferedTextByAgent: Map<string, string>;
  lastFlushedTextByAgent: Map<string, string>;
  textOffsetByAgent: Map<string, number>;
  flushHandleByAgent: Map<string, number>;
  // Flag: quando true, próximo texto do agente cria um NOVO assistant block
  // (permite que texto após tools apareça DEPOIS das tools, não antes)
  needsNewAssistantBlock: Map<string, boolean>;
};

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toolKey(tool?: string, title?: string): string {
  return `${tool ?? 'tool'}::${title ?? 'action'}`;
}

function normalizeError(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    try {
      return JSON.stringify(error, null, 2);
    } catch {
      return 'Erro desconhecido ao processar evento do agente.';
    }
  }
  return 'Erro desconhecido ao processar evento do agente.';
}

function extractTextFromParts(parts?: Array<{ type: string; text?: string; [key: string]: unknown }>): string {
  if (!parts || parts.length === 0) return '';
  
  const textParts: string[] = [];
  for (const part of parts) {
    if (part.type === 'text' && part.text) {
      textParts.push(part.text);
    }
  }
  
  return textParts.join('\n');
}

function mapAgentStatusToBlockStatus(status: Agent['status']): BlockStatus {
  switch (status) {
    case 'running':
      return 'running';
    case 'done':
      return 'success';
    case 'error':
      return 'error';
    default:
      return 'idle';
  }
}

function isTerminalToolName(toolName?: string): boolean {
  const normalized = toolName?.toLowerCase() ?? '';
  return normalized.includes('bash') || normalized.includes('shell') || normalized.includes('terminal');
}

function getFilePath(file: PipelineUpdateEvent['file']): string | null {
  if (!file) return null;
  if (typeof file === 'string') return file;
  return file.path || file.filePath || null;
}

export function useOpencodeTranscriptBridge() {
  const workspace = useAtomValue(workspaceAtom);
  const activeAgentTabId = workspace?.activeAgentTabId ?? null;
  const activeAgent = useAtomValue(activeAgentAtom);
  const activeAgentTeam = useAtomValue(activeAgentTeamAtom);
  const globalCeoAgent = useAtomValue(globalCeoAgentAtom);
  const actions = useChatActions();
  
  // Obter sessão ativa do contexto
  const { activeSessionId } = useActiveSession();
  
  console.log('[TranscriptBridge] Hook render, activeSessionId from context:', activeSessionId);

  const adapterRef = useRef<AgentEventAdapter | null>(null);
  if (!adapterRef.current) {
    adapterRef.current = AgentEventAdapter.create();
  }

  const transcriptCacheRef = useRef<Map<string, TranscriptSnapshot>>(new Map());
  const previousAgentIdRef = useRef<string | null>(null);

  const runtimeRef = useRef<RuntimeState>({
    currentTurnByAgent: new Map(),
    thinkingBlockByAgent: new Map(),
    thinkingSettledByAgent: new Set(),
    assistantBlockByAgent: new Map(),
    toolCallBlocksByAgent: new Map(),
    toolResultBlocksByAgent: new Map(),
    terminalBlocksByAgent: new Map(),
    fileChangesBlocksByAgent: new Map(),
    filePathsByAgent: new Map(),
    bufferedTextByAgent: new Map(),
    lastFlushedTextByAgent: new Map(),
    textOffsetByAgent: new Map(),
    flushHandleByAgent: new Map(),
    needsNewAssistantBlock: new Map(),
  });

  const activeContext = useMemo<ActiveAgentContext | null>(() => {
    if (!activeAgentTabId || !activeAgent || !globalCeoAgent) return null;

    if (activeAgentTabId === globalCeoAgent.id) {
      return {
        agent: globalCeoAgent,
        team: null,
        isCeo: true,
      };
    }

    return {
      agent: activeAgent,
      team: activeAgentTeam,
      isCeo: false,
    };
  }, [activeAgent, activeAgentTabId, activeAgentTeam, globalCeoAgent]);

  const activeAgentId = activeContext?.agent.id ?? null;
  const activeAgentIdRef = useRef<string | null>(activeAgentId);

  // emit precisa estar antes do useEffect que usa ele
  const emit = useCallback((event: Parameters<AgentEventAdapter['emit']>[0]) => {
    recordChatBridgeEvent(`emit:${event.type}`);
    adapterRef.current?.emit(event);
  }, []);

  useEffect(() => {
    activeAgentIdRef.current = activeAgentId;
  }, [activeAgentId]);

  useEffect(() => {
    const previousAgentId = previousAgentIdRef.current;

    if (previousAgentId) {
      transcriptCacheRef.current.set(previousAgentId, useChatStore.getState().getSnapshot());
    }

    const runtime = runtimeRef.current;
    for (const handle of runtime.flushHandleByAgent.values()) {
      window.clearTimeout(handle);
    }
    runtime.flushHandleByAgent.clear();
    runtime.bufferedTextByAgent.clear();
    runtime.lastFlushedTextByAgent.clear();
    runtime.thinkingSettledByAgent.clear();

    if (activeAgentId && transcriptCacheRef.current.has(activeAgentId)) {
      actions.replaceTranscript(transcriptCacheRef.current.get(activeAgentId)!);
    } else {
      actions.clearChat();
    }

    previousAgentIdRef.current = activeAgentId;
  }, [activeAgentId, actions]);

  // Quando a sessão ativa muda, carregar histórico e assinar eventos
  useEffect(() => {
    console.log('[TranscriptBridge] useEffect triggered, activeSessionId:', activeSessionId, 'activeContext:', !!activeContext);
    
    if (!activeSessionId || !activeContext) {
      console.log('[TranscriptBridge] Skipping - no session or context');
      return;
    }

    console.log('[TranscriptBridge] Session changed to:', activeSessionId);
    
    // Limpar chat atual quando troca de sessão
    actions.clearChat();
    
    const loadSessionHistory = async () => {
      try {
        // Carregar mensagens históricas
        const messages = await window.vibeAPI.session.messages(activeSessionId);
        console.log('[TranscriptBridge] Loaded messages:', messages?.length);
        console.log('[TranscriptBridge] First message structure:', JSON.stringify(messages?.[0], null, 2));
        
        if (messages && messages.length > 0) {
          // Processar mensagens históricas e adicionar ao chat
          for (const msg of messages) {
            // Verificar a estrutura real da mensagem
            const role = msg.info?.role;
            const textContent = extractTextFromParts(msg.parts);
            
            console.log('[TranscriptBridge] Message role:', role, 'text length:', textContent?.length);
            
            if (role === 'user' && textContent) {
              // Mensagem de usuário
              const turnId = createId('turn-user');
              const blockId = createId('user-historic');
              const userBlock: UserMessageBlock = {
                id: blockId,
                turnId,
                type: 'user-message',
                status: 'success',
                timestamp: msg.info?.createdAt || Date.now(),
                content: textContent,
              };
              actions.createTurn(turnId);
              emit({ type: 'block-added', turnId, data: userBlock });
            } else if (role === 'assistant' && textContent) {
              // Mensagem de assistant
              const turnId = createId('turn-asst');
              const blockId = createId('asst-historic');
              const assistantBlock: AssistantMessageBlock = {
                id: blockId,
                turnId,
                type: 'assistant-message',
                status: 'success',
                timestamp: msg.info?.createdAt || Date.now(),
                content: textContent,
              };
              actions.createTurn(turnId);
              emit({ type: 'block-added', turnId, data: assistantBlock });
            }
          }
        }
      } catch (error) {
        console.error('[TranscriptBridge] Failed to load session history:', error);
      }
      
      // Depois de carregar histórico, assinar para novos eventos
      try {
        await window.vibeAPI.session.subscribe(activeSessionId);
        console.log('[TranscriptBridge] Subscribed to session:', activeSessionId);
      } catch (error) {
        console.error('[TranscriptBridge] Failed to subscribe to session:', error);
      }
    };
    
    loadSessionHistory();
  }, [activeSessionId, activeContext, actions, emit]);

  const ensureTurn = useCallback((agentId: string): string => {
    const runtime = runtimeRef.current;
    let turnId = runtime.currentTurnByAgent.get(agentId);

    if (!turnId) {
      turnId = createId('turn');
      actions.createTurn(turnId);
      runtime.currentTurnByAgent.set(agentId, turnId);
    }

    return turnId;
  }, [actions]);

  const ensureThinkingBlock = useCallback((agentId: string, initialText = 'Aguardando resposta do agente...'): string => {
    const runtime = runtimeRef.current;
    const existingId = runtime.thinkingBlockByAgent.get(agentId);
    if (existingId) return existingId;

    const turnId = ensureTurn(agentId);
    const blockId = createId('thinking');
    const block: ThinkingBlock = {
      id: blockId,
      turnId,
      type: 'thinking',
      status: 'streaming',
      timestamp: Date.now(),
      content: initialText,
    };

    emit({ type: 'block-added', turnId, data: block });
    runtime.thinkingBlockByAgent.set(agentId, blockId);
    return blockId;
  }, [emit, ensureTurn]);

  const ensureAssistantBlock = useCallback((agentId: string): string => {
    const runtime = runtimeRef.current;
    const existingId = runtime.assistantBlockByAgent.get(agentId);
    if (existingId) return existingId;

    const turnId = ensureTurn(agentId);
    const blockId = createId('assistant');
    const block: AssistantMessageBlock = {
      id: blockId,
      turnId,
      type: 'assistant-message',
      status: 'streaming',
      timestamp: Date.now(),
      content: '',
    };

    emit({ type: 'block-added', turnId, data: block });
    runtime.assistantBlockByAgent.set(agentId, blockId);
    return blockId;
  }, [emit, ensureTurn]);

  const ensureTerminalBlock = useCallback((agentId: string, command: string): string => {
    const runtime = runtimeRef.current;
    const existingId = runtime.terminalBlocksByAgent.get(agentId);
    if (existingId) return existingId;

    const turnId = ensureTurn(agentId);
    const blockId = createId('terminal');
    const block: TerminalBlock = {
      id: blockId,
      turnId,
      type: 'terminal',
      status: 'running',
      timestamp: Date.now(),
      command,
      output: '',
    };

    emit({ type: 'block-added', turnId, data: block });
    runtime.terminalBlocksByAgent.set(agentId, blockId);
    return blockId;
  }, [emit, ensureTurn]);

  const flushBufferedText = useCallback((agentId: string) => {
    measureChatBridgeOperation('flushBufferedText', () => {
      const runtime = runtimeRef.current;
      const bufferedText = runtime.bufferedTextByAgent.get(agentId);
      runtime.flushHandleByAgent.delete(agentId);

      if (!bufferedText) return;

      recordChatBridgeEvent('flush:text');

      // Verificar se precisamos criar um NOVO assistant block (texto após tools)
      const needsNewBlock = runtime.needsNewAssistantBlock.get(agentId);
      
      if (needsNewBlock) {
        // Finalizar o assistant block anterior se existir
        const oldAssistantBlockId = runtime.assistantBlockByAgent.get(agentId);
        if (oldAssistantBlockId) {
          emit({
            type: 'block-updated',
            blockId: oldAssistantBlockId,
            data: { status: 'success' } as Partial<AssistantMessageBlock>,
          });
        }
        
        // Antes de deletar a referência, salvamos o offset do que já foi "exibido"
        const contentSoFar = runtime.lastFlushedTextByAgent.get(agentId) || "";
        runtime.textOffsetByAgent.set(agentId, contentSoFar.length);

        // Limpar o mapa para forçar criação de um novo assistant block
        runtime.assistantBlockByAgent.delete(agentId);
        // lastFlushedText continua com o texto completo para mantermos o histórico
        // Resetar o flag
        runtime.needsNewAssistantBlock.set(agentId, false);
      }

      const assistantBlockId = ensureAssistantBlock(agentId);
      const thinkingBlockId = runtime.thinkingBlockByAgent.get(agentId);
      const previousTotalFlushed = runtime.lastFlushedTextByAgent.get(agentId) ?? '';
      const offsetInTurn = runtime.textOffsetByAgent.get(agentId) ?? 0;

      if (thinkingBlockId && !runtime.thinkingSettledByAgent.has(agentId)) {
        emit({
          type: 'block-updated',
          blockId: thinkingBlockId,
          data: { status: 'success' } as Partial<ThinkingBlock>,
        });
        runtime.thinkingSettledByAgent.add(agentId);
      }

      if (bufferedText === previousTotalFlushed) return;

      // O texto que deve aparecer neste bloco específico é apenas após o offset
      const blockBufferedText = bufferedText.slice(offsetInTurn);
      const blockPreviousFlushed = previousTotalFlushed.slice(offsetInTurn);

      if (blockPreviousFlushed && blockBufferedText.startsWith(blockPreviousFlushed)) {
        const delta = blockBufferedText.slice(blockPreviousFlushed.length);
        if (delta) {
          emit({
            type: 'content-appended',
            blockId: assistantBlockId,
            data: delta,
          });
        }
      } else {
        emit({
          type: 'block-updated',
          blockId: assistantBlockId,
          data: {
            content: blockBufferedText,
            status: 'streaming',
          } as Partial<AssistantMessageBlock>,
        });
      }

      runtime.lastFlushedTextByAgent.set(agentId, bufferedText);
    });
  }, [emit, ensureAssistantBlock]);

  const scheduleTextFlush = useCallback((agentId: string, nextText: string) => {
    const runtime = runtimeRef.current;
    const previousBuffered = runtime.bufferedTextByAgent.get(agentId);
    const previousFlushed = runtime.lastFlushedTextByAgent.get(agentId);

    if (nextText === previousBuffered || nextText === previousFlushed) {
      return;
    }

    runtime.bufferedTextByAgent.set(agentId, nextText);

    if (runtime.flushHandleByAgent.has(agentId)) return;

    const handle = window.setTimeout(() => {
      flushBufferedText(agentId);
    }, 40);

    runtime.flushHandleByAgent.set(agentId, handle);
  }, [flushBufferedText]);

  const finalizeAgentTurn = useCallback((agentId: string, finalStatus: BlockStatus = 'success') => {
    const runtime = runtimeRef.current;
    const handle = runtime.flushHandleByAgent.get(agentId);
    if (handle) {
      window.clearTimeout(handle);
      flushBufferedText(agentId);
    }

    const thinkingBlockId = runtime.thinkingBlockByAgent.get(agentId);
    const assistantBlockId = runtime.assistantBlockByAgent.get(agentId);
    const terminalBlockId = runtime.terminalBlocksByAgent.get(agentId);
    const fileChangesBlockId = runtime.fileChangesBlocksByAgent.get(agentId);
    const turnId = runtime.currentTurnByAgent.get(agentId);

    if (thinkingBlockId) {
      emit({
        type: 'block-updated',
        blockId: thinkingBlockId,
        data: { status: finalStatus === 'error' ? 'error' : 'success' } as Partial<ThinkingBlock>,
      });
    }

    if (assistantBlockId) {
      emit({
        type: 'block-updated',
        blockId: assistantBlockId,
        data: { status: finalStatus } as Partial<AssistantMessageBlock>,
      });
    }

    if (terminalBlockId) {
      emit({
        type: 'block-updated',
        blockId: terminalBlockId,
        data: { status: finalStatus } as Partial<TerminalBlock>,
      });
    }

    if (fileChangesBlockId) {
      emit({
        type: 'block-updated',
        blockId: fileChangesBlockId,
        data: { status: finalStatus } as Partial<FileChangesBlock>,
      });
    }

    if (turnId) {
      emit({ type: 'turn-completed', turnId });
    }

    emit({ type: 'streaming-end' });

    runtime.currentTurnByAgent.delete(agentId);
    runtime.thinkingBlockByAgent.delete(agentId);
    runtime.thinkingSettledByAgent.delete(agentId);
    runtime.assistantBlockByAgent.delete(agentId);
    runtime.toolCallBlocksByAgent.delete(agentId);
    runtime.toolResultBlocksByAgent.delete(agentId);
    runtime.terminalBlocksByAgent.delete(agentId);
    runtime.fileChangesBlocksByAgent.delete(agentId);
    runtime.filePathsByAgent.delete(agentId);
    runtime.bufferedTextByAgent.delete(agentId);
    runtime.lastFlushedTextByAgent.delete(agentId);
    runtime.textOffsetByAgent.delete(agentId);
    runtime.flushHandleByAgent.delete(agentId);
    runtime.needsNewAssistantBlock.delete(agentId);
  }, [emit, flushBufferedText]);

  const handleChunk = useCallback((event: AgentChunkEvent) => {
    if (!event.agentId || event.agentId !== activeAgentIdRef.current) return;
    recordChatBridgeEvent('incoming:chunk');
    let nextText = event.message?.content?.text;
    if (!nextText) return;

    // Filter out thinking content that might be included in chunks
    const runtime = runtimeRef.current;
    const thinkingBlockId = runtime.thinkingBlockByAgent.get(event.agentId);
    if (thinkingBlockId) {
      const thinkingBlock = useChatStore.getState().blocks[thinkingBlockId];
      if (thinkingBlock && thinkingBlock.type === 'thinking') {
        const thinkingContent = (thinkingBlock as ThinkingBlock).content;
        if (thinkingContent && nextText.startsWith(thinkingContent)) {
          nextText = nextText.slice(thinkingContent.length);
          if (!nextText) return;
        }
      }
    }

    ensureTurn(event.agentId);
    scheduleTextFlush(event.agentId, nextText);
  }, [ensureTurn, scheduleTextFlush]);

  const handleReasoning = useCallback((event: AgentReasoningEvent) => {
    if (!event.agentId || event.agentId !== activeAgentIdRef.current) return;
    recordChatBridgeEvent('incoming:reasoning');

    const blockId = ensureThinkingBlock(event.agentId);
    emit({
      type: 'block-updated',
      blockId,
      data: {
        content: event.text || 'Analisando contexto...',
        status: event.isOngoing === false ? 'success' : 'streaming',
      } as Partial<ThinkingBlock>,
    });
  }, [emit, ensureThinkingBlock]);

  const handleTool = useCallback((event: AgentToolEvent) => {
    if (!event.agentId || event.agentId !== activeAgentIdRef.current || !event.tool) return;
    recordChatBridgeEvent(`incoming:tool:${event.state ?? 'unknown'}`);

    const turnId = ensureTurn(event.agentId);
    const status = event.state === 'error'
      ? 'error'
      : event.state === 'completed'
      ? 'success'
      : 'running';

    if (isTerminalToolName(event.tool)) {
      const terminalBlockId = ensureTerminalBlock(event.agentId, event.title || event.tool);
      emit({
        type: 'block-updated',
        blockId: terminalBlockId,
        data: {
          command: event.title || event.tool,
          output: event.output || '',
          status,
        } as Partial<TerminalBlock>,
      });
      return;
    }

    const runtime = runtimeRef.current;
    const key = toolKey(event.tool, event.title);

    let callMap = runtime.toolCallBlocksByAgent.get(event.agentId);
    if (!callMap) {
      callMap = new Map();
      runtime.toolCallBlocksByAgent.set(event.agentId, callMap);
    }

    const existingCallId = callMap.get(key);
    if (!existingCallId) {
      const blockId = createId('tool-call');
      const block: ToolCallBlock = {
        id: blockId,
        turnId,
        type: 'tool-call',
        status,
        timestamp: Date.now(),
        toolName: event.title || event.tool,
        args: event.input,
      };
      emit({ type: 'block-added', turnId, data: block });
      callMap.set(key, blockId);
    } else {
      emit({
        type: 'block-updated',
        blockId: existingCallId,
        data: {
          status,
          args: event.input,
        } as Partial<ToolCallBlock>,
      });
    }

    if (event.state === 'completed' || event.state === 'error') {
      // Marcar que próximo texto do agente deve criar um NOVO assistant block
      // Assim o texto após tools aparece DEPOIS das tools na conversa
      runtime.needsNewAssistantBlock.set(event.agentId, true);

      let resultMap = runtime.toolResultBlocksByAgent.get(event.agentId);
      if (!resultMap) {
        resultMap = new Map();
        runtime.toolResultBlocksByAgent.set(event.agentId, resultMap);
      }

      const resultId = resultMap.get(key);
      const resultText = event.output
        ? event.output
        : event.state === 'error'
        ? `${event.title || event.tool} falhou.`
        : `${event.title || event.tool} concluído${event.input ? `\n\n${JSON.stringify(event.input, null, 2)}` : '.'}`;

      if (!resultId) {
        const blockId = createId('tool-result');
        const block: ToolResultBlock = {
          id: blockId,
          turnId,
          type: 'tool-result',
          status,
          timestamp: Date.now(),
          toolName: event.title || event.tool,
          result: resultText,
        };
        emit({ type: 'block-added', turnId, data: block });
        resultMap.set(key, blockId);
      } else {
        emit({
          type: 'block-updated',
          blockId: resultId,
          data: {
            status,
            result: resultText,
          } as Partial<ToolResultBlock>,
        });
      }
    }
  }, [emit, ensureTerminalBlock, ensureTurn]);

  const handleActivity = useCallback((event: AgentActivityEvent) => {
    if (!event.agentId || event.agentId !== activeAgentIdRef.current) return;
    recordChatBridgeEvent(`incoming:activity:${event.activity}`);
    if (!isTerminalToolName(event.toolName || event.title)) return;

    const blockId = ensureTerminalBlock(event.agentId, event.title || event.toolName || 'terminal');
    emit({
      type: 'block-updated',
      blockId,
      data: {
        command: event.title || event.toolName || 'terminal',
        status: event.activity === 'idle' ? 'success' : 'running',
      } as Partial<TerminalBlock>,
    });
  }, [emit, ensureTerminalBlock]);

  const handlePipelineUpdate = useCallback((event: PipelineUpdateEvent) => {
    if (event.type !== 'file.edited' || !event.agentId || event.agentId !== activeAgentIdRef.current) return;
    recordChatBridgeEvent(`incoming:pipeline:${event.type}`);

    const filePath = getFilePath(event.file);
    if (!filePath) return;

    const runtime = runtimeRef.current;
    const turnId = ensureTurn(event.agentId);
    const existingBlockId = runtime.fileChangesBlocksByAgent.get(event.agentId);
    let trackedPaths = runtime.filePathsByAgent.get(event.agentId);

    if (!trackedPaths) {
      trackedPaths = new Set<string>();
      runtime.filePathsByAgent.set(event.agentId, trackedPaths);
    }

    if (trackedPaths.has(filePath)) return;
    trackedPaths.add(filePath);

    if (!existingBlockId) {
      const blockId = createId('file-changes');
      const block: FileChangesBlock = {
        id: blockId,
        turnId,
        type: 'file-changes',
        status: 'running',
        timestamp: Date.now(),
        files: [{ path: filePath, action: 'modified' }],
      };
      emit({ type: 'block-added', turnId, data: block });
      runtime.fileChangesBlocksByAgent.set(event.agentId, blockId);
      return;
    }

    const existing = useChatStore.getState().blocks[existingBlockId] as FileChangesBlock | undefined;
    if (!existing || existing.type !== 'file-changes') return;

    emit({
      type: 'block-updated',
      blockId: existingBlockId,
      data: {
        files: [...existing.files, { path: filePath, action: 'modified' }],
      } as Partial<FileChangesBlock>,
    });
  }, [emit, ensureTurn]);

  const handleStatus = useCallback((event: AgentStatusEvent) => {
    if (!event.agentId || event.agentId !== activeAgentIdRef.current) return;
    recordChatBridgeEvent(`incoming:status:${event.status}`);
    if (event.status === 'idle' || event.status === 'done') {
      finalizeAgentTurn(event.agentId, 'success');
      return;
    }

    const thinkingBlockId = runtimeRef.current.thinkingBlockByAgent.get(event.agentId);
    if (thinkingBlockId) {
      emit({
        type: 'block-updated',
        blockId: thinkingBlockId,
        data: {
          status: mapAgentStatusToBlockStatus(event.status),
        } as Partial<ThinkingBlock>,
      });
    }
  }, [emit, finalizeAgentTurn]);

  const handleDone = useCallback((event: AgentDoneEvent) => {
    if (!event.agentId || event.agentId !== activeAgentIdRef.current) return;
    recordChatBridgeEvent('incoming:done');
    finalizeAgentTurn(event.agentId, 'success');
  }, [finalizeAgentTurn]);

  const handleError = useCallback((event: AgentErrorEvent) => {
    const agentId = event.agentId;
    if (!agentId || agentId !== activeAgentIdRef.current) return;
    recordChatBridgeEvent('incoming:error');

    const runtime = runtimeRef.current;
    const turnId = ensureTurn(agentId);
    const assistantBlockId = ensureAssistantBlock(agentId);
    const thinkingBlockId = runtime.thinkingBlockByAgent.get(agentId);
    const message = normalizeError(event.error);

    if (thinkingBlockId) {
      emit({
        type: 'block-updated',
        blockId: thinkingBlockId,
        data: {
          content: message,
          status: 'error',
        } as Partial<ThinkingBlock>,
      });
    }

    emit({
      type: 'block-updated',
      blockId: assistantBlockId,
      data: {
        content: `Erro ao executar o agente.\n\n${message}`,
        status: 'error',
      } as Partial<AssistantMessageBlock>,
    });

    emit({ type: 'turn-completed', turnId });
    emit({ type: 'streaming-end' });

    runtime.currentTurnByAgent.delete(agentId);
    runtime.thinkingBlockByAgent.delete(agentId);
    runtime.thinkingSettledByAgent.delete(agentId);
    runtime.assistantBlockByAgent.delete(agentId);
    runtime.toolCallBlocksByAgent.delete(agentId);
    runtime.toolResultBlocksByAgent.delete(agentId);
    runtime.terminalBlocksByAgent.delete(agentId);
    runtime.fileChangesBlocksByAgent.delete(agentId);
    runtime.filePathsByAgent.delete(agentId);
    runtime.bufferedTextByAgent.delete(agentId);
    runtime.lastFlushedTextByAgent.delete(agentId);
    runtime.needsNewAssistantBlock.delete(agentId);

    const handle = runtime.flushHandleByAgent.get(agentId);
    if (handle) {
      window.clearTimeout(handle);
      runtime.flushHandleByAgent.delete(agentId);
    }
  }, [emit, ensureAssistantBlock, ensureTurn]);

  useEffect(() => {
    const maybeExtendedApi = window.vibeAPI as typeof window.vibeAPI & {
      onAgentReasoning?: (cb: (data: AgentReasoningEvent) => void) => () => void;
      onAgentTool?: (cb: (data: AgentToolEvent) => void) => () => void;
      onAgentActivity?: (cb: (data: AgentActivityEvent) => void) => () => void;
    };

    const unsubscribers = ([
      window.vibeAPI.onAgentChunk(handleChunk),
      maybeExtendedApi.onAgentReasoning?.(handleReasoning),
      maybeExtendedApi.onAgentTool?.(handleTool),
      maybeExtendedApi.onAgentActivity?.(handleActivity),
      window.vibeAPI.onAgentStatus(handleStatus),
      window.vibeAPI.onAgentDone(handleDone),
      window.vibeAPI.onAgentError(handleError),
      window.vibeAPI.onPipelineUpdate(handlePipelineUpdate),
    ].filter((u) => typeof u === 'function') as unknown) as Array<() => void>;

    return () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    };
  }, [handleActivity, handleChunk, handleDone, handleError, handlePipelineUpdate, handleReasoning, handleStatus, handleTool]);


  const sendMessage = useCallback(async (text: string) => {
    const context = activeContext;
    
    if (!context || !text.trim()) return;
    recordChatBridgeEvent('outgoing:sendMessage');

    // Create separate turns: user turn and agent turn
    const userTurnId = createId('turn-user');
    const agentTurnId = createId('turn-agent');
    const userBlockId = createId('user');
    const thinkingBlockId = createId('thinking');

    // User turn with user message
    actions.createTurn(userTurnId);
    const userBlock: UserMessageBlock = {
      id: userBlockId,
      turnId: userTurnId,
      type: 'user-message',
      status: 'success',
      timestamp: Date.now(),
      content: text,
    };
    emit({ type: 'streaming-start' });
    emit({ type: 'block-added', turnId: userTurnId, data: userBlock });

    // Agent turn with thinking block
    actions.createTurn(agentTurnId);
    const thinkingBlock: ThinkingBlock = {
      id: thinkingBlockId,
      turnId: agentTurnId,
      type: 'thinking',
      status: 'streaming',
      timestamp: Date.now(),
      content: 'Conectando ao OpenCode...',
    };
    emit({ type: 'block-added', turnId: agentTurnId, data: thinkingBlock });

    const runtime = runtimeRef.current;
    runtime.currentTurnByAgent.set(context.agent.id, agentTurnId);
    runtime.thinkingBlockByAgent.set(context.agent.id, thinkingBlockId);
    runtime.assistantBlockByAgent.delete(context.agent.id);
    runtime.toolCallBlocksByAgent.delete(context.agent.id);
    runtime.toolResultBlocksByAgent.delete(context.agent.id);
    runtime.terminalBlocksByAgent.delete(context.agent.id);
    runtime.fileChangesBlocksByAgent.delete(context.agent.id);
    runtime.filePathsByAgent.delete(context.agent.id);
    runtime.bufferedTextByAgent.delete(context.agent.id);
    runtime.lastFlushedTextByAgent.delete(context.agent.id);
    runtime.needsNewAssistantBlock.delete(context.agent.id);

    const handle = runtime.flushHandleByAgent.get(context.agent.id);
    if (handle) {
      window.clearTimeout(handle);
      runtime.flushHandleByAgent.delete(context.agent.id);
    }

    try {
      // Se temos uma sessão ativa, usar session.prompt diretamente
      if (activeSessionId) {
        console.log('[TranscriptBridge] Using active session:', activeSessionId);
        
        // Subscribe to events first
        await window.vibeAPI.session.subscribe(activeSessionId);
        
        // Send message to specific session
        await window.vibeAPI.session.prompt({
          sessionId: activeSessionId,
          message: text,
          agentSlug: context.agent.catalogSlug,
        });
      } else {
        // Fallback: usar o fluxo padrão (cria/usa sessão padrão do agente)
        if (context.isCeo) {
          await window.vibeAPI.ceo.ensure({
            agentId: context.agent.id,
            agentSlug: context.agent.catalogSlug,
            workspaceDirectory: '',
          });
          await window.vibeAPI.ceo.subscribe();
          await window.vibeAPI.ceo.send({
            agentId: context.agent.id,
            message: text,
          });
        } else {
          await window.vibeAPI.agent.ensure({
            agentId: context.agent.id,
            teamId: context.team?.id,
            role: context.agent.role,
            agentSlug: context.agent.catalogSlug,
            workspaceDirectory: context.team?.projectPath,
          });
          await window.vibeAPI.agent.subscribe(context.agent.id);
          await window.vibeAPI.agent.send({
            agentId: context.agent.id,
            message: text,
          });
        }
      }
    } catch (error) {
      handleError({
        agentId: context.agent.id,
        error,
      });
    }
  }, [activeContext, activeSessionId, actions.createTurn, emit, handleError]);

  const header = useMemo(() => {
    if (!activeContext) {
      return {
        title: 'Nenhum agente selecionado',
        subtitle: 'Selecione um agente para iniciar o transcript operacional',
      };
    }

    return {
      title: activeContext.agent.name,
      subtitle: activeContext.isCeo
        ? 'OpenCode global orchestration'
        : `${activeContext.team?.name ?? 'Workspace'} · ${activeContext.agent.role}`,
    };
  }, [activeContext]);

  return {
    activeAgent: activeContext?.agent ?? null,
    header,
    sendMessage,
  };
}
