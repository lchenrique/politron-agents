import { useEffect, useState } from 'react'
import { Copy, KeyRound, ShieldCheck, Smartphone, Unplug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PwaDesktopStatus } from '../../../../shared/pwa-desktop'

export function PwaSettingsPanel() {
  const api = window.pwaAPI
  const [status, setStatus] = useState<PwaDesktopStatus | null>(null)
  const [pairing, setPairing] = useState<{ code: string; expires: number; url: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    if (!api) return
    let alive = true
    void api.status().then(value => { if (alive) setStatus(value) }).catch(error => { if (alive) setFeedback(String(error)) })
    return () => { alive = false }
  }, [api])
  const perform = async (action: () => Promise<void>) => {
    setBusy(true); setFeedback('')
    try { await action() } catch (error) { setFeedback(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  if (!api) return <p className="text-xs text-muted-foreground">Configure a PWA no aplicativo para Windows.</p>
  return <div className="space-y-3">
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
      <p className="flex items-center gap-2 font-medium text-foreground"><ShieldCheck className="size-4 text-emerald-500" />Gateway privado · modo leitura</p>
      <p className="mt-1">O gateway aceita conexões somente no próprio PC (porta 6780). Para acessar pelo celular, use HTTPS privado com Tailscale Serve, sem abrir esta porta no roteador.</p>
      <p className="mt-2">{status?.running ? `Gateway ativo · ${status.sessions} dispositivo(s) pareado(s).` : 'Iniciando gateway…'}</p>
    </div>
    <div className="flex flex-wrap gap-2">
      <Button disabled={busy || !status?.running} onClick={() => void perform(async () => {
        setPairing(await api.issueCode())
        setStatus(await api.status())
        setFeedback('Código temporário gerado para um único pareamento.')
      })}><Smartphone data-icon="inline-start" />Gerar código PWA</Button>
      <Button variant="outline" disabled={busy || !status?.running} onClick={() => void perform(async () => {
        const value = await api.revokeAll()
        setStatus(value); setPairing(null); setFeedback('Todos os dispositivos foram desconectados.')
      })}><Unplug data-icon="inline-start" />Revogar dispositivos</Button>
    </div>
    {pairing && pairing.expires > Date.now() && <div className="rounded-lg border border-primary/50 bg-primary/5 p-3">
      <p className="mb-1 flex items-center gap-2 text-xs font-semibold"><KeyRound className="size-3.5" />Código válido por 3 minutos</p>
      <p className="font-mono text-3xl font-bold tracking-[.25em]">{pairing.code}</p>
      <p className="mt-2 text-xs text-muted-foreground">Abra o navegador do dispositivo em <strong>{pairing.url}</strong> (neste PC) ou no endereço HTTPS do Tailscale Serve (no celular).</p>
      <Button size="sm" variant="outline" className="mt-2" onClick={() => { void navigator.clipboard.writeText(pairing.code).then(() => setFeedback('Código copiado.')).catch(() => setFeedback('Não foi possível copiar.')) }}><Copy data-icon="inline-start" />Copiar código</Button>
    </div>}
    <p className="text-xs text-muted-foreground">Um código novo invalida o anterior. A sessão dura no máximo 12 horas, não autoriza comandos, edição de arquivos, aprovações ou envio de mensagens e pode ser revogada neste PC.</p>
    {feedback && <p role="status" className="text-xs text-muted-foreground">{feedback}</p>}
  </div>
}
