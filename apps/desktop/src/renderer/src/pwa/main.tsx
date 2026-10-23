/* eslint-disable react-refresh/only-export-components -- PWA single entrypoint. */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { AlertCircle, ArrowRight, Check, ChevronRight, CodeXml, FileCode, FileDiff, Folder, GitBranch, LayoutPanelLeft,
  LoaderCircle, Menu, MessageCircle, PanelRight, RefreshCcw, ShieldCheck, Square, Wifi, WifiOff, X } from 'lucide-react'
import type { Agent } from '../../../shared/v9'
import { PoliAvatar } from '../features/app/PoliAvatar'
import { MessageMarkdown } from '../features/chat/MessageMarkdown'
import { RunProgress } from '../features/chat/RunProgress'
import { Message, MessageContent, MessageHeader } from '@/components/ui/message'
import { Trace, TraceLine, TraceTitle } from '@/components/ui/trace'
import { MessageBubble } from '@/components/ai/message-bubble'
import { PromptInput } from '@/components/ai/prompt-input'
import { Button } from '@/components/ui/button'
import AITextLoading from '@/components/kokonutui/ai-text-loading'
import { request, rpc, type RemoteBoo, type RemoteConversation, type RemoteMessage, type RemoteSnapshot, type RemoteStatus } from './api'
import logo from '../../public/boobot-mascot.svg?url'
import '../index.css'
import './pwa.css'

