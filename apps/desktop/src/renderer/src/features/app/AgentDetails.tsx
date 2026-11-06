import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Phone, Pencil } from 'lucide-react'
import { ASSISTANT_ID, type Agent, type Run } from '../../../../shared/v9'
import { Avatar } from './Avatar'

const statusLabels: Record<Run['status'], string> = { queued: 'Na fila', running: 'Trabalhando', waiting: 'Aguardando aprovação', completed: 'Concluído', failed: 'Falhou', interrupted: 'Interrompido', cancelled: 'Cancelada' }
export function AgentDetails({ agent, runs, onClose, onEdit, onOpenMascot }: {
  agent?: Agent; runs: Run[]; onClose: () => void; onEdit: (agent: Agent) => void; onOpenMascot: (agent: Agent) => void
}) {
  const recent = agent ? runs.filter(run => run.agentId === agent.id).slice(-8).reverse() : []
  const active = recent.find(run => ['running', 'waiting', 'queued'].includes(run.status))
  return <Sheet modal={false} open={!!agent} onOpenChange={open => { if (!open) onClose() }}>
    <SheetContent className="overflow-y-auto">
      {agent && <>
        <SheetHeader className="items-center gap-3 pb-5 pt-10 text-center">
          <Avatar agent={agent} size="lg" />
          <SheetTitle>{agent.name}</SheetTitle>
          <SheetDescription>{agent.description || 'Seu agente de trabalho.'}</SheetDescription>
          <p role="status" className="text-xs text-muted-foreground">{active ? statusLabels[active.status] : 'Disponível'}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenMascot(agent)}><Phone data-icon="inline-start" />Conversar por voz</Button>
            {agent.id !== ASSISTANT_ID && <Button variant="ghost" size="icon" aria-label={`Editar ${agent.name}`} onClick={() => onEdit(agent)}><Pencil /></Button>}
          </div>
        </SheetHeader>
        <Tabs defaultValue="activity" className="px-4 pb-4">
          <TabsList className="w-full"><TabsTrigger value="activity" className="flex-1">Atividade</TabsTrigger><TabsTrigger value="about" className="flex-1">Sobre</TabsTrigger></TabsList>
          <TabsContent value="activity" className="pt-4">
            {recent.length ? <ul className="flex flex-col gap-5">{recent.map(run => <li key={run.id} className="flex flex-col gap-1"><p className="line-clamp-3 text-sm">{run.input}</p><p className="text-xs text-muted-foreground">{statusLabels[run.status]} · {new Date(run.createdAt).toLocaleString('pt-BR')}</p></li>)}</ul> : <p className="text-sm text-muted-foreground">As tarefas deste agente aparecerão aqui.</p>}
          </TabsContent>
          <TabsContent value="about" className="pt-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-4 text-sm">
              <dt className="text-muted-foreground">Provedor</dt><dd>{agent.runtime === 'codex' ? 'Codex' : 'Claude'}</dd>
              <dt className="text-muted-foreground">Modelo</dt><dd>{agent.model || 'Padrão do provedor'}</dd>
              <dt className="text-muted-foreground">Arquivos</dt><dd>{agent.canWrite ? 'Pode editar' : 'Somente leitura'}</dd>
              <dt className="text-muted-foreground">Navegador</dt><dd>{agent.computerUse ? 'Habilitado' : 'Desabilitado'}</dd>
            </dl>
          </TabsContent>
        </Tabs>
      </>}
    </SheetContent>
  </Sheet>
}
