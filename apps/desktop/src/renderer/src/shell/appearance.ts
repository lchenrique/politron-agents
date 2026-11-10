import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Agent, Approval, Conversation, Mission, Run, Snapshot, Workspace } from '../../../shared/v9'
import type { AgentAvatarState } from '@/features/app/Avatar'
import { colorForId, normalizeVariant, safeHex, type BooVariant } from './primitives'

/**
 * Adaptadores entre os dados reais do Boobot e os modelos de apresentação do
 * design Carbon & Graphite (Boos, pastas de workspace, conversas e fila).
 * Nada aqui inventa dados: cada linha vem do snapshot do processo principal.
 */

export interface BooRow {
  id: string
  name: string
  role: string
  shortRole: string
  model: string
  worktree: string
  status: string
  color: string
  variant: BooVariant
  alias: string
  isChief: boolean
  state: AgentAvatarState
  waiting: boolean
}

const SHORT_ROLE: Record<string, string> = {
  chief: 'Líder',
  agent: 'Boo',
}

/** Papel curto exibido à direita do nome: a especialidade do Boo, não a menção. */
function shortRoleOf(agent: Agent, isChief: boolean): string {
  if (isChief) return 'Líder'
  const label = (agent.description || agent.alias || '').split('&')[0].trim() || SHORT_ROLE.agent
  return label.length > 14 ? `${label.slice(0, 13)}…` : label
}

const STATE_STATUS: Record<AgentAvatarState, string> = {
  idle: 'Ocioso',
  working: 'Trabalhando',
  waiting: 'Decisão',
  speaking: 'Falando',
}

export function booRows(snapshot: Snapshot, agentStates: Record<string, AgentAvatarState>): BooRow[] {
  const agents = [snapshot.assistant, ...snapshot.agents]
  return agents.map(agent => {
    const isChief = agent.id === snapshot.assistant.id || agent.role === 'chief'
    const state = agentStates[agent.id] || (isChief ? 'idle' : 'idle')
    const waiting = state === 'waiting'
    return {
      id: agent.id,
      name: agent.name,
      role: agent.alias || agent.description || SHORT_ROLE.agent,
      shortRole: shortRoleOf(agent, isChief),
      model: agent.model,
      worktree: agent.role === 'chief' ? 'wt:main' : `wt:${agent.runtime}`,
      status: waiting ? 'Aguardando decisão' : STATE_STATUS[state],
      color: safeHex(agent.color, '#10B981'),
      variant: normalizeVariant(agent.avatar),
      alias: agent.alias,
      isChief,
      state,
      waiting,
    }
  })
}

export interface SessionRow {
  id: string
  title: string
  active: boolean
  time: string
  hasGate: boolean
}

