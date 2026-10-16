import { ArrowLeft, KeyRound, Palette } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ThemeSelector } from '@/components/ide/ThemeSelector'

export function SettingsPage({ onClose }: { onClose: () => void }) {
  const [apiKey, setApiKey] = useState('')
  const [configured, setConfigured] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { void window.appAPI.hasClaudeCredential().then(setConfigured).catch(error => setFeedback(String(error))) }, [])
  const saveKey = async () => {
    setSaving(true); setFeedback('')
    try { await window.appAPI.saveClaudeCredential(apiKey); setApiKey(''); setConfigured(true); setFeedback('Chave protegida e salva neste computador.') }
    catch (error) { setFeedback(error instanceof Error ? error.message : 'Não foi possível salvar a chave.') }
    finally { setSaving(false) }
  }
  return <section className="flex min-h-0 flex-1 flex-col overflow-auto">
    <header className="flex min-h-[58px] items-center gap-3 border-b border-border/50 px-5">
      <Button variant="ghost" size="icon" aria-label="Voltar ao espaço de trabalho" onClick={onClose}><ArrowLeft className="size-4" /></Button>
      <div><h1 className="text-sm font-semibold">Configurações</h1><p className="text-[11px] text-muted-foreground">Preferências do Politron</p></div>
    </header>
    <div className="mx-auto w-full max-w-2xl space-y-6 p-6 sm:p-10">
      <div><h2 className="text-xl font-semibold">Aparência</h2><p className="mt-1 text-sm text-muted-foreground">Personalize o tema e o contraste da interface.</p></div>
      <section className="flex flex-wrap items-center justify-between gap-5 rounded-xl border border-border/70 bg-card p-5">
        <div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Palette className="size-4" /></span><div><h3 className="text-sm font-medium">Tema e modo de cor</h3><p className="mt-1 text-xs text-muted-foreground">Escolha uma paleta e alterne entre claro e escuro.</p></div></div>
        <ThemeSelector />
      </section>
      <section className="space-y-4 rounded-xl border border-border/70 bg-card p-5">
        <div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><KeyRound className="size-4" /></span><div><h2 className="text-sm font-medium">Claude Agent SDK</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Configure uma chave de API Anthropic. Ela é criptografada pelo sistema operacional e não é salva no banco de conversas.</p></div></div>
        <label className="block space-y-1.5 text-xs font-medium">Chave de API<input aria-label="Chave de API Anthropic" type="password" autoComplete="off" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={configured ? 'Chave configurada; digite outra para substituir' : 'sk-ant-…'} className="h-10 w-full rounded-lg border border-input bg-background px-3 font-mono text-xs" /></label>
        <div className="flex items-center justify-between gap-3"><span role="status" className="text-xs text-muted-foreground">{feedback || (configured ? 'Claude configurado' : 'Claude ainda não configurado')}</span><Button disabled={saving || !apiKey.trim()} onClick={() => void saveKey()}>{saving ? 'Salvando…' : 'Salvar chave'}</Button></div>
      </section>
    </div>
  </section>
}
