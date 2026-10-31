import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FolderPlus, MessageSquarePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import TitleBar from '@/components/ide/TitleBar'
import { ASSISTANT_ID, type Agent, type Conversation, type MessageAttachment, type Model, type ModelRuntimeOptions, type Snapshot, type Workspace } from '../../../../shared/v9'
import type { ProviderSnapshot } from '../../../../shared/providers'
import { Sidebar } from '../sidebar/Sidebar'
import { WorkspaceSearch } from '../sidebar/WorkspaceSearch'
import { WorkspaceOverview } from './WorkspaceOverview'
import { PoliAvatar } from './PoliAvatar'
import { AgentDetails } from './AgentDetails'
import { ChatHeader, ConversationAvatar, ConversationTools, conversationIdentity, type ConversationChromeProps } from '../chat/ChatHeader'
import { booActivity } from './boo-activity'
import { MessageList } from '../chat/MessageList'
import { MessageLinkContext, type MessageLinkHandlers } from '../chat/MessageMarkdown'
import { linkFileWorkspaceId } from '../chat/message-link'
import { useConversationHistory } from '../chat/useConversationHistory'
import { Composer } from '../composer/Composer'
import { ComposerTakeover } from '../composer/ComposerTakeover'
import { modelOptions } from '../composer/model-options'
import { DockWorkspace, type DockWorkspaceHandle, type DockTool, type DockZone } from '../panels/DockWorkspace'
import type { EditorData, EditorKind } from '../editors/Editor'
import type { SettingsSection } from './SettingsPage'
import { INHERIT_MODEL_NAME, emptySnapshot, errorText } from './appShellShared'
import { selectVisibleRunEvidence } from './delegation-evidence'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { replaceEqualDeep } from '@tanstack/react-query'
import { useIsMobile } from '@/hooks/use-mobile'
import { getPwaCapabilities, onPwaCapabilitiesChanged } from '../../pwa/remote-api'
import { ChiefHome } from '../work/ChiefHome'
import { PwaBoosPage } from '../pwa/PwaAgentFirst'
import { PwaChatList, PwaChatTopBar, type PwaMenuAction } from '../pwa/PwaChatList'
import { usePwaDelegationNotices } from '../pwa/use-pwa-delegation-notices'
import { booOverview, deriveDelegations } from '../pwa/pwa-agent-model'
import { RoutinesPage } from '../work/RoutinesPage'
import { MissionStrip } from '../work/MissionStrip'
import { BoardPage } from '../board/BoardPage'
import { OfficePage } from '../office/OfficePage'

const Editor = lazy(() => import('../editors/Editor').then(module => ({ default: module.Editor })))
const SettingsPage = lazy(() => import('./SettingsPage').then(module => ({ default: module.SettingsPage })))
const UpdateReadyCallout = lazy(() => import('./UpdateReadyCallout').then(module => ({ default: module.UpdateReadyCallout })))

