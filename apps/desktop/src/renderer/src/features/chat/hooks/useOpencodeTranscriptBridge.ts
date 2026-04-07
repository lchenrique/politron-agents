import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useAtomValue } from 'jotai';
import {
  activeAgentAtom,
  activeAgentTeamAtom,
  globalAgentsAtom,
  workspaceAtom,
  projectsAtom,
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
  SubAgentBlock,
  UserMessageBlock,
  TodoItem,
} from '../types/block.types';
import {
  AgentEventAdapter,
  type TranscriptSnapshot,
  useChatStore,
} from '../store/chatStore';
import {
  measureChatBridgeOperation,
  recordChatBridgeEvent,
} from '../perf/chatPerf';
import { useActiveSession } from '../context/ActiveSessionContext';
import { buildSessionContextKey, useSessionStore } from '../store/sessionStore';

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

type AgentHandoffEvent = {
  teamId?: string;
  teamName?: string;
  sessionId?: string;
  fromAgentId: string;
  fromAgentName?: string;
  toAgentId: string;
  toAgentName?: string;
  task: string;
  files?: string[];
  branchName?: string;
};

type TaskDelegatedEvent = {
  team: {
    id: string;
    name: string;
  };
  task: {
    id: string;
    teamId: string;
    agentId: string;
    description: string;
    files: string[];
    status: string;
    branchName?: string;
  };
  fromAgentId?: string;
  fromAgentName?: string;
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

type QueuedSendRequest = {
  contextKey: string;
  context: ActiveAgentContext;
  text: string;
  options?: { model?: { modelID: string; providerID: string } };
};

type PipelineUpdateEvent = {
  agentId?: string;
  sessionId?: string;
  type: string;
  file?: {
    path?: string;
    filePath?: string;
  } | string;
  todos?: Array<Record<string, unknown>>;
};

type ActiveAgentContext = {
  agent: Agent;
  team: Team | null;
  isGlobal: boolean;
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

function normalizeError(error: unknown, context?: ActiveAgentContext | null): string {
  if (context && !context.isGlobal && !context.team?.projectPath?.trim()) {
    return `O agente ${context.agent.name} não tem pasta de projeto configurada. Selecione e configure um projeto no canto superior direito para poder conversar com este Agente.`;
  }
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    try {
      return JSON.stringify(error, null, 2);
    } catch {
      return 'Erro desconhecido ao processar evento do agente.';
    }
  }
  return 'Erro desconhecido.'.concat(String(error));
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

function isTodoLikeObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseTodoItemsFromText(text?: string): TodoItem[] | null {
  if (!text?.trim()) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  const rawItems = Array.isArray(parsed)
    ? parsed
    : isTodoLikeObject(parsed) && Array.isArray(parsed.todos)
      ? parsed.todos
      : null;

  if (!rawItems) {
    return null;
  }

  const items = rawItems
    .map((entry) => {
      if (!isTodoLikeObject(entry)) return null;

      const content = [entry.content, entry.description, entry.title]
        .find((value) => typeof value === 'string' && value.trim());
      if (!content || typeof content !== 'string') return null;

      return {
        content,
        priority: typeof entry.priority === 'string' ? entry.priority : undefined,
        status: typeof entry.status === 'string' ? entry.status : undefined,
      } satisfies TodoItem;
    })
    .filter((item): item is TodoItem => Boolean(item));

  return items.length > 0 ? items : null;
}

function getFilePath(file: PipelineUpdateEvent['file']): string | null {
  if (!file) return null;
  if (typeof file === 'string') return file;
  return file.path || file.filePath || null;
}

function isSimpleGreeting(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');

  return [
    'oi',
    'ola',
    'olá',
    'e ai',
    'eae',
    'opa',
    'fala',
    'bom dia',
    'boa tarde',
    'boa noite',
    'hello',
    'hi',
    'hey',
  ].includes(normalized);
}

function buildUserFacingLanguageRule(): string {
  return [
    'Regra de idioma:',
    '- Toda resposta visível ao usuário final deve ser em português do Brasil.',
    '- A comunicação interna entre agentes pode usar inglês quando for mais eficiente.',
    '- Se houver delegação, a tarefa pode ser passada em linguagem técnica, mas a resposta final ao usuário continua em pt-BR.',
  ].join('\n');
}

function buildCeoMessage(
  text: string,
  projects: Array<{ name: string; teamId: string }>,
  workspace?: { teams?: Array<{ id: string; projectPath?: string }> } | null
): string {
  if (projects.length === 0 || isSimpleGreeting(text)) {
    return `${buildUserFacingLanguageRule()}\n\n${text}`;
  }

  const projectList = projects
    .map((project) => {
      const team = workspace?.teams?.find((candidate) => candidate.id === project.teamId);
      const path = team?.projectPath || 'sem pasta definida';
      return `- ${project.name} (pasta: ${path})`;
    })
    .join('\n');

  return `Você é o CEO Global e conhece todos os projetos existentes.
Não execute comandos, não inspecione arquivos e não analise projetos a menos que o usuário peça isso explicitamente.
Se a mensagem for apenas uma saudação, responda de forma breve e natural.
${buildUserFacingLanguageRule()}

Projetos disponíveis:
${projectList}

---

${text}`;
}

function unwrapCeoMessage(text: string): string {
  const separator = '\n---\n';
  const separatorIndex = text.lastIndexOf(separator);

  if (separatorIndex === -1) {
    return text;
  }

  return text.slice(separatorIndex + separator.length).trim();
}

function isHandoffPlaceholderBlock(block: unknown): block is SubAgentBlock {
  return !!block && typeof block === 'object' && (block as SubAgentBlock).type === 'sub-agent' && Boolean((block as SubAgentBlock).isHandoffPlaceholder);
}

function isOnlyHandoffPlaceholderSnapshot(snapshot: TranscriptSnapshot | null | undefined): boolean {
  if (!snapshot) {
    return false;
  }

  if (snapshot.blockIds.length !== 1 || snapshot.turnIds.length !== 1) {
    return false;
  }

  return isHandoffPlaceholderBlock(snapshot.blocks[snapshot.blockIds[0]]);
}

function stripCommandMarkupFromTranscript(text: string): string {
  if (!text.trim()) {
    return text;
  }

  // Pre-emptive stripping of partial markers to avoid UI flicker/leaks
  // Matches partial tags like <inv, <task, <para, [DELE etc.
  const partialMarkers = [
    /<[itp][\w:]*$/i,           // <i, <in, <inv..., <t, <ta, <tas..., <p, <pa, <par...
    /<minimax:[\w:]*$/i,        // <minimax:too...
    /\[[CDHPRA][\w_]*$/i        // [DELE..., [HIRE..., [ASK...
  ];

  let cleanText = text;
  for (const regex of partialMarkers) {
    cleanText = cleanText.replace(regex, '');
  }

  const markers = [
    text.search(/\[(CREATE_TEAM|DELEGATE|HIRE_AGENT|PAUSE_TEAM|RESUME_TEAM|ASK_HUMAN)\]/i),
    text.search(/<invoke\b/i),
    text.search(/<task\b/i),
    text.search(/<parameter\b/i),
    text.search(/<\/?minimax:tool_call\b/i),
  ].filter((index): index is number => index >= 0);

  if (markers.length === 0) {
    return cleanText.trimEnd();
  }

  const firstMarker = Math.min(...markers);
  return text.slice(0, firstMarker).trimEnd();
}

const TRANSCRIPT_STORAGE_PREFIX = 'politron-chat-transcript-v1';

function getTranscriptStorageKey(contextKey: string): string {
  return `${TRANSCRIPT_STORAGE_PREFIX}:${contextKey}`;
}

function loadPersistedTranscript(contextKey: string): TranscriptSnapshot | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getTranscriptStorageKey(contextKey));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as TranscriptSnapshot;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn('[useOpencodeTranscriptBridge] Failed to load persisted transcript:', error);
    return null;
  }
}

