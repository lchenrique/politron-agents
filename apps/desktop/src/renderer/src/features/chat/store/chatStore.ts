/**
 * Chat Store - Agentic Transcript Architecture
 *
 * Performance decisions:
 * 1. Normalized state by entities (blocks, turns) - avoids recreating giant arrays
 * 2. Granular selectors - each component subscribes only to what it needs
 * 3. Turn grouping via turnIds array - O(1) lookup, no nested iteration
 * 4. Append-only content updates - streaming doesn't recreate block objects
 * 5. Ephemeral UI state separated from persistent transcript state
 *
 * @optimization All selectors use shallow equality checks via zustand's built-in memoization
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { Block, BlockType, BlockStatus } from '../types/block.types';
import { measureChatStoreMutation } from '../perf/chatPerf';

// =============================================================================
// TYPES - Transcript Event Types for Streaming
// =============================================================================

export interface TranscriptTurn {
  id: string;
  blockIds: string[]; // Blocks in this turn
  createdAt: number;
  status: TurnStatus;
}

export type TurnStatus = 'in-progress' | 'completed' | 'cancelled';

export interface UIState {
  // Sticky scroll behavior
  autoScroll: boolean;
  userScrolledUp: boolean;

  // Expanded/collapsed states for heavy blocks
  expandedBlocks: Set<string>;

  // Loading states
  isStreaming: boolean;

  // Selection state
  selectedBlockId: string | null;
}

export interface ChatState {
  // ========== PERSISTENT STATE (Transcript) ==========
  blocks: Record<string, Block>;        // Entity store - O(1) lookup
  blockIds: string[];                  // Insertion order
  turns: Record<string, TranscriptTurn>; // Turn grouping
  turnIds: string[];                   // Turn order

  // ========== EPHEMERAL UI STATE ==========
  ui: UIState;

  // ========== PERSISTENCE ADAPTER ==========
  // Prepare for localStorage/IndexedDB - not coupled to implementation
  _persistAdapter?: PersistAdapter;
}

export interface TranscriptSnapshot {
  blocks: Record<string, Block>;
  blockIds: string[];
  turns: Record<string, TranscriptTurn>;
  turnIds: string[];
}

// =============================================================================
// PERSIST ADAPTER INTERFACE - Decouples UI from storage backend
// =============================================================================

export interface PersistAdapter {
  saveTranscript: (blocks: Block[], turns: TranscriptTurn[]) => Promise<void>;
  loadTranscript: () => Promise<{ blocks: Block[]; turns: TranscriptTurn[] } | null>;
  clearTranscript: () => Promise<void>;
}

// =============================================================================
// ACTIONS - Event-driven updates for streaming
// =============================================================================

interface ChatActions {
  // Block operations
  addBlock: (block: Block) => void;
  addBlockToTranscript: (turnId: string, block: Block) => void;
  updateBlock: (id: string, partial: Partial<Block>) => void;
  appendBlockContent: (id: string, textToAppend: string) => void;
  removeBlock: (id: string) => void;

  // Turn operations
  createTurn: (turnId: string) => void;
  addBlockToTurn: (turnId: string, blockId: string) => void;
  completeTurn: (turnId: string) => void;

  // Batch operations for efficiency
  addBlocksBatch: (blocks: Block[]) => void;

  // UI operations
  setAutoScroll: (val: boolean) => void;
  setUserScrolledUp: (val: boolean) => void;
  toggleBlockExpanded: (blockId: string) => void;
  setBlockExpanded: (blockId: string, expanded: boolean) => void;
  setStreaming: (val: boolean) => void;
  selectBlock: (blockId: string | null) => void;

  // Persistence
  setPersistAdapter: (adapter: PersistAdapter) => void;
  replaceTranscript: (snapshot: TranscriptSnapshot) => void;
  getSnapshot: () => TranscriptSnapshot;

  // Reset
  clearChat: () => void;
}

// =============================================================================
// STORE INITIAL STATE
// =============================================================================

const initialUIState: UIState = {
  autoScroll: true,
  userScrolledUp: false,
  expandedBlocks: new Set<string>(),
  isStreaming: false,
  selectedBlockId: null,
};

// =============================================================================
// STORE IMPLEMENTATION
// =============================================================================

export const useChatStore = create<ChatState & ChatActions>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    blocks: {},
    blockIds: [],
    turns: {},
    turnIds: [],
    ui: { ...initialUIState },

    // ---------------------------------------------------------------------------
    // BLOCK OPERATIONS
    // ---------------------------------------------------------------------------

    addBlock: (block) => set((state) => measureChatStoreMutation('addBlock', () => {
      // Idempotent - don't recreate if exists
      if (state.blocks[block.id]) return state;

      return {
        blocks: { ...state.blocks, [block.id]: block },
        blockIds: [...state.blockIds, block.id],
      };
    }, state)),

    addBlockToTranscript: (turnId, block) => set((state) => measureChatStoreMutation('addBlockToTranscript', () => {
      if (state.blocks[block.id]) return state;

      const turn = state.turns[turnId];
      if (!turn) {
        return {
          blocks: { ...state.blocks, [block.id]: block },
          blockIds: [...state.blockIds, block.id],
        };
      }

      return {
        blocks: { ...state.blocks, [block.id]: block },
        blockIds: [...state.blockIds, block.id],
        turns: {
          ...state.turns,
          [turnId]: {
            ...turn,
            blockIds: [...turn.blockIds, block.id],
          },
        },
      };
    }, state)),

    updateBlock: (id, partial) => set((state) => measureChatStoreMutation('updateBlock', () => {
      const existing = state.blocks[id];
      if (!existing) return state;

      let hasChanges = false;
      for (const [key, value] of Object.entries(partial)) {
        if (existing[key as keyof Block] !== value) {
          hasChanges = true;
          break;
        }
      }

      if (!hasChanges) return state;

      return {
        blocks: {
          ...state.blocks,
          [id]: { ...existing, ...partial } as Block,
        },
      };
    }, state)),

    appendBlockContent: (id, text) => set((state) => measureChatStoreMutation('appendBlockContent', () => {
      const existing = state.blocks[id];
      if (!existing) return state;

      // Type-safe content append based on block type
      const updatedBlock = { ...existing } as Block & { content?: string; output?: string };

      if (
        existing.type === 'assistant-message' ||
        existing.type === 'thinking' ||
        existing.type === 'user-message'
      ) {
        updatedBlock.content = (updatedBlock.content || '') + text;
      } else if (existing.type === 'terminal') {
        updatedBlock.output = (updatedBlock.output || '') + text;
      } else if (existing.type === 'tool-result') {
        (updatedBlock as typeof updatedBlock & { result?: string }).result =
          ((updatedBlock as typeof updatedBlock & { result?: string }).result || '') + text;
      }

      return {
        blocks: {
          ...state.blocks,
          [id]: updatedBlock as Block,
        },
      };
    }, state)),

    removeBlock: (id) => set((state) => {
      const { [id]: _, ...remainingBlocks } = state.blocks;
      return {
        blocks: remainingBlocks,
        blockIds: state.blockIds.filter((bid) => bid !== id),
      };
    }),

    // ---------------------------------------------------------------------------
    // TURN OPERATIONS - Grouping blocks by conversation turn
    // ---------------------------------------------------------------------------

    createTurn: (turnId) => set((state) => measureChatStoreMutation('createTurn', () => {
      if (state.turns[turnId]) return state;

      const turn: TranscriptTurn = {
        id: turnId,
        blockIds: [],
        createdAt: Date.now(),
        status: 'in-progress',
      };

      return {
        turns: { ...state.turns, [turnId]: turn },
        turnIds: [...state.turnIds, turnId],
      };
    }, state)),

    addBlockToTurn: (turnId, blockId) => set((state) => {
      const turn = state.turns[turnId];
      if (!turn) return state;

      return {
        turns: {
          ...state.turns,
          [turnId]: {
            ...turn,
            blockIds: [...turn.blockIds, blockId],
          },
        },
      };
    }),

    completeTurn: (turnId) => set((state) => measureChatStoreMutation('completeTurn', () => {
      const turn = state.turns[turnId];
      if (!turn) return state;

      return {
        turns: {
          ...state.turns,
          [turnId]: { ...turn, status: 'completed' },
        },
      };
    }, state)),

    // ---------------------------------------------------------------------------
    // BATCH OPERATIONS - For initial load or bulk updates
    // ---------------------------------------------------------------------------

    addBlocksBatch: (blocks) => set((state) => {
      const newBlocks: Record<string, Block> = {};
      const newBlockIds: string[] = [];

      for (const block of blocks) {
        if (!state.blocks[block.id]) {
          newBlocks[block.id] = block;
          newBlockIds.push(block.id);
        }
      }

      if (Object.keys(newBlocks).length === 0) return state;

      return {
        blocks: { ...state.blocks, ...newBlocks },
        blockIds: [...state.blockIds, ...newBlockIds],
      };
    }),

    // ---------------------------------------------------------------------------
    // UI OPERATIONS - Ephemeral state (not persisted)
    // ---------------------------------------------------------------------------

    setAutoScroll: (val) => set((state) => measureChatStoreMutation('setAutoScroll', () => {
      if (state.ui.autoScroll === val) return state;
      return {
        ui: { ...state.ui, autoScroll: val },
      };
    }, state)),

    setUserScrolledUp: (val) => set((state) => measureChatStoreMutation('setUserScrolledUp', () => {
      if (state.ui.userScrolledUp === val) return state;
      return {
        ui: { ...state.ui, userScrolledUp: val },
      };
    }, state)),

    toggleBlockExpanded: (blockId) => set((state) => {
      const newExpanded = new Set(state.ui.expandedBlocks);
      if (newExpanded.has(blockId)) {
        newExpanded.delete(blockId);
      } else {
        newExpanded.add(blockId);
      }
      return {
        ui: { ...state.ui, expandedBlocks: newExpanded },
      };
    }),

    setBlockExpanded: (blockId, expanded) => set((state) => {
      const newExpanded = new Set(state.ui.expandedBlocks);
      if (expanded) {
        newExpanded.add(blockId);
      } else {
        newExpanded.delete(blockId);
      }
      return {
        ui: { ...state.ui, expandedBlocks: newExpanded },
      };
    }),

    setStreaming: (val) => set((state) => measureChatStoreMutation('setStreaming', () => {
      if (state.ui.isStreaming === val) return state;
      return {
        ui: { ...state.ui, isStreaming: val },
      };
    }, state)),

    selectBlock: (blockId) => set((state) => measureChatStoreMutation('selectBlock', () => {
      if (state.ui.selectedBlockId === blockId) return state;
      return {
        ui: { ...state.ui, selectedBlockId: blockId },
      };
    }, state)),

    // ---------------------------------------------------------------------------
    // PERSISTENCE
    // ---------------------------------------------------------------------------

    setPersistAdapter: (adapter) => set({ _persistAdapter: adapter }),

    replaceTranscript: (snapshot) => set((state) => measureChatStoreMutation('replaceTranscript', () => ({
      blocks: snapshot.blocks,
      blockIds: snapshot.blockIds,
      turns: snapshot.turns,
      turnIds: snapshot.turnIds,
      ui: {
        ...state.ui,
        expandedBlocks: new Set<string>(),
        selectedBlockId: null,
        userScrolledUp: false,
      },
    }), state)),

    getSnapshot: () => {
      const state = get();
      return {
        blocks: state.blocks,
        blockIds: state.blockIds,
        turns: state.turns,
        turnIds: state.turnIds,
      };
    },

    clearChat: () => set((state) => measureChatStoreMutation('clearChat', () => ({
      blocks: {},
      blockIds: [],
      turns: {},
      turnIds: [],
      ui: { ...initialUIState },
    }), state)),
  }))
);

// =============================================================================
// GRANULAR SELECTORS - Each component subscribes only to what it needs
// Performance: These prevent global re-renders when block content updates
// =============================================================================

/** Subscribe to only the block IDs array - re-renders only when blocks are added/removed */
export const useBlockIds = () => useChatStore((state) => state.blockIds);

