import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FolderPlus, MessageSquarePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ASSISTANT_ID, type Agent, type Conversation, type MessageAttachment, type Model, type Snapshot, type Workspace } from '../../../../shared/v9'
import type { ProviderSnapshot } from '../../../../shared/providers'
import type { HomeView } from '../sidebar/NavRail'
import { WorkspaceOverview } from './WorkspaceOverview'
import { PoliAvatar } from './PoliAvatar'
import { AgentDetails } from './AgentDetails'
import { ChatHeader, ConversationAvatar, ConversationTools, conversationIdentity, type ConversationChromeProps } from '../chat/ChatHeader'
import { booActivity } from './boo-activity'
import { AssistantRuntimeProvider } from '@assistant-ui/react'
import { MessageList } from '../chat/MessageList'
import { useV1ThreadRuntime, type SendOptions } from '../chat/assistant-ui-adapter'
import { MessageLinkContext, type MessageLinkHandlers } from '../chat/MessageMarkdown'
import { linkFileWorkspaceId } from '../chat/message-link'
import { useConversationHistory } from '../chat/useConversationHistory'
import { Composer } from '../composer/Composer'
import { ModelSlotProvider } from '../composer/ComposerModelSlot'
import { useContentWidth } from '@/components/layout/content-width'
import { ComposerTakeover } from '../composer/ComposerTakeover'
import { modelOptions } from '../composer/model-options'
import { DockWorkspace, type DockWorkspaceHandle, type DockTool, type DockZone } from '../panels/DockWorkspace'
import type { EditorData, EditorKind } from '../editors/Editor'
import type { SettingsSection } from './SettingsPage'
import { INHERIT_MODEL_NAME, emptySnapshot, errorText } from './appShellShared'
import { selectDescendantApprovals, selectVisibleRunEvidence } from './delegation-evidence'
import { replaceEqualDeep } from '@tanstack/react-query'
import { ChiefHome } from '../work/ChiefHome'
import { RoutinesPage } from '../work/RoutinesPage'
import { MissionStrip } from '../work/MissionStrip'
import { BoardPage } from '../board/BoardPage'
import { TopBar } from '@/shell/top-bar'
import { ActivityRail, type SidebarMode } from '@/shell/activity-rail'
import { WorkspaceSidebar } from '@/shell/workspace-sidebar'
import { activeProject, booRows, queueRows, useChromeAppearance, workspaceRows } from '@/shell/appearance'
import { CommandPalette } from '@/shell/command-palette'
import { SettingsOverlay } from '@/shell/settings/settings-overlay'
import { BooModal, WorkspaceModal } from '@/shell/entity-modals'
import { colorForId } from '@/shell/primitives'


const Editor = lazy(() => import('../editors/Editor').then(module => ({ default: module.Editor })))
const SettingsPage = lazy(() => import('./SettingsPage').then(module => ({ default: module.SettingsPage })))
const UpdateReadyCallout = lazy(() => import('./UpdateReadyCallout').then(module => ({ default: module.UpdateReadyCallout })))