function savePersistedTranscript(contextKey: string, snapshot: TranscriptSnapshot): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(getTranscriptStorageKey(contextKey), JSON.stringify(snapshot));
  } catch (error) {
    console.warn('[useOpencodeTranscriptBridge] Failed to persist transcript:', error);
  }
}

export function useOpencodeTranscriptBridge() {
  const workspace = useAtomValue(workspaceAtom);
  const projects = useAtomValue(projectsAtom);
  const activeAgentTabId = workspace?.activeAgentTabId ?? null;
  const activeAgent = useAtomValue(activeAgentAtom);
  const activeAgentTeam = useAtomValue(activeAgentTeamAtom);
  const globalAgents = useAtomValue(globalAgentsAtom);
  const createTurn = useChatStore((state) => state.createTurn);
  const replaceTranscript = useChatStore((state) => state.replaceTranscript);
  const clearChat = useChatStore((state) => state.clearChat);
  const removeBlock = useChatStore((state) => state.removeBlock);
  const setAgentTodos = useChatStore((state) => state.setAgentTodos);
  
  // Obter sessão ativa do contexto
  const { activeSessionId } = useActiveSession();
  
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

  // Track previous chat context so an active SDK session never leaks across agents/directories
  const previousChatContextKeyRef = useRef<string | null>(null);
  const activeSessionIdRef = useRef<string | null>(activeSessionId);
  const sendQueueRef = useRef<Map<string, QueuedSendRequest[]>>(new Map());
  const activeQueueContextsRef = useRef<Set<string>>(new Set());
  const inFlightQueueContextByAgentRef = useRef<Map<string, string>>(new Map());
  const handleErrorRef = useRef<((event: AgentErrorEvent) => void) | null>(null);
  const visibleSubAgentBlocksByAgentRef = useRef<Map<string, { blockId: string; turnId: string }>>(new Map());

  const activeContext = useMemo<ActiveAgentContext | null>(() => {
    if (!activeAgentTabId || !activeAgent) {
      return null;
    }

    const matchedGlobalAgent = globalAgents.find((agent) => agent.id === activeAgentTabId);
    if (matchedGlobalAgent) {
      return {
        agent: matchedGlobalAgent,
        team: null,
        isGlobal: true,
        isCeo: matchedGlobalAgent.role === 'ceo',
      };
    }

    return {
      agent: activeAgent,
      team: activeAgentTeam,
      isGlobal: false,
      isCeo: false,
    };
  }, [activeAgent, activeAgentTabId, activeAgentTeam, globalAgents]);

  const activeAgentId = activeContext?.agent.id ?? null;
  const isCeoContext = activeContext?.isCeo ?? false;
  const activeAgentIdRef = useRef<string | null>(activeAgentId);
  const activeContextKey = activeContext
    ? buildSessionContextKey({
        agentId: activeContext.agent.id,
        isGlobal: activeContext.isGlobal,
        teamId: activeContext.team?.id ?? null,
      })
    : null;
  const sessionContextKey = activeSessionId && activeContextKey
    ? `${activeSessionId}:${activeContextKey}`
    : null;
  const transcriptStateKey = sessionContextKey ?? activeContextKey;
  const lastSessionContextKeyRef = useRef<string | null>(null);

  // emit precisa estar antes do useEffect que usa ele
  const emit = useCallback((event: Parameters<AgentEventAdapter['emit']>[0]) => {
    recordChatBridgeEvent(`emit:${event.type}`);
    adapterRef.current?.emit(event);
  }, []);

  useEffect(() => {
    activeAgentIdRef.current = activeAgentId;
  }, [activeAgentId]);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const isRelevantSessionEvent = useCallback((sessionId?: string) => {
    const currentSessionId = activeSessionIdRef.current;
    return !sessionId || !currentSessionId || sessionId === currentSessionId;
  }, []);

  const releaseQueueForAgent = useCallback((agentId: string) => {
    const contextKey = inFlightQueueContextByAgentRef.current.get(agentId);
    if (!contextKey) {
      return null;
    }

    inFlightQueueContextByAgentRef.current.delete(agentId);
    activeQueueContextsRef.current.delete(contextKey);
    return contextKey;
  }, []);

  const appendVisibleSubAgentResult = useCallback((agentId: string, text: string, status?: BlockStatus) => {
    const tracked = visibleSubAgentBlocksByAgentRef.current.get(agentId);
    if (!tracked || !text.trim()) {
      return;
    }

    const block = useChatStore.getState().blocks[tracked.blockId];
    if (!block || block.type !== 'sub-agent') {
      return;
    }

    const currentResult = block.result || '';
    const nextResult = currentResult ? `${currentResult}\n${text}` : text;
    emit({
      type: 'block-updated',
      blockId: tracked.blockId,
      data: {
        result: nextResult,
        isHandoffPlaceholder: false,
        ...(status ? { status } : {}),
      } as Partial<SubAgentBlock>,
    });
  }, [emit]);

  const finalizeVisibleSubAgent = useCallback((agentId: string, status: BlockStatus, trailer?: string) => {
    const tracked = visibleSubAgentBlocksByAgentRef.current.get(agentId);
    if (!tracked) {
      return;
    }

    const block = useChatStore.getState().blocks[tracked.blockId];
    if (!block || block.type !== 'sub-agent') {
      visibleSubAgentBlocksByAgentRef.current.delete(agentId);
      return;
    }

    const nextResult = trailer
      ? [block.result?.trim(), trailer.trim()].filter(Boolean).join('\n\n')
      : block.result;

    emit({
      type: 'block-updated',
      blockId: tracked.blockId,
      data: {
        status,
        isHandoffPlaceholder: false,
        ...(nextResult ? { result: nextResult } : {}),
      } as Partial<SubAgentBlock>,
    });

    if (status === 'success' || status === 'error' || status === 'cancelled') {
      emit({ type: 'turn-completed', turnId: tracked.turnId });
      emit({ type: 'streaming-end' });
      visibleSubAgentBlocksByAgentRef.current.delete(agentId);
    }
  }, [emit]);

  const executeQueuedRequest = useCallback(async (request: QueuedSendRequest) => {
    const { context, text, options } = request;

    recordChatBridgeEvent('outgoing:sendMessage');

    const agentTurnId = createId('turn-agent');
    const thinkingBlockId = createId('thinking');

    createTurn(agentTurnId);
    const thinkingBlock: ThinkingBlock = {
      id: thinkingBlockId,
      turnId: agentTurnId,
      type: 'thinking',
      status: 'streaming',
      timestamp: Date.now(),
      content: 'Conectando ao OpenCode...',
    };
    emit({ type: 'streaming-start' });
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
      const messageToSend = context.isCeo ? buildCeoMessage(text, projects, workspace) : text;
      let ensuredActiveSessionId = activeSessionIdRef.current ?? activeSessionId;

      if (activeSessionIdRef.current) {
        if (context.isGlobal) {
          const ensureRole = context.isCeo ? 'global-ceo' : 'global-agent';
          const ensureResult = await window.vibeAPI.ceo.ensure({
            agentId: context.agent.id,
            role: ensureRole,
            agentSlug: context.agent.catalogSlug?.toLowerCase(),
            systemPromptPath: context.agent.systemPromptPath,
            workspaceDirectory: '',
          });
          const refreshedSessionId = ensureResult.session?.id;

          if (refreshedSessionId) {
            ensuredActiveSessionId = refreshedSessionId;

            if (request.contextKey) {
              useSessionStore.getState().addSession(ensureResult.session, request.contextKey);
              useSessionStore.getState().selectSession(request.contextKey, refreshedSessionId);
            }
          }
        } else {
          const ensureResult = await window.vibeAPI.agent.ensure({
            agentId: context.agent.id,
            teamId: context.team?.id,
            role: context.agent.role,
            agentSlug: context.agent.catalogSlug?.toLowerCase(),
            workspaceDirectory: context.team!.projectPath,
          });
          const refreshedSessionId = ensureResult.session?.id;

          if (refreshedSessionId) {
            ensuredActiveSessionId = refreshedSessionId;

            if (request.contextKey) {
              useSessionStore.getState().addSession(ensureResult.session, request.contextKey);
              useSessionStore.getState().selectSession(request.contextKey, refreshedSessionId);
            }
          }
        }

        if (!ensuredActiveSessionId) {
          throw new Error('Agent session was not created correctly.');
        }

        await window.vibeAPI.session.subscribe(ensuredActiveSessionId);
        await window.vibeAPI.session.prompt({
          sessionId: ensuredActiveSessionId,
          message: messageToSend,
          agentId: context.agent.id,
          teamId: context.team?.id,
          role: context.isCeo
            ? 'global-ceo'
            : context.isGlobal
            ? 'global-agent'
            : context.agent.role === 'tech-lead'
            ? 'tech-lead'
            : 'team-agent',
          agentSlug: context.agent.catalogSlug?.toLowerCase(),
          systemPromptPath: context.agent.systemPromptPath,
          workspaceDirectory: context.isGlobal ? '' : context.team!.projectPath,
          model: options?.model,
        });
      } else {
        if (context.isGlobal) {
          const ensureRole = context.isCeo ? 'global-ceo' : 'global-agent';
          const ensureResult = await window.vibeAPI.ceo.ensure({
            agentId: context.agent.id,
            role: ensureRole,
            agentSlug: context.agent.catalogSlug?.toLowerCase(),
            systemPromptPath: context.agent.systemPromptPath,
            workspaceDirectory: '',
          });
          const ensuredSessionId = ensureResult.session?.id;
          if (ensuredSessionId && request.contextKey) {
            useSessionStore.getState().addSession(ensureResult.session, request.contextKey);
            useSessionStore.getState().selectSession(request.contextKey, ensuredSessionId);
          }
          if (context.isCeo) {
            await window.vibeAPI.ceo.subscribe();
          } else {
            await window.vibeAPI.agent.subscribe(context.agent.id);
          }
          if (!ensuredSessionId) {
            throw new Error('Global agent session was not created correctly.');
          }

          await window.vibeAPI.session.prompt({
            sessionId: ensuredSessionId,
            message: messageToSend,
            agentId: context.agent.id,
            teamId: context.team?.id,
            role: ensureRole,
            agentSlug: context.agent.catalogSlug?.toLowerCase(),
            systemPromptPath: context.agent.systemPromptPath,
            workspaceDirectory: '',
            model: options?.model,
          });
        } else {
          let ensuredSessionId: string | undefined;
          try {
            const ensureResult = await window.vibeAPI.agent.ensure({
              agentId: context.agent.id,
              teamId: context.team?.id,
              role: context.agent.role,
              agentSlug: context.agent.catalogSlug?.toLowerCase(),
              workspaceDirectory: context.team!.projectPath,
            });
            ensuredSessionId = ensureResult.session?.id;
            if (ensuredSessionId && request.contextKey) {
              useSessionStore.getState().addSession(ensureResult.session, request.contextKey);
              useSessionStore.getState().selectSession(request.contextKey, ensuredSessionId);
            }
          } catch (e) {
            console.error('[TranscriptBridge] agent.ensure FAILED:', e);
          }
          if (!ensuredSessionId) {
            throw new Error('Agent session was not created correctly.');
          }
          await window.vibeAPI.session.prompt({
            sessionId: ensuredSessionId,
            message: text,
            agentId: context.agent.id,
            teamId: context.team?.id,
            role: context.agent.role === 'tech-lead' ? 'tech-lead' : 'team-agent',
            agentSlug: context.agent.catalogSlug?.toLowerCase(),
            systemPromptPath: context.agent.systemPromptPath,
            workspaceDirectory: context.team!.projectPath,
            model: options?.model,
          });
        }
      }
    } catch (error) {
      handleErrorRef.current?.({
        agentId: context.agent.id,
        error,
      });
    }
  }, [activeSessionId, createTurn, emit, projects, workspace]);

  const drainQueue = useCallback(async (contextKey: string) => {
    if (!contextKey || activeContextKey !== contextKey) {
      return;
    }

    if (activeQueueContextsRef.current.has(contextKey)) {
      return;
    }

    const queue = sendQueueRef.current.get(contextKey);
    const nextRequest = queue?.shift();
    if (!nextRequest) {
      if (queue && queue.length === 0) {
        sendQueueRef.current.delete(contextKey);
      }
      return;
    }

    if (queue && queue.length === 0) {
      sendQueueRef.current.delete(contextKey);
    }

    activeQueueContextsRef.current.add(contextKey);
    inFlightQueueContextByAgentRef.current.set(nextRequest.context.agent.id, contextKey);

    try {
      await executeQueuedRequest(nextRequest);
    } catch (error) {
      console.error('[TranscriptBridge] queued send failed:', error);
      const releasedContextKey = releaseQueueForAgent(nextRequest.context.agent.id);
      if (releasedContextKey && activeContextKey === releasedContextKey) {
        void drainQueue(releasedContextKey);
      }
    }
  }, [activeContextKey, executeQueuedRequest, releaseQueueForAgent]);

  useEffect(() => {
    if (!activeContextKey) {
      return;
    }

    void drainQueue(activeContextKey);
  }, [activeContextKey, drainQueue]);

  useEffect(() => {
    const previousAgentId = previousAgentIdRef.current;
    const agentChanged = previousAgentId !== activeAgentId;

    if (previousAgentId) {
      const previousSnapshot = useChatStore.getState().getSnapshot();
      if (previousChatContextKeyRef.current) {
        transcriptCacheRef.current.set(previousChatContextKeyRef.current, previousSnapshot);
      }
      if (previousChatContextKeyRef.current) {
        savePersistedTranscript(previousChatContextKeyRef.current, previousSnapshot);
      }
    }

    const runtime = runtimeRef.current;
    for (const handle of runtime.flushHandleByAgent.values()) {
      window.clearTimeout(handle);
    }
    runtime.flushHandleByAgent.clear();
    runtime.bufferedTextByAgent.clear();
    runtime.lastFlushedTextByAgent.clear();
    runtime.thinkingSettledByAgent.clear();

    if (activeAgentId) {
      const cachedSnapshot =
        (transcriptStateKey ? transcriptCacheRef.current.get(transcriptStateKey) : null) ||
        (transcriptStateKey ? loadPersistedTranscript(transcriptStateKey) : null);

      if (cachedSnapshot) {
      if (transcriptStateKey) {
        transcriptCacheRef.current.set(transcriptStateKey, cachedSnapshot);
      }
      replaceTranscript(cachedSnapshot);
      } else if (agentChanged) {
        clearChat();
      }
    } else if (agentChanged) {
      clearChat();
    }

    previousAgentIdRef.current = activeAgentId;
  }, [activeAgentId, activeContextKey, clearChat, replaceTranscript, sessionContextKey, transcriptStateKey]);

  useEffect(() => {
    if (!activeContextKey || !activeAgentId) {
      return;
    }

    let persistHandle: number | null = null;

    const persistCurrentTranscript = () => {
      const snapshot = useChatStore.getState().getSnapshot();
      if (transcriptStateKey) {
        transcriptCacheRef.current.set(transcriptStateKey, snapshot);
        savePersistedTranscript(transcriptStateKey, snapshot);
      }
    };

    const schedulePersist = () => {
      if (persistHandle) {
        window.clearTimeout(persistHandle);
      }

      persistHandle = window.setTimeout(() => {
        persistCurrentTranscript();
        persistHandle = null;
      }, 150);
    };

    const unsubscribe = useChatStore.subscribe((state, previousState) => {
      const transcriptChanged =
        state.blocks !== previousState.blocks ||
        state.blockIds !== previousState.blockIds ||
        state.turns !== previousState.turns ||
        state.turnIds !== previousState.turnIds;

      if (transcriptChanged) {
        schedulePersist();
      }
    });

    schedulePersist();

    return () => {
      if (persistHandle) {
        window.clearTimeout(persistHandle);
      }

      persistCurrentTranscript();
      unsubscribe();
    };
  }, [activeAgentId, activeContextKey]);

  // Clear the current SDK session whenever the active chat context changes.
  // This avoids reusing a project session when the user switches to the CEO, and vice versa.
  useEffect(() => {
    if (!activeContextKey) {
      previousChatContextKeyRef.current = null;
      return;
    }

    if (previousChatContextKeyRef.current !== activeContextKey) {
      useSessionStore.getState().clearSessions();
    }

    previousChatContextKeyRef.current = activeContextKey;
  }, [activeContextKey]);

  useLayoutEffect(() => {
    if (!sessionContextKey) {
      lastSessionContextKeyRef.current = null;
      return;
    }

    if (lastSessionContextKeyRef.current === sessionContextKey) {
      return;
    }

    const hadPreviousSessionContext = !!lastSessionContextKeyRef.current;
    lastSessionContextKeyRef.current = sessionContextKey;

    // Removemos a chamada para clearChat() aqui.
    // O clearChat não deve ser feito quando o activeSessionId muda
    // porque o backend pode atualizar o sessionId automaticamente.
    // O clearChat só é feito ao mudar de agente (abaixo) ou ao selecionar do Modal.
  }, [activeContext, activeSessionId, clearChat, sessionContextKey]);

  // Quando a sessão ativa muda, carregar histórico e assinar eventos
  useEffect(() => {
    if (!activeSessionId || !sessionContextKey) {
      return;
    }
    let cancelled = false;
    const sessionIdAtEffectStart = activeSessionId;

    const loadSessionHistory = async () => {
      try {
        // Carregar mensagens históricas
        const messages = await window.vibeAPI.session.messages(sessionIdAtEffectStart);
        if (cancelled || useSessionStore.getState().getActiveSessionId(activeContextKey) !== sessionIdAtEffectStart) {
          return;
        }
        
        if (messages && messages.length > 0) {
          const currentSnapshot = useChatStore.getState().getSnapshot();
          const hasPlaceholder = isOnlyHandoffPlaceholderSnapshot(currentSnapshot);

          // Evitar duplicação: se a UI já tem mensagens locais "reais" (restauração ou mensagens recém-enviadas),
          // não vamos inserir as mensagens históricas por cima.
          // Se o que existe é apenas o handoff sintético, carregamos o histórico da sessão.
          if (currentSnapshot.turnIds.length > 0 && !hasPlaceholder) {
            return;
          }

          let skippedHandoffPrompt = !hasPlaceholder;

          // Processar mensagens históricas e adicionar ao chat
          for (const msg of messages) {
            // Verificar a estrutura real da mensagem
            const role = msg.info?.role;
            const textContent = extractTextFromParts(msg.parts);
            const visibleText = isCeoContext ? unwrapCeoMessage(textContent) : textContent;
            const sanitizedVisibleText = stripCommandMarkupFromTranscript(visibleText);
            
            if (hasPlaceholder && !skippedHandoffPrompt && role === 'user') {
              skippedHandoffPrompt = true;
              continue;
            }
            
            if (role === 'user' && sanitizedVisibleText) {
              skippedHandoffPrompt = true;
              // Mensagem de usuário
              const turnId = createId('turn-user');
              const blockId = createId('user-historic');
              const userBlock: UserMessageBlock = {
                id: blockId,
                turnId,
                type: 'user-message',
                status: 'success',
                timestamp: msg.info?.createdAt || Date.now(),
                content: sanitizedVisibleText,
              };
              createTurn(turnId);
              emit({ type: 'block-added', turnId, data: userBlock });
            } else if (role === 'assistant' && sanitizedVisibleText) {
              // Mensagem de assistant
              const turnId = createId('turn-asst');
              const blockId = createId('asst-historic');
              const assistantBlock: AssistantMessageBlock = {
                id: blockId,
                turnId,
                type: 'assistant-message',
                status: 'success',
                timestamp: msg.info?.createdAt || Date.now(),
                content: sanitizedVisibleText,
              };
              createTurn(turnId);
              emit({ type: 'block-added', turnId, data: assistantBlock });
            }
          }
        }
      } catch (error) {
        if (cancelled || useSessionStore.getState().getActiveSessionId(activeContextKey) !== sessionIdAtEffectStart) {
          return;
        }
        console.error('[TranscriptBridge] Failed to load session history:', error);
      }
      
      // Depois de carregar histórico, assinar para novos eventos
      try {
        if (cancelled || useSessionStore.getState().getActiveSessionId(activeContextKey) !== sessionIdAtEffectStart) {
          return;
        }
        await window.vibeAPI.session.subscribe(sessionIdAtEffectStart);
        if (cancelled || useSessionStore.getState().getActiveSessionId(activeContextKey) !== sessionIdAtEffectStart) {
          return;
        }
      } catch (error) {
        if (cancelled || useSessionStore.getState().getActiveSessionId(activeContextKey) !== sessionIdAtEffectStart) {
          return;
        }
        console.error('[TranscriptBridge] Failed to subscribe to session:', error);
      }
    };
    
    loadSessionHistory();
    
    return () => {
      cancelled = true;
    };
  }, [activeContextKey, activeSessionId, createTurn, emit, isCeoContext, sessionContextKey]);

  const ensureTurn = useCallback((agentId: string): string => {
    const runtime = runtimeRef.current;
    let turnId = runtime.currentTurnByAgent.get(agentId);

    if (!turnId) {
      turnId = createId('turn');
      createTurn(turnId);
      runtime.currentTurnByAgent.set(agentId, turnId);
    }

    return turnId;
  }, [createTurn]);

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
    const releasedContextKey = releaseQueueForAgent(agentId);
    if (releasedContextKey && activeContextKey === releasedContextKey) {
      void drainQueue(releasedContextKey);
    }
  }, [activeContextKey, drainQueue, emit, flushBufferedText, releaseQueueForAgent]);

  const handleChunk = useCallback((event: AgentChunkEvent) => {
    if (!event.agentId) return;
    const isActiveAgent = event.agentId === activeAgentIdRef.current;
    const isVisibleSubAgent = visibleSubAgentBlocksByAgentRef.current.has(event.agentId);
    if (!isActiveAgent && !isVisibleSubAgent) return;
    if (!isRelevantSessionEvent(event.sessionId) && !isVisibleSubAgent) return;
    recordChatBridgeEvent('incoming:chunk');
    let nextText = event.message?.content?.text;
    if (!nextText) return;

    if (isVisibleSubAgent && !isActiveAgent) {
      appendVisibleSubAgentResult(event.agentId, nextText, 'running');
      return;
    }

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
  }, [appendVisibleSubAgentResult, ensureTurn, isRelevantSessionEvent, scheduleTextFlush]);

  const handleReasoning = useCallback((event: AgentReasoningEvent) => {
    if (!event.agentId) return;
    const isActiveAgent = event.agentId === activeAgentIdRef.current;
    const isVisibleSubAgent = visibleSubAgentBlocksByAgentRef.current.has(event.agentId);
    if (!isActiveAgent && !isVisibleSubAgent) return;
    if (!isRelevantSessionEvent(event.sessionId) && !isVisibleSubAgent) return;
    recordChatBridgeEvent('incoming:reasoning');

    if (isVisibleSubAgent && !isActiveAgent) {
      appendVisibleSubAgentResult(event.agentId, `Pensamento: ${event.text || 'Analisando contexto...'}`, 'running');
      return;
    }

    // Ensure previous text is flushed before showing reasoning/thinking
    flushBufferedText(event.agentId);

    const blockId = ensureThinkingBlock(event.agentId);
    emit({
      type: 'block-updated',
      blockId,
      data: {
        content: event.text || 'Analisando contexto...',
        status: event.isOngoing === false ? 'success' : 'streaming',
      } as Partial<ThinkingBlock>,
    });
  }, [appendVisibleSubAgentResult, emit, ensureThinkingBlock, isRelevantSessionEvent]);

  const handleTool = useCallback((event: AgentToolEvent) => {
    if (!event.agentId || !event.tool) return;
    const isActiveAgent = event.agentId === activeAgentIdRef.current;
    const isVisibleSubAgent = visibleSubAgentBlocksByAgentRef.current.has(event.agentId);
    if (!isActiveAgent && !isVisibleSubAgent) return;
    if (!isRelevantSessionEvent(event.sessionId) && !isVisibleSubAgent) return;
    recordChatBridgeEvent(`incoming:tool:${event.state ?? 'unknown'}`);

    if (isVisibleSubAgent && !isActiveAgent) {
      const toolLine = `[${event.state ?? 'unknown'}] ${event.title || event.tool}${event.output ? `\n${event.output}` : ''}`;
      appendVisibleSubAgentResult(event.agentId, toolLine, event.state === 'error' ? 'error' : 'running');
      if (event.state === 'completed') {
        finalizeVisibleSubAgent(event.agentId, 'running');
      }
      return;
    }

    const runtime = runtimeRef.current;
    
    // Ensure pre-text is flushed before any tool block is created/updated (Rule 01)
    if (event.state === 'running' || event.state === 'pending') {
      flushBufferedText(event.agentId);
    }
    const turnId = ensureTurn(event.agentId);
    const status = event.state === 'error'
      ? 'error'
      : event.state === 'completed'
      ? 'success'
      : 'running';

    if (isTerminalToolName(event.tool)) {
      if (event.state === 'running' || event.state === 'pending') {
        runtime.needsNewAssistantBlock.set(event.agentId, true);
      }
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
      const parsedTodos = event.state === 'completed' ? parseTodoItemsFromText(event.output) : null;

      if (parsedTodos) {
        setAgentTodos(event.agentId, parsedTodos, event.tool || event.title);
        if (resultId) {
          removeBlock(resultId);
          resultMap.delete(key);
        }
        return;
      }

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
  }, [appendVisibleSubAgentResult, emit, ensureTerminalBlock, ensureTurn, finalizeVisibleSubAgent, isRelevantSessionEvent, removeBlock, setAgentTodos]);

  const handleActivity = useCallback((event: AgentActivityEvent) => {
    if (!event.agentId) return;
    const isActiveAgent = event.agentId === activeAgentIdRef.current;
    const isVisibleSubAgent = visibleSubAgentBlocksByAgentRef.current.has(event.agentId);
    if (!isActiveAgent && !isVisibleSubAgent) return;
    if (!isRelevantSessionEvent(event.sessionId) && !isVisibleSubAgent) return;
    recordChatBridgeEvent(`incoming:activity:${event.activity}`);
    if (!isTerminalToolName(event.toolName || event.title)) return;

    if (isVisibleSubAgent && !isActiveAgent) {
      appendVisibleSubAgentResult(
        event.agentId,
        `[activity:${event.activity}] ${event.title || event.toolName || 'terminal'}`,
        event.activity === 'idle' ? 'success' : 'running'
      );
      return;
    }

    if (event.activity !== 'idle') {
      runtimeRef.current.needsNewAssistantBlock.set(event.agentId, true);
      // Flush before starting activity
      flushBufferedText(event.agentId);
    }

    const blockId = ensureTerminalBlock(event.agentId, event.title || event.toolName || 'terminal');
    emit({
      type: 'block-updated',
      blockId,
      data: {
        command: event.title || event.toolName || 'terminal',
        status: event.activity === 'idle' ? 'success' : 'running',
      } as Partial<TerminalBlock>,
    });
  }, [appendVisibleSubAgentResult, emit, ensureTerminalBlock, isRelevantSessionEvent]);

  const handleAgentHandoff = useCallback((event: AgentHandoffEvent) => {
    if (!event.toAgentId) return;
    recordChatBridgeEvent('incoming:agent-handoff');

    const sourceAgentId = activeAgentIdRef.current;
    if (sourceAgentId) {
      flushBufferedText(sourceAgentId);
    }

    const targetContextKey = event.teamId
      ? buildSessionContextKey({
          agentId: event.toAgentId,
          isGlobal: false,
          teamId: event.teamId,
        })
      : null;
    const targetSessionContextKey = event.sessionId && targetContextKey
      ? `${event.sessionId}:${targetContextKey}`
      : targetContextKey;

    if (event.sessionId && targetContextKey) {
      useSessionStore.getState().addSession(
        {
          id: event.sessionId,
          title: event.toAgentName || event.toAgentId,
          time: {
            created: Date.now(),
            updated: Date.now(),
          },
        },
        targetContextKey
      );
      useSessionStore.getState().selectSession(targetContextKey, event.sessionId);
    }

    const turnId = createId('turn-subagent');
    const blockId = createId('sub-agent');
    createTurn(turnId);

    visibleSubAgentBlocksByAgentRef.current.set(event.toAgentId, { blockId, turnId });

    const block: SubAgentBlock = {
      id: blockId,
      turnId,
      type: 'sub-agent',
      status: 'running',
      timestamp: Date.now(),
      agentId: event.toAgentId,
      teamId: event.teamId,
      teamName: event.teamName,
      fromAgentName: event.fromAgentName,
      branchName: event.branchName,
      isHandoffPlaceholder: true,
      handoffMessage: event.task,
      agentName: event.toAgentName || event.toAgentId,
      task: event.task,
      result: [
        `Transferido por: ${event.fromAgentName || event.fromAgentId}`,
        `Equipe: ${event.teamName || event.teamId || 'time'}`,
        event.branchName ? `Branch: ${event.branchName}` : '',
        '',
        'Aguardando primeira atualização do sub-agente...',
      ].filter(Boolean).join('\n'),
    };

    emit({ type: 'block-added', turnId, data: block });
    emit({ type: 'streaming-start' });

    const existingSnapshot = targetSessionContextKey
      ? transcriptCacheRef.current.get(targetSessionContextKey)
      : transcriptCacheRef.current.get(event.toAgentId);
    const nextSnapshot: TranscriptSnapshot = {
      blocks: {
        ...(existingSnapshot?.blocks ?? {}),
        [blockId]: block,
      },
      blockIds: existingSnapshot?.blockIds.includes(blockId)
        ? existingSnapshot.blockIds
        : [...(existingSnapshot?.blockIds ?? []), blockId],
      turns: {
        ...(existingSnapshot?.turns ?? {}),
        [turnId]: existingSnapshot?.turns[turnId] ?? {
          id: turnId,
          blockIds: [blockId],
          createdAt: Date.now(),
          status: 'in-progress',
        },
      },
      turnIds: existingSnapshot?.turnIds.includes(turnId)
        ? existingSnapshot.turnIds
        : [...(existingSnapshot?.turnIds ?? []), turnId],
    };

    if (targetSessionContextKey) {
      transcriptCacheRef.current.set(targetSessionContextKey, nextSnapshot);
    }
  }, [createTurn, emit]);

  const handleTaskDelegated = useCallback((event: TaskDelegatedEvent) => {
    const sourceAgentId = event.fromAgentId || activeAgentIdRef.current;
    if (!sourceAgentId || sourceAgentId !== activeAgentIdRef.current) {
      return;
    }
    if (activeAgentTeam?.id && activeAgentTeam.id !== event.team.id) {
      return;
    }
    if (!event.task?.description) {
      return;
    }

    recordChatBridgeEvent('incoming:task-delegated');
    flushBufferedText(sourceAgentId);

    const turnId = createId('turn-delegation');
    createTurn(turnId);

    const sourceAgent = activeContext?.agent;
    const targetAgentName = activeAgentTeam?.agents.find((agent) => agent.id === event.task.agentId)?.name;
    const assistantBlockId = ensureAssistantBlock(sourceAgentId);
    const delegationText = [
      `${targetAgentName || event.task.agentId}:`,
      event.task.description,
      event.task.files?.length ? `Arquivos: ${event.task.files.join(', ')}` : '',
      event.task.branchName ? `Branch: ${event.task.branchName}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    emit({
      type: 'block-updated',
      blockId: assistantBlockId,
      data: {
        content: delegationText,
        status: 'success',
      } as Partial<AssistantMessageBlock>,
    });

    emit({ type: 'streaming-start' });
    emit({ type: 'streaming-end' });
  }, [activeAgentTeam, activeContext?.agent, createTurn, emit]);

  const handlePipelineUpdate = useCallback((event: PipelineUpdateEvent) => {
    if (!event.agentId || event.agentId !== activeAgentIdRef.current) return;
    if (!isRelevantSessionEvent(event.sessionId)) return;
    recordChatBridgeEvent(`incoming:pipeline:${event.type}`);

    if (event.type === 'todo.updated') {
      const items = Array.isArray(event.todos)
        ? event.todos
            .map((item) => {
              if (!item || typeof item !== 'object') return null;
              const content = [item.content, item.description, item.title]
                .find((value) => typeof value === 'string' && value.trim());
              if (!content || typeof content !== 'string') return null;

              return {
                content,
                priority: typeof item.priority === 'string' ? item.priority : undefined,
                status: typeof item.status === 'string' ? item.status : undefined,
              } satisfies TodoItem;
            })
            .filter((item): item is TodoItem => Boolean(item))
        : [];

      setAgentTodos(event.agentId, items, event.type);
      return;
    }

    if (event.type !== 'file.edited') return;

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
  }, [emit, ensureTurn, isRelevantSessionEvent, setAgentTodos]);

  const handleStatus = useCallback((event: AgentStatusEvent) => {
    if (!event.agentId) return;
    const isActiveAgent = event.agentId === activeAgentIdRef.current;
    const isVisibleSubAgent = visibleSubAgentBlocksByAgentRef.current.has(event.agentId);
    if (!isActiveAgent && !isVisibleSubAgent) return;
    if (!isRelevantSessionEvent(event.sessionId) && !isVisibleSubAgent) return;
    recordChatBridgeEvent(`incoming:status:${event.status}`);

    if (isVisibleSubAgent && !isActiveAgent) {
      if (event.status === 'idle' || event.status === 'done') {
        finalizeVisibleSubAgent(event.agentId, 'success', 'Tarefa concluída.');
      } else if (event.status === 'error') {
        finalizeVisibleSubAgent(event.agentId, 'error', 'A execução do sub-agente falhou.');
      } else {
        appendVisibleSubAgentResult(event.agentId, `Status: ${event.status}`, 'running');
      }
      return;
    }

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
  }, [appendVisibleSubAgentResult, emit, finalizeAgentTurn, finalizeVisibleSubAgent, isRelevantSessionEvent]);

  const handleDone = useCallback((event: AgentDoneEvent) => {
    if (!event.agentId) return;
    const isActiveAgent = event.agentId === activeAgentIdRef.current;
    const isVisibleSubAgent = visibleSubAgentBlocksByAgentRef.current.has(event.agentId);
    if (!isActiveAgent && !isVisibleSubAgent) return;
    if (!isRelevantSessionEvent(event.sessionId) && !isVisibleSubAgent) return;
    recordChatBridgeEvent('incoming:done');

    if (isVisibleSubAgent && !isActiveAgent) {
      finalizeVisibleSubAgent(event.agentId, 'success', 'Sub-agente finalizado.');
      return;
    }

    finalizeAgentTurn(event.agentId, 'success');
  }, [finalizeAgentTurn, finalizeVisibleSubAgent, isRelevantSessionEvent]);

  const handleError = useCallback((event: AgentErrorEvent) => {
    const agentId = event.agentId;
    if (!agentId) return;
    const isActiveAgent = agentId === activeAgentIdRef.current;
    const isVisibleSubAgent = visibleSubAgentBlocksByAgentRef.current.has(agentId);
    if (!isActiveAgent && !isVisibleSubAgent) return;
    if (!isRelevantSessionEvent(event.sessionId)) return;
    recordChatBridgeEvent('incoming:error');

    if (isVisibleSubAgent && !isActiveAgent) {
      finalizeVisibleSubAgent(agentId, 'error', normalizeError(event.error, activeContext));
      return;
    }

    const runtime = runtimeRef.current;
    const turnId = ensureTurn(agentId);
    const assistantBlockId = ensureAssistantBlock(agentId);
    const thinkingBlockId = runtime.thinkingBlockByAgent.get(agentId);
    const message = normalizeError(event.error, activeContext);

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
    const releasedContextKey = releaseQueueForAgent(agentId);
    if (releasedContextKey && activeContextKey === releasedContextKey) {
      void drainQueue(releasedContextKey);
    }
  }, [activeContext, activeContextKey, drainQueue, emit, ensureAssistantBlock, ensureTurn, finalizeVisibleSubAgent, isRelevantSessionEvent, releaseQueueForAgent]);

  useEffect(() => {
    handleErrorRef.current = handleError;
  }, [handleError]);

  useEffect(() => {
    const maybeExtendedApi = window.vibeAPI as typeof window.vibeAPI & {
      onAgentReasoning?: (cb: (data: AgentReasoningEvent) => void) => () => void;
      onAgentTool?: (cb: (data: AgentToolEvent) => void) => () => void;
      onAgentActivity?: (cb: (data: AgentActivityEvent) => void) => () => void;
      onAgentHandoff?: (cb: (data: AgentHandoffEvent) => void) => () => void;
      onTaskDelegated?: (cb: (data: TaskDelegatedEvent) => void) => () => void;
    };

    const unsubscribers = ([
      window.vibeAPI.onAgentChunk(handleChunk),
      maybeExtendedApi.onAgentReasoning?.(handleReasoning),
      maybeExtendedApi.onAgentTool?.(handleTool),
      maybeExtendedApi.onAgentActivity?.(handleActivity),
      maybeExtendedApi.onAgentHandoff?.(handleAgentHandoff),
      maybeExtendedApi.onTaskDelegated?.(handleTaskDelegated),
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
  }, [handleActivity, handleAgentHandoff, handleChunk, handleDone, handleError, handlePipelineUpdate, handleReasoning, handleStatus, handleTaskDelegated, handleTool]);


  const sendMessage = useCallback(async (text: string, options?: { model?: { modelID: string, providerID: string } }) => {
    const context = activeContext;
    const trimmedText = text.trim();

    if (!context || !trimmedText) {
      return;
    }

    const userTurnId = createId('turn-user');
    const userBlockId = createId('user');

    createTurn(userTurnId);
    emit({
      type: 'block-added',
      turnId: userTurnId,
      data: {
        id: userBlockId,
        turnId: userTurnId,
        type: 'user-message',
        status: 'success',
        timestamp: Date.now(),
        content: trimmedText,
      } as UserMessageBlock,
    });

    const request: QueuedSendRequest = {
      contextKey: activeContextKey ?? buildSessionContextKey({
        agentId: context.agent.id,
        isGlobal: context.isGlobal,
        teamId: context.team?.id ?? null,
      }),
      context,
      text: trimmedText,
      options,
    };

    const queue = sendQueueRef.current.get(request.contextKey) ?? [];
    queue.push(request);
    sendQueueRef.current.set(request.contextKey, queue);

    void drainQueue(request.contextKey);
  }, [activeContext, activeContextKey, createTurn, drainQueue, emit]);

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
        : activeContext.isGlobal
        ? `Global · ${activeContext.agent.role}`
        : `${activeContext.team?.name ?? 'Workspace'} · ${activeContext.agent.role}`,
    };
  }, [activeContext]);

  return {
    activeAgent: activeContext?.agent ?? null,
    header,
    sendMessage,
  };
}