export default function AppShell() {
  const browserMode = !('vibeAPI' in window)
  const isMobile = useIsMobile()
  // No celular a PWA abre na conversa com o Chief e navega por Chief, Boos e Projetos.
  const pwaMobile = browserMode && isMobile
  // No celular "nenhuma conversa aberta" é a lista de conversas: não escolher a primeira sozinho.
  // A detecção de celular chega depois do primeiro carregamento; a largura da tela já vale desde o início.
  const pwaListRef = useRef(false)
  pwaListRef.current = pwaMobile || (browserMode && typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches === true)
  const [pwaCapabilities, setPwaCapabilities] = useState<string[]>(getPwaCapabilities)
  const canChat = !browserMode || pwaCapabilities.includes('chat')
  const canApprove = !browserMode || pwaCapabilities.includes('approvals')
  const canReadFiles = !browserMode || pwaCapabilities.includes('files:read') || pwaCapabilities.includes('files:write')
  const canWriteFiles = !browserMode || pwaCapabilities.includes('files:write')
  useEffect(() => onPwaCapabilitiesChanged(setPwaCapabilities), [])
  useEffect(() => browserMode ? undefined : window.platformBrowserAPI?.onReveal(() => dockRef.current?.revealTool('web')), [browserMode])
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
  const [view, setView] = useState<'home' | 'routines' | 'board' | 'office' | 'boos' | null>('home')
  const [pwaStarted, setPwaStarted] = useState(false)
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
    if (browserMode && window.matchMedia('(max-width: 767px)').matches) return true
    try { return localStorage.getItem('politron.sidebar.collapsed') === 'true' } catch { return false }
  })
  const [sidebarSection, setSidebarSection] = useState<'projects' | 'agents'>(() => { try { return localStorage.getItem('politron.sidebar.section') === 'agents' ? 'agents' : 'projects' } catch { return 'projects' } })
  useEffect(() => { try { localStorage.setItem('politron.sidebar.section', sidebarSection) } catch { /* preferência opcional */ } }, [sidebarSection])
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
    if (browserMode && (kind === 'files' && !canReadFiles || kind === 'terminal' || kind === 'web' || kind === 'mascot')) return
    dockRef.current?.openTool(kind, zone)
  }
  const [workspaceDiff, setWorkspaceDiff] = useState('')
  const [loading, setLoading] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('geral')
  useEffect(() => { const open = (event: Event) => { const section = (event as CustomEvent).detail; setSettingsSection(section === 'voz' || section === 'conexoes' || section === 'atualizacoes' ? section : 'geral'); setSettingsOpen(true) }; window.addEventListener('boobot:open-settings', open); return () => window.removeEventListener('boobot:open-settings', open) }, [])
  const [detailsAgentId, setDetailsAgentId] = useState<string | null>(null)
  const [mascotAgentId, setMascotAgentId] = useState<string | null>(null)
  useEffect(() => { selectedIdRef.current = selectedId; if (selectedId) setUnreadCounts(current => { if (!current[selectedId]) return current; const next = { ...current }; delete next[selectedId]; return next }) }, [selectedId])
  useEffect(() => { localStorage.setItem('politron-unread-counts', JSON.stringify(unreadCounts)) }, [unreadCounts])
  // No celular, sem conversa escolhida mostra a lista de conversas em vez de abrir a primeira.
  const selected = view || activeWorkspaceId ? undefined : snapshot.conversations.find(item => item.id === selectedId && !item.archived) || (!activeWorkspaceId && !pwaListRef.current ? snapshot.conversations.find(item => !item.archived) : undefined)
  const activeWorkspace = snapshot.workspaces.find(item => item.id === activeWorkspaceId && !item.archived)
  useEffect(() => { setDetailsAgentId(null); setMascotAgentId(null) }, [selected?.id])
  const selectConversation = useCallback((id: string) => { activeWorkspaceIdRef.current = null; setActiveWorkspaceId(null); setView(null); setSelectedId(id); if (browserMode && isMobile) setSidebarCollapsed(true) }, [browserMode, isMobile])
  const selectWorkspace = useCallback((id: string) => { activeWorkspaceIdRef.current = id; setActiveWorkspaceId(id); setView(null); setSelectedId(''); if (browserMode && isMobile) setSidebarCollapsed(true) }, [browserMode, isMobile])
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
  const composerTakeoverApproval = canApprove
    ? visibleApprovals.find(approval => approval.status === 'pending')
    : undefined
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
  // Links das respostas no Desktop: arquivos no editor do dock, web no navegador da plataforma. A PWA não recebe provider.
  const messageLinks = useMemo<MessageLinkHandlers | null>(() => browserMode ? null : {
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
  }, [browserMode, linkWorkspaceId, linkWorkspaceRoot])
  // O IPC recria os objetos: conservar os dados iguais evita invalidar os memos do chat e dos Boos.
  const refresh = useCallback(async () => { try { const data = await window.appAPI.snapshot(); setSnapshot(current => replaceEqualDeep(current, data)); setSelectedId(current => activeWorkspaceIdRef.current ? '' : data.conversations.some(item => item.id === current && !item.archived) ? current : pwaListRef.current && !current ? '' : data.conversations.find(item => !item.archived)?.id || ''); setActiveWorkspaceId(current => current && data.workspaces.some(item => item.id === current && !item.archived) ? current : null) } catch (error) { setNotice(errorText(error)) } finally { setLoading(false) } }, [])
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
  }, [refresh, queueMessage, reconcileAfterReconnect, browserMode])
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
      } else if (!(pwaListRef.current && !selectedId) && !data.conversations.some(item => item.id === selectedId && !item.archived)) setSelectedId(data.conversations.find(item => !item.archived)?.id || '')
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
    try { const conversation = await window.appAPI.saveConversation({ kind: 'direct', agentIds: [agent.id], name: agent.name }); await refresh(); selectConversation(conversation.id) }
    catch (error) { setNotice(errorText(error)) }
  }
  const openWorkspaceAgent = async (workspaceId: string, agent: Agent) => {
    const previous = snapshot.conversations.find(item => !item.archived && item.workspaceId === workspaceId && item.agentIds.length === 1 && item.agentIds[0] === agent.id)
    if (previous) { selectConversation(previous.id); return }
    try { const conversation = await window.appAPI.saveConversation({ workspaceId, kind: 'direct', agentIds: [agent.id], name: agent.name }); await refresh(); selectConversation(conversation.id) }
    catch (error) { setNotice(errorText(error)) }
  }
  const submitMessage = async (value: string, modelName: string, options: { files: File[]; effort?: Agent['effort']; modelOptions: ModelRuntimeOptions; planMode?: boolean; delivery: 'queue' | 'now'; requestId: string }) => {
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
  const promptOptions = useMemo(() => modelOptions(providerInventory?.providers || []), [providerInventory])
  const agentStates = useMemo(() => Object.fromEntries(snapshot.agents.map(agent => { const activeRuns = snapshot.runs.filter(run => run.agentId === agent.id && ['queued', 'running', 'waiting'].includes(run.status)); return [agent.id, activeRuns.some(run => run.status === 'waiting') ? 'waiting' : activeRuns.length ? 'working' : 'idle'] as const })), [snapshot.agents, snapshot.runs])
  const openHome = useCallback((next: 'home' | 'routines' | 'board' | 'office' | 'boos') => { activeWorkspaceIdRef.current = null; setActiveWorkspaceId(null); setView(next); if (browserMode && isMobile) setSidebarCollapsed(true) }, [browserMode, isMobile])
  const selectedMission = selected ? (snapshot.missions || []).filter(item => item.conversationId === selected.id && ['active', 'waiting', 'paused'].includes(item.status)).at(-1) : undefined
  const attentionCount = (snapshot.missions || []).filter(item => item.status === 'waiting').length + snapshot.approvals.filter(item => item.status === 'pending').length
  const pwaBoos = useMemo(() => booOverview(snapshot, agentStates), [snapshot, agentStates])
  const pwaDelegations = useMemo(() => deriveDelegations(snapshot), [snapshot])
  usePwaDelegationNotices(pwaMobile ? pwaDelegations : [], setNotice)
  useEffect(() => { if (pwaMobile && !pwaStarted && !loading) { setView(null); setPwaStarted(true) } }, [pwaMobile, pwaStarted, loading])
  // Projetos no PWA: a barra lateral antiga aparece no lugar da lista até voltar às conversas.
  const [pwaProjects, setPwaProjects] = useState(false)
  const backToChats = useCallback(() => { activeWorkspaceIdRef.current = null; setActiveWorkspaceId(null); setSelectedId(''); setView(null); setPwaProjects(false); if (isMobile) setSidebarCollapsed(true) }, [isMobile])
  const pwaMenu = (action: PwaMenuAction) => {
    if (action === 'projects') { setSidebarSection('projects'); setPwaProjects(true); if (isMobile) setSidebarCollapsed(false); return }
    openHome(action)
  }
  const pwaChatList = <PwaChatList snapshot={snapshot} unreadCounts={unreadCounts} selectedId={selected?.id} canChat={canChat} onSelect={selectConversation}
    onNewChat={agent => { if (canChat) void openAgent(agent) }} onMenu={pwaMenu} />
  const pwaList = pwaMobile && !selected && !view && !activeWorkspaceId
  const conversationRuns = snapshot.runs.filter(run => run.conversationId === selected?.id && !run.parentId && ['queued', 'running', 'waiting'].includes(run.status))
  const queuedMessages = useMemo(() => messages.filter(message => message.role === 'user' && message.status === 'queued'), [messages])
  // A barra da janela diz onde se está; quem participa e as ações da conversa ficam na faixa da conversa.
  const chiefName = snapshot.agents.find(agent => agent.role === 'chief')?.name
  const contextWorkspace = activeWorkspace || selectedWorkspace
  const parentWorkspace = contextWorkspace?.kind === 'worktree' ? snapshot.workspaces.find(item => item.id === contextWorkspace.parentWorkspaceId) : undefined
  const windowLocation = view === 'boos' ? { label: 'Boos' } : view === 'home' ? { label: `Central do ${chiefName || 'Chief'}` }
    : view === 'routines' ? { label: 'Rotinas' }
    : view === 'board' ? { label: 'Board da empresa' }
    : view === 'office' ? { label: 'Escritório' }
    : contextWorkspace && (parentWorkspace?.name || contextWorkspace.name) ? { label: parentWorkspace?.name || contextWorkspace.name, detail: contextWorkspace.kind === 'worktree' ? contextWorkspace.branch || contextWorkspace.name : undefined }
    : undefined
  const mainTabLabel = view === 'boos' ? 'Boos' : view === 'home' ? 'Central' : view === 'routines' ? 'Rotinas' : view === 'board' ? 'Board' : view === 'office' ? 'Escritório' : activeWorkspace ? 'Projeto' : undefined
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
    browserMode,
    canReadFiles,
    canChat,
  } : null
  const conversationTitle = selected ? conversationIdentity(selected, snapshot.agents, snapshot.assistant) : null

  return <div data-pwa-shell={browserMode ? 'true' : undefined} data-sidebar-collapsed={sidebarCollapsed} className="flex h-dvh w-full flex-col overflow-hidden bg-chrome font-sans text-foreground">
    {!(pwaMobile && !view) && <TitleBar sidebarCollapsed={sidebarCollapsed} onToggleSidebar={() => setSidebarCollapsed(current => !current)} onOpenHome={() => openHome('home')} onOpenTool={openTool} onDevelopmentLayout={() => dockRef.current?.useDevelopmentLayout()} browserMode={browserMode} browserCanReadFiles={canReadFiles} location={windowLocation}
      search={!browserMode && <WorkspaceSearch snapshot={snapshot} canChat={canChat} onSelectWorkspace={selectWorkspace} onSelectConversation={selectConversation} onStartConversation={startConversation} onOpenAgent={openAgent} onOpenEditor={setEditor} onSectionChange={setSidebarSection} />} />}
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
      {browserMode && isMobile && !sidebarCollapsed && <Button type="button" variant="ghost" size={null} className="boobot-web-sidebar-backdrop h-auto rounded-none p-0" aria-label="Fechar navegação" onClick={() => setSidebarCollapsed(true)} />}
      <ResizablePanelGroup key={browserMode && isMobile ? 'web-mobile-layout' : sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-open'} id="politron-main-layout" orientation="horizontal" resizePreviewMode="separator"
        defaultLayout={sidebarCollapsed ? { main: 100 } : { sidebar: sidebarSize, main: 100 - sidebarSize }}
        onLayoutChanged={(layout, meta) => { if (!meta.isUserInteraction || typeof layout.sidebar !== 'number') return; const next = Math.min(34, Math.max(10, layout.sidebar)); setSidebarSize(next); try { localStorage.setItem('politron.sidebar.size', String(next)) } catch { /* preferência opcional */ } }}
        className="boobot-web-layout min-h-0 min-w-0">
      {!sidebarCollapsed && <>
      <ResizablePanel id="sidebar" defaultSize={`${sidebarSize}%`} minSize="240px" maxSize="400px" className={'min-w-0 ' + (browserMode ? 'boobot-web-sidebar-panel' : '')}>
      {browserMode && !isMobile && !pwaProjects ? pwaChatList : <>
      {browserMode && <Button type="button" variant="ghost" size="sm" className="m-2 justify-start" onClick={backToChats}>← Conversas</Button>}
      <Sidebar
        snapshot={snapshot}
        selected={selected}
        unreadCounts={unreadCounts}
        agentStates={agentStates}
        onSelectConversation={selectConversation}
        onSelectWorkspace={selectWorkspace}
        activeWorkspaceId={activeWorkspaceId}
        onStartConversation={startConversation}
        onOpenAgent={(agent, newConversation) => {
          if (canChat) void openAgent(agent, newConversation)
          else { setDetailsAgentId(agent.id); if (browserMode && isMobile) setSidebarCollapsed(true) }
        }}
        onOpenEditor={setEditor}
        onOpenSettings={() => setSettingsOpen(true)}
        view={view === "boos" ? null : view}
        onOpenHome={openHome}
        section={sidebarSection}
        onSectionChange={setSidebarSection}
        attentionCount={attentionCount}
        onDeleteWorkspace={deleteWorkspace}
        onDeleteConversation={deleteConversation}
        onDeleteAgent={deleteAgent}
        onSetChief={setAgentChief}
        onNotice={setNotice}
        browserMode={browserMode}
        canChat={canChat}
      />
      </>}
      </ResizablePanel>
      {/* Alça invisível de 8px centrada na borda, como no DSH: o canvas encosta na barra lateral. */}
      <ResizableHandle aria-label="Redimensionar barra lateral" className="z-10 w-0 bg-transparent after:w-2 hover:bg-transparent" />
      </>}
      <ResizablePanel id="main" defaultSize={sidebarCollapsed ? '100%' : `${100 - sidebarSize}%`} minSize={sidebarCollapsed ? '100%' : '50%'} className={'min-w-0 ' + (browserMode ? 'pb-1.5 pr-1.5 boobot-web-main-panel ' + (sidebarCollapsed ? 'pl-1.5' : '') : '')}>
      <div className="boobot-canvas ds-canvas flex h-full min-h-0 min-w-0">
      <DockWorkspace onSendMessage={canChat ? (conversationId, agentId, text) => window.appAPI.respondToAgent(conversationId, text, agentId) : undefined} ref={dockRef} workspaceId={activeWorkspaceId || selected?.workspaceId || null} conversationId={selected?.id} delegationMessages={selected ? messages : []} conversations={snapshot.conversations} runs={snapshot.runs} onOpenRelatedConversation={selectConversation} voiceAgentId={mascotAgentId || selected?.leaderAgentId || selectedAgents[0]?.id} assistant={snapshot.assistant} agents={snapshot.agents} selectedAgents={selectedAgents} agentStates={agentStates} onChanged={setNotice} workspaceDiff={workspaceDiff} browserMode={browserMode} canReadFiles={canReadFiles} canWriteFiles={canWriteFiles}
        chatHeader={conversationChrome && !pwaMobile && <ChatHeader {...conversationChrome} />}
        chatTab={conversationChrome && conversationTitle ? { label: conversationTitle.title, title: [conversationTitle.title, conversationTitle.subtitle].filter(Boolean).join(' · '), leading: <ConversationAvatar compact {...conversationChrome} />, trailing: <ConversationTools compact {...conversationChrome} /> } : mainTabLabel ? { label: mainTabLabel } : undefined}>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {pwaMobile && view && <header className="pwa-chat-top"><Button variant="ghost" size="sm" onClick={backToChats}>← Conversas</Button></header>}
        {pwaMobile && !pwaStarted ? <div className="flex-1" aria-busy="true" />
        : pwaList ? pwaChatList
        : view === 'boos' ? <PwaBoosPage boos={pwaBoos} onOpenAgent={agent => { if (canChat) void openAgent(agent); else setDetailsAgentId(agent.id) }} />
        : view === 'home' ? <ChiefHome snapshot={snapshot} agentStates={agentStates} onOpenConversation={selectConversation} onOpenAgent={agent => { if (canChat) void openAgent(agent); else setDetailsAgentId(agent.id) }} onOpenRoutines={() => openHome('routines')} onNotice={setNotice} canChat={canChat} />
        : view === 'routines' ? <RoutinesPage snapshot={snapshot} onOpenConversation={selectConversation} onNotice={setNotice} />
        : view === 'office' ? <OfficePage snapshot={snapshot} onOpenConversation={selectConversation} onOpenAgent={agent => { if (canChat) void openAgent(agent); else setDetailsAgentId(agent.id) }} />
        : view === 'board' ? <BoardPage snapshot={snapshot} onOpenConversation={selectConversation} onNotice={setNotice} readOnly={browserMode} />
        : selected ? <>
          {pwaMobile && <PwaChatTopBar snapshot={snapshot} conversation={selected} onBack={backToChats}
            tools={[{ id: 'diff', label: 'Alterações' }, ...(canReadFiles ? [{ id: 'files', label: 'Arquivos' }] : [])]} onTool={id => openTool(id as DockTool)} />}
          {selectedMission && <MissionStrip mission={selectedMission} runs={snapshot.runs} approvals={snapshot.approvals} onNotice={setNotice} />}
          <div className="flex min-h-0 flex-1 flex-col">
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
              selectedAgents={selectedAgents}
              workspaceName={selectedWorkspace?.name}
              onOpenRelatedConversation={selectConversation}
              onNotice={setNotice}
              canSpeak={!browserMode || canChat}
              canApprove={canApprove}
              canCancelQueued={canChat}
            />
            </MessageLinkContext.Provider>
            <fieldset disabled={!canChat} className="m-0 min-w-0 border-0 p-0">
            <div hidden={Boolean(composerTakeoverApproval)}>
            <Composer
              mentionAgents={selectedAgents}
              working={conversationRuns.length > 0}
              queued={queuedMessages}
              canAttachImages={canAttachImages}
              canAttachFiles={!browserMode || canAttachImages}
              conversationId={selected.id}
              reviewChanges={latestReview}
              reviewKey={finishedWithChanges?.runId || ''}
              models={promptOptions.models}
              modelProviders={promptOptions.providers}
              defaultModelName={selectedModelName}
              defaultEffort={selectedEffort}
              onModelChange={setSelectedModelName}
              onSubmit={submitMessage}
              onStop={() => void window.appAPI.stop(selected.id)}
              onVoiceNotice={setNotice}
            />
            </div>
            </fieldset>
            {composerTakeoverApproval && <ComposerTakeover key={composerTakeoverApproval.id} approval={composerTakeoverApproval} onNotice={setNotice} canApprove={canApprove} />}
            {browserMode && !canChat && <p className="mx-3 mb-2 rounded-md bg-warning-soft px-3 py-2 text-center text-xs text-warning sm:mx-auto sm:max-w-3xl">O host está em leitura para este dispositivo. Libere o chat nas permissões PWA do Boobot.</p>}
          </div>
        </> : activeWorkspace ? <WorkspaceOverview workspace={activeWorkspace} conversations={snapshot.conversations} workspaces={snapshot.workspaces} agents={snapshot.agents} onCreateSession={() => void startConversation(activeWorkspace.id)} onOpenConversation={selectConversation} onEdit={() => setEditor({ kind: 'workspace', initial: activeWorkspace })} onOpenAgent={agent => {
          if (canChat) void openWorkspaceAgent(activeWorkspace.id, agent)
          else { setDetailsAgentId(agent.id); if (browserMode && isMobile) setSidebarCollapsed(true) }
        }} browserMode={browserMode} canChat={canChat} /> : <div className="flex flex-1 items-center justify-center p-8"><div className="max-w-md text-center"><div className="mx-auto mb-5 flex items-center justify-center"><PoliAvatar agent={{ ...snapshot.assistant, name: 'Boo' }} size={104} /></div><h1 className="ds-page-title">Seu espaço de trabalho</h1><p className="ds-page-lede mx-auto">Converse agora com o Assistente padrão, sem cadastrar nada. Organize conversas em projetos e, quando quiser, crie agentes para formar uma equipe.</p><div className="mt-6 flex flex-wrap justify-center gap-2"><Button disabled={!canChat} onClick={() => void startConversation()}><MessageSquarePlus className="size-4" /> Nova conversa</Button>{!browserMode && <Button variant="outline" onClick={() => setEditor({ kind: 'workspace' })}><FolderPlus className="size-4" /> Novo projeto</Button>}</div>{loading && <p className="mt-4 text-xs text-muted-foreground">Carregando conversas…</p>}</div></div>}
      </main>
      </DockWorkspace>
      </div>
      </ResizablePanel>
      </ResizablePanelGroup>
      </div>
    </div>
    <AgentDetails agent={detailsAgentId ? agentOf(detailsAgentId) : undefined} runs={snapshot.runs} onClose={() => setDetailsAgentId(null)} onEdit={agent => { setDetailsAgentId(null); setEditor({ kind: 'agent', initial: agent }) }} onOpenMascot={agent => { setDetailsAgentId(null); setMascotAgentId(agent.id); openTool('mascot') }} browserMode={browserMode} />
    {!browserMode && <Suspense fallback={null}><UpdateReadyCallout onOpen={() => { setSettingsSection('atualizacoes'); setSettingsOpen(true) }} /></Suspense>}
    {/* No celular o composer ocupa toda a largura: o aviso sobe para não cobrir o botão de enviar. */}
    {notice && <div role="status" className="fixed inset-x-3 bottom-32 z-[60] mx-auto max-w-md rounded-lg sm:inset-x-auto sm:bottom-5 sm:right-5 sm:mx-0 border border-border bg-popover px-4 py-3 text-[13px] leading-5 text-popover-foreground shadow-lg">{notice}</div>}
    {!browserMode && <Suspense fallback={null}>
      <SettingsPage open={settingsOpen} onOpenChange={setSettingsOpen} initialSection={settingsSection} />
      {editor && <Editor kind={editor.kind} initial={editor.initial} workspaceId={editor.workspaceId} defaultAgentIds={editor.workspaceId ? snapshot.workspaces.find(workspace => workspace.id === editor.workspaceId)?.defaultAgentIds : undefined} workspaces={snapshot.workspaces} agents={snapshot.agents} models={models} onClose={() => setEditor(null)} onSave={editor.kind === 'agent' ? saveAgent : editor.kind === 'workspace' ? saveWorkspace : saveConversation} onPickFolder={() => window.appAPI.pickFolder()} />}
    </Suspense>}
  </div>
}
