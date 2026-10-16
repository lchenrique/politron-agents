import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bot, FolderPlus, MessageSquarePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import TitleBar from '@/components/ide/TitleBar'
import { ASSISTANT_ID, type Agent, type BrowserFrame, type Conversation, type Message, type Model, type Project, type Snapshot } from '../../../../shared/v9'
import { Sidebar } from '../sidebar/Sidebar'
import { ChatHeader } from '../chat/ChatHeader'
import { MessageList } from '../chat/MessageList'
import { Composer } from '../composer/Composer'
import { SidePanel } from '../panels/SidePanel'
import { Editor, type EditorData, type EditorKind } from '../editors/Editor'
import { SettingsPage } from './SettingsPage'
import { emptySnapshot, errorText } from './appShellShared'

export default function AppShell() {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot)
  const [messages, setMessages] = useState<Message[]>([])
  const [models, setModels] = useState<Model[]>([])
  const [selectedModelName, setSelectedModelName] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const selectedIdRef = useRef(selectedId)
  const seenIncomingIds = useRef(new Set<string>())
  const eventStatuses = useRef(new Map<string, string>())
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem('politron-unread-counts') || '{}') as Record<string, number> } catch { return {} }
  })
  const [editor, setEditor] = useState<{ kind: EditorKind; initial?: Agent | Conversation | Project; projectId?: string | null } | null>(null)
  const [notice, setNotice] = useState('')
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [computerOpen, setComputerOpen] = useState(false)
  const [browserFrames, setBrowserFrames] = useState<BrowserFrame[]>([])
  const [loading, setLoading] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  useEffect(() => { selectedIdRef.current = selectedId; if (selectedId) setUnreadCounts(current => { if (!current[selectedId]) return current; const next = { ...current }; delete next[selectedId]; return next }) }, [selectedId])
  useEffect(() => { localStorage.setItem('politron-unread-counts', JSON.stringify(unreadCounts)) }, [unreadCounts])
  const selected = snapshot.conversations.find(item => item.id === selectedId) || snapshot.conversations.find(item => !item.archived)
  const selectedAgents = useMemo(() => !selected ? [] : selected.agentIds.length ? selected.agentIds.map(id => snapshot.agents.find(agent => agent.id === id)).filter((agent): agent is Agent => !!agent) : [snapshot.assistant], [selected, snapshot.agents, snapshot.assistant])
  const agentOf = useCallback((id: string | null) => id === ASSISTANT_ID ? snapshot.assistant : id ? snapshot.agents.find(agent => agent.id === id) : undefined, [snapshot.assistant, snapshot.agents])
  const selectedProject = selected?.projectId ? snapshot.projects.find(project => project.id === selected.projectId) : undefined
  const refresh = useCallback(async () => { try { const data = await window.appAPI.snapshot(); setSnapshot(data); setSelectedId(current => data.conversations.some(item => item.id === current) ? current : data.conversations.find(item => !item.archived)?.id || '') } catch (error) { setNotice(errorText(error)) } finally { setLoading(false) } }, [])
  useEffect(() => { void refresh(); void window.appAPI.models().then(data => { setModels(data); setSelectedModelName(current => current || data.find(item => item.isDefault)?.name || data[0]?.name || '') }).catch(error => setNotice(`Não foi possível carregar os modelos do Codex: ${errorText(error)}`)); const off = window.appAPI.onEvent(event => { if (event.type === 'message') { setMessages(current => { const at = current.findIndex(item => item.id === event.message.id); if (at < 0) return [...current, event.message]; const next = [...current]; next[at] = event.message; return next }); const previousStatus = eventStatuses.current.get(event.message.id); if (previousStatus !== event.message.status) { eventStatuses.current.set(event.message.id, event.message.status); void refresh() } if (event.message.role !== 'user' && event.message.conversationId !== selectedIdRef.current && !seenIncomingIds.current.has(event.message.id)) { seenIncomingIds.current.add(event.message.id); setUnreadCounts(current => ({ ...current, [event.message.conversationId]: (current[event.message.conversationId] || 0) + 1 })) } } else if (event.type === 'changed') void refresh(); else if (event.type === 'browser') setBrowserFrames(current => { const at = current.findIndex(frame => frame.key === event.frame.key); if (at < 0) return [...current, event.frame]; const next = [...current]; next[at] = event.frame; return next }) }); return off }, [refresh])
  useEffect(() => { let live = true; if (!selected) { setMessages([]); return } window.appAPI.history(selected.id).then(data => { if (live) setMessages(data) }).catch(error => setNotice(errorText(error))); return () => { live = false } }, [selected?.id])
  const refreshBrowser = useCallback(async () => { if (!selected) { setBrowserFrames([]); return } try { setBrowserFrames(await window.appAPI.browserFrames(selected.id)) } catch (error) { setNotice(errorText(error)) } }, [selected?.id])
  useEffect(() => { void refreshBrowser() }, [refreshBrowser])
  useEffect(() => { const timeout = window.setTimeout(() => setNotice(''), 6000); return () => window.clearTimeout(timeout) }, [notice])
  const saveAgent = async (data: EditorData) => { const agent = await window.appAPI.saveAgent(data as Partial<Agent>); await refresh(); if (!data.id) setNotice(`${agent.name} já pode participar de uma conversa.`) }
  const saveConversation = async (data: EditorData) => { const conversation = await window.appAPI.saveConversation(data as Partial<Conversation>); await refresh(); setSelectedId(conversation.id) }
  const updateParticipants = async (agentIds: string[]) => { if (!selected) return; try { await window.appAPI.saveConversation({ id: selected.id, agentIds, kind: agentIds.length > 1 ? 'group' : 'direct' }); await refresh() } catch (error) { setNotice(errorText(error)) } }
  const saveProject = async (data: EditorData) => { const project = await window.appAPI.saveProject(data as Partial<Project>); await refresh(); if (!data.id) await startConversation(project.id) }
  const startConversation = async (projectId: string | null) => { try { const conversation = await window.appAPI.saveConversation({ projectId }); await refresh(); setSelectedId(conversation.id) } catch (error) { setNotice(errorText(error)) } }
  const openAgent = async (agent: Agent, newConversation = false) => {
    const previous = snapshot.conversations.filter(item => !item.archived && item.kind === 'direct' && item.agentIds.length === 1 && item.agentIds[0] === agent.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    if (previous && !newConversation) { setSelectedId(previous.id); return }
    try { const conversation = await window.appAPI.saveConversation({ kind: 'direct', agentIds: [agent.id], name: agent.name }); await refresh(); setSelectedId(conversation.id) }
    catch (error) { setNotice(errorText(error)) }
  }
  const submitMessage = async (value: string, modelName: string, options: { files: File[] }) => {
    if (!selected) throw new Error('Escolha uma conversa antes de enviar.')
    let input = value
    if (options.files.length) {
      const contents = await Promise.all(options.files.map(async file => { if (file.size > 100_000 || !file.type.startsWith('text/') && !/\.(md|txt|json|csv|ts|tsx|js|jsx|css|html|xml|ya?ml)$/i.test(file.name)) throw new Error(`${file.name}: anexe arquivos de texto de até 100 KB.`); return `\n\n--- ${file.name} ---\n${await file.text()}` }))
      input += contents.join('')
    }
    const selectedModel = models.find(item => item.name === modelName)?.id
    await window.appAPI.send(selected.id, input, selectedModel)
  }
  const promptModels = useMemo(() => models.map(item => ({ name: item.name, description: item.isDefault ? 'Modelo padrão do Codex' : undefined })), [models])
  const agentStates = useMemo(() => Object.fromEntries(snapshot.agents.map(agent => { const activeRuns = snapshot.runs.filter(run => run.agentId === agent.id && ['queued', 'running', 'waiting'].includes(run.status)); return [agent.id, activeRuns.some(run => run.status === 'waiting') ? 'waiting' : activeRuns.length ? 'working' : 'idle'] as const })), [snapshot.agents, snapshot.runs])

  return <div className="flex h-dvh w-full flex-col overflow-hidden bg-background font-sans text-foreground">
    <TitleBar terminalOpen={terminalOpen} onToggleTerminal={() => setTerminalOpen(value => !value)} className="border-b border-border/50" />
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <Sidebar
        snapshot={snapshot}
        selected={selected}
        unreadCounts={unreadCounts}
        agentStates={agentStates}
        onSelectConversation={setSelectedId}
        onStartConversation={startConversation}
        onOpenAgent={openAgent}
        onOpenEditor={setEditor}
        onOpenSettings={() => setSettingsOpen(true)}
        onNotice={setNotice}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {settingsOpen ? <SettingsPage onClose={() => setSettingsOpen(false)} /> : selected ? <>
          <ChatHeader
            selected={selected}
            selectedAgents={selectedAgents}
            agents={snapshot.agents}
            selectedProject={selectedProject}
            models={models}
            modelName={selectedModelName}
            onModelChange={setSelectedModelName}
            onParticipantsChange={updateParticipants}
            onOpenComputerUse={() => { setComputerOpen(true); setTerminalOpen(true) }}
            onEditConversation={() => setEditor({ kind: 'conversation', initial: selected })}
          />
          <div className="flex min-h-0 flex-1 flex-col">
            <MessageList
              messages={messages}
              conversations={snapshot.conversations}
              agentOf={agentOf}
              selectedAgents={selectedAgents}
              onOpenRelatedConversation={setSelectedId}
              onNotice={setNotice}
            />
            <Composer
              models={promptModels}
              defaultModelName={selectedModelName}
              onModelChange={setSelectedModelName}
              onSubmit={submitMessage}
              onStop={() => void window.appAPI.stop(selected.id)}
            />
          </div>
        </> : <div className="flex flex-1 items-center justify-center p-8"><div className="max-w-md text-center"><span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Bot className="size-6" /></span><h1 className="text-xl font-semibold">Seu espaço de trabalho</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Converse agora com o Assistente padrão, sem cadastrar nada. Organize conversas em projetos e, quando quiser, crie agentes para formar uma equipe.</p><div className="mt-5 flex justify-center gap-2"><Button onClick={() => void startConversation(null)}><MessageSquarePlus className="size-4" /> Nova conversa</Button><Button variant="outline" onClick={() => setEditor({ kind: 'project' })}><FolderPlus className="size-4" /> Novo projeto</Button></div>{loading && <p className="mt-4 text-xs text-muted-foreground">Carregando conversas…</p>}</div></div>}
      </main>
      {terminalOpen && <SidePanel
        computerOpen={computerOpen}
        onCloseComputer={() => setComputerOpen(false)}
        browserFrames={browserFrames.filter(frame => frame.conversationId === selected?.id)}
        agents={snapshot.agents}
        onRefreshBrowser={() => void refreshBrowser()}
        onChanged={setNotice}
        directory={selected?.directory}
      />}
    </div>
    {notice && <div role="status" className="fixed bottom-5 right-5 z-[60] max-w-md rounded-xl border border-border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-xl">{notice}</div>}
    {editor && <Editor kind={editor.kind} initial={editor.initial} projectId={editor.projectId} defaultAgentIds={editor.projectId ? snapshot.projects.find(project => project.id === editor.projectId)?.defaultAgentIds : undefined} agents={snapshot.agents} models={models} onClose={() => setEditor(null)} onSave={editor.kind === 'agent' ? saveAgent : editor.kind === 'project' ? saveProject : saveConversation} onPickFolder={() => window.appAPI.pickFolder()} />}
  </div>
}
