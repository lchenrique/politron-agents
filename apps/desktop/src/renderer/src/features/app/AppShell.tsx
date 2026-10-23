import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FolderPlus, MessageSquarePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import TitleBar from '@/components/ide/TitleBar'
import { ASSISTANT_ID, type Agent, type BrowserFrame, type Conversation, type Model, type Snapshot, type Workspace } from '../../../../shared/v9'
import type { ProviderSnapshot } from '../../../../shared/providers'
import { Sidebar } from '../sidebar/Sidebar'
import { WorkspaceOverview } from './WorkspaceOverview'
import { PoliAvatar } from './PoliAvatar'
import { AgentDetails } from './AgentDetails'
import { ChatHeader } from '../chat/ChatHeader'
import { MessageList } from '../chat/MessageList'
import { useConversationHistory } from '../chat/useConversationHistory'
import { Composer } from '../composer/Composer'
import { modelOptions } from '../composer/model-options'
import { DockWorkspace, type DockWorkspaceHandle, type DockTool, type DockZone } from '../panels/DockWorkspace'
import { Editor, type EditorData, type EditorKind } from '../editors/Editor'
import { SettingsPage, type SettingsSection } from './SettingsPage'
import { UpdateReadyCallout } from './UpdateReadyCallout'
import { INHERIT_MODEL_NAME, emptySnapshot, errorText } from './appShellShared'
import { selectVisibleRunEvidence } from './delegation-evidence'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { replaceEqualDeep } from '@tanstack/react-query'