function Boo({ boo, size = 42, working = false }: { boo?: RemoteBoo; size?: number; working?: boolean }) {
  if (!boo) return <span className="flex items-center justify-center rounded-xl border border-border bg-muted" style={{ width: size, height: size }}><MessageCircle size={size * .45} /></span>
  const agent = { ...boo, alias: boo.alias || '', description: '', instructions: '', runtime: 'codex',
    model: '', avatar: '', canWrite: true, computerUse: false, approvalMode: 'ask', revision: 1, createdAt: '' } as Agent
  return <PoliAvatar agent={agent} size={size} state={working ? 'working' : 'idle'} motionPolicy={working ? 'hover' : 'never'} />
}
const initial: RemoteSnapshot = { agents: [], workspaces: [], conversations: [], runs: [], approvals: [] }
function getError(error: unknown) { return error instanceof Error ? error.message : 'Erro inesperado.' }
function MenuItem({ children, active, onClick, icon }: { children: React.ReactNode; active?: boolean; onClick: () => void; icon?: React.ReactNode }) {
  return <button type="button" onClick={onClick}
    className={`boobot-pwa-nav flex w-full items-center gap-2.5 rounded-md border-l-2 px-2.5 py-2 text-left text-xs transition-colors ${active ? 'border-foreground bg-sidebar-accent text-sidebar-accent-foreground' : 'border-transparent text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground'}`}>
    {icon}<span className="min-w-0 flex-1 truncate">{children}</span>{active && <ChevronRight size={13} />}
  </button>
}
function Pwa() {
  const [status, setStatus] = useState<RemoteStatus | null>(null)
  const [snapshot, setSnapshot] = useState(initial)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<RemoteMessage[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [pairCode, setPairCode] = useState('')
  const [pairError, setPairError] = useState('')
  const [busy, setBusy] = useState(false)
  const [chatText, setChatText] = useState('')
  const [sidebar, setSidebar] = useState(false)
  const [inspector, setInspector] = useState(false)
  const [panel, setPanel] = useState<'activity' | 'files' | 'diff'>('activity')
  const [files, setFiles] = useState<{ name: string; directory?: boolean }[]>([])
  const [diff, setDiff] = useState('')
  const [online, setOnline] = useState(true)
  const [notice, setNotice] = useState('')
  const [sending, setSending] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const selectedWorkspace = snapshot.workspaces.find(w => w.id === workspaceId)
  const selectedConversation = snapshot.conversations.find(c => c.id === conversationId)
  const selectedBoos = useMemo(() => snapshot.agents.filter(a => selectedConversation?.agentIds?.includes(a.id)), [selectedConversation, snapshot.agents])
  const canChat = !!status?.capabilities?.includes('chat')
  const canApprove = !!status?.capabilities?.includes('approvals')
  const runs = snapshot.runs.filter(r => r.workspaceId === workspaceId)
  const activeRun = runs.some(r => r.conversationId === conversationId && ['running', 'queued', 'waiting'].includes(r.status))
  const doRequest = useCallback(async (method: string, ...args: unknown[]) => {
    try { return await rpc<unknown>(method, ...args) }
    catch (error) { setNotice(getError(error)); throw error }
  }, [])
  const refresh = useCallback(async () => {
    if (document.hidden) return
    try {
      const [info, data] = await Promise.all([request<RemoteStatus>('/api/status'), rpc<RemoteSnapshot>('v9:snapshot')])
      setStatus(info); setSnapshot(data); setOnline(true)
    } catch (error) {
      setOnline(false); setNotice(getError(error))
      if ([401, 409].includes((error as { status?: number }).status || 0)) setStatus({ paired: false })
    }
  }, [])
  useEffect(() => {
    let mounted = true
    request<RemoteStatus>('/api/status').then(info => { if (!mounted) return; setStatus(info); if (info.paired) void refresh() })
      .catch(error => { if (mounted) setPairError(getError(error)) })
    return () => { mounted = false }
  }, [refresh])
  useEffect(() => {
    if (!status?.paired) return
    const id = window.setInterval(() => { void refresh() }, 7000)
    return () => clearInterval(id)
  }, [status?.paired, refresh])
  useEffect(() => {
    if (!conversationId || !status?.paired) return
    let cancelled = false
    setMessagesLoading(true)
    const fetchMessages = async () => {
      try {
        const page = await rpc<{ messages: RemoteMessage[] }>('v9:historyPage', conversationId, null, 100)
        if (!cancelled) setMessages(page.messages || [])
      } catch (error) { if (!cancelled) setNotice(getError(error)) }
      finally { if (!cancelled) setMessagesLoading(false) }
    }
    void fetchMessages()
    const id = window.setInterval(() => { if (!document.hidden) void fetchMessages() }, 3000)
    return () => { cancelled = true; clearInterval(id) }
  }, [conversationId, status?.paired])
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }) }, [messages.length, conversationId])
  useEffect(() => {
    if (!workspaceId) return
    if (panel === 'files') void doRequest('v9:listProjectFiles', workspaceId, '').then(value => setFiles(Array.isArray(value) ? value : [])).catch(() => undefined)
    if (panel === 'diff') void doRequest('v9:workspaceDiff', workspaceId).then(value => setDiff(typeof value === 'string' ? value : '')).catch(() => undefined)
  }, [panel, workspaceId, doRequest])
  const chooseWorkspace = (id: string) => { setWorkspaceId(id); setConversationId(null); setMessages([]); setSidebar(false); setPanel('activity') }
  const chooseConversation = (id: string) => { setConversationId(id); setMessages([]); setSidebar(false); setChatText('') }
  const pair = async (event: FormEvent) => {
    event.preventDefault(); setPairError(''); setBusy(true)
    try {
      await request('/api/pair', { code: pairCode.trim(), device: navigator.userAgent.slice(0, 50) })
      const info = await request<RemoteStatus>('/api/status'); setStatus(info); setPairCode(''); await refresh()
    } catch (error) { setPairError(getError(error)) }
    finally { setBusy(false) }
  }
  const send = async (value: string) => {
    const text = value.trim()
    if (!text || !conversationId || !canChat || sending) return
    setSending(true); setNotice('')
    try {
      await doRequest('v9:send', conversationId, text)
      setChatText(''); setNotice('Mensagem enviada ao host. O Boo está processando a solicitação.')
      void refresh()
    } catch { /* notice from doRequest */ }
    finally { setSending(false) }
  }
  const stop = async () => {
    if (!conversationId) return
    try { await doRequest('v9:stop', conversationId); setNotice('Solicitação de parada enviada ao host.') }
    catch { /* notice from doRequest */ }
  }
  const approve = async (id: string, approved: boolean) => {
    if (!canApprove) return
    try { await doRequest('v9:respondApproval', id, approved); setNotice(approved ? 'Aprovação enviada.' : 'Solicitação negada.'); await refresh() }
    catch { /* notice from doRequest */ }
  }
  if (!status?.paired) return <div className="boobot-pwa-pair flex min-h-dvh items-center justify-center p-5">
    <div className="w-full max-w-md space-y-5 rounded-xl border border-border bg-card p-7 shadow-xl">
      <div className="flex items-center gap-3 border-b border-border pb-4"><img src={logo} className="size-12" alt="Boobot" />
        <div><p className="text-xl font-semibold tracking-tight">BOOBOT</p><p className="text-xs text-muted-foreground">Seu espaço de trabalho, em qualquer tela.</p></div></div>
      <h1 className="text-xl font-semibold tracking-tight">Conectar ao seu host</h1>
      <p className="text-sm text-muted-foreground">A mesma experiência do Boobot, conectada aos agentes e projetos do seu computador.</p>
      <form onSubmit={pair} className="space-y-3"><label htmlFor="pair-code" className="block text-xs font-medium">Código de oito dígitos</label>
        <input id="pair-code" aria-label="Código de oito dígitos" inputMode="numeric" pattern="[0-9]{8}" maxLength={8}
          required autoComplete="one-time-code" value={pairCode} onChange={e => setPairCode(e.target.value)}
          placeholder="00000000" className="w-full rounded-lg border border-input bg-background p-3 text-center font-mono text-xl tracking-[.3em] outline-none focus:ring-2 focus:ring-ring" />
        <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}Conectar dispositivo</button>
        {pairError && <p role="alert" className="flex items-center gap-2 text-xs text-destructive"><AlertCircle size={14}/>{pairError}</p>}
      </form>
      <p className="text-xs leading-5 text-muted-foreground">Abra o Boobot no computador e acesse Configurações → Conexões → Acesso PWA → Gerar código. O código é válido por 3 minutos.</p>
    </div>
  </div>
  return <div className="boobot-pwa h-dvh overflow-hidden bg-background text-foreground">
    <header className="glass-header flex h-10 items-center justify-between border-b border-border px-3">
      <div className="flex items-center gap-2.5"><button className="rounded-md p-1.5 hover:bg-accent md:hidden" onClick={() => setSidebar(true)} aria-label="Abrir menu"><Menu size={17}/></button>
        <img src={logo} alt="" className="h-5 w-5" /><span className="text-xs font-bold tracking-tight">BOOBOT</span>
        <span className="hidden border-l border-border pl-3 text-[11px] text-muted-foreground sm:block">Espaço de trabalho</span></div>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="hidden truncate sm:block">{status.host?.name || 'Host'}</span>
        {online ? <Wifi size={14} className="text-emerald-500" /> : <WifiOff size={14} className="text-red-400" />}
        <button type="button" onClick={() => void refresh()} aria-label="Atualizar"><RefreshCcw className="size-3.5"/></button>
      </div>
    </header>
    <div className="relative flex h-[calc(100dvh-40px)] min-h-0">
      {sidebar && <button onClick={() => setSidebar(false)} className="fixed inset-0 z-30 bg-black/50 md:hidden" aria-label="Fechar menu" />}
      <aside className={`boobot-sidebar boobot-pwa-sidebar fixed inset-y-10 left-0 z-40 flex w-[282px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform md:static md:z-auto md:translate-x-0 ${sidebar ? 'translate-x-0' : '-translate-x-full'}`} aria-label="Barra lateral do Boobot">
        <div className="space-y-1 border-b border-sidebar-border px-3 py-3">
          <div className="flex items-center justify-between px-2 pb-2 text-[11px] font-semibold text-muted-foreground"><span>WORKSPACE</span><button onClick={() => setSidebar(false)} className="md:hidden" aria-label="Fechar menu"><X size={16}/></button></div>
          <MenuItem onClick={() => { setWorkspaceId(null); setConversationId(null); setSidebar(false) }} active={!workspaceId} icon={<LayoutPanelLeft size={17}/>} >Visão geral</MenuItem>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
          <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Projetos</p>
          {snapshot.workspaces.filter(w => !w.archived).map(w => <MenuItem key={w.id} active={workspaceId===w.id} onClick={() => chooseWorkspace(w.id)} icon={<Folder size={16}/>}>{w.name}</MenuItem>)}
          {workspaceId && <>
            <p className="mb-2 mt-6 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Conversas</p>
            {snapshot.conversations.filter(c => c.workspaceId===workspaceId && !c.archived).map(c => {
              const boo = snapshot.agents.find(a => c.agentIds?.includes(a.id))
              return <MenuItem key={c.id} active={conversationId===c.id} onClick={() => chooseConversation(c.id)}
                icon={<Boo boo={boo} size={37} />}>{c.name}</MenuItem>
            })}
          </>}
          <p className="mb-2 mt-6 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Seus Boos</p>
          <div className="grid grid-cols-3 gap-2 px-1">
            {snapshot.agents.map(agent => <div key={agent.id} className="flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 hover:bg-sidebar-accent" title={agent.name}>
              <Boo boo={agent} size={58} /><span className="max-w-full truncate text-[10px] font-medium">{agent.name}</span></div>)}
          </div>
          {!snapshot.agents.length && <p className="px-2 text-xs text-muted-foreground">Seus Boos aparecerão aqui.</p>}
        </div>
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center justify-between gap-2 rounded-lg bg-sidebar-accent/70 px-3 py-2 text-xs"><span className="flex items-center gap-2"><Wifi size={13} className="text-emerald-500" /><span className="max-w-32 truncate">{status.host?.name}</span></span><span className="text-[10px] text-muted-foreground">{canChat ? 'Chat ativo' : 'Leitura'}</span></div>
          <button onClick={async () => { await request('/api/logout', {}); setStatus({ paired: false }); setSnapshot(initial); setWorkspaceId(null); setConversationId(null) }}
            className="mt-2 px-2 text-[11px] text-muted-foreground hover:text-foreground">Desconectar dispositivo</button>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-[59px] items-center justify-between gap-3 border-b border-border px-3 md:px-5">
          <div className="min-w-0"><div className="flex items-center gap-1 text-[10px] text-muted-foreground">{selectedWorkspace?.name || 'Visão geral'}
            {selectedWorkspace && <><ChevronRight size={11} />{selectedConversation?.name || 'Conversas'}</>}</div>
            <h1 className="truncate text-sm font-semibold">{selectedConversation?.name || selectedWorkspace?.name || 'Painel dos Boos'}</h1></div>
          <div className="flex items-center gap-2">
            {selectedBoos.slice(0,3).map(boo => <Boo key={boo.id} boo={boo} size={38} working={activeRun} />)}
            <button onClick={() => setInspector(true)} className="rounded-md border border-border p-2 hover:bg-accent lg:hidden" aria-label="Abrir detalhes do projeto"><PanelRight size={16} /></button>
          </div>
        </div>
        {!conversationId ? <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5 md:p-10">
          <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 text-center">
            <div className="flex items-end gap-1.5">{snapshot.agents.slice(0,4).map((boo,i) => <Boo key={boo.id} boo={boo} size={i===1?96:74} />)}</div>
            <h2 className="mt-3 text-xl font-semibold tracking-tight md:text-2xl">Seus Boos, de onde você estiver.</h2>
            <p className="max-w-lg text-sm leading-6 text-muted-foreground">Escolha um projeto e uma conversa para continuar o trabalho do mesmo computador que está executando o Boobot.</p>
            <div className="mt-4 grid w-full grid-cols-3 gap-3">
              {([[snapshot.workspaces.length,'Projetos'],[snapshot.conversations.length,'Conversas'],[snapshot.agents.length,'Boos']] as const).map(([value,label])=>
                <div key={label} className="rounded-xl border border-border bg-card p-4"><strong className="block text-2xl">{value}</strong><span className="text-xs text-muted-foreground">{label}</span></div>)}
            </div>
            <div className="mt-5 grid w-full gap-2 text-left">
              {snapshot.conversations.filter(c=>!c.archived && (!workspaceId || c.workspaceId === workspaceId)).slice(0,5).map(c=>{
                const boo = snapshot.agents.find(a => c.agentIds?.includes(a.id))
                return <button key={c.id} onClick={() => { setWorkspaceId(c.workspaceId); chooseConversation(c.id) }}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-left hover:bg-accent/40">
                  <Boo boo={boo} size={50} /><span className="flex-1 text-sm font-medium">{c.name}</span><ChevronRight size={16}/></button>
              })}
            </div>
          </div>
        </div> :
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="boobot-pwa-messages min-h-0 flex-1 overflow-y-auto px-3 py-5 md:px-8" aria-label="Histórico da conversa">
              <div className="mx-auto flex max-w-[850px] flex-col gap-5">
                {messagesLoading && !messages.length && <AITextLoading texts={['Carregando conversa…']} label="Carregando conversa" className="py-8 text-sm font-normal text-muted-foreground" />}
                {!messagesLoading && !messages.length && <p className="py-8 text-center text-xs text-muted-foreground">Esta conversa ainda não tem mensagens.</p>}
                {messages.map(m => {
                  const mine = m.role === 'user'
                  const boo = snapshot.agents.find(a => a.id === m.agentId) || selectedBoos[0]
                  if (m.role === 'activity') return <Trace key={m.id} role="status"><TraceLine status={m.status === 'failed' ? 'error' : m.status === 'running' ? 'running' : m.status === 'queued' ? 'pending' : 'complete'}><TraceTitle>{m.text}</TraceTitle></TraceLine></Trace>
                  return <Message key={m.id} align={mine ? 'end' : 'start'} data-message-id={m.id}>
                    {!mine && <Boo boo={boo} size={42} />}
                    <MessageContent className={mine ? 'w-fit max-w-[85%]' : 'max-w-[90%]'}>
                      <MessageHeader className="px-0">{mine ? 'Você' : boo?.name || m.author || 'Boobot'}</MessageHeader>
                      {mine ? <MessageBubble from="user" className="whitespace-pre-wrap" status={m.status === 'failed' ? 'failed' : m.status === 'queued' || m.status === 'running' ? 'sending' : 'sent'}>{m.text}</MessageBubble>
                        : <>
                          <RunProgress status={m.status || 'completed'} agentName={boo?.name || m.author || 'Boobot'} />
                          {m.status === 'queued' && !m.text ? <AITextLoading texts={['Aguardando resposta…']} label="Aguardando resposta" className="justify-start text-sm font-normal text-muted-foreground" /> : <MessageMarkdown>{m.text}</MessageMarkdown>}
                        </>}
                    </MessageContent>
                  </Message>
                })}
                <div ref={bottom} />
              </div>
            </div>
            <div className="border-t border-border bg-background p-3 md:px-8 md:py-4">
              <fieldset disabled={!canChat || sending} className="mx-auto min-w-0 max-w-[850px]">
                <PromptInput value={chatText} onValueChange={setChatText} onSubmit={value => void send(value)}
                  textareaLabel="Mensagem para o Boo" showModelPicker={false} showAttachments={false}
                  extraControls={activeRun && canChat ? <Button type="button" variant="ghost" size="icon" aria-label="Parar agente" onClick={() => void stop()}><Square /></Button> : undefined}
                  placeholder={canChat ? 'Envie uma mensagem para seus Boos…' : 'Autorize mensagens para este dispositivo nas configurações do Boobot.'} />
              </fieldset>
              <p className="mx-auto mt-1.5 max-w-[850px] text-center text-[10px] text-muted-foreground">{canChat ? 'Mensagens enviadas ao mesmo host. O processamento continua no Boobot do computador.' : 'Para enviar mensagens, autorize este dispositivo em Configurações → Conexões → Acesso PWA, no Boobot do computador.'}</p>
            </div>
          </div>
        }
        {notice && <div role="status" className="absolute bottom-24 left-1/2 z-20 max-w-[80vw] -translate-x-1/2 rounded-lg border border-border bg-popover p-3 text-xs text-popover-foreground shadow-xl" onClick={() => setNotice('')}>{notice}<button className="ml-2" aria-label="Fechar alerta"><X size={13}/></button></div>}
      </main>
      {inspector && <button className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setInspector(false)} aria-label="Fechar detalhes" />}
      <aside className={`boobot-pwa-inspector fixed inset-y-10 right-0 z-40 flex w-[min(360px,90vw)] flex-col border-l border-border bg-card transition-transform lg:static lg:z-auto lg:w-[320px] lg:translate-x-0 ${inspector ? 'translate-x-0' : 'translate-x-full'}`} id="inspector">
        <div className="flex min-h-[59px] items-center justify-between border-b border-border px-3">
          <span className="text-xs font-semibold">Detalhes</span><button className="p-1 lg:hidden" aria-label="Fechar detalhes" onClick={() => setInspector(false)}><X size={17}/></button>
        </div>
        <div className="flex gap-1 border-b border-border p-2">
          {([['activity','Atividade'],['files','Arquivos'],['diff','Diff']] as const).map(([key,label]) =>
            <button key={key} onClick={() => setPanel(key)} className={`flex-1 rounded-md px-1.5 py-2 text-xs ${panel===key?'bg-accent text-accent-foreground':'text-muted-foreground hover:bg-accent/40'}`}>{label}</button>)}
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-3 text-xs">
          {!workspaceId ? <p className="text-muted-foreground">Selecione um projeto para ver os detalhes.</p> : panel==='activity' ?
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-background p-3"><strong>{selectedWorkspace?.name}</strong>
                <p className="mt-1 flex items-center gap-1 text-muted-foreground"><GitBranch size={13}/>{selectedWorkspace?.branch || 'Workspace'}</p></div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Execuções</h3>
              {runs.slice(-15).reverse().map(r => <div className="rounded-lg border border-border p-3" key={r.id}>
                <span className="text-[11px] font-semibold">{snapshot.agents.find(a=>a.id===r.agentId)?.name || 'Boo'}</span>
                <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-muted-foreground">{r.input || 'Execução'}</p><span className="mt-2 inline-block text-[10px] text-muted-foreground">{r.status}</span>
              </div>)}
              {!!snapshot.approvals.length && <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Aprovações pendentes</h3>}
              {snapshot.approvals.map(a => <div className="space-y-2 rounded-lg border border-border p-3" key={a.id}><div className="flex items-center gap-1"><AlertCircle size={14} className="text-amber-500" /><strong>{a.kind}</strong></div>
                <p className="break-all text-muted-foreground">{a.details?.action || a.details?.path || 'Solicitação do agente'}</p>
                {canApprove ? <div className="flex gap-2"><button className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground" onClick={()=>void approve(a.id,true)}><Check size={13} className="inline"/> Aprovar</button>
                  <button className="rounded-md border border-border px-3 py-1.5" onClick={()=>void approve(a.id,false)}>Negar</button></div>:
                  <p className="text-muted-foreground">Aprove pelo Boobot no computador ou autorize aprovações para este dispositivo.</p>}</div>)}
            </div> : panel==='files' ?
              <div><p className="mb-3 text-muted-foreground">Arquivos no host (leitura)</p>{files.slice(0,200).map(f=><div key={f.name} className="flex gap-2 border-b border-border/60 py-2 text-muted-foreground">{f.directory?<Folder size={15}/>:<FileCode size={15}/>}<span className="break-all">{f.name}</span></div>)}</div> :
              <div><p className="mb-3 flex items-center gap-1 text-muted-foreground"><FileDiff size={14}/> Alterações</p><pre className="whitespace-pre-wrap break-all text-[11px] leading-5 text-muted-foreground">{diff.slice(0,160000) || 'Sem alterações.'}</pre></div>
          }
        </div>
      </aside>
    </div>
  </div>
}
createRoot(document.getElementById('root')!).render(<Pwa />)
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined)
