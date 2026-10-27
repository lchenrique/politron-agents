import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AgentTerminalSession } from '../../../../shared/v9'

const MAX_OUTPUT = 32_000
const STATUS_LABEL: Record<AgentTerminalSession['status'], string> = { running: 'em execução', completed: 'concluído', failed: 'falhou', interrupted: 'interrompido', timed_out: 'tempo esgotado' }

/**
 * Saída das PTYs que os agentes desta conversa iniciaram no host do workspace (local ou remoto).
 * Somente leitura: o texto do agente nunca passa pelo terminal manual do usuário.
 */
export function AgentTerminalSessions({ workspaceId, conversationId }: { workspaceId: string; conversationId: string }) {
  const [sessions, setSessions] = useState<AgentTerminalSession[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(0)
  const outputs = useRef(new Map<string, string>())
  const container = useRef<HTMLDivElement>(null)
  const term = useRef<Terminal | null>(null)
  const selectedRef = useRef<string | null>(null)
  selectedRef.current = selectedId
  const requestVersion = useRef(0)

  const load = useCallback(() => {
    const version = ++requestVersion.current
    void window.appAPI.agentTerminalSessions(conversationId, workspaceId).then(list => {
      if (version !== requestVersion.current) return
      outputs.current = new Map(list.map(item => [item.id, item.output]))
      setSessions(list.map(({ output: _output, ...session }) => session))
      setSelectedId(current => current && list.some(item => item.id === current) ? current : list.at(-1)?.id || null)
      setError('')
      setLoaded(value => value + 1)
    }).catch(reason => {
      if (version !== requestVersion.current) return
      outputs.current = new Map()
      setSessions([])
      setSelectedId(null)
      setLoaded(value => value + 1)
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os processos dos agentes.')
    })
  }, [conversationId, workspaceId])

  useEffect(() => {
    // Fail closed on scope changes; do not retain another conversation's terminal output.
    requestVersion.current++
    outputs.current = new Map()
    setSessions([])
    setSelectedId(null)
    setError('')
    setLoaded(value => value + 1)
    load()
    const unsubscribe = window.appAPI.onEvent(event => {
      if (event.type === 'changed' && event.reason === 'connection-restored') { load(); return }
      if (event.type !== 'agentTerminal' || event.session.conversationId !== conversationId || event.session.workspaceId !== workspaceId) return
      const { session } = event
      if (event.event === 'output' && event.data) {
        outputs.current.set(session.id, ((outputs.current.get(session.id) || '') + event.data).slice(-MAX_OUTPUT))
        if (selectedRef.current === session.id) term.current?.write(event.data)
        return
      }
      setSessions(current => current.some(item => item.id === session.id) ? current.map(item => item.id === session.id ? session : item) : [...current, session])
      if (event.event === 'started') setSelectedId(session.id)
    })
    return () => { requestVersion.current++; unsubscribe() }
  }, [conversationId, workspaceId, load])

  useEffect(() => {
    if (!container.current) return
    const style = getComputedStyle(document.documentElement)
    const instance = new Terminal({ disableStdin: true, convertEol: true, fontSize: 12, scrollback: 5000, allowTransparency: true,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, "Courier New", monospace',
      theme: { background: 'transparent', foreground: style.getPropertyValue('--foreground').trim() || '#ececf1' } })
    const fit = new FitAddon()
    instance.loadAddon(fit)
    instance.open(container.current)
    term.current = instance
    const observer = new ResizeObserver(() => { try { fit.fit() } catch { /* painel oculto */ } })
    observer.observe(container.current)
    return () => { observer.disconnect(); instance.dispose(); term.current = null }
  }, [])

  useEffect(() => {
    term.current?.reset()
    if (selectedId) term.current?.write(outputs.current.get(selectedId) || '')
  }, [selectedId, loaded])

  const stop = (session: AgentTerminalSession) => {
    void window.appAPI.agentTerminalStop(session.id, conversationId, workspaceId).catch(reason => setError(reason instanceof Error ? reason.message : 'Não foi possível parar o processo.'))
  }
  return <div className="flex h-full min-h-0 flex-col">
    {error && <p role="alert" className="shrink-0 px-3 py-1.5 text-xs text-destructive">{error}</p>}
    {sessions.length > 0 ? <ul aria-label="Processos dos agentes" className="max-h-28 shrink-0 overflow-y-auto border-b border-border">
      {[...sessions].reverse().map(session => <li key={session.id} className={'flex items-center gap-2 px-2 py-1 text-[11px] ' + (session.id === selectedId ? 'bg-accent' : '')}>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-pressed={session.id === selectedId} onClick={() => setSelectedId(session.id)} title={session.cwd}>
          <span aria-hidden="true" className={'size-2 shrink-0 rounded-full ' + (session.status === 'running' ? 'bg-success' : session.status === 'completed' ? 'bg-muted-foreground' : 'bg-destructive')} />
          <span className="shrink-0 font-medium">{session.agentName}</span>
          <code className="min-w-0 flex-1 truncate font-mono text-muted-foreground">{session.command}</code>
          <span className="shrink-0 text-muted-foreground">{STATUS_LABEL[session.status]}{session.exitCode !== null ? ` · ${session.exitCode}` : ''}</span>
        </button>
        {session.status === 'running' && <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[11px]" aria-label={`Parar ${session.command}`} onClick={() => stop(session)}><Square className="mr-1 size-3" />Parar</Button>}
      </li>)}
    </ul> : <p className="shrink-0 px-3 py-2 text-xs text-muted-foreground">Os comandos executados pelos agentes desta conversa aparecem aqui.</p>}
    <div ref={container} data-testid="agent-terminal-output" className="min-h-0 flex-1 overflow-hidden px-2 py-1" />
  </div>
}
