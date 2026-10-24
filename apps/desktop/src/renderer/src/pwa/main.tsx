import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { AlertCircle, ArrowRight, LoaderCircle } from 'lucide-react'
import App from '../App'
import { request, type RemoteStatus } from './api'
import { syncPwaStatus } from './remote-api'
import '../index.css'
import './pwa.css'

function Pwa() {
  const [status, setStatus] = useState<RemoteStatus | null>(null)
  const [pairCode, setPairCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const refresh = useCallback(async () => {
    try { setStatus(await syncPwaStatus()); setError('') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível conectar ao host.') }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    if (!status?.paired) return
    const timer = window.setInterval(() => { if (!document.hidden) void refresh() }, 4000)
    return () => clearInterval(timer)
  }, [status?.paired, refresh])
  const pair = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true)
    try {
      await request('/api/pair', { code: pairCode.trim(), device: navigator.userAgent.slice(0, 50) })
      setPairCode('')
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível parear este dispositivo.') }
    finally { setBusy(false) }
  }
  if (status?.paired) return <App />
  return <div className="boobot-pwa-pair flex min-h-dvh items-center justify-center p-5">
    <div className="w-full max-w-md space-y-5 rounded-xl border border-border bg-card p-7 shadow-xl">
      <div className="flex items-center gap-3 border-b border-border pb-4"><img src="/icon.svg" className="size-12" alt="Boobot" />
        <div><p className="text-xl font-semibold tracking-tight">BOOBOT</p><p className="text-xs text-muted-foreground">Acesse seu host pelo navegador.</p></div></div>
      <h1 className="text-xl font-semibold tracking-tight">Conectar ao seu host</h1>
      <p className="text-sm text-muted-foreground">A interface do computador, com os mesmos projetos, sessões e agentes. O trabalho continua sendo executado no host.</p>
      <form onSubmit={pair} className="space-y-3"><label htmlFor="pair-code" className="block text-xs font-medium">Código de oito dígitos</label>
        <input id="pair-code" aria-label="Código de oito dígitos" inputMode="numeric" pattern="[0-9]{8}" maxLength={8} required autoComplete="one-time-code"
          value={pairCode} onChange={event => setPairCode(event.target.value)} placeholder="00000000"
          className="w-full rounded-lg border border-input bg-background p-3 text-center font-mono text-xl tracking-[.3em] outline-none focus:ring-2 focus:ring-ring" />
        <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}Conectar dispositivo</button>
        {error && <p role="alert" className="flex items-center gap-2 text-xs text-destructive"><AlertCircle size={14}/>{error}</p>}
      </form>
      <p className="text-xs leading-5 text-muted-foreground">No Boobot do computador, acesse Configurações → Conexões → Acesso PWA → Gerar código. O código é válido por 3 minutos.</p>
    </div>
  </div>
}

createRoot(document.getElementById('root')!).render(<Pwa />)
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined)
