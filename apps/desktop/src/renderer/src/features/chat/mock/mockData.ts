/**
 * Mock Data - Comprehensive example data for the transcript
 *
 * This demonstrates all block types and states for testing
 */

import {
  Block,
  UserMessageBlock,
  AssistantMessageBlock,
  ThinkingBlock,
  ToolCallBlock,
  ToolResultBlock,
  TerminalBlock,
  DiffBlock,
  FileChangesBlock,
  ApprovalBlock,
  SubAgentBlock,
} from '../types/block.types';

let blockIdCounter = 1;
let turnIdCounter = 1;

const genId = (prefix: string) => `${prefix}-${blockIdCounter++}`;
const genTurnId = () => `turn-${turnIdCounter++}`;

export const createMockTurn = () => {
  const turnId = genTurnId();

  const userMessage: UserMessageBlock = {
    id: genId('msg'),
    turnId,
    type: 'user-message',
    status: 'success',
    timestamp: Date.now(),
    content: 'Crie um componente de chat para um agente de IA com streaming de mensagens',
  };

  const thinking: ThinkingBlock = {
    id: genId('think'),
    turnId,
    type: 'thinking',
    status: 'success',
    timestamp: Date.now() + 1,
    content: `Vou criar um componente de chat com as seguintes características:

1. **Arquitetura de Transcript**: Modelar como eventos sequenciais, não mensagens simples
2. **Estado Normalizado**: Usar Zustand com estado por entidades para evitar re-renders
3. **Componentes Desacoplados**: Cada tipo de bloco é um componente isolado
4. **Streaming**: Suporte a streaming token por token
5. **Virtualização**: TanStack Virtual para performance em listas longas
6. **Lazy Loading**: Code splitting para componentes pesados (diff, markdown)

Vou começar pela estrutura de tipos...`,
  };

  const toolCall: ToolCallBlock = {
    id: genId('tool'),
    turnId,
    type: 'tool-call',
    status: 'success',
    timestamp: Date.now() + 2,
    toolName: 'create_file',
    args: {
      path: 'src/components/AgentChat.tsx',
      content: '// Initial content...',
    },
  };

  const toolResult: ToolResultBlock = {
    id: genId('result'),
    turnId,
    type: 'tool-result',
    status: 'success',
    timestamp: Date.now() + 3,
    toolName: 'create_file',
    result: JSON.stringify({
      success: true,
      path: 'src/components/AgentChat.tsx',
      lines: 245,
    }, null, 2),
  };

  const terminal: TerminalBlock = {
    id: genId('term'),
    turnId,
    type: 'terminal',
    status: 'success',
    timestamp: Date.now() + 4,
    command: 'npm run dev',
    cwd: '/project',
    output: `> vite v5.0.0
> dev
> ready in 342ms

  Local:   http://localhost:5173/
  Network: http://192.168.1.42:5173/`,
  };

  const diff: DiffBlock = {
    id: genId('diff'),
    turnId,
    type: 'diff',
    status: 'success',
    timestamp: Date.now() + 5,
    filePath: 'src/components/AgentChat.tsx',
    originalContent: `export function AgentChat() {
  return (
    <div>
      <h1>Chat</h1>
    </div>
  );
}`,
    modifiedContent: `export function AgentChat() {
  const [messages, setMessages] = useState<Message[]>([]);

  return (
    <div className="flex flex-col h-full">
      <ChatHeader />
      <Transcript messages={messages} />
      <PromptInput onSend={handleSend} />
    </div>
  );
}`,
  };

  const fileChanges: FileChangesBlock = {
    id: genId('files'),
    turnId,
    type: 'file-changes',
    status: 'success',
    timestamp: Date.now() + 6,
    files: [
      { path: 'src/components/AgentChat.tsx', action: 'created' },
      { path: 'src/components/Transcript.tsx', action: 'created' },
      { path: 'src/components/PromptInput.tsx', action: 'modified' },
      { path: 'src/hooks/useChatStore.ts', action: 'created' },
    ],
  };

  const approval: ApprovalBlock = {
    id: genId('approval'),
    turnId,
    type: 'approval',
    status: 'idle',
    timestamp: Date.now() + 7,
    message:
      'Este comando irá executar `rm -rf node_modules` no diretório do projeto. Esta ação não pode ser desfeita. Deseja continuar?',
  };

  const subAgent: SubAgentBlock = {
    id: genId('subagent'),
    turnId,
    type: 'sub-agent',
    status: 'success',
    timestamp: Date.now() + 8,
    agentName: 'CodeReviewer',
    task: 'Revisar o código do componente AgentChat e sugerir melhorias',
    result: `## Code Review - AgentChat.tsx

### Issues Found
1. **Performance**: O componente não está memoizado
2. **Acessibilidade**: Faltam labels ARIA
3. **Type Safety**: Alguns 'any' encontrados

### Suggestions
- Usar React.memo para otimizar re-renders
- Adicionar atributos aria-* para screen readers
- Substituir 'any' por tipos específicos

### Rating
⭐⭐⭐⭐☆ (4/5)`,
  };

  const assistantMessage: AssistantMessageBlock = {
    id: genId('assistant'),
    turnId,
    type: 'assistant-message',
    status: 'success',
    timestamp: Date.now() + 9,
    content: `Criei o componente de chat AgentChat com arquitetura de transcript!

### Estrutura criada:

\`\`\`
src/components/chat/
├── AgentChat.tsx      # Shell principal
├── Transcript.tsx    # Viewport virtualizado
├── PromptInput.tsx    # Input com toolbar
└── blocks/            # Cards especializados
    ├── UserMessageCard.tsx
    ├── AssistantMessageCard.tsx
    ├── ThinkingCard.tsx
    └── ...
\`\`\`

### Features implementadas:

1. **Estado Normalizado** - Zustand com selectors granulares
2. **Streaming** - appendBlockContent para updates incrementais
3. **Virtualização** - TanStack Virtual para performance
4. **Lazy Loading** - DiffCard carregado sob demanda

O componente está pronto para uso! 🚀`,
  };

  return {
    turnId,
    blocks: [
      userMessage,
      thinking,
      toolCall,
      toolResult,
      terminal,
      diff,
      fileChanges,
      approval,
      subAgent,
      assistantMessage,
    ] as Block[],
  };
};

export const createMockTranscript = (turnCount = 3) => {
  const transcript: { turnId: string; blocks: Block[] }[] = [];

  for (let i = 0; i < turnCount; i++) {
    transcript.push(createMockTurn());
  }

  return transcript;
};

// Streaming simulation helper
export const simulateStreaming = (
  blockId: string,
  content: string,
  onChunk: (chunk: string) => void,
  onComplete: () => void,
  chunkSize = 1,
  delay = 20
): (() => void) => {
  let index = 0;
  let cancelled = false;

  const stream = () => {
    if (cancelled) return;

    if (index < content.length) {
      const chunk = content.slice(index, index + chunkSize);
      onChunk(chunk);
      index += chunkSize;
      setTimeout(stream, delay);
    } else {
      onComplete();
    }
  };

  stream();

  return () => {
    cancelled = true;
  };
};