/** Subscribe to only a specific block - re-renders only when that block changes */
export const useBlock = (id: string) => useChatStore((state) => state.blocks[id]);

/** Subscribe to turn IDs */
export const useTurnIds = () => useChatStore((state) => state.turnIds);

/** Subscribe to a specific turn */
export const useTurn = (id: string) => useChatStore((state) => state.turns[id]);

/** Subscribe directly to the block ID list of a turn */
export const useTurnBlockIds = (turnId: string) => useChatStore(
  (state) => state.turns[turnId]?.blockIds ?? []
);

/** Subscribe to all turns */
export const useTurns = () => useChatStore((state) => state.turns);

/** Get all blocks for a specific turn */
export const useTurnBlocks = (turnId: string) => useChatStore((state) => {
  const turn = state.turns[turnId];
  if (!turn) return [];
  return turn.blockIds.map((id) => state.blocks[id]).filter(Boolean);
});

/** UI State selectors */
export const useAutoScroll = () => useChatStore((state) => state.ui.autoScroll);
export const useIsStreaming = () => useChatStore((state) => state.ui.isStreaming);
export const useUserScrolledUp = () => useChatStore((state) => state.ui.userScrolledUp);
export const useSelectedBlockId = () => useChatStore((state) => state.ui.selectedBlockId);