export default function AppShell() {
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => { try { return localStorage.getItem('politron.sidebar.collapsed') === 'true' } catch { return false } })
  const [sidebarSize, setSidebarSize] = useState(() => { try { const value = Number(localStorage.getItem('politron.sidebar.size')); return Number.isFinite(value) && value >= 17 && value <= 34 ? value : 19 } catch { return 19 } })
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
  const openTool = (kind: DockTool, zone: DockZone = 'side') => dockRef.current?.openTool(kind, zone)
  const [browserFrames, setBrowserFrames] = useState<BrowserFrame[]>([])
  const [workspaceDiff, setWorkspaceDiff] = useState('')
  const [loading, setLoading] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('geral')
  useEffect(() => { const open = (event: Event) => { const section = (event as CustomEvent).detail; setSettingsSection(section === 'voz' || section === 'conexoes' || section === 'atualizacoes' ? section : 'geral'); setSettingsOpen(true) }; window.addEventListener('boobot:open-settings', open); return () => window.removeEventListener('boobot:open-settings', open) }, [])
  const [detailsAgentId, setDetailsAgentId] = useState<string | null>(null)
  const [mascotAgentId, setMascotAgentId] = useState<string | null>(null)
  useEffect(() => { selectedIdRef.current = selectedId; if (selectedId) setUnreadCounts(current => { if (!current[selectedId]) return current; const next = { ...current }; delete next[selectedId]; return next }) }, [selectedId])
  useEffect(() => { localStorage.setItem('politron-unread-counts', JSON.stringify(unreadCounts)) }, [unreadCounts])
  const selected = activeWorkspaceId ? undefined : snapshot.conversations.find(item => item.id === selectedId && !item.archived) || (!activeWorkspaceId ? snapshot.conversations.find(item => !item.archived) : undefined)
  const activeWorkspace = snapshot.workspaces.find(item => item.id === activeWorkspaceId && !item.archived)
  useEffect(() => { setDetailsAgentId(null); setMascotAgentId(null) }, [selected?.id])
  const selectConversation = useCallback((id: string) => { activeWorkspaceIdRef.current = null; setActiveWorkspaceId(null); setSelectedId(id) }, [])
  const selectWorkspace = useCallback((id: string) => { activeWorkspaceIdRef.current = id; setActiveWorkspaceId(id); setSelectedId('') }, [])
  useEffect(() => { activeWorkspaceIdRef.current = activeWorkspaceId }, [activeWorkspaceId])
  const selectedAgents = useMemo(() => !selected ? [] : selected.agentIds.length ? selected.agentIds.map(id => snapshot.agents.find(agent => agent.id === id)).filter((agent): agent is Agent => !!agent) : [snapshot.assistant], [selected, snapshot.agents, snapshot.assistant])
  const { messages, hasOlderMessages: historyHasMore, hasNewerMessages, focusedMessageId: focusedHistoryMessageId, queueMessage, loadOlder: loadOlderMessages, search: searchHistory, openSearchHit: openHistorySearchHit, returnToLatest: returnToLatestHistory, reconcileAfterReconnect } = useConversationHistory(selected?.id, setNotice)
  const visibleRunEvidence = useMemo(() => selectVisibleRunEvidence(messages, snapshot.fileChanges, snapshot.approvals), [messages, snapshot.fileChanges, snapshot.approvals])
  const visibleFileChanges = visibleRunEvidence.fileChanges
  const visibleApprovals = visibleRunEvidence.approvals
  // Only completed, real writes from this conversation can appear above the composer.
  const finishedWithChanges = [...messages].reverse().find(message => message.role === 'assistant'
    && message.runId && ['completed', 'failed', 'interrupted'].includes(message.status)
    && visibleFileChanges.some(change => change.runId === message.runId && change.status === 'applied'))
  const latestReview = finishedWithChanges?.runId
    ? visibleFileChanges.filter(change => change.runId === finishedWithChanges.runId && change.status === 'applied') : []
  const agentOf = useCallback((id: string | null) => id === ASSISTANT_ID ? snapshot.assistant : id ? snapshot.agents.find(agent => agent.id === id) : undefined, [snapshot.assistant, snapshot.agents])
  const selectedWorkspace = selected ? snapshot.workspaces.find(workspace => workspace.id === selected.workspaceId) : undefined
  // O IPC recria os objetos: conservar os dados iguais evita invalidar os memos do chat e dos Boos.
  const refresh = useCallback(async () => { try { const data = await window.appAPI.snapshot(); setSnapshot(current => replaceEqualDeep(current, data)); setSelectedId(current => activeWorkspaceIdRef.current ? '' : data.conversations.some(item => item.id === current && !item.archived) ? current : data.conversations.find(item => !item.archived)?.id || ''); setActiveWorkspaceId(current => current && data.workspaces.some(item => item.id === current && !item.archived) ? current : null) } catch (error) { setNotice(errorText(error)) } finally { setLoading(false) } }, [])
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
      else if (event.type === 'changed') {
        if (event.reason === 'connection-restored') void reconcileAfterReconnect().catch(error => setNotice(errorText(error)))
        scheduleRefresh()
      }
      else if (event.type === 'browser') setBrowserFrames(current => {
        const at = current.findIndex(frame => frame.key === event.frame.key)
        if (at < 0) return [...current, event.frame]
        const next = [...current]; next[at] = event.frame; return next
      })
      else if (event.type === 'browserClosed') setBrowserFrames(current => current.filter(frame => frame.key !== event.key))
    })
    return () => { off(); offProviders(); if (refreshTimer !== null) clearTimeout(refreshTimer) }
  }, [refresh, queueMessage, reconcileAfterReconnect])
  useEffect(() => { void window.appAPI.setVisibleConversation(selected?.id || null).catch(error => setNotice(errorText(error))) }, [selected?.id])
  const refreshBrowser = useCallback(async () => { if (!selected) { setBrowserFrames([]); return } try { setBrowserFrames(await window.appAPI.browserFrames(selected.id)) } catch (error) { setNotice(errorText(error)) } }, [selected?.id])
  useEffect(() => { void refreshBrowser() }, [refreshBrowser])
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
    const previous = snapshot.conversations.filter(item => !item.archived && item.kind === 'direct' && item.agentIds.length === 1 && item.agentIds[0] === agent.id && snapshot.workspaces.some(workspace => workspace.id === item.workspaceId && workspace.kind === 'free')).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
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
  const submitMessage = async (value: string, modelName: string, options: { files: File[]; effort?: Agent['effort']; planMode?: boolean }) => {
    if (!selected) throw new Error('Escolha uma conversa antes de enviar.')
    let input = value
    if (options.files.length) {
      const contents = await Promise.all(options.files.map(async file => { if (file.size > 100_000 || !file.type.startsWith('text/') && !/\.(md|txt|json|csv|ts|tsx|js|jsx|css|html|xml|ya?ml)$/i.test(file.name)) throw new Error(`${file.name}: anexe arquivos de texto de até 100 KB.`); return `\n\n--- ${file.name} ---\n${await file.text()}` }))
      input += contents.join('')
    }
    const selectedModel = models.find(item => item.id === modelName || item.name === modelName)?.id
    if (options.effort) setSelectedEffort(options.effort)
    await window.appAPI.send(selected.id, input, selectedModel, options.effort, options.planMode)
  }
  const promptOptions = useMemo(() => modelOptions(providerInventory?.providers || []), [providerInventory])
  const agentStates = useMemo(() => Object.fromEntries(snapshot.agents.map(agent => { const activeRuns = snapshot.runs.filter(run => run.agentId === agent.id && ['queued', 'running', 'waiting'].includes(run.status)); return [agent.id, activeRuns.some(run => run.status === 'waiting') ? 'waiting' : activeRuns.length ? 'working' : 'idle'] as const })), [snapshot.agents, snapshot.runs])
  const conversationRuns = snapshot.runs.filter(run => run.conversationId === selected?.id && !run.parentId && ['queued', 'running', 'waiting'].includes(run.status))
  const canSteer = conversationRuns.length > 0 && conversationRuns.every(run => snapshot.steeringRuntimes?.includes(run.agent.runtime) && !!run.threadId && !!run.turnId)

  return <div className="flex h-dvh w-full flex-col overflow-hidden bg-background font-sans text-foreground">
    <TitleBar sidebarCollapsed={sidebarCollapsed} onToggleSidebar={() => setSidebarCollapsed(current => !current)} onOpenTool={openTool} onDevelopmentLayout={() => dockRef.current?.useDevelopmentLayout()} className="border-b border-border/50" />
    <div className="min-h-0 flex-1 overflow-hidden">
      <ResizablePanelGroup key={sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-open'} id="politron-main-layout" orientation="horizontal" resizePreviewMode="separator"
        defaultLayout={sidebarCollapsed ? { main: 100 } : { sidebar: sidebarSize, main: 100 - sidebarSize }}
        onLayoutChanged={(layout, meta) => { if (!meta.isUserInteraction || typeof layout.sidebar !== 'number') return; const next = Math.min(34, Math.max(17, layout.sidebar)); setSidebarSize(next); try { localStorage.setItem('politron.sidebar.size', String(next)) } catch { /* preferência opcional */ } }}
        className="min-h-0 min-w-0">
      {!sidebarCollapsed && <>
      <ResizablePanel id="sidebar" defaultSize={`${sidebarSize}%`} minSize="240px" maxSize="400px" className="min-w-0">
      <Sidebar
        snapshot={snapshot}
        selected={selected}
        unreadCounts={unreadCounts}
        agentStates={agentStates}
        onSelectConversation={selectConversation}
        onSelectWorkspace={selectWorkspace}
        activeWorkspaceId={activeWorkspaceId}
        onStartConversation={startConversation}
        onOpenAgent={openAgent}
        onOpenEditor={setEditor}
        onOpenSettings={() => setSettingsOpen(true)}
        onDeleteWorkspace={deleteWorkspace}
        onDeleteConversation={deleteConversation}
        onDeleteAgent={deleteAgent}
        onSetChief={setAgentChief}
        onNotice={setNotice}
      />
      </ResizablePanel>
      <ResizableHandle withHandle />
      </>}
      <ResizablePanel id="main" defaultSize={sidebarCollapsed ? '100%' : `${100 - sidebarSize}%`} minSize={sidebarCollapsed ? '100%' : '50%'} className="min-w-0">
      <DockWorkspace ref={dockRef} workspaceId={activeWorkspaceId || selected?.workspaceId || null} conversationId={selected?.id} voiceAgentId={mascotAgentId || selected?.leaderAgentId || selectedAgents[0]?.id} assistant={snapshot.assistant} agents={snapshot.agents} selectedAgents={selectedAgents} agentStates={agentStates} browserFrames={browserFrames.filter(frame => frame.conversationId === selected?.id)} onRefreshBrowser={() => void refreshBrowser()} onChanged={setNotice} workspaceDiff={workspaceDiff}>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {selected ? <>
          <ChatHeader
            assistant={snapshot.assistant}
            onOpenAgent={agent => setDetailsAgentId(agent.id)}
            selected={selected}
            agents={snapshot.agents}
            selectedWorkspace={selectedWorkspace}
            onParticipantsChange={updateParticipants}
            onOpenComputerUse={() => openTool('browser')}
            onOpenProjectFiles={() => openTool('files')}
            onOpenMascot={() => openTool('mascot')}
            onEditConversation={() => setEditor({ kind: 'conversation', initial: selected })}
            onSearchHistory={searchHistory}
            onOpenSearchHit={hit => void openHistorySearchHit(hit).catch(error => setNotice(errorText(error)))}
            focusedMessageId={focusedHistoryMessageId}
            onReturnToLatest={() => void returnToLatestHistory().catch(error => setNotice(errorText(error)))}
          />
          <div className="flex min-h-0 flex-1 flex-col">
            <MessageList
              key={selected.id}
              messages={messages}
              hasOlderMessages={historyHasMore}
              hasNewerMessages={hasNewerMessages}
              onReturnToLatest={() => void returnToLatestHistory().catch(error => setNotice(errorText(error)))}
              onLoadOlder={loadOlderMessages}
              focusedMessageId={focusedHistoryMessageId}
              fileChanges={visibleFileChanges}
              approvals={visibleApprovals}
              conversations={snapshot.conversations}
              agentOf={agentOf}
              selectedAgents={selectedAgents}
              onOpenRelatedConversation={selectConversation}
              onNotice={setNotice}
            />
            <Composer
              mentionAgents={selectedAgents}
              working={conversationRuns.length > 0}
              canSteer={canSteer}
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
        </> : activeWorkspace ? <WorkspaceOverview workspace={activeWorkspace} conversations={snapshot.conversations} workspaces={snapshot.workspaces} agents={snapshot.agents} onCreateSession={() => void startConversation(activeWorkspace.id)} onOpenConversation={selectConversation} onEdit={() => setEditor({ kind: 'workspace', initial: activeWorkspace })} onOpenAgent={agent => void openWorkspaceAgent(activeWorkspace.id, agent)} /> : <div className="flex flex-1 items-center justify-center p-8"><div className="max-w-md text-center"><div className="mx-auto mb-4 flex items-center justify-center"><PoliAvatar agent={{ ...snapshot.assistant, name: 'Boo' }} size={112} /></div><h1 className="text-xl font-semibold">Seu espaço de trabalho</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Converse agora com o Assistente padrão, sem cadastrar nada. Organize conversas em workspaces e, quando quiser, crie agentes para formar uma equipe.</p><div className="mt-5 flex justify-center gap-2"><Button onClick={() => void startConversation()}><MessageSquarePlus className="size-4" /> Nova conversa</Button><Button variant="outline" onClick={() => setEditor({ kind: 'workspace' })}><FolderPlus className="size-4" /> Novo workspace</Button></div>{loading && <p className="mt-4 text-xs text-muted-foreground">Carregando conversas…</p>}</div></div>}
      </main>
      </DockWorkspace>
      </ResizablePanel>
      </ResizablePanelGroup>
    </div>
    <AgentDetails agent={detailsAgentId ? agentOf(detailsAgentId) : undefined} runs={snapshot.runs} onClose={() => setDetailsAgentId(null)} onEdit={agent => { setDetailsAgentId(null); setEditor({ kind: 'agent', initial: agent }) }} onOpenMascot={agent => { setDetailsAgentId(null); setMascotAgentId(agent.id); openTool('mascot') }} />
    <UpdateReadyCallout onOpen={() => { setSettingsSection('atualizacoes'); setSettingsOpen(true) }} />
    {notice && <div role="status" className="fixed bottom-5 right-5 z-[60] max-w-md rounded-xl border border-border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-xl">{notice}</div>}
    <SettingsPage open={settingsOpen} onOpenChange={setSettingsOpen} initialSection={settingsSection} />
    {editor && <Editor kind={editor.kind} initial={editor.initial} workspaceId={editor.workspaceId} defaultAgentIds={editor.workspaceId ? snapshot.workspaces.find(workspace => workspace.id === editor.workspaceId)?.defaultAgentIds : undefined} workspaces={snapshot.workspaces} agents={snapshot.agents} models={models} onClose={() => setEditor(null)} onSave={editor.kind === 'agent' ? saveAgent : editor.kind === 'workspace' ? saveWorkspace : saveConversation} onPickFolder={() => window.appAPI.pickFolder()} />}
  </div>
}
