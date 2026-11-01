/** Prévia de desenvolvimento da barra lateral com dados fictícios; nenhuma ação chega ao processo principal. */
import { useState } from 'react'
import type { Agent, Approval, Conversation, Run, Snapshot, Workspace } from '../../../../shared/v9'
import type { HostsAPI, HostsSnapshot } from '../../../../shared/hosts'
import { emptySnapshot } from '../app/appShellShared'
import { Sidebar } from '../sidebar/Sidebar'

const created = '2026-10-30T12:00:00.000Z'
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString()
const agent = (id: string, name: string, color: string, extra: Partial<Agent> = {}): Agent => ({ id, name, alias: id, description: extra.description || '', instructions: '', runtime: 'codex', model: '', color, avatar: '', canWrite: true, computerUse: false, approvalMode: 'ask', revision: 1, createdAt: created, ...extra })
const agents = [agent('chief', 'Chief', '#ffd23f', { description: 'Coordenação', role: 'chief' }), agent('atlas', 'Atlas', '#ffffff', { description: 'Código e arquitetura' }), agent('examen', 'Examen', '#7ee0b5', { description: 'Testes' }), agent('hermes', 'Hermes', '#e9eaf0', { description: 'Pesquisa' }), agent('tyr', 'Tyr', '#ff8fa3', { description: 'Revisão' }), agent('freya', 'Freya', '#c4b5fd', { description: 'Infra' }), agent('luna', 'Luna', '#93c5fd', { description: 'Design' }), agent('mimir', 'Mimir', '#fde68a', { description: 'Documentação' })]
const workspace = (id: string, name: string, extra: Partial<Workspace> = {}): Workspace => ({ id, name, kind: 'local', path: 'C:/projetos/' + id, branch: 'main', baseBranch: null, parentWorkspaceId: null, instructions: '', defaultAgentIds: [], changes: 0, archived: false, createdAt: created, ...extra })
const workspaces = [workspace('bubbledesk', 'bubbledesk', { defaultAgentIds: ['atlas', 'tyr', 'examen'] }), workspace('politron', 'politron'), workspace('politron-wt', 'politron-sidebar', { kind: 'worktree', branch: 'feat/sidebar-v2', parentWorkspaceId: 'politron', changes: 4 }), workspace('site', 'site-pessoal'), workspace('acme', 'acme-loja')]
const conversation = (id: string, name: string, workspaceId: string, agentIds: string[], hours: number): Conversation => ({ id, kind: 'direct', name, agentIds, workspaceId, titleAuto: false, revision: 1, archived: false, createdAt: ago(hours), updatedAt: ago(hours) })
const bubbleTitles = ['Branch develop remota', 'Módulo de agendamentos', 'Corrigir login social', 'Revisão do checkout', 'Migração do banco', 'Relatório semanal', 'Notificações por e-mail', 'Testes de carga', 'Cache de imagens', 'Webhooks do Stripe', 'Tela de perfil', 'Refatorar rotas']
const conversations = [
  ...bubbleTitles.map((title, index) => conversation('b' + index, title, 'bubbledesk', ['atlas'], 20 + index * 9)),
  conversation('p1', 'Ajustes do composer', 'politron', ['examen'], 3),
  conversation('p2', 'Deploy da beta', 'politron', ['freya'], 1),
  conversation('w1', 'Barra lateral v2', 'politron-wt', ['luna'], 2),
  conversation('a1', 'Catálogo de produtos', 'acme', ['hermes'], 50),
]
const approvals: Approval[] = [{ id: 'ap1', runId: 'r-freya', conversationId: 'p2', agentId: 'freya', kind: 'command', details: { command: 'npm run release -- --tag beta' }, status: 'pending', createdAt: ago(0.2), resolvedAt: null }]
const run = (id: string, conversationId: string, agentId: string, status: Run['status']) => ({ id, conversationId, agentId, status, workspaceId: '', createdAt: ago(0.1) }) as unknown as Run
const runs = [run('r-tyr', 'b1', 'tyr', 'running'), run('r-luna', 'w1', 'luna', 'running'), run('r-freya', 'p2', 'freya', 'waiting')]
const board = { teams: [], events: [], missions: [], evidence: [], tasks: [{ status: 'todo' }, { status: 'doing' }, { status: 'done' }] } as unknown as Snapshot['board']
const routines = [{ enabled: true }, { enabled: true }] as unknown as Snapshot['routines']
const snapshot: Snapshot = { ...emptySnapshot, agents, workspaces, conversations, approvals, runs, board, routines }
const noop = () => undefined

// Pasta de projetos e host fictícios: a prévia não tem banco nem processo principal.
// As duas colunas começam na lista global; a da direita entra no projeto pela navegação.
try { localStorage.removeItem('politron.sidebar.project') } catch { /* prévia */ }
try { if (!localStorage.getItem('politron.sidebar.favorites')) localStorage.setItem('politron.sidebar.favorites', JSON.stringify(['workspace:politron'])) } catch { /* prévia */ }
try { if (!localStorage.getItem('politron.sidebar.groups')) { localStorage.setItem('politron.sidebar.groups', JSON.stringify(['Clientes'])); localStorage.setItem('politron.sidebar.workspace-groups', JSON.stringify({ site: 'Clientes', acme: 'Clientes' })) } } catch { /* prévia */ }
const hostsSnapshot: HostsSnapshot = { selectedId: 'local', hosts: [{ id: 'local', name: 'Este PC', endpoint: 'local', transport: 'local', status: 'connected' }], local: { enabled: false, address: '127.0.0.1', port: 6778, advertisedUrl: '', relayUrl: '', running: false } }
if (!window.hostsAPI) window.hostsAPI = { snapshot: async () => hostsSnapshot, onChanged: () => noop, configure: async () => hostsSnapshot, add: async () => hostsSnapshot.hosts[0], select: async () => undefined, remove: async () => undefined, copyPairing: async () => '', revoke: async () => undefined, browse: async () => [], resolveFolder: async () => null, onFolderRequest: () => noop } as unknown as HostsAPI

export default function SidebarGallery() {
  const [view, setView] = useState<'home' | 'routines' | 'board' | 'office' | 'marketplace' | null>(null)
  const props = { snapshot, unreadCounts: { b2: 2 }, agentStates: { tyr: 'working', luna: 'working', freya: 'waiting' } as const, onSelectConversation: noop, onStartConversation: noop, onOpenAgent: noop, onOpenEditor: noop, onOpenSettings: noop, onDeleteWorkspace: noop, onDeleteConversation: noop, onDeleteAgent: noop, onSetChief: noop, onNotice: noop, view, onOpenHome: setView, attentionCount: 3 }
  return <div className="flex h-dvh bg-chrome text-foreground" data-sidebar-gallery>
    <div className="h-full w-[280px] shrink-0" data-level="global"><Sidebar {...props} selected={undefined} activeWorkspaceId={null} /></div>
    <div className="h-full w-[280px] shrink-0" data-level="project"><Sidebar {...props} selected={conversations[0]} activeWorkspaceId="bubbledesk" /></div>
    <main className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Prévia da barra lateral · global e projeto · dados fictícios</main>
  </div>
}
