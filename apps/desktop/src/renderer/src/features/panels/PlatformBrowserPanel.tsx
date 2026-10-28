import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, ExternalLink, Globe, LoaderCircle, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { safeWebUrl, type ExternalBrowserStatus, type PlatformBrowserState } from '../../../../shared/platform-browser'
import type { Agent } from '../../../../shared/v9'

/** Endereço digitado sem esquema vira HTTPS; qualquer outro protocolo é recusado. */
function addressUrl(value: string): string | null {
  const text = value.trim()
  if (!text) return null
  return safeWebUrl(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : 'https://' + text)
}

/**
 * Navegador da plataforma: a página é uma WebContentsView do processo principal,
 * posicionada sobre a área medida aqui e compartilhada apenas com consentimento.
 */
export function PlatformBrowserPanel({ onNotice, workspaceId, conversationId, agents = [] }: { onNotice: (value: string) => void; workspaceId?: string | null; conversationId?: string; agents?: Agent[] }) {
  const api = window.platformBrowserAPI
  const viewport = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<PlatformBrowserState | null>(null)
  const [address, setAddress] = useState('')
  const [agentId, setAgentId] = useState('')
  const eligible = agents.filter(agent => agent.computerUse)
  const editing = useRef(false)
  const [external, setExternal] = useState<ExternalBrowserStatus | null>(null)
  const isEligible = eligible.some(agent => agent.id === agentId)
  const owner = useMemo(() => workspaceId && conversationId && agentId && isEligible ? { workspaceId, conversationId, agentId } : null, [workspaceId, conversationId, agentId, isEligible])
  useEffect(() => { setAgentId('') }, [workspaceId, conversationId])
  const sharing = state?.sharing
  const ownSharing = !!sharing && sharing.workspaceId === workspaceId && sharing.conversationId === conversationId
  // Agente que adquiriu o navegador sozinho: reflete o compartilhamento em vez de escondê-lo.
  useEffect(() => { if (sharing && ownSharing) setAgentId(sharing.agentId) }, [sharing, ownSharing, workspaceId, conversationId])
  useEffect(() => {
    setExternal(null)
    if (!api || !owner) return
    let current = true
    void api.externalStatus(owner).then(next => { if (current) setExternal(next) }).catch(() => undefined)
    return () => { current = false }
  }, [api, owner])
  useEffect(() => {
    if (!api) return
    // Sem escolha do usuário não toca no contexto: pode ser o de um agente que adquiriu o navegador.
    if (!owner) return
    void api.setSharingContext(owner).catch(() => undefined)
    return () => { void api.setSharingContext(null).catch(() => undefined) }
  }, [api, owner])
  // A view nativa só existe depois da primeira navegação; remede a área quando ela aparece.
  const hasView = state !== null
  useEffect(() => {
    if (!api) return
    let received = false
    const apply = (next: PlatformBrowserState | null) => { setState(next); if (!editing.current) setAddress(next?.url || '') }
    // Um evento que chegue antes da leitura inicial é mais recente: a leitura não o sobrescreve.
    void api.state().then(next => { if (!received) apply(next) }).catch(() => undefined)
    return api.onState(next => { received = true; apply(next) })
  }, [api])
  useEffect(() => {
    const element = viewport.current
    if (!api || !element) return
    let frame = 0
    const sync = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect()
        const visible = rect.width > 0 && rect.height > 0
        void api.setBounds({ x: Math.max(0, rect.left), y: Math.max(0, rect.top), width: Math.max(0, rect.width), height: Math.max(0, rect.height) }, visible).catch(() => undefined)
      })
    }
    const observer = new ResizeObserver(sync)
    observer.observe(element)
    observer.observe(document.body)
    window.addEventListener('resize', sync)
    sync()
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', sync)
      void api.setBounds({ x: 0, y: 0, width: 0, height: 0 }, false).catch(() => undefined)
    }
  }, [api, hasView])
  if (!api) return <p className="p-4 text-sm text-muted-foreground">O navegador da plataforma está disponível somente no Boobot Desktop.</p>
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const url = addressUrl(address)
    if (!url) { onNotice('Digite um endereço HTTP ou HTTPS.'); return }
    editing.current = false
    void api.navigate(url).catch(error => onNotice(error instanceof Error ? error.message : 'Não foi possível abrir o endereço.'))
  }
  const current = state?.url ? safeWebUrl(state.url) : null
  return <section aria-label="Navegador" className="flex h-full min-h-0 flex-col">
    <form onSubmit={submit} className="flex h-10 shrink-0 items-center gap-1 border-b border-border bg-muted/40 px-1.5">
      <Button type="button" size="icon" variant="ghost" className="size-7" aria-label="Voltar" disabled={!state?.canGoBack} onClick={() => void api.back()}><ArrowLeft className="size-4" /></Button>
      <Button type="button" size="icon" variant="ghost" className="size-7" aria-label="Avançar" disabled={!state?.canGoForward} onClick={() => void api.forward()}><ArrowRight className="size-4" /></Button>
      <Button type="button" size="icon" variant="ghost" className="size-7" aria-label="Recarregar" disabled={!state} onClick={() => void api.reload()}>{state?.loading ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCw className="size-4" />}</Button>
      <Input aria-label="Endereço" value={address} placeholder="https://" className="h-7 flex-1 text-xs" spellCheck={false}
        onFocus={() => { editing.current = true }} onBlur={() => { editing.current = false }} onChange={event => setAddress(event.target.value)} />
      <Button type="button" size="icon" variant="ghost" className="size-7" aria-label="Abrir no navegador do sistema" title="Abrir no navegador do sistema" disabled={!current}
        onClick={() => { if (current) void api.openExternal(current).catch(error => onNotice(error instanceof Error ? error.message : 'Não foi possível abrir o navegador do sistema.')) }}><ExternalLink className="size-4" /></Button>
    </form>
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-2 py-1.5 text-xs">
      <select aria-label="Agente para compartilhar" value={agentId} onChange={event => setAgentId(event.target.value)} className="min-w-0 rounded border border-input bg-background px-2 py-1" disabled={!workspaceId || !conversationId}>
        <option value="">Escolha um agente</option>{eligible.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
      </select>
      {state?.sharing ? <Button type="button" size="sm" variant="outline" onClick={() => void api.revokeSharing().catch(error => onNotice(String(error)))}>Revogar compartilhamento</Button>
        : <Button type="button" size="sm" variant="outline" disabled={!current || !workspaceId || !conversationId || !agentId} onClick={() => { if (workspaceId && conversationId && agentId) void api.grantSharing({ workspaceId, conversationId, agentId }).catch(error => onNotice(error instanceof Error ? error.message : 'Não foi possível compartilhar.')) }}>Compartilhar com agente</Button>}
      <span className="text-muted-foreground">{sharing && !ownSharing ? `Compartilhado com ${agents.find(agent => agent.id === sharing.agentId)?.name || 'um agente'} em outra conversa` : state?.sharing ? 'Agente pode ler e operar a página visível. Ações já enviadas podem concluir após revogar.' : 'Compartilhamento desativado.'}</span>
    </div>
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-2 py-1.5 text-xs">
      {external?.granted ? <Button type="button" size="sm" variant="outline" onClick={() => { if (owner) void api.setExternalGrant(owner, false).then(setExternal).catch(error => onNotice(error instanceof Error ? error.message : 'Não foi possível revogar.')) }}>Revogar navegador externo</Button>
        : <Button type="button" size="sm" variant="outline" disabled={!owner || !external} onClick={() => { if (owner) void api.setExternalGrant(owner, true).then(setExternal).catch(error => onNotice(error instanceof Error ? error.message : 'Não foi possível autorizar.')) }}>Autorizar navegador externo</Button>}
      <span className={external?.granted ? 'font-medium text-foreground' : 'text-muted-foreground'}>{external?.granted ? 'Navegador externo autorizado para este agente nesta conversa (Brave/Chrome pela extensão oficial do provider). Revogue para recusar as próximas chamadas.' : 'Navegador externo desativado (Brave/Chrome pela extensão oficial do provider). O agente poderá ler e agir em qualquer site em que você está logado, incluindo cookies e dados salvos, até você revogar.'}</span>
      {external?.granted && external.problems.length > 0 && <span role="status" className="text-destructive">Indisponível: {external.problems.join('; ')}.</span>}
    </div>
    {state?.error && <p role="alert" className="shrink-0 border-b border-border px-3 py-1.5 text-xs text-destructive">{state.error}</p>}
    <div ref={viewport} data-testid="platform-browser-viewport" className="relative min-h-0 flex-1 bg-background">
      {!state && <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground"><Globe className="size-8 opacity-50" /><p className="text-sm">Digite um endereço ou clique num link da conversa.</p><p className="text-xs">Ctrl+clique num link abre no navegador do sistema.</p></div>}
    </div>
  </section>
}
