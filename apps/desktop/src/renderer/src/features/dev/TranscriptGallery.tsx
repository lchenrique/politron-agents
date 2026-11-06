import { MessageList } from '@/features/chat/MessageList'
import type { Agent, Message } from '../../../../shared/v9'

const agent: Agent = {
  id: 'gallery-pits', name: 'Pits', alias: 'pits', description: '', instructions: '',
  runtime: 'codex', model: 'demo', color: '#786bea', avatar: '', canWrite: false, computerUse: false,
  approvalMode: 'ask', revision: 1, createdAt: new Date(0).toISOString(),
}

const startedAt = new Date(Date.now() - 15_000).toISOString()
const finishedAt = new Date(Date.now() - 1_000).toISOString()
const history: Message[] = Array.from({ length: 6 }, (_, index) => {
  const number = index + 1
  const runId = `gallery-history-run-${number}`
  const turnStarted = new Date(Date.now() - 180_000 + number * 20_000).toISOString()
  const turnFinished = new Date(Date.parse(turnStarted) + 8_000).toISOString()
  return [
    {
      id: `gallery-history-user-${number}`, conversationId: 'gallery-chat', agentId: null, author: 'Você', role: 'user' as const,
      text: `Pergunta de exemplo ${number}: qual ponto devo conferir?`, status: 'completed' as const, runId: null, createdAt: turnStarted,
    },
    {
      id: `gallery-history-tool-${number}`, conversationId: 'gallery-chat', agentId: agent.id, author: agent.name, role: 'activity' as const,
      text: `Leitura · material de referência ${number}`, status: 'completed' as const, runId, createdAt: turnStarted,
      tool: { name: 'read', args: `{"path":"docs/referencia-${number}.md"}`, output: 'Trecho de referência conferido.', status: 'completed' as const, startedAt: turnStarted, finishedAt: turnFinished },
    },
    {
      id: `gallery-history-reply-${number}`, conversationId: 'gallery-chat', agentId: agent.id, author: agent.name, role: 'assistant' as const,
      text: `Resumo do turno ${number}: a fonte confirma o ponto principal e indica uma verificação adicional.`, status: 'completed' as const,
      runId, createdAt: turnFinished, finishedAt: turnFinished,
    },
  ]
}).flat()

const currentMessages: Message[] = [
  {
    id: 'gallery-user-1', conversationId: 'gallery-chat', agentId: null, author: 'Você', role: 'user',
    text: 'Compare as duas abordagens e resuma os pontos principais.', status: 'completed', runId: null,
    createdAt: startedAt,
  },
  {
    id: 'gallery-prelude', conversationId: 'gallery-chat', agentId: agent.id, author: agent.name, role: 'assistant',
    text: 'Vou comparar a documentação e conferir uma fonte independente.', status: 'completed', runId: 'gallery-run-1',
    createdAt: startedAt,
  },
  {
    id: 'gallery-tool-read', conversationId: 'gallery-chat', agentId: agent.id, author: agent.name, role: 'activity',
    text: 'Leitura · docs/estrategia.md', status: 'completed', runId: 'gallery-run-1', createdAt: startedAt,
    tool: { name: 'read', args: '{"path":"docs/estrategia.md"}', output: 'Duas abordagens compartilham os mesmos limites operacionais.', status: 'completed', startedAt, finishedAt },
  },
  {
    id: 'gallery-tool-web', conversationId: 'gallery-chat', agentId: agent.id, author: agent.name, role: 'activity',
    text: 'Web · documentação oficial', status: 'completed', runId: 'gallery-run-1', createdAt: startedAt,
    tool: { name: 'web', args: '{"query":"documentação oficial"}', output: 'Fonte encontrada e conferida.', status: 'completed', startedAt, finishedAt },
  },
  {
    id: 'gallery-reply-1', conversationId: 'gallery-chat', agentId: agent.id, author: agent.name, role: 'assistant',
    text: 'As abordagens se distinguem pelo **controle operacional** e pela **facilidade de adoção**. A documentação oficial confirma o fluxo principal; os limites de uso dependem da configuração local.',
    status: 'completed', runId: 'gallery-run-1', createdAt: finishedAt, finishedAt,
  },
  {
    id: 'gallery-user-2', conversationId: 'gallery-chat', agentId: null, author: 'Você', role: 'user',
    text: 'E qual é o próximo passo recomendado?', status: 'completed', runId: null, createdAt: new Date().toISOString(),
  },
  {
    id: 'gallery-reply-running', conversationId: 'gallery-chat', agentId: agent.id, author: agent.name, role: 'assistant',
    text: 'Estou organizando a recomendação por impacto e esforço.', status: 'running', runId: 'gallery-run-2', createdAt: new Date().toISOString(),
  },
  ...([
    ['gallery-step-read', 'Leitura · src/services/ServiceCard.tsx', 'workspace_read', '{"path":"src/services/ServiceCard.tsx"}', 'completed', 'export function ServiceCard() {}', 42],
    ['gallery-step-edit', 'Edição · src/services/ServiceCard.tsx', 'workspace_write', '{"path":"src/services/ServiceCard.tsx"}', 'completed', 'Arquivo atualizado.', 30],
    ['gallery-step-checkout', 'Terminal · git checkout -b develop', 'workspace_run_command', '{"command":"git checkout -b develop"}', 'completed', "Switched to a new branch 'develop'", 18],
    ['gallery-step-push', 'Terminal · git push -u origin develop', 'workspace_run_command', '{"command":"git push -u origin develop"}', 'running', undefined, 4],
  ] as const).map(([id, text, name, args, status, output, ago]): Message => {
    const startedAt = new Date(Date.now() - ago * 1000).toISOString()
    return { id, conversationId: 'gallery-chat', agentId: agent.id, author: agent.name, role: 'activity', text, status: status === 'running' ? 'running' : 'completed', runId: 'gallery-run-2', createdAt: startedAt,
      tool: { name, args, status, startedAt, ...(output ? { output, finishedAt: new Date(Date.parse(startedAt) + 1400).toISOString() } : {}), ...(name === 'workspace_write' || name === 'workspace_read' ? { path: 'src/services/ServiceCard.tsx' } : {}) } }
  }),
]
const messages = [...history, ...currentMessages]

export default function TranscriptGallery() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', minHeight: 0, background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)' }} data-transcript-gallery>
      <header style={{ flex: 'none', padding: '12px 24px', borderBottom: '1px solid var(--dsw-alias-border-l2)', font: 'var(--dsw-font-s-14)' }}>
        <strong>Prévia da transcrição</strong><span style={{ marginLeft: 12, color: 'var(--dsw-alias-label-tertiary)' }}>Dados fictícios · não envia mensagens nem altera o banco</span>
      </header>
      <main style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <MessageList messages={messages} fileChanges={[]} approvals={[]} conversations={[]} agentOf={id => id === agent.id ? agent : undefined} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />
      </main>
    </div>
  )
}