export interface WorkspaceRow {
  id: string
  name: string
  branch: string
  path: string
  color: string
  expanded: boolean
  sessions: SessionRow[]
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** Cabe no rótulo de 10px do sidebar: agora · 16:40 · ontem · sáb. */
export function shortTime(iso: string | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const diff = now.getTime() - date.getTime()
  if (diff < 60_000) return 'agora'
  if (date.getTime() >= dayStart) return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (date.getTime() >= dayStart - 86_400_000) return 'ontem'
  if (diff < 7 * 86_400_000) return ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][date.getDay()]
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`
}

export function sessionRows(conversations: Conversation[], approvals: Approval[], selectedId: string | undefined, workspaceId: string | null): SessionRow[] {
  const gates = new Set(approvals.filter(approval => approval.status === 'pending').map(approval => approval.conversationId))
  return conversations
    .filter(conversation => !conversation.archived && conversation.workspaceId === workspaceId)
    .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt))
    .map(conversation => ({
      id: conversation.id,
      title: conversation.name,
      active: conversation.id === selectedId,
      time: shortTime(conversation.updatedAt || conversation.createdAt),
      hasGate: gates.has(conversation.id),
    }))
}

export function workspaceRows(input: {
  workspaces: Workspace[]
  conversations: Conversation[]
  approvals: Approval[]
  selectedId?: string
  expanded: Record<string, boolean>
  colors: Record<string, string>
}): WorkspaceRow[] {
  const { workspaces, conversations, approvals, selectedId, expanded, colors } = input
  const visible = workspaces.filter(workspace => !workspace.archived)
  const rows = visible.map(workspace => ({
    id: workspace.id,
    name: workspace.name,
    branch: workspace.branch || 'main',
    path: workspace.path,
    color: safeHex(colors[workspace.id], colorForId(workspace.id)),
    expanded: expanded[workspace.id] !== false,
    sessions: sessionRows(conversations, approvals, selectedId, workspace.id),
  }))
  // As conversas sem pasta aparecem juntas, como "Conversas livres" no HTML.
  const orphans = conversations.filter(conversation => !conversation.archived && !visible.some(workspace => workspace.id === conversation.workspaceId))
  if (orphans.length) {
    rows.push({
      id: '__free__',
      name: 'Conversas livres',
      branch: 'local',
      path: '~/.boobot/conversas-livres',
      color: colors.__free__ ? safeHex(colors.__free__) : '#14B8A6',
      expanded: expanded.__free__ !== false,
      sessions: sessionRows(orphans.map(conversation => ({ ...conversation })), approvals, selectedId, orphans[0].workspaceId),
    })
  }
  return rows
}

export interface QueueRow {
  id: string
  boo: string
  task: string
  time: string
  state: 'done' | 'gate' | 'running'
}

const RUN_LABEL: Record<string, string> = {
  queued: 'na fila',
  running: 'executando',
  waiting: 'aguardando você',
  completed: 'concluído',
  failed: 'falhou',
  interrupted: 'interrompido',
  cancelled: 'cancelado',
}

/** Fila do time: runs ativos primeiro, depois missões concluídas como histórico. */
export function queueRows(snapshot: Snapshot): QueueRow[] {
  const nameOf = (id: string) => [snapshot.assistant, ...snapshot.agents].find(agent => agent.id === id)?.name || 'Boo'
  const active: QueueRow[] = snapshot.runs
    .filter(run => ['queued', 'running', 'waiting'].includes(run.status))
    .slice(0, 6)
    .map(run => ({
      id: run.id,
      boo: nameOf(run.agentId),
      task: run.input.split('\n')[0].slice(0, 120) || 'Tarefa sem título',
      time: RUN_LABEL[run.status] || run.status,
      state: run.status === 'waiting' ? 'gate' : 'running',
    }))
  const missions: QueueRow[] = (snapshot.missions || [])
    .filter(mission => ['waiting', 'paused'].includes(mission.status))
    .slice(0, 4)
    .map((mission: Mission) => ({
      id: mission.id,
      boo: nameOf(mission.ownerAgentId),
      task: mission.title,
      time: RUN_LABEL[mission.status] || mission.status,
      state: 'gate',
    }))
  return [...missions, ...active]
}

/** Pasta ativa do top bar: o workspace da conversa aberta ou o último selecionado. */
export function activeProject(input: { workspaces: Workspace[]; conversations: Conversation[]; selected: Conversation | undefined; activeWorkspaceId: string | null }): { name: string; branch: string } {
  const workspace = input.workspaces.find(item => item.id === (input.activeWorkspaceId || input.selected?.workspaceId))
  return { name: workspace?.name || 'Conversas livres', branch: workspace?.branch || 'local' }
}

/* ---------------------------------------------------------------------------
 * Preferências visuais do chrome (cores de pasta e expansão das listas).
 * Ficam no localStorage porque são aparência, não dado do produto.
 * ------------------------------------------------------------------------- */

const STORAGE_KEY = 'politron.chrome.appearance.v1'

interface AppearanceState {
  colors: Record<string, string>
  expanded: Record<string, boolean>
}

function loadAppearance(): AppearanceState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { colors: {}, expanded: {} }
    const parsed = JSON.parse(raw) as Partial<AppearanceState>
    return {
      colors: typeof parsed.colors === 'object' && parsed.colors ? parsed.colors : {},
      expanded: typeof parsed.expanded === 'object' && parsed.expanded ? parsed.expanded : {},
    }
  } catch {
    return { colors: {}, expanded: {} }
  }
}

export function useChromeAppearance() {
  const [state, setState] = useState<AppearanceState>(loadAppearance)
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* preferência opcional */ }
  }, [state])
  const setColor = useCallback((id: string, hex: string) => setState(current => ({ ...current, colors: { ...current.colors, [id]: safeHex(hex) } })), [])
  const toggleExpanded = useCallback((id: string) => setState(current => {
    const currentValue = current.expanded[id] !== false
    return { ...current, expanded: { ...current.expanded, [id]: !currentValue } }
  }), [])
  const setExpanded = useCallback((id: string, value: boolean) => setState(current => ({ ...current, expanded: { ...current.expanded, [id]: value } })), [])
  return useMemo(() => ({ colors: state.colors, expanded: state.expanded, setColor, toggleExpanded, setExpanded }), [state, setColor, toggleExpanded, setExpanded])
}

/** Contexto por conversa para o cabeçalho da aba de orquestração. */
export function conversationMeta(runs: Run[], conversationId: string | undefined) {
  if (!conversationId) return { running: 0, waiting: 0 }
  const scoped = runs.filter(run => run.conversationId === conversationId)
  return {
    running: scoped.filter(run => ['queued', 'running'].includes(run.status)).length,
    waiting: scoped.filter(run => run.status === 'waiting').length,
  }
}
