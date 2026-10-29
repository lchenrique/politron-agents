import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Approval, Agent, Message } from '../../../../shared/v9'
import { Composer } from '../composer/Composer'
import { ComposerTakeover } from '../composer/ComposerTakeover'

const agent: Agent = {
  id: 'gallery-pits', name: 'Pits', alias: 'pits', description: '', instructions: '',
  runtime: 'codex', model: 'demo', color: '#786bea', avatar: '', canWrite: false, computerUse: false,
  approvalMode: 'ask', revision: 1, createdAt: new Date(0).toISOString(),
}

const queue: Message[] = [1, 2].map(index => ({
  id: `gallery-queued-${index}`, conversationId: 'gallery-chat', agentId: null, author: 'Você', role: 'user',
  text: index === 1 ? 'Revise os nomes e mantenha a API atual.' : 'Depois, atualize o resumo da documentação.',
  status: 'queued', runId: null, createdAt: new Date(Date.now() + index * 1000).toISOString(),
}))

const approvals: Record<'approval' | 'question' | 'plan', Approval> = {
  approval: {
    id: 'gallery-approval', runId: 'gallery-run', conversationId: 'gallery-chat', agentId: agent.id,
    kind: 'command', details: { command: 'npm run typecheck', cwd: 'D:/projetos pessoais/politron' },
    status: 'pending', createdAt: new Date().toISOString(), resolvedAt: null,
  },
  question: {
    id: 'gallery-question', runId: 'gallery-run', conversationId: 'gallery-chat', agentId: agent.id,
    kind: 'question', details: { question: 'Qual comportamento devo manter nesta atualização?', options: ['Preservar o fluxo atual', 'Adicionar uma opção configurável'] },
    status: 'pending', createdAt: new Date().toISOString(), resolvedAt: null,
  },
  plan: {
    id: 'gallery-plan', runId: 'gallery-run', conversationId: 'gallery-chat', agentId: agent.id,
    kind: 'plan', details: { planTitle: 'Revisar o fluxo de mensagens', planSteps: ['Mapear o comportamento atual e os pontos de integração.', 'Implementar o ajuste mantendo fila e steering.', 'Validar os fluxos e registrar as mudanças.'] },
    status: 'pending', createdAt: new Date().toISOString(), resolvedAt: null,
  },
}

type PreviewMode = 'composer' | 'busy' | 'approval' | 'question' | 'plan'

export default function ComposerGallery() {
  const [mode, setMode] = useState<PreviewMode>('busy')
  const [dark, setDark] = useState(true)
  const [notice, setNotice] = useState('')
  const takeover = mode === 'approval' ? approvals.approval : mode === 'question' ? approvals.question : mode === 'plan' ? approvals.plan : undefined

  return <div className={dark ? 'dsh-dark' : 'dsh-light'} style={{ display: 'flex', flexDirection: 'column', height: '100vh', minHeight: 0, background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)' }} data-composer-gallery>
    <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, flex: 'none', padding: '10px 16px', borderBottom: '1px solid var(--dsw-alias-border-l2)' }}>
      <strong style={{ marginRight: 8 }}>Prévia do composer</strong>
      {(['composer', 'busy', 'approval', 'question', 'plan'] as const).map(item => <Button key={item} size="sm" variant={mode === item ? 'secondary' : 'ghost'} onClick={() => setMode(item)}>
        {{ composer: 'Livre', busy: 'Com fila', approval: 'Aprovação', question: 'Pergunta', plan: 'Revisão do plano' }[item]}
      </Button>)}
      <Button className="ml-auto" size="sm" variant="outline" onClick={() => setDark(value => !value)}>{dark ? 'Tema claro' : 'Tema escuro'}</Button>
    </header>
    <main style={{ display: 'flex', flex: '1 1 auto', minHeight: 0, flexDirection: 'column' }}>
      <div style={{ display: 'flex', flex: '1 1 auto', minHeight: 0, alignItems: 'center', justifyContent: 'center', padding: 24, color: 'var(--dsw-alias-label-tertiary)', textAlign: 'center' }}>
        <p>Dados fictícios. O campo, a fila e as interações desta galeria não enviam mensagens ao agente.</p>
      </div>
      {takeover ? <ComposerTakeover approval={takeover} onNotice={setNotice} canApprove /> : <Composer
        conversationId="gallery-composer"
        mentionAgents={[agent]}
        working={mode === 'busy'}
        queued={mode === 'busy' ? queue : []}
        models={[{ id: 'codex:demo', name: 'Modelo de demonstração', provider: 'Codex', providerId: 'codex', enabled: true, efforts: ['low', 'medium', 'high'], defaultEffort: 'medium' }]}
        defaultModelName="codex:demo"
        onModelChange={() => undefined}
        onSubmit={async () => undefined}
        onStop={() => undefined}
        onVoiceNotice={setNotice}
        onCancelQueued={async () => undefined}
        onSendQueuedNow={async () => undefined}
      />}
      {notice && <p role="status" style={{ margin: '0 16px 8px', textAlign: 'center' }}>{notice}</p>}
    </main>
  </div>
}