/** Check if a block is expanded */
export const useIsBlockExpanded = (blockId: string) => useChatStore(
  (state) => state.ui.expandedBlocks.has(blockId)
);

/** Actions selector - returns stable reference using useShallow */
export const useChatActions = () => useChatStore(
  useShallow((state) => ({
    addBlock: state.addBlock,
    addBlockToTranscript: state.addBlockToTranscript,
    updateBlock: state.updateBlock,
    appendBlockContent: state.appendBlockContent,
    removeBlock: state.removeBlock,
    createTurn: state.createTurn,
    addBlockToTurn: state.addBlockToTurn,
    completeTurn: state.completeTurn,
    addBlocksBatch: state.addBlocksBatch,
    setAutoScroll: state.setAutoScroll,
    setUserScrolledUp: state.setUserScrolledUp,
    toggleBlockExpanded: state.toggleBlockExpanded,
    setBlockExpanded: state.setBlockExpanded,
    setStreaming: state.setStreaming,
    selectBlock: state.selectBlock,
    replaceTranscript: state.replaceTranscript,
    getSnapshot: state.getSnapshot,
    clearChat: state.clearChat,
  }))
);

/** Combined selectors for convenience */
export const useTranscript = () => useChatStore((state) => ({
  blocks: state.blocks,
  blockIds: state.blockIds,
  turns: state.turns,
  turnIds: state.turnIds,
}));

