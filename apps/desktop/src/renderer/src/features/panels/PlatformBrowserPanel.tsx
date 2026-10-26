import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, ExternalLink, Globe, LoaderCircle, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { safeWebUrl, type PlatformBrowserState } from '../../../../shared/platform-browser'

/** Endereço digitado sem esquema vira HTTPS; qualquer outro protocolo é recusado. */
function addressUrl(value: string): string | null {
  const text = value.trim()
  if (!text) return null
  return safeWebUrl(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : 'https://' + text)
}

/**
 * Navegador da plataforma: a página é uma WebContentsView do processo principal,
 * posicionada sobre a área medida aqui. Não usa a sessão do navegador dos agentes.
 */
export function PlatformBrowserPanel({ onNotice }: { onNotice: (value: string) => void }) {
  const api = window.platformBrowserAPI
  const viewport = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<PlatformBrowserState | null>(null)
  const [address, setAddress] = useState('')
  const editing = useRef(false)
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
    {state?.error && <p role="alert" className="shrink-0 border-b border-border px-3 py-1.5 text-xs text-destructive">{state.error}</p>}
    <div ref={viewport} data-testid="platform-browser-viewport" className="relative min-h-0 flex-1 bg-background">
      {!state && <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground"><Globe className="size-8 opacity-50" /><p className="text-sm">Digite um endereço ou clique num link da conversa.</p><p className="text-xs">Ctrl+clique num link abre no navegador do sistema.</p></div>}
    </div>
  </section>
}