export default function AppShell() {
  // Mantém --content-width em <html>: a largura escolhida vale para páginas, chat e composer.
  useContentWidth()
  useEffect(() => window.platformBrowserAPI?.onReveal(() => dockRef.current?.revealTool('web')), [])
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot)
  const [models, setModels] = useState<Model[]>([])
  const [providerInventory, setProviderInventory] = useState<ProviderSnapshot | null>(null)
  const preferenceHost = useRef('local')
  useEffect(() => { void window.hostsAPI?.snapshot().then(data => { preferenceHost.current = data.selectedId; try { setSelectedModelNameState(localStorage.getItem(`politron.composer.model.${data.selectedId}`) || (data.selectedId === 'local' ? localStorage.getItem('politron.composer.model') : null) || INHERIT_MODEL_NAME) } catch { /* preferência opcional */ } }) }, [])
  // Única fonte de modelo/esforço é o composer; persiste no disco para sobreviver a reinícios e recargas em desenvolvimento.
  const [selectedModelName, setSelectedModelNameState] = useState(() => { try { return localStorage.getItem('politron.composer.model') || INHERIT_MODEL_NAME } catch { return INHERIT_MODEL_NAME } })
  const setSelectedModelName = useCallback((name: string) => { setSelectedModelNameState(name); try { localStorage.setItem(`politron.composer.model.${preferenceHost.current}`, name) } catch { /* preferência opcional */ } }, [])
  const [selectedEffort, setSelectedEffortState] = useState<Agent['effort']>(() => { try { const stored = localStorage.getItem('politron.composer.effort'); return (stored as Agent['effort']) || 'medium' } catch { return 'medium' } })
  const setSelectedEffort = useCallback((effort: Agent['effort']) => { setSelectedEffortState(effort); try { localStorage.setItem('politron.composer.effort', effort || 'medium') } catch { /* preferência opcional */ } }, [])
  const [selectedId, setSelectedId] = useState('')
  // A Central do Chief é a tela inicial; conversas e projetos continuam a um clique.
  // Abre na conversa do líder: o trabalho com os agentes é a superfície principal; a Central fica na faixa.
  const [view, setView] = useState<HomeView | null>(null)
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)
  const activeWorkspaceIdRef = useRef<string | null>(null)
  const selectedIdRef = useRef(selectedId)
  const seenIncomingIds = useRef(new Set<string>())
  const eventStatuses = useRef(new Map<string, string>())
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem('politron-unread-counts') || '{}') as Record<string, number> } catch { return {} }
  })
  const [editor, setEditor] = useState<{ kind: EditorKind; initial?: Agent | Conversation | Workspace; workspaceId?: string | null } | null>(null)
  const [notice, setNotice] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('politron.sidebar.collapsed') === 'true' } catch { return false }
  })
  // Sem preferência salva, abre com 280px (largura padrão do DSH) convertidos para a porcentagem que o layout aceita.
  const [sidebarSize, setSidebarSize] = useState(() => { const fallback = Math.min(34, Math.max(10, 28_000 / (window.innerWidth || 1280))); try { const value = Number(localStorage.getItem('politron.sidebar.size')); return Number.isFinite(value) && value >= 10 && value <= 34 ? value : fallback } catch { return fallback } })
  const dockRef = useRef<DockWorkspaceHandle>(null)
  useEffect(() => { try { localStorage.setItem('politron.sidebar.collapsed', String(sidebarCollapsed)) } catch { /* preferência opcional */ } }, [sidebarCollapsed])
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b' && !event.altKey) {
        event.preventDefault()
        setSidebarCollapsed(current => !current)
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [])
  const openTool = (kind: DockTool, zone: DockZone = 'side') => {
    dockRef.current?.openTool(kind, zone)
  }
  const [workspaceDiff, setWorkspaceDiff] = useState('')
  const [loading, setLoading] = useState(true)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('geral')
  const [detailsAgentId, setDetailsAgentId] = useState<string | null>(null)
  const [mascotAgentId, setMascotAgentId] = useState<string | null>(null)
  useEffect(() => { selectedIdRef.current = selectedId; if (selectedId) setUnreadCounts(current => { if (!current[selectedId]) return current; const next = { ...current }; delete next[selectedId]; return next }) }, [selectedId])
  useEffect(() => { localStorage.setItem('politron-unread-counts', JSON.stringify(unreadCounts)) }, [unreadCounts])
  const selected = view || activeWorkspaceId ? undefined : snapshot.conversations.find(item => item.id === selectedId && !item.archived) || snapshot.conversations.find(item => !item.archived)
  const activeWorkspace = snapshot.workspaces.find(item => item.id === activeWorkspaceId && !item.archived)
  useEffect(() => { setDetailsAgentId(null); setMascotAgentId(null) }, [selected?.id])
  const selectConversation = useCallback((id: string) => { activeWorkspaceIdRef.current = null; setActiveWorkspaceId(null); setView(null); setSelectedId(id) }, [])
  const selectWorkspace = useCallback((id: string) => { activeWorkspaceIdRef.current = id; setActiveWorkspaceId(id); setView(null); setSelectedId('') }, [])
  useEffect(() => { activeWorkspaceIdRef.current = activeWorkspaceId }, [activeWorkspaceId])
  const selectedAgents = useMemo(() => !selected ? [] : selected.agentIds.length ? selected.agentIds.map(id => snapshot.agents.find(agent => agent.id === id)).filter((agent): agent is Agent => !!agent) : [snapshot.assistant], [selected, snapshot.agents, snapshot.assistant])
  const selectedModelRuntime = selectedModelName.split(':', 1)[0] as Agent['runtime']
  const canAttachImages = selectedModelName.includes(':')
    ? snapshot.imageRuntimes?.includes(selectedModelRuntime) === true
    : selectedAgents.length > 0 && selectedAgents.every(agent => snapshot.imageRuntimes?.includes(agent.runtime))
  const { messages, hasOlderMessages: historyHasMore, hasNewerMessages, focusedMessageId: focusedHistoryMessageId, queueMessage, loadOlder: loadOlderMessages, search: searchHistory, openSearchHit: openHistorySearchHit, returnToLatest: returnToLatestHistory, reconcileAfterReconnect } = useConversationHistory(selected?.id, setNotice)
  const visibleRunEvidence = useMemo(() => selectVisibleRunEvidence(messages, snapshot.fileChanges, snapshot.approvals), [messages, snapshot.fileChanges, snapshot.approvals])
  const visibleFileChanges = visibleRunEvidence.fileChanges
  const visibleApprovals = visibleRunEvidence.approvals
  // Pendências das conversas delegadas sobem para a conversa do líder, depois das próprias.
  const delegatedApprovals = useMemo(() => selected ? selectDescendantApprovals(selected.id, snapshot.conversations, snapshot.approvals) : [], [selected, snapshot.conversations, snapshot.approvals])
  const composerTakeoverApproval = visibleApprovals.find(approval => approval.status === 'pending') || delegatedApprovals[0]
  const transcriptApprovals = composerTakeoverApproval
    ? visibleApprovals.filter(approval => approval.id !== composerTakeoverApproval.id)
    : visibleApprovals
  // Only completed, real writes from this conversation can appear above the composer.
  const finishedWithChanges = [...messages].reverse().find(message => message.role === 'assistant'
    && message.runId && ['completed', 'failed', 'interrupted'].includes(message.status)
    && visibleFileChanges.some(change => change.runId === message.runId && change.status === 'applied'))
  const latestReview = finishedWithChanges?.runId
    ? visibleFileChanges.filter(change => change.runId === finishedWithChanges.runId && change.status === 'applied') : []
  const agentOf = useCallback((id: string | null) => id === ASSISTANT_ID ? snapshot.assistant : id ? snapshot.agents.find(agent => agent.id === id) : undefined, [snapshot.assistant, snapshot.agents])
  const selectedWorkspace = selected ? snapshot.workspaces.find(workspace => workspace.id === selected.workspaceId) : undefined
  const linkWorkspaceId = linkFileWorkspaceId(selectedWorkspace)
  const linkWorkspaceRoot = linkWorkspaceId ? selectedWorkspace?.path : undefined
  // Links das respostas: arquivos no editor do dock, web no navegador da plataforma.
  const messageLinks = useMemo<MessageLinkHandlers>(() => ({
    workspaceRoot: linkWorkspaceRoot,
    openFile: path => {
      if (!linkWorkspaceId) { setNotice('Esta conversa não tem pasta de projeto; o arquivo não pode ser aberto.'); return }
      dockRef.current?.openFile(linkWorkspaceId, path)
    },
    openUrl: (url, mode) => {
      const api = window.platformBrowserAPI
      if (!api) return
      if (mode === 'external') { void api.openExternal(url).catch(error => setNotice(errorText(error))); return }
      dockRef.current?.revealTool('web')
      void api.navigate(url).catch(error => setNotice(errorText(error)))
    },
    blocked: () => setNotice('Link não aberto: somente HTTP/HTTPS ou arquivos dentro da pasta do projeto são permitidos.'),
  }), [linkWorkspaceId, linkWorkspaceRoot])
  // O IPC recria os objetos: conservar os dados iguais evita invalidar os memos do chat e dos Boos.
  const refresh = useCallback(async () => { try { const data = await window.appAPI.snapshot(); setSnapshot(current => replaceEqualDeep(current, data)); const chiefId = data.agents.find(agent => agent.role === 'chief')?.id; const leaderConversation = data.conversations.find(item => !item.archived && item.leaderAgentId === chiefId); setSelectedId(current => activeWorkspaceIdRef.current ? '' : data.conversations.some(item => item.id === current && !item.archived) ? current : leaderConversation?.id || data.conversations.find(item => !item.archived)?.id || ''); setActiveWorkspaceId(current => current && data.workspaces.some(item => item.id === current && !item.archived) ? current : null) } catch (error) { setNotice(errorText(error)) } finally { setLoading(false) } }, [])
  useEffect(() => {
    void refresh()
    const applyProviders = (catalog: ProviderSnapshot) => {
      setProviderInventory(catalog)
      const ready: Model[] = catalog.providers.filter(provider => provider.executable === true && (provider.id === 'codex' || provider.id === 'claude' || provider.id === 'pi' || provider.id === 'opencode' || provider.id === 'antigravity')).flatMap(provider =>
        (provider.models || []).map(model => ({
          ...model,
          id: provider.id + ':' + model.id,
          name: model.name,
          runtime: provider.id as Model['runtime'],
          isDefault: model.isDefault === true,
        })))
      setModels(ready)
      setSelectedModelNameState(current => {
        if (current === INHERIT_MODEL_NAME || ready.some(model => model.id === current)) return current
        return ready.find(model => model.name === current ||
          `${model.name} · ${catalog.providers.find(provider => provider.id === model.runtime)?.name}` === current ||
          `${model.name} · ${model.runtime === 'claude' ? 'Claude' : 'Codex'}` === current)?.id || INHERIT_MODEL_NAME
      })
    }
    void window.providersAPI.list().then(applyProviders).catch(error => setNotice(`Não foi possível carregar o inventário das CLIs: ${errorText(error)}`))
    const offProviders = window.providersAPI.onChanged(applyProviders)
    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    const scheduleRefresh = () => {
      if (refreshTimer !== null) return
      refreshTimer = setTimeout(() => { refreshTimer = null; void refresh() }, 100)
    }
    const off = window.appAPI.onEvent(event => {
      if (event.type === 'message') {
        queueMessage(event.message)
        const previousStatus = eventStatuses.current.get(event.message.id)
        if (previousStatus !== event.message.status) {
          if (eventStatuses.current.size > 2000) eventStatuses.current.clear()
          eventStatuses.current.set(event.message.id, event.message.status)
          scheduleRefresh()
        }
        if (event.message.role !== 'user' && event.message.conversationId !== selectedIdRef.current && !seenIncomingIds.current.has(event.message.id)) {
          if (seenIncomingIds.current.size > 2000) seenIncomingIds.current.clear()
          seenIncomingIds.current.add(event.message.id)
          setUnreadCounts(current => ({ ...current, [event.message.conversationId]: (current[event.message.conversationId] || 0) + 1 }))
        }
      } else if (event.type === 'fileChange') setSnapshot(current => ({ ...current, fileChanges: [...current.fileChanges.filter(item => item.id !== event.fileChange.id), event.fileChange] }))
      else if (event.type === 'approval') setSnapshot(current => ({ ...current, approvals: [...current.approvals.filter(item => item.id !== event.approval.id), event.approval] }))
      else if (event.type === 'mission') setSnapshot(current => { const missions = current.missions || []; const at = missions.findIndex(item => item.id === event.mission.id); return { ...current, missions: at < 0 ? [...missions, event.mission] : missions.map(item => item.id === event.mission.id ? event.mission : item) } })
      else if (event.type === 'changed') {
        if (event.reason === 'connection-restored') void reconcileAfterReconnect().catch(error => setNotice(errorText(error)))
        scheduleRefresh()
      }
    })
    return () => { off(); offProviders(); if (refreshTimer !== null) clearTimeout(refreshTimer) }
  }, [refresh, queueMessage, reconcileAfterReconnect])
  useEffect(() => { void window.appAPI.setVisibleConversation(selected?.id || null).catch(error => setNotice(errorText(error))) }, [selected?.id])
  useEffect(() => { if (!selected?.workspaceId) { setWorkspaceDiff(''); return } window.appAPI.workspaceDiff(selected.workspaceId).then(setWorkspaceDiff).catch(error => setNotice(errorText(error))) }, [selected?.workspaceId, snapshot.workspaces, snapshot.fileChanges])
  useEffect(() => { const timeout = window.setTimeout(() => setNotice(''), 6000); return () => window.clearTimeout(timeout) }, [notice])
  const saveAgent = async (data: EditorData) => {
    const agentInput = data as Partial<Agent>
    const agent = await window.appAPI.saveAgent(agentInput)
    if (agentInput.role && agent.role !== agentInput.role) throw new Error('O papel do agente não foi salvo. Reinicie o Boobot para atualizar o processo principal.')
    await refresh()
    setNotice(!data.id ? `${agent.name} já pode participar de uma conversa.` : agent.role === 'chief' ? `${agent.name} agora é Chief.` : `Alterações de ${agent.name} salvas.`)
  }
  const saveConversation = async (data: EditorData) => { const conversation = await window.appAPI.saveConversation(data as Partial<Conversation> & { workspacePath?: string | null }); await refresh(); selectConversation(conversation.id) }
  const updateParticipants = async (agentIds: string[]) => {
    if (!selected) return
    const previousAgentNames = selected.agentIds.map(id => snapshot.agents.find(agent => agent.id === id)?.name).filter((name): name is string => !!name)
    const nameWasDerivedFromAgent = previousAgentNames.includes(selected.name)
    const nextName = !nameWasDerivedFromAgent ? selected.name : agentIds.length === 0 ? 'Nova conversa' : agentIds.length === 1 ? snapshot.agents.find(agent => agent.id === agentIds[0])?.name || 'Nova conversa' : 'Conversa em equipe'
    const update: Partial<Conversation> = { id: selected.id, agentIds, kind: agentIds.length > 1 ? 'group' : 'direct' }
    if (selected.responseMode !== 'broadcast' && (!selected.leaderAgentId || !agentIds.includes(selected.leaderAgentId))) update.leaderAgentId = agentIds[0] || null
    if (nameWasDerivedFromAgent) update.name = nextName
    try { await window.appAPI.saveConversation(update); await refresh() } catch (error) { setNotice(errorText(error)) }
  }
  const saveWorkspace = async (data: EditorData) => { const workspace = await window.appAPI.saveWorkspace(data as Partial<Workspace> & { path?: string | null }); await refresh(); selectWorkspace(workspace.id) }
  const startConversation = async (workspaceId?: string) => { try { const conversation = await window.appAPI.saveConversation({ workspaceId }); await refresh(); selectConversation(conversation.id) } catch (error) { setNotice(errorText(error)) } }
  // Ctrl+N: nova sessão livre, como o botão do topo da barra lateral.
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'n' || event.repeat) return
      event.preventDefault()
      void startConversation()
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  })
  const deleteWorkspace = async (id: string) => {
    try {
      const currentActiveWorkspace = activeWorkspaceIdRef.current
      const currentSelectedWorkspace = selected?.workspaceId
      await window.appAPI.deleteWorkspace(id)
      const data = await window.appAPI.snapshot()
      setSnapshot(current => replaceEqualDeep(current, data))
      const activeWorkspaceWasDeleted = !!currentActiveWorkspace && !data.workspaces.some(item => item.id === currentActiveWorkspace && !item.archived)
      if (activeWorkspaceWasDeleted) { activeWorkspaceIdRef.current = null; setActiveWorkspaceId(null) }
      const removedCurrentContext = currentActiveWorkspace === id || activeWorkspaceWasDeleted || currentSelectedWorkspace === id || (!!selectedId && !data.conversations.some(item => item.id === selectedId && !item.archived))
      if (removedCurrentContext) {
        const next = data.conversations.find(item => !item.archived)
        if (next) selectConversation(next.id)
        else {
          const conversation = await window.appAPI.saveConversation({})
          const updated = await window.appAPI.snapshot()
          setSnapshot(current => replaceEqualDeep(current, updated))
          selectConversation(conversation.id)
        }
      } else if (!data.conversations.some(item => item.id === selectedId && !item.archived)) setSelectedId(data.conversations.find(item => !item.archived)?.id || '')
    } catch (error) { setNotice(errorText(error)) }
  }
  const deleteConversation = async (id: string) => {
    try {
      const wasCurrent = selectedId === id
      const workspaceId = snapshot.conversations.find(item => item.id === id)?.workspaceId
      await window.appAPI.deleteConversation(id)
      const data = await window.appAPI.snapshot()
      setSnapshot(current => replaceEqualDeep(current, data))
      if (wasCurrent) {
        const next = data.conversations.find(item => !item.archived && item.workspaceId === workspaceId)
          || data.conversations.find(item => !item.archived)
        if (next) selectConversation(next.id)
        else {
          const conversation = await window.appAPI.saveConversation({ workspaceId })
          const updated = await window.appAPI.snapshot()
          setSnapshot(current => replaceEqualDeep(current, updated))
          selectConversation(conversation.id)
        }
      }
    } catch (error) { setNotice(errorText(error)) }
  }
  /** Exclui várias conversas e só então reconcilia a seleção, para não abrir uma conversa que também vai ser apagada. */
  const deleteConversations = async (ids: string[]) => {
    const removed = new Set(ids)
    const wasCurrent = removed.has(selectedId)
    const workspaceId = snapshot.conversations.find(item => item.id === selectedId)?.workspaceId
    let deleted = 0
    let failure: unknown
    for (const id of ids) {
      try { await window.appAPI.deleteConversation(id); deleted++ } catch (error) { failure ??= error }
    }
    try {
      const data = await window.appAPI.snapshot()
      setSnapshot(current => replaceEqualDeep(current, data))
      if (wasCurrent && !data.conversations.some(item => item.id === selectedId)) {
        const next = data.conversations.find(item => !item.archived && item.workspaceId === workspaceId)
          || data.conversations.find(item => !item.archived)
        if (next) selectConversation(next.id)
        else {
          const conversation = await window.appAPI.saveConversation({ workspaceId })
          const updated = await window.appAPI.snapshot()
          setSnapshot(current => replaceEqualDeep(current, updated))
          selectConversation(conversation.id)
        }
      }
      setNotice(failure ? `${deleted} de ${ids.length} conversas excluídas. ${errorText(failure)}` : `${deleted} conversa${deleted === 1 ? '' : 's'} excluída${deleted === 1 ? '' : 's'}.`)
    } catch (error) { setNotice(errorText(error)) }
  }
  const deleteAgent = async (id: string) => { try { const name = snapshot.agents.find(agent => agent.id === id)?.name; await window.appAPI.deleteAgent(id); await refresh(); setNotice(`${name || 'Agente'} excluído.`) } catch (error) { setNotice(errorText(error)) } }
  const setAgentChief = async (agent: Agent, chief: boolean) => {
    if (chief && snapshot.agents.some(item => item.id !== agent.id && item.role === 'chief')) { setNotice('Já existe um Chief. Remova esse papel antes de promover outro agente.'); return }
    try {
      const role = chief ? 'chief' : 'agent'
      const updated = await window.appAPI.saveAgent({ ...agent, role })
      if (updated.role !== role) throw new Error('O papel do agente não foi salvo. Reinicie o Boobot para atualizar o processo principal.')
      await refresh()
      setNotice(chief ? `${updated.name} agora é Chief.` : `${updated.name} voltou a ser um agente da equipe.`)
    } catch (error) { setNotice(errorText(error)) }
  }
  const openAgent = async (agent: Agent, newConversation = false) => {
    const previous = snapshot.conversations.filter(item => !item.archived && !item.parentConversationId && item.kind === 'direct' && item.agentIds.length === 1 && item.agentIds[0] === agent.id && snapshot.workspaces.some(workspace => workspace.id === item.workspaceId && workspace.kind === 'free')).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    if (previous && !newConversation) { selectConversation(previous.id); return }
    // Sem nome fixo: o título vem do primeiro pedido, e a lista não repete o nome do Boo em cada conversa.
    try { const conversation = await window.appAPI.saveConversation({ kind: 'direct', agentIds: [agent.id] }); await refresh(); selectConversation(conversation.id) }
    catch (error) { setNotice(errorText(error)) }
  }
  const openWorkspaceAgent = async (workspaceId: string, agent: Agent) => {
    const previous = snapshot.conversations.find(item => !item.archived && item.workspaceId === workspaceId && item.agentIds.length === 1 && item.agentIds[0] === agent.id)
    if (previous) { selectConversation(previous.id); return }
    try { const conversation = await window.appAPI.saveConversation({ workspaceId, kind: 'direct', agentIds: [agent.id] }); await refresh(); selectConversation(conversation.id) }
    catch (error) { setNotice(errorText(error)) }
  }
  const submitMessage = async (value: string, modelName: string, options: SendOptions) => {
    if (!selected) throw new Error('Escolha uma conversa antes de enviar.')
    let input = value
    const attachments: MessageAttachment[] = []
    const extensionMime: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }
    for (const file of options.files) {
      const extension = file.name.split('.').pop()?.toLowerCase() || ''
      const allowedMime = ['image/png', 'image/jpeg', 'image/webp']
      const imageMime = allowedMime.includes(file.type) ? file.type : ['','application/octet-stream'].includes(file.type) ? extensionMime[extension] : undefined
      const isImage = file.type.startsWith('image/') || !!extensionMime[extension]
      if (isImage) {
        if (!canAttachImages) throw new Error('O envio de imagens só está disponível em conversas com runtime compatível e testado.')
        if (!imageMime) throw new Error('Envie imagens PNG, JPEG ou WebP.')
        if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name}: imagens de até 20 MB.`)
        const bytes = new Uint8Array(await file.arrayBuffer())
        attachments.push(await window.appAPI.uploadAttachment(selected.id, file.name, imageMime, bytes))
      } else {
        if (file.size > 100_000 || !file.type.startsWith('text/') && !/\.(md|txt|json|csv|ts|tsx|js|jsx|css|html|xml|ya?ml)$/i.test(file.name)) throw new Error(`${file.name}: anexe arquivos de texto de até 100 KB.`)
        input += `\n\n--- ${file.name} ---\n${await file.text()}`
      }
    }
    const selectedModel = models.find(item => item.id === modelName || item.name === modelName)?.id
    if (options.effort) setSelectedEffort(options.effort)
    await window.appAPI.send(selected.id, input, selectedModel, options.effort, options.planMode, {
      requestId: options.requestId, delivery: options.delivery, attachments, returnAfterAcceptance: true,
      ...(Object.keys(options.modelOptions).length ? { modelOptions: options.modelOptions } : {}),
    })
  }
  const chatRuntime = useV1ThreadRuntime(submitMessage)
  const promptOptions = useMemo(() => modelOptions(providerInventory?.providers || []), [providerInventory])
  const agentStates = useMemo(() => Object.fromEntries(snapshot.agents.map(agent => { const activeRuns = snapshot.runs.filter(run => run.agentId === agent.id && ['queued', 'running', 'waiting'].includes(run.status)); return [agent.id, activeRuns.some(run => run.status === 'waiting') ? 'waiting' : activeRuns.length ? 'working' : 'idle'] as const })), [snapshot.agents, snapshot.runs])
  const openHome = useCallback((next: HomeView) => { activeWorkspaceIdRef.current = null; setActiveWorkspaceId(null); setView(next) }, [])
  useEffect(() => { const open = (event: Event) => { const section = (event as CustomEvent).detail; setSettingsSection(section === 'voz' || section === 'conexoes' || section === 'atualizacoes' ? section : 'geral'); setSettingsOpen(true) }; window.addEventListener('boobot:open-settings', open); return () => window.removeEventListener('boobot:open-settings', open) }, [])
  const selectedMission = selected ? (snapshot.missions || []).filter(item => item.conversationId === selected.id && ['active', 'waiting', 'paused'].includes(item.status)).at(-1) : undefined
  const openBoardTasks = snapshot.board?.tasks.filter(item => !['done', 'cancelled'].includes(item.status)).length || 0
  const enabledRoutines = snapshot.routines?.filter(item => item.enabled).length || 0
  const attentionCount = (snapshot.missions || []).filter(item => item.status === 'waiting').length + snapshot.approvals.filter(item => item.status === 'pending').length
  const conversationRuns = snapshot.runs.filter(run => run.conversationId === selected?.id && !run.parentId && ['queued', 'running', 'waiting'].includes(run.status))
  const queuedMessages = useMemo(() => messages.filter(message => message.role === 'user' && message.status === 'queued'), [messages])
  const mainTabLabel = view === 'home' ? 'Central' : view === 'routines' ? 'Rotinas' : view === 'board' ? 'Board' : view === 'settings' ? 'Configurações' : activeWorkspace ? 'Projeto' : undefined
  // A barra da janela mostra só o app; o contexto (projeto, conversa) vive no cabeçalho de cada página.
  const chiefName = snapshot.agents.find(agent => agent.role === 'chief')?.name
  // Mesmos dados para a faixa da conversa (chat sozinho) e para a aba do chat (com outras abas): nunca as duas ao mesmo tempo.
  const conversationChrome: ConversationChromeProps | null = selected ? {
    agentActivities: Object.fromEntries([snapshot.assistant, ...snapshot.agents].map(agent => [agent.id, booActivity(agent.id, selected.id, snapshot.runs, messages)])),
    assistant: snapshot.assistant,
    onOpenAgent: agent => setDetailsAgentId(agent.id),
    selected,
    agents: snapshot.agents,
    selectedWorkspace,
    onParticipantsChange: updateParticipants,
    onOpenComputerUse: () => openTool('web'),
    onOpenProjectFiles: () => openTool('files'),
    onOpenMascot: () => openTool('mascot'),
    onEditConversation: () => setEditor({ kind: 'conversation', initial: selected }),
    onSearchHistory: searchHistory,
    onOpenSearchHit: hit => void openHistorySearchHit(hit).catch(error => setNotice(errorText(error))),
    focusedMessageId: focusedHistoryMessageId,
    onReturnToLatest: () => void returnToLatestHistory().catch(error => setNotice(errorText(error))),
  } : null
  const conversationTitle = selected ? conversationIdentity(selected, snapshot.agents, snapshot.assistant) : null

  /* ---------------------------------------------------------------------------
   * Chrome do design Carbon & Graphite: modo do sidebar, largura, aparência das
   * pastas e a command palette. Tudo persistido como preferência local.
   * ------------------------------------------------------------------------- */
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(() => {
    try {
      const saved = localStorage.getItem('politron.sidebar.mode')
      return saved === 'all' || saved === 'workspaces' || saved === 'boos' || saved === 'queue' || saved === 'memory' ? saved : 'all'
    } catch { return 'all' }
  })
  useEffect(() => { try { localStorage.setItem('politron.sidebar.mode', sidebarMode) } catch { /* preferência opcional */ } }, [sidebarMode])
  const [sidebarWidth, setSidebarWidth] = useState(() => { try { const value = Number(localStorage.getItem('politron.sidebar.width')); return Number.isFinite(value) && value >= 200 && value <= 420 ? value : 248 } catch { return 248 } })
  useEffect(() => { try { localStorage.setItem('politron.sidebar.width', String(sidebarWidth)) } catch { /* preferência opcional */ } }, [sidebarWidth])
  const [resizingSidebar, setResizingSidebar] = useState(false)
  const startSidebarResize = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = sidebarWidth
    setResizingSidebar(true)
    const move = (native: MouseEvent) => setSidebarWidth(Math.min(420, Math.max(200, startWidth + native.clientX - startX)))
    const up = () => { setResizingSidebar(false); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  const [commandOpen, setCommandOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const openSettings = useCallback((section: SettingsSection = 'geral') => { setSettingsSection(section); setSettingsOpen(true) }, [])
  const appearance = useChromeAppearance()
  const [memoryCount, setMemoryCount] = useState(0)
  useEffect(() => {
    if (!window.memoryAPI) return
    window.memoryAPI.list({ limit: 500 }).then(list => setMemoryCount(list.length)).catch(() => undefined)
  }, [snapshot.conversations.length])
  const boos = useMemo(() => booRows(snapshot, agentStates), [snapshot, agentStates])
  const sidebarWorkspaces = useMemo(() => workspaceRows({
    workspaces: snapshot.workspaces,
    conversations: snapshot.conversations,
    approvals: snapshot.approvals,
    selectedId: selected?.id,
    expanded: appearance.expanded,
    colors: appearance.colors,
  }), [snapshot.workspaces, snapshot.conversations, snapshot.approvals, selected?.id, appearance.expanded, appearance.colors])
  const sidebarQueue = useMemo(() => queueRows(snapshot), [snapshot])
  const project = activeProject({ workspaces: snapshot.workspaces, conversations: snapshot.conversations, selected, activeWorkspaceId })
  const projectOptions = useMemo(() => snapshot.workspaces.filter(workspace => !workspace.archived).map(workspace => ({ id: workspace.id, name: workspace.name, branch: workspace.branch || 'main' })), [snapshot.workspaces])
  const changeBooColor = async (id: string, hex: string) => {
    // O Chief/Assistente vive fora de `agents`: procurar só na lista de equipe deixava a cor sem efeito.
    const agent = [snapshot.assistant, ...snapshot.agents].find(item => item.id === id)
    if (!agent) { setNotice('Não foi possível mudar a cor: agente não encontrado.'); return }
    // Pinta na hora para o menu responder ao clique; o refresh confirma o que ficou salvo.
    setSnapshot(current => ({
      ...current,
      assistant: current.assistant.id === id ? { ...current.assistant, color: hex } : current.assistant,
      agents: current.agents.map(item => item.id === id ? { ...item, color: hex } : item),
    }))
    try {
      await window.appAPI.saveAgent({ ...agent, color: hex })
      await refresh()
      setNotice(`Cor de ${agent.name} atualizada.`)
    } catch (error) {
      await refresh()
      setNotice(errorText(error))
    }
  }
  const moveSession = async (conversationId: string, workspaceId: string) => {
    try { await window.appAPI.saveConversation({ id: conversationId, workspaceId }); await refresh(); setNotice('Conversa movida de pasta.') } catch (error) { setNotice(errorText(error)) }
  }
  const paletteActions = useMemo(() => {
    const tools: Array<{ kind: DockTool; label: string }> = [
      { kind: 'chat', label: 'Chief · Orquestração' },
      { kind: 'files', label: 'Arquivos & Diff Viewer' },
      { kind: 'terminal', label: 'Terminal Integrado' },
      { kind: 'web', label: 'Navegador / Preview Web' },
      { kind: 'squad', label: 'Equipe de Boos' },
      { kind: 'memory', label: 'Memória & MCP' },
    ]
    const presets: Array<{ preset: 'two-cols' | 'three-cols' | 'ide-split' | 'quad-grid' | 'focus-chat'; label: string }> = [
      { preset: 'two-cols', label: 'Layout: 2 colunas (Chat + Código)' },
      { preset: 'three-cols', label: 'Layout: 3 colunas (Chat + Diff + Terminal)' },
      { preset: 'ide-split', label: 'Layout: split 2D' },
      { preset: 'quad-grid', label: 'Layout: grade 2x2' },
      { preset: 'focus-chat', label: 'Layout: foco no Chief' },
    ]
    return [
      { id: 'new-conversation', group: 'Ação', label: 'Nova conversa', hint: 'Ctrl N', run: () => void startConversation() },
      { id: 'new-boo', group: 'Ação', label: 'Novo agente (Boo)', run: () => setEditor({ kind: 'agent' }) },
      { id: 'new-project', group: 'Ação', label: 'Novo projeto', run: () => setEditor({ kind: 'workspace' }) },
      { id: 'settings', group: 'Ação', label: 'Abrir configurações', hint: 'Ctrl ,', run: () => setSettingsOpen(true) },
      { id: 'home', group: 'Ir para', label: 'Central do Chief', run: () => openHome('home') },
      { id: 'board', group: 'Ir para', label: 'Board de tarefas', run: () => openHome('board') },
      { id: 'routines', group: 'Ir para', label: 'Rotinas', run: () => openHome('routines') },
      ...tools.map(tool => ({ id: `tab-${tool.kind}`, group: 'Aba', label: tool.label, run: () => openTool(tool.kind) })),
      ...presets.map(item => ({ id: `layout-${item.preset}`, group: 'Layout', label: item.label, run: () => dockRef.current?.applyPreset(item.preset) })),
      ...boos.map(row => ({ id: `boo-${row.id}`, group: 'Boo', label: row.name, hint: row.shortRole, run: () => { const agent = snapshot.agents.find(item => item.id === row.id); if (agent) void openAgent(agent) } })),
      ...snapshot.conversations.filter(conversation => !conversation.archived).slice(0, 15).map(conversation => ({ id: `conv-${conversation.id}`, group: 'Conversa', label: conversation.name, run: () => selectConversation(conversation.id) })),
    ]
  }, [startConversation, openHome, openTool, boos, snapshot.agents, snapshot.conversations, selectConversation, openAgent])
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 'k' && !event.shiftKey) { event.preventDefault(); setCommandOpen(current => !current) }
      if (event.key === ',') { event.preventDefault(); setSettingsOpen(true) }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [openHome])


  return <ModelSlotProvider><div data-sidebar-collapsed={sidebarCollapsed} className="boobot-chrome flex h-dvh w-full flex-col overflow-hidden bg-[var(--bg-app)] font-sans text-foreground">
    <TopBar
      project={project}
      projects={projectOptions}
      onSelectProject={id => { if (!id) void startConversation(); else selectWorkspace(id) }}
      status={attentionCount > 0 ? { text: `Chief aguardando sua decisão (${attentionCount})`, tone: 'warning' } : { text: 'Local Daemon Ativo', tone: 'success' }}
      onOpenCommand={() => setCommandOpen(true)}
      onOpenSettings={() => setSettingsOpen(true)}
      onOpenTool={openTool}
      onApplyPreset={preset => dockRef.current?.applyPreset(preset)}
      onResetLayout={() => dockRef.current?.resetLayout()}
    />
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <ActivityRail
        mode={sidebarMode}
        onModeChange={setSidebarMode}
        onToggleSidebar={() => setSidebarCollapsed(current => !current)}
        onOpenSettings={() => setSettingsOpen(true)}
        queueBadge={sidebarQueue.some(item => item.state === 'gate')}
      />
      {!sidebarCollapsed ? <>
        <div style={{ width: sidebarWidth }} data-sidebar-width={sidebarWidth} className="flex h-full min-h-0 shrink-0 overflow-hidden">
          <WorkspaceSidebar
            mode={sidebarMode}
            boos={boos}
            workspaces={sidebarWorkspaces}
            queue={sidebarQueue}
            memory={{ entries: memoryCount, mcp: [] }}
            activeAgentId={selectedAgents[0]?.id}
            worktrees={snapshot.workspaces.filter(workspace => workspace.kind === 'worktree' && !workspace.archived).length}
            onSelectAgent={row => { const agent = snapshot.agents.find(item => item.id === row.id); if (agent) void openAgent(agent) }}
            onSelectSession={(_, sessionId) => selectConversation(sessionId)}
            onToggleWorkspace={appearance.toggleExpanded}
            onNewBoo={() => setEditor({ kind: 'agent' })}
            onEditBoo={id => { const agent = snapshot.agents.find(item => item.id === id); if (agent) setEditor({ kind: 'agent', initial: agent }) }}
            onDeleteBoo={id => void deleteAgent(id)}
            onBooColor={(id, hex) => void changeBooColor(id, hex)}
            onNewWorkspace={() => setEditor({ kind: 'workspace' })}
            onEditWorkspace={id => { const workspace = snapshot.workspaces.find(item => item.id === id); if (workspace) setEditor({ kind: 'workspace', initial: workspace }) }}
            onDeleteWorkspace={id => void deleteWorkspace(id)}
            onWorkspaceColor={appearance.setColor}
            onNewSession={id => void startConversation(id)}
            onRenameSession={(_, sessionId) => { const conversation = snapshot.conversations.find(item => item.id === sessionId); if (conversation) setEditor({ kind: 'conversation', initial: conversation }) }}
            onDeleteSession={(_, sessionId) => void deleteConversation(sessionId)}
            onMoveSession={(sessionId, workspaceId) => void moveSession(sessionId, workspaceId)}
            onOpenTool={openTool}
          />
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionar barra lateral"
          onMouseDown={startSidebarResize}
          className={resizingSidebar ? 'splitter-v active' : 'splitter-v'}
        />
      </> : null}
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <DockWorkspace onSendMessage={(conversationId, agentId, text) => window.appAPI.respondToAgent(conversationId, text, agentId)} ref={dockRef} workspaceId={activeWorkspaceId || selected?.workspaceId || null} conversationId={selected?.id} delegationMessages={selected ? messages : []} conversations={snapshot.conversations} runs={snapshot.runs} onOpenRelatedConversation={selectConversation} voiceAgentId={mascotAgentId || selected?.leaderAgentId || selectedAgents[0]?.id} assistant={snapshot.assistant} agents={snapshot.agents} selectedAgents={selectedAgents} agentStates={agentStates} onChanged={setNotice} workspaceDiff={workspaceDiff} fileChanges={snapshot.fileChanges}
        onEditAgent={agentId => { const agent = snapshot.agents.find(item => item.id === agentId); if (agent) setEditor({ kind: 'agent', initial: agent }) }}
        onStartAgentConversation={agentId => { const agent = snapshot.agents.find(item => item.id === agentId); if (agent) void openAgent(agent, true) }}
        onOpenSettings={section => { setSettingsSection((section === 'voz' || section === 'conexoes' || section === 'atualizacoes' ? section : 'geral') as SettingsSection); setSettingsOpen(true) }}
        chatTab={conversationChrome && conversationTitle ? { label: conversationTitle.title, title: [conversationTitle.title, conversationTitle.subtitle].filter(Boolean).join(' · '), leading: <ConversationAvatar compact {...conversationChrome} />, trailing: <ConversationTools compact {...conversationChrome} /> } : mainTabLabel ? { label: mainTabLabel } : undefined}>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {view === 'home' ? <ChiefHome snapshot={snapshot} agentStates={agentStates} onOpenConversation={selectConversation} onOpenAgent={agent => void openAgent(agent)} onOpenRoutines={() => openHome('routines')} onNotice={setNotice} />
        : view === 'routines' ? <RoutinesPage snapshot={snapshot} onOpenConversation={selectConversation} onNotice={setNotice} />
        : view === 'board' ? <BoardPage snapshot={snapshot} onOpenConversation={selectConversation} onNotice={setNotice} />
        : view === 'settings' ? <Suspense fallback={null}><SettingsPage initialSection={settingsSection} /></Suspense>
        : selected ? <>
          {selectedMission && <MissionStrip mission={selectedMission} runs={snapshot.runs} approvals={snapshot.approvals} onNotice={setNotice} />}
          <div className="flex min-h-0 flex-1 flex-col">
            <AssistantRuntimeProvider runtime={chatRuntime.runtime}>
            <MessageLinkContext.Provider value={messageLinks}>
            <MessageList
              key={selected.id}
              messages={messages}
              hasOlderMessages={historyHasMore}
              hasNewerMessages={hasNewerMessages}
              onReturnToLatest={() => void returnToLatestHistory().catch(error => setNotice(errorText(error)))}
              onLoadOlder={loadOlderMessages}
              focusedMessageId={focusedHistoryMessageId}
              fileChanges={visibleFileChanges}
              reviewRunId={latestReview.length ? finishedWithChanges?.runId || null : null}
              approvals={transcriptApprovals}
              conversations={snapshot.conversations}
              agentOf={agentOf}
              workspaceName={selectedWorkspace?.name}
              onOpenRelatedConversation={selectConversation}
              onNotice={setNotice}
              canCancelQueued
            />
            </MessageLinkContext.Provider>
            <div hidden={Boolean(composerTakeoverApproval)}>
            <Composer
              mentionAgents={selectedAgents}
              recipientName={(agentOf(selected.leaderAgentId || null) || selectedAgents[0] || snapshot.assistant)?.name}
              working={conversationRuns.length > 0}
              queued={queuedMessages}
              canAttachImages={canAttachImages}
              conversationId={selected.id}
              reviewChanges={latestReview}
              reviewKey={finishedWithChanges?.runId || ''}
              models={promptOptions.models}
              modelProviders={promptOptions.providers}
              defaultModelName={selectedModelName}
              defaultEffort={selectedEffort}
              onModelChange={setSelectedModelName}
              onSubmit={chatRuntime.send}
              onStop={() => void window.appAPI.stop(selected.id)}
              onVoiceNotice={setNotice}
            />
            </div>
            {composerTakeoverApproval && <ComposerTakeover key={composerTakeoverApproval.id} approval={composerTakeoverApproval} agent={agentOf(composerTakeoverApproval.agentId)} delegated={composerTakeoverApproval.conversationId !== selected.id} onNotice={setNotice} />}
            </AssistantRuntimeProvider>
          </div>
        </> : activeWorkspace ? <WorkspaceOverview workspace={activeWorkspace} conversations={snapshot.conversations} workspaces={snapshot.workspaces} agents={snapshot.agents} onCreateSession={() => void startConversation(activeWorkspace.id)} onOpenConversation={selectConversation} onEdit={() => setEditor({ kind: 'workspace', initial: activeWorkspace })} onOpenAgent={agent => void openWorkspaceAgent(activeWorkspace.id, agent)} /> : <div className="flex flex-1 items-center justify-center p-8"><div className="max-w-md text-center"><div className="mx-auto mb-5 flex items-center justify-center"><PoliAvatar agent={{ ...snapshot.assistant, name: 'Boo' }} size={104} /></div><h1 className="ds-page-title">Seu espaço de trabalho</h1><p className="ds-page-lede mx-auto">Converse agora com o Assistente padrão, sem cadastrar nada. Organize conversas em projetos e, quando quiser, crie agentes para formar uma equipe.</p><div className="mt-6 flex flex-wrap justify-center gap-2"><Button onClick={() => void startConversation()}><MessageSquarePlus className="size-4" /> Nova conversa</Button><Button variant="outline" onClick={() => setEditor({ kind: 'workspace' })}><FolderPlus className="size-4" /> Novo projeto</Button></div>{loading && <p className="mt-4 text-xs text-muted-foreground">Carregando conversas…</p>}</div></div>}
      </main>
      </DockWorkspace>
      </div>
    </div>
    <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} actions={paletteActions} />
    <SettingsOverlay open={settingsOpen} initialSection={settingsSection} onClose={() => setSettingsOpen(false)} />
    <AgentDetails agent={detailsAgentId ? agentOf(detailsAgentId) : undefined} runs={snapshot.runs} onClose={() => setDetailsAgentId(null)} onEdit={agent => { setDetailsAgentId(null); setEditor({ kind: 'agent', initial: agent }) }} onOpenMascot={agent => { setDetailsAgentId(null); setMascotAgentId(agent.id); openTool('mascot') }} />
    <Suspense fallback={null}><UpdateReadyCallout onOpen={() => { setSettingsSection('atualizacoes'); setSettingsOpen(true) }} /></Suspense>
    {/* No celular o composer ocupa toda a largura: o aviso sobe para não cobrir o botão de enviar. */}
    {notice && <div role="status" className="fixed inset-x-3 bottom-32 z-[60] mx-auto max-w-md rounded-lg sm:inset-x-auto sm:bottom-5 sm:right-5 sm:mx-0 border border-border bg-popover px-4 py-3 text-[13px] leading-5 text-popover-foreground shadow-lg">{notice}</div>}
    {editor?.kind === 'agent' ? <BooModal agent={editor.initial as Agent | undefined} models={models} onClose={() => setEditor(null)} onSave={saveAgent} onDelete={id => void deleteAgent(id)} /> : null}
    {editor?.kind === 'workspace' ? <WorkspaceModal workspace={editor.initial as Workspace | undefined} color={appearance.colors[(editor.initial as Workspace | undefined)?.id || ''] || colorForId((editor.initial as Workspace | undefined)?.id || 'novo')} onClose={() => setEditor(null)} onSave={saveWorkspace} onDelete={id => void deleteWorkspace(id)} onPickFolder={() => window.appAPI.pickFolder()} /> : null}
    <Suspense fallback={null}>
      {editor?.kind === 'conversation' ? <Editor kind="conversation" initial={editor.initial} workspaceId={editor.workspaceId} defaultAgentIds={editor.workspaceId ? snapshot.workspaces.find(workspace => workspace.id === editor.workspaceId)?.defaultAgentIds : undefined} workspaces={snapshot.workspaces} agents={snapshot.agents} models={models} onClose={() => setEditor(null)} onSave={saveConversation} onPickFolder={() => window.appAPI.pickFolder()} /> : null}
    </Suspense>
  </div></ModelSlotProvider>
}
