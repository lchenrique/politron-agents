/** Prévia local com eventos declaradamente simulados; nunca chama um motor. */
import { useState } from 'react'
import type { Agent, Message, Run } from '../../../../shared/v9'
import { Button } from '@/components/ui/button'
import { BooWorkPanel } from '../panels/BooWorkPanel'

const agent = { id: 'demo-boo', name: 'Boo', alias: 'boo', color: '#ffffff', avatar: '', description: '' } as Agent
const PHASES = ['Leitura', 'Edição', 'Comando', 'Aprovação', 'Concluído', 'Interrompido'] as const
type Phase = typeof PHASES[number]
export default function BooWorkGallery() {
  const [phase, setPhase] = useState<Phase>('Edição')
  const [notice, setNotice] = useState('')
  const status = phase === 'Aprovação' ? 'waiting' : phase === 'Concluído' ? 'completed' : phase === 'Interrompido' ? 'interrupted' : 'running'
  const run = { id: 'demo-run', agentId: agent.id, conversationId: 'demo-chat', status } as Run
  const category = phase === 'Comando' ? 'Terminal' : phase === 'Leitura' ? 'Leitura' : 'Edição'
  const toolStatus = phase === 'Leitura' || phase === 'Concluído' ? 'completed' : 'running'
  const message = { id: 'demo-tool', agentId: agent.id, conversationId: 'demo-chat', runId: run.id, role: 'activity', status: toolStatus, createdAt: '',
    text: category + ' · ' + (phase === 'Comando' ? 'npm run typecheck' : 'src/saudacao.ts'),
    tool: { name: phase === 'Comando' ? 'workspace_run_command' : phase === 'Leitura' ? 'workspace_read' : 'workspace_write',
      path: phase === 'Comando' ? undefined : 'src/saudacao.ts', status: toolStatus, startedAt: '', args: phase === 'Comando' ? '{"command":"npm run typecheck"}' : undefined,
      output: toolStatus === 'completed' ? 'export function saudacao(nome: string) {\n  return `Olá, ${nome}!`\n}' : undefined,
    } } as Message
  return <main className="h-dvh overflow-auto bg-background p-4 text-foreground md:p-8">
    <header className="mx-auto mb-5 max-w-6xl"><h1 className="text-lg font-semibold">Boo ao vivo</h1><p className="mt-1 text-xs text-muted-foreground">Prévia de desenvolvimento · eventos de exemplo, sem executar tarefas</p>
      <div className="mt-4 flex flex-wrap gap-2">{PHASES.map(value => <Button key={value} size="sm" variant={phase === value ? 'default' : 'outline'} onClick={() => setPhase(value)}>{value}</Button>)}</div>
    </header>
    <div className="mx-auto grid max-w-6xl gap-4 md:h-[720px] md:grid-cols-[minmax(0,1fr)_360px]">
      <section className="flex min-h-64 flex-col rounded-xl border border-border bg-card p-5" aria-label="Chat de exemplo"><h2 className="border-b border-border pb-4 text-sm font-medium">Projeto de exemplo</h2>
        <div className="my-6 ml-auto max-w-xs rounded-xl bg-muted p-3 text-sm">Ajuste a mensagem de boas-vindas.</div>
        <div className="text-sm leading-7"><p className="font-medium">Boo</p><p className="text-muted-foreground">Vou conferir a função de saudação e ajustar o texto.</p></div>
        <div className="mt-8 rounded-lg border border-border p-4 text-xs text-muted-foreground"><p>Chat e painel acompanham a mesma conversa.</p><p className="mt-2">A atividade muda pelos eventos reais no aplicativo; os botões desta galeria simulam esses eventos.</p></div>
        {notice && <p role="status" className="mt-4 text-xs text-muted-foreground">{notice}</p>}
        <div className="mt-auto rounded-lg border border-border p-3 text-xs text-muted-foreground">Envie uma mensagem pelo chat ou pelo painel do Boo.</div>
      </section>
      <div className="h-[720px] min-w-0 overflow-hidden rounded-xl border border-border md:h-full"><BooWorkPanel agents={[agent]} selectedAgents={[agent]} conversationId="demo-chat" runs={[run]} messages={[message]} onOpenFile={path => setNotice('Arquivo selecionado: ' + path)} onOpenChat={() => setNotice('Chat selecionado')} onSendMessage={async (_conversationId, _agentId, text) => { setNotice('Mensagem de exemplo: ' + text) }} /></div>
    </div>
  </main>
}
