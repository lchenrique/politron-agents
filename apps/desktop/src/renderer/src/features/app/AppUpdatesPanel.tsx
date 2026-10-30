import { useEffect, useState } from 'react'
import { Download, RefreshCcw, ShieldCheck } from 'lucide-react'
import type { ReleaseChannel, UpdateSnapshot } from '../../../../shared/updates'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { errorText } from './appShellShared'

const descriptions: Record<UpdateSnapshot['phase'], string> = {
  development: 'Modo desenvolvimento: atualizações automáticas não instalam builds de desenvolvimento.',
  'not-configured': 'A distribuição ainda não foi publicada. Configure um feed HTTPS público no pacote de instalação.',
  idle: 'Aguardando verificação.',
  checking: 'Consultando a versão mais recente…',
  available: 'Atualização encontrada. Preparando download…',
  downloading: 'Baixando a nova versão com validação de integridade…',
  downloaded: 'Atualização baixada e pronta. Você decide quando reiniciar.',
  'up-to-date': 'Esta versão está atualizada.',
  error: 'Não foi possível verificar a atualização.',
}

export function AppUpdatesPanel() {
  const [status, setStatus] = useState<UpdateSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [confirmInstall, setConfirmInstall] = useState(false)
  useEffect(() => {
    const api = window.updatesAPI
    if (!api) { setFeedback('A API de atualização não está disponível nesta versão.'); return }
    let active = true
    void api.status().then(value => { if (active) setStatus(value) })
      .catch(cause => { if (active) setFeedback(errorText(cause)) })
    const unsubscribe = api.onChanged(next => {
      if (active) {
        setStatus(next)
        if (next.phase !== 'downloaded') setConfirmInstall(false)
      }
    })
    return () => { active = false; unsubscribe() }
  }, [])
  const perform = async (operation: () => Promise<UpdateSnapshot>) => {
    setBusy(true); setFeedback('')
    try { setStatus(await operation()) }
    catch (cause) { setFeedback(errorText(cause)) }
    finally { setBusy(false) }
  }
  const switchChannel = (value: ReleaseChannel) => {
    setConfirmInstall(false)
    void perform(() => window.updatesAPI.setChannel(value))
  }
  const install = async () => {
    setBusy(true); setFeedback('')
    try {
      const result = await window.updatesAPI.install()
      if (!result.installing) setFeedback(result.message)
    } catch (cause) { setFeedback(errorText(cause)); setConfirmInstall(false) }
    finally { setBusy(false) }
  }
  const unavailable = !status || status.phase === 'development' || status.phase === 'not-configured'
  const isChecking = busy || status?.phase === 'checking'
  return <div className="space-y-4 rounded-lg border border-border/70 bg-card p-5">
    <div className="flex items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Download className="size-4" />
      </span>
      <div>
        <h3 className="text-sm font-medium">Atualizações do Boobot</h3>
        <p className="mt-1 text-xs text-muted-foreground">Verificações a cada 30 minutos nas versões instaladas; você escolhe quando reiniciar.</p>
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2.5 text-sm">
      <span>Versão instalada: <strong>{status?.currentVersion || 'Consultando…'}</strong></span>
      <span className="text-xs text-muted-foreground">Nova versão: {status?.latestVersion || '—'}</span>
    </div>
    <label className="block space-y-1.5 text-xs font-medium">
      Canal de atualizações
      <Select value={status?.channel || 'stable'}
        disabled={!status || busy || status.phase === 'checking' || status.phase === 'downloading'}
        onValueChange={value => switchChannel(value as ReleaseChannel)}>
        <SelectTrigger aria-label="Canal de atualizações" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="stable">Estável — recomendado</SelectItem>
          <SelectItem value="beta">Beta — novidades antecipadas</SelectItem>
        </SelectContent>
      </Select>
    </label>
    <p role="status" className="text-xs leading-5 text-muted-foreground">
      {status ? descriptions[status.phase] : 'Carregando estado das atualizações…'}
      {status?.progressPercent != null && status.phase === 'downloading' ? ' ' + status.progressPercent + '%' : ''}
    </p>
    {status?.phase === 'downloading' && <div role="progressbar" aria-label="Download da atualização"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={status.progressPercent ?? 0}
      className="h-2 overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary transition-[width]"
        style={{ width: String(status.progressPercent ?? 0) + '%' }} />
    </div>}
    {status?.releaseNotes && <details className="rounded-md border border-border/60 p-3 text-xs">
      <summary className="cursor-pointer font-medium">Notas da atualização {status.latestVersion}</summary>
      <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{status.releaseNotes}</p>
    </details>}
    {status?.lastCheckedAt && <p className="text-[11px] text-muted-foreground">
      Última verificação: {new Date(status.lastCheckedAt).toLocaleString('pt-BR')}
    </p>}
    {status?.error && <p role="alert" className="text-xs text-destructive">{status.error}</p>}
    {feedback && <p role="alert" className="text-xs text-destructive">{feedback}</p>}
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" disabled={unavailable || isChecking}
        onClick={() => void perform(() => window.updatesAPI.check())}>
        <RefreshCcw className="size-3.5" />{isChecking ? 'Verificando…' : 'Buscar atualizações'}
      </Button>
      {status?.phase === 'downloaded' && (
        confirmInstall ? <>
          <Button size="sm" disabled={busy} onClick={() => void install()}>Confirmar e reiniciar</Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirmInstall(false)}>Agora não</Button>
        </> : <Button size="sm" disabled={busy} onClick={() => setConfirmInstall(true)}>Instalar atualização</Button>
      )}
    </div>
    <p className="flex items-start gap-2 text-[11px] leading-4 text-muted-foreground">
      <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
      Downloads usam um feed HTTPS público separado do código-fonte privado. Nenhuma credencial do GitHub é incluída no aplicativo.
    </p>
  </div>
}