// =============================================================================
// AGENT EVENT ADAPTER - Interface for connecting to SSE/WebSocket
// This decouples the UI from the backend streaming implementation
// =============================================================================

export interface AgentEvent {
  type: 'block-added' | 'block-updated' | 'content-appended' | 'turn-completed' | 'streaming-start' | 'streaming-end';
  blockId?: string;
  turnId?: string;
  data?: Partial<Block> | string;
}

export type AgentEventHandler = (event: AgentEvent) => void;

export class AgentEventAdapter {
  private handlers: Set<AgentEventHandler> = new Set();
  private state: ChatState;

  constructor(getState: () => ChatState) {
    this.state = getState();
  }

  /** Subscribe to events */
  on(handler: AgentEventHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** Emit an event to all handlers and update store */
  emit(event: AgentEvent) {
    const {
      addBlock,
      addBlockToTranscript,
      updateBlock,
      appendBlockContent,
      completeTurn,
      setStreaming,
    } = useChatStore.getState();

    switch (event.type) {
      case 'block-added':
        if (event.data && typeof event.data === 'object' && 'id' in event.data) {
          const block = event.data as Block;
          if (event.turnId) {
            addBlockToTranscript(event.turnId, block);
          } else {
            addBlock(block);
          }
        }
        break;

      case 'block-updated':
        if (event.blockId && event.data && typeof event.data === 'object') {
          updateBlock(event.blockId, event.data as Partial<Block>);
        }
        break;

      case 'content-appended':
        if (event.blockId && typeof event.data === 'string') {
          appendBlockContent(event.blockId, event.data);
        }
        break;

      case 'turn-completed':
        if (event.turnId) {
          completeTurn(event.turnId);
        }
        break;

      case 'streaming-start':
        setStreaming(true);
        break;

      case 'streaming-end':
        setStreaming(false);
        break;
    }

    // Notify handlers
    this.handlers.forEach((handler) => handler(event));
  }

  /** Factory to create adapter bound to store */
  static create(): AgentEventAdapter {
    return new AgentEventAdapter(() => useChatStore.getState());
  }
}

// =============================================================================
// UTILITY HOOKS
// =============================================================================

/** Hook to get blocks by type - useful for filtering */
export const useBlocksByType = (type: BlockType) => useChatStore((state) =>
  state.blockIds
    .map((id) => state.blocks[id])
    .filter((block) => block?.type === type)
);

/** Hook to get blocks by status */
export const useBlocksByStatus = (status: BlockStatus) => useChatStore((state) =>
  state.blockIds
    .map((id) => state.blocks[id])
    .filter((block) => block?.status === status)
);

/** Hook to get all block types count */
export const useBlockCounts = () => useChatStore((state) => {
  const counts: Record<BlockType, number> = {
    'user-message': 0,
    'assistant-message': 0,
    'thinking': 0,
    'tool-call': 0,
    'tool-result': 0,
    'terminal': 0,
    'diff': 0,
    'file-changes': 0,
    'approval': 0,
    'sub-agent': 0,
  };

  for (const block of Object.values(state.blocks)) {
    if (block) {
      counts[block.type]++;
    }
  }

  return counts;
});
