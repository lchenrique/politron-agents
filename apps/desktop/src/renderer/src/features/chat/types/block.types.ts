export type BlockStatus = 'idle' | 'running' | 'streaming' | 'success' | 'error' | 'cancelled';

export interface TodoItem {
  content: string;
  priority?: string;
  status?: string;
}

export interface TodoListState {
  agentId: string;
  updatedAt: number;
  source?: string;
  items: TodoItem[];
}

export type BlockType =
  | 'user-message'
  | 'assistant-message'
  | 'thinking'
  | 'tool-call'
  | 'tool-result'
  | 'terminal'
  | 'diff'
  | 'file-changes'
  | 'approval'
  | 'delegation'
  | 'sub-agent';

export interface BaseBlock {
  id: string;
  turnId: string;
  type: BlockType;
  status: BlockStatus;
  timestamp: number;
}

export interface UserMessageBlock extends BaseBlock {
  type: 'user-message';
  content: string;
}

export interface AssistantMessageBlock extends BaseBlock {
  type: 'assistant-message';
  content: string;
}

export interface ThinkingBlock extends BaseBlock {
  type: 'thinking';
  content: string;
}

export interface ToolCallBlock extends BaseBlock {
  type: 'tool-call';
  toolName: string;
  args?: Record<string, unknown>;
}

export interface ToolResultBlock extends BaseBlock {
  type: 'tool-result';
  toolName: string;
  result: string;
}

export interface TerminalBlock extends BaseBlock {
  type: 'terminal';
  command: string;
  cwd?: string;
  output: string; // Combined stdout/stderr
}

export interface DiffBlock extends BaseBlock {
  type: 'diff';
  filePath: string;
  originalContent: string;
  modifiedContent: string;
}

export interface FileChangesBlock extends BaseBlock {
  type: 'file-changes';
  files: Array<{
    path: string;
    action: 'created' | 'modified' | 'deleted';
  }>;
}

export interface ApprovalBlock extends BaseBlock {
  type: 'approval';
  message: string;
  isApproved?: boolean;
}

export interface DelegationBlock extends BaseBlock {
  type: 'delegation';
  teamId?: string;
  teamName?: string;
  fromAgentId?: string;
  fromAgentName?: string;
  toAgentId?: string;
  toAgentName?: string;
  branchName?: string;
  task: string;
  files?: string[];
  statusMessage?: string;
}

export interface SubAgentBlock extends BaseBlock {
  type: 'sub-agent';
  agentId?: string;
  requestId?: string;
  rootRequestId?: string;
  teamId?: string;
  teamName?: string;
  fromAgentName?: string;
  requesterAgentId?: string;
  requesterAgentName?: string;
  currentAgentId?: string;
  currentAgentName?: string;
  branchName?: string;
  isHandoffPlaceholder?: boolean;
  handoffMessage?: string;
  agentName: string;
  task: string;
  result?: string;
}

export type Block =
  | UserMessageBlock
  | AssistantMessageBlock
  | ThinkingBlock
  | ToolCallBlock
  | ToolResultBlock
  | TerminalBlock
  | DiffBlock
  | FileChangesBlock
  | ApprovalBlock
  | DelegationBlock
  | SubAgentBlock;
