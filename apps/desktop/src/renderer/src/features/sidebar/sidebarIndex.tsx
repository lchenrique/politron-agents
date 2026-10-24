import { useMemo } from 'react'
import { FolderOpen, MessageSquarePlus, Plus, Users } from 'lucide-react'
import type { CommandItem } from '@/components/kokonutui/action-search-bar'
import type { Agent, Conversation, Snapshot, Workspace } from '../../../../shared/v9'

/**
 * Indices do snapshot usados pela barra lateral.
 *
 * A varredura direta custava O(projetos^2 * sessoes): cada projeto procurava seu
 * workspace dentro do filtro de cada sessao. Aqui tudo vira uma passagem unica
 * com Map, no mesmo spirito do catalogo do MiniMax Code, que le o projeto por
 * indice em vez de agregar na leitura.
 */
export function useSidebarIndex(snapshot: Snapshot) {
  const workspacesById = useMemo(() => new Map(snapshot.workspaces.map(item => [item.id, item])), [snapshot.workspaces])
  const agentsById = useMemo(() => new Map(snapshot.agents.map(item => [item.id, item])), [snapshot.agents])
  const conversationsByWorkspace = useMemo(() => {
    const map = new Map<string, Conversation[]>()
    for (const item of snapshot.conversations) {
      if (item.archived) continue
      const list = map.get(item.workspaceId)
      if (list) list.push(item)
      else map.set(item.workspaceId, [item])
    }
    for (const list of map.values()) list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return map
  }, [snapshot.conversations])
  const childrenByWorkspace = useMemo(() => {
    const map = new Map<string, Workspace[]>()
    for (const item of snapshot.workspaces) {
      if (item.archived || !item.parentWorkspaceId) continue
      const list = map.get(item.parentWorkspaceId)
      if (list) list.push(item)
      else map.set(item.parentWorkspaceId, [item])
    }
    return map
  }, [snapshot.workspaces])
  // Aprovacoes pendentes por sessao: evita varrer a lista de aprovacoes para cada sessao.
  const pendingApprovalConversations = useMemo(() => new Set(snapshot.approvals.filter(approval => approval.status === 'pending').map(approval => approval.conversationId)), [snapshot.approvals])
  // Sessoes legadas conservam os diretorios originais, mas nao aparecem soltas.
  const legacyConversations = useMemo(() => snapshot.conversations.filter(item => !item.archived && !workspacesById.get(item.workspaceId)?.name), [snapshot.conversations, workspacesById])
  const rootWorkspaces = useMemo(() => snapshot.workspaces.filter(item => !item.archived && !item.parentWorkspaceId && item.name).sort((a, b) => Number(b.name === 'Livre' && b.kind === 'free') - Number(a.name === 'Livre' && a.kind === 'free') || a.name.localeCompare(b.name, 'pt-BR')), [snapshot.workspaces])

  const childWorkspaces = (id: string) => childrenByWorkspace.get(id) || []
  const needsAttention = (conversationId: string) => pendingApprovalConversations.has(conversationId)
  const conversationsOf = (workspaceId: string) => {
    const direct = conversationsByWorkspace.get(workspaceId) || []
    const workspace = workspacesById.get(workspaceId)
    if (!(workspace?.name === 'Livre' && workspace.kind === 'free')) return direct
    // O workspace livre tambem mostra as sessoes cujo workspace nao tem nome.
    const seen = new Set(direct.map(item => item.id))
    return direct.concat(legacyConversations.filter(item => !seen.has(item.id))).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  return { workspacesById, agentsById, legacyConversations, rootWorkspaces, childWorkspaces, conversationsOf, needsAttention }
}

/** Itens da busca rapida. A paleta fica fechada na maior parte do tempo, entao a lista e memorizada. */
export function buildPaletteItems(snapshot: Snapshot, options: { canChat: boolean; browserMode: boolean }, workspacesById: Map<string, Workspace>, agentsById: Map<string, Agent>): CommandItem[] {
  return [
    ...(options.canChat ? [{ id: 'create:session', group: 'Criar', label: 'Nova sessão livre', icon: <MessageSquarePlus className="size-4" />, keywords: ['conversa', 'chat', 'livre'] }] : []),
    ...(!options.browserMode ? [
      { id: 'create:workspace', group: 'Criar', label: 'Novo projeto', icon: <FolderOpen className="size-4" />, keywords: ['pasta', 'workspace'] },
      { id: 'create:agent', group: 'Criar', label: 'Novo Boo', icon: <Plus className="size-4" />, keywords: ['boo', 'boos', 'bot'] },
    ] : []),
    ...snapshot.workspaces.filter(workspace => workspace.name && !workspace.archived).map(workspace => ({
      id: 'workspace:' + workspace.id, group: 'Projetos', label: workspace.name,
      keywords: [workspace.path, workspace.branch || '', 'workspace', 'projeto'],
      icon: <FolderOpen className="size-4" />
    })),
    ...snapshot.conversations.filter(conversation => !conversation.archived).map(conversation => ({
      id: 'conversation:' + conversation.id, group: 'Sessões', label: conversation.name,
      keywords: [workspacesById.get(conversation.workspaceId)?.name || '', ...conversation.agentIds.map(id => agentsById.get(id)?.name || ''), 'conversa'],
      icon: <MessageSquarePlus className="size-4" />
    })),
    ...snapshot.agents.filter(agent => agent.temporaryStatus !== 'retired').map(agent => ({
      id: 'agent:' + agent.id, group: 'Agentes', label: agent.name,
      keywords: [agent.alias, agent.description, agent.role === 'chief' ? 'chief' : 'boo'],
      icon: <Users className="size-4" />
    }))
  ]
}
