/** Prévia de desenvolvimento da barra lateral com dados fictícios; nenhuma ação chega ao processo principal. */
import { useState } from 'react'
import type { Agent, Conversation, Snapshot, Workspace } from '../../../../shared/v9'
import { emptySnapshot } from '../app/appShellShared'
import { Sidebar } from '../sidebar/Sidebar'

const created = '2026-10-30T12:00:00.000Z'
const agent = (id: string, name: string, color: string, extra: Partial<Agent> = {}): Agent => ({ id, name, alias: id, description: extra.description || '', instructions: '', runtime: 'codex', model: '', color, avatar: '', canWrite: true, computerUse: false, approvalMode: 'ask', revision: 1, createdAt: created, ...extra })
const agents = [agent('chief', 'Chief', '#ffd23f', { description: 'Coordenação', role: 'chief' }), agent('atlas', 'Atlas', '#ffffff', { description: 'Código e arquitetura' }), agent('examen', 'Examen', '#7ee0b5', { description: 'Testes' }), agent('hermes', 'Hermes', '#e9eaf0', { description: 'Pesquisa' }), agent('tyr', 'Tyr', '#ff8fa3', { description: 'Revisão' })]
const workspace = (id: string, name: string): Workspace => ({ id, name, kind: 'local', path: 'C:/projetos/' + id, branch: 'main', baseBranch: null, parentWorkspaceId: null, instructions: '', defaultAgentIds: [], changes: 0, archived: false, createdAt: created })
const workspaces = [workspace('bubbledesk', 'bubbledesk'), workspace('politron', 'politron'), workspace('site', 'site-pessoal')]
const conversation = (id: string, name: string, workspaceId: string, agentIds: string[]): Conversation => ({ id, kind: 'direct', name, agentIds, workspaceId, titleAuto: false, revision: 1, archived: false, createdAt: created, updatedAt: created })
const conversations = [conversation('c1', 'Branch develop remota', 'bubbledesk', ['atlas']), conversation('c2', 'Módulo de agendamentos', 'bubbledesk', ['atlas']), conversation('c3', 'Ajustes do composer', 'politron', ['examen'])]
const snapshot: Snapshot = { ...emptySnapshot, agents, workspaces, conversations } as Snapshot
const noop = () => undefined

export default function SidebarGallery() {
  const [view, setView] = useState<'home' | 'routines' | 'board' | null>(null)
  return <div className="flex h-dvh bg-chrome text-foreground" data-sidebar-gallery>
    <div className="h-full w-[280px] shrink-0">
      <Sidebar snapshot={snapshot} selected={conversations[0]} activeWorkspaceId={null} unreadCounts={{ c2: 2 }} agentStates={{ atlas: 'working', examen: 'waiting' }}
        onSelectConversation={noop} onStartConversation={noop} onOpenAgent={noop} onOpenEditor={noop} onOpenSettings={noop} onDeleteWorkspace={noop} onDeleteConversation={noop}
        onDeleteAgent={noop} onSetChief={noop} onNotice={noop} view={view} onOpenHome={setView} attentionCount={3} />
    </div>
    <main className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Prévia da barra lateral · dados fictícios</main>
  </div>
}
