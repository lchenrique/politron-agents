import { useEffect, useId, useState, type ReactNode } from 'react'
import { AudioLines, Brain, Download, FolderPlus, GraduationCap, ImagePlus, KeyRound, Monitor, MousePointerClick, Palette, Pencil, Plug, Router, Send, TerminalSquare, Trash2, Wrench, X } from 'lucide-react'
import { ASSISTANT_ID, type ModelPreferences, type Agent, type DecisionModel, type OpenRouterDecisionStatus } from '../../../../shared/v9'
import type { ProviderSnapshot } from '../../../../shared/providers'
import type { SkillInfo } from '../../../../shared/skills'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageShell } from '@/components/layout/PageShell'
import { ThemeSelector } from '@/components/ide/ThemeSelector'
import { errorText } from './appShellShared'
import { setRivePreview, useRivePreview } from './booRendererPreference'
import { RealtimeSettingsPanel } from '../realtime/RealtimeCall'
import { HostSettingsPanel } from '../hosts/HostSettingsPanel'
import { ApprovalGrantList } from '../editors/ApprovalGrantList'
import { AppUpdatesPanel } from './AppUpdatesPanel'
import { ImageGenerationPanel } from './ImageGenerationPanel'
import { TelegramPanel } from './TelegramPanel'
import { MemoryPanel } from './MemoryPanel'
import { ComputerUsePanel } from './ComputerUsePanel'
import { Field as FormField, FieldGroup, FieldLabel } from '@/components/ui/field'
import css from './SettingsPage.module.css'

export type SettingsSection = 'geral' | 'assistente' | 'ferramentas' | 'provedores' | 'imagens' | 'skills' | 'memoria' | 'computer-use' | 'voz' | 'conexoes' | 'telegram' | 'atualizacoes'
type Section = SettingsSection
const SECTIONS: { id: Section; label: string; icon: typeof Palette; description: string }[] = [
  { id: 'geral', label: 'Geral', icon: Palette, description: 'Modo visual do Boobot e animação dos Boos neste dispositivo.' },
  { id: 'assistente', label: 'Assistente', icon: KeyRound, description: 'Permissões e modo de aprovação do Assistente padrão.' },
  { id: 'ferramentas', label: 'Ferramentas', icon: Wrench, description: 'Recursos compartilhados por todos os agentes, como o terminal.' },
  { id: 'provedores', label: 'Provedores', icon: Plug, description: 'CLIs detectadas, chaves de API e o modelo que escolhe quem responde em grupo.' },
  { id: 'imagens', label: 'Geração de imagens', icon: ImagePlus, description: 'Quem gera as imagens pedidas aos Boos: Codex ou uma chave de API.' },
  { id: 'skills', label: 'Skills', icon: GraduationCap, description: 'Skills SKILL.md encontradas nesta máquina e pastas adicionadas por você.' },
  { id: 'memoria', label: 'Memória', icon: Brain, description: 'Fatos que os Boos lembram entre conversas, guardados só neste computador.' },
  { id: 'computer-use', label: 'Computer Use', icon: MousePointerClick, description: 'Deixe os Boos controlarem o Windows com o cua-driver, com aprovação por conversa.' },
  { id: 'voz', label: 'Voz em tempo real', icon: AudioLines, description: 'Chaves, transcrição e vozes das ligações e da leitura de mensagens.' },
  { id: 'conexoes', label: 'Conexões', icon: Monitor, description: 'Acesso a este computador pelos seus outros computadores.' },
  { id: 'telegram', label: 'Telegram', icon: Send, description: 'Fale com o Chief e aprove ações pelo celular com um bot seu do Telegram.' },
  { id: 'atualizacoes', label: 'Atualizações', icon: Download, description: 'Versão instalada, canal de atualização e instalação de novas versões.' },
]
const SOURCE_LABEL: Record<SkillInfo['source'], string> = { codex: 'Codex', claude: 'Claude Code', custom: 'Adicionada aqui', learned: 'Aprendida por um agente', marketplace: 'Marketplace' }

function Field({ icon: Icon, title, description, children }: { icon?: typeof Palette; title: string; description: string; children: React.ReactNode }) {
  const titleId = useId()
  return <section aria-labelledby={titleId} className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-5">
    <div className="flex items-start gap-3.5">
      {Icon && <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--bg-card)] text-[var(--accent-primary)]"><Icon className="size-4" /></span>}
      <div className="min-w-0">
        <h3 id={titleId} className="text-[14px] font-semibold text-[var(--text-primary)]">{title}</h3>
        <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">{description}</p>
      </div>
    </div>
    <div className="mt-4 space-y-4 border-t border-[var(--border-subtle)] pt-4">{children}</div>
  </section>
}

/** Cartão de configuração no formato do mock: ícone circular, título, descrição e corpo. */
function SettingsCard({ icon, title, badge, description, action, children }: { icon: ReactNode; title: string; badge?: ReactNode; description: ReactNode; action?: ReactNode; children: ReactNode }) {
  // O tema remapeia o raio de 2xl para 28px; o mock usa 16px, então o raio vai explícito.
  return <section className="space-y-4 border p-5" style={{ backgroundColor: 'var(--panel-card-surface, var(--bg-elevated))', borderColor: 'var(--panel-card-border, var(--border-subtle))', borderRadius: 16 }}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3.5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--bg-hover)] text-[var(--accent-primary)]">{icon}</div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">{title}</h3>
            {badge}
          </div>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">{description}</p>
        </div>
      </div>
      {action}
    </div>
    {children}
  </section>
}

const providerModelCount = (snapshot: ProviderSnapshot | null, id: string): number | null => snapshot?.providers.find(provider => provider.id === id)?.models?.length ?? null

const providerPillClass = 'rounded-md border border-[var(--border-default)] bg-[var(--bg-hover)] px-2 py-0.5 font-mono text-[10.5px] text-[var(--text-secondary)]'
const smallActionClass = 'flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-hover)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)] disabled:opacity-60'

function ProvidersSection() {
  const [inventory, setInventory] = useState<ProviderSnapshot | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    // Leitura do inventário salvo. Abrir o modal não executa CLIs.
    void window.providersAPI.list().then(value => { if (active) setInventory(value) }).catch(cause => { if (active) setError(errorText(cause)) })
    const off = window.providersAPI.onChanged(value => { if (active) setInventory(value) })
    return () => { active = false; off() }
  }, [])
  const refresh = async () => {
    setChecking(true); setError('')
    try { setInventory(await window.providersAPI.refresh()) }
    catch (cause) { setError(errorText(cause)) }
    finally { setChecking(false) }
  }
  return <SettingsCard icon={<TerminalSquare className="size-4" />} title="CLIs de agentes instaladas" description="O inventário fica salvo neste dispositivo. A atualização só é executada quando você solicita.">
    <div className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-pane)]">
      {(inventory?.providers || []).map(provider => <details key={provider.id}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden="true" className={'size-2 shrink-0 rounded-full ' + (provider.executable ? 'bg-success' : provider.found ? 'bg-warning' : 'bg-muted-foreground/30')} />
            <span className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{provider.name}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <span className="font-mono text-[12px] text-[var(--text-secondary)]">{provider.version || (provider.found ? 'localizado' : 'não encontrado')}</span>
            <span className="rounded-full border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2.5 py-0.5 font-mono text-[11px] text-[var(--text-primary)]">{provider.models?.length ?? 0}</span>
          </div>
        </summary>
        <div className="space-y-1 px-4 pb-3 text-[12px] leading-relaxed text-[var(--text-secondary)]">
          {provider.modelReason && <p>{provider.modelReason}</p>}
          {provider.executable && !provider.modelReason && <p>CLI disponível. O acesso a cada modelo depende das credenciais, assinatura ou saldo do provedor.</p>}
          {provider.modelSource && <p className="font-mono text-[10.5px] text-[var(--text-muted)]">{provider.modelSource === 'runtime' ? 'catálogo do runtime' : 'configuração local'}</p>}
          {!!provider.models?.length && <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto border-t border-[var(--border-subtle)] pt-2 font-mono text-[11px] text-[var(--text-muted)]">
            {provider.models.map(model => <li key={model.id} className="truncate">{model.name}</li>)}
          </ul>}
        </div>
      </details>)}
      {!inventory && <p className="px-4 py-3 text-[12px] text-[var(--text-muted)]">Carregando inventário salvo…</p>}
    </div>
    <div className="flex flex-wrap items-center gap-3 pt-1">
      <button type="button" disabled={checking} onClick={() => void refresh()} className="rounded-full border border-[var(--border-default)] bg-[var(--bg-hover)] px-4 py-2 text-[12.5px] font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-active)] disabled:opacity-60">{checking ? 'Atualizando…' : 'Atualizar detecção'}</button>
      {inventory?.checkedAt && <span className="text-[12px] text-[var(--text-muted)]">Última verificação: {new Date(inventory.checkedAt).toLocaleString('pt-BR')}</span>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  </SettingsCard>
}

/** Provedor por chave: cabeçalho mono do tipo de auth, campo da chave e ações. */
function KeyProviderRow({ name, initial, authType, configured, keyValue, feedback, busy, onKeyChange, onSave, onRemove, placeholder, models }: {
  name: string
  initial: string
  authType: string
  configured: boolean
  keyValue: string
  feedback: string
  busy: boolean
  onKeyChange: (value: string) => void
  onSave: () => void
  onRemove: () => void
  placeholder: string
  models: number | null
}) {
  return <div className="space-y-2.5">
    <div className="flex items-center justify-between gap-2 px-1">
      <div className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-md border border-[var(--border-default)] bg-[var(--bg-hover)] font-mono text-[11px] font-semibold text-[var(--accent-primary)]">{initial}</span>
        <span className="truncate text-[13.5px] font-semibold text-[var(--text-primary)]">{name}</span>
        <span className={providerPillClass}>{authType}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {models !== null && <span className="font-mono text-[11px] text-[var(--text-muted)]">{models} modelos</span>}
        <span className={'size-2 rounded-full ' + (configured ? 'bg-success' : 'bg-muted-foreground/30')} title={configured ? 'Chave salva' : 'Sem chave'} />
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Input aria-label={`Chave de API ${name}`} type="password" autoComplete="off" value={keyValue} onChange={event => onKeyChange(event.target.value)} placeholder={configured ? 'Chave configurada; digite outra para substituir' : placeholder} className="h-9 min-w-0 flex-1 border border-input bg-[var(--bg-pane)] px-3 font-mono text-xs" />
      <button type="button" disabled={busy || !keyValue.trim()} onClick={onSave} className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-hover)] px-3.5 py-2 text-[12px] font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-active)] disabled:opacity-60">{busy ? 'Salvando…' : configured ? 'Substituir chave' : 'Salvar chave'}</button>
      {configured && <button type="button" disabled={busy} onClick={onRemove} className="rounded-xl border border-[var(--border-default)] px-3.5 py-2 text-[12px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-60">Remover</button>}
    </div>
    <p role="status" className="px-1 text-[11.5px] text-[var(--text-muted)]">{feedback || (configured ? 'Chave salva e criptografada neste computador.' : 'Sem chave configurada.')}</p>
  </div>
}

/** Catálogo por provedor com os interruptores de modelo do mock. */
function ModelProvidersList() {
  const [inventory, setInventory] = useState<ProviderSnapshot | null>(null)
  const [prefs, setPrefs] = useState<ModelPreferences>({ disabled: [], custom: [] })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [adding, setAdding] = useState<string | null>(null)
  const [draft, setDraft] = useState({ id: '', name: '' })
  useEffect(() => {
    let active = true
    void window.providersAPI.list().then(value => { if (active) setInventory(value) }).catch(cause => { if (active) setNotice(errorText(cause)) })
    void window.appAPI.modelPreferences().then(value => { if (active) setPrefs(value) }).catch(cause => { if (active) setNotice(errorText(cause)) })
    const off = window.providersAPI.onChanged(value => { if (active) setInventory(value) })
    return () => { active = false; off() }
  }, [])
  const persist = async (next: ModelPreferences, message = 'Preferências de modelo salvas.') => {
    setBusy(true); setNotice('')
    try {
      setPrefs(await window.appAPI.saveModelPreferences(next))
      window.dispatchEvent(new Event('boobot:model-preferences'))
      setNotice(message)
    } catch (cause) { setNotice(errorText(cause)) } finally { setBusy(false) }
  }
  const toggle = (key: string, active: boolean) => {
    // `active` é o estado atual do interruptor: ligado → esconde o modelo.
    const disabled = active ? [...prefs.disabled, key] : prefs.disabled.filter(item => item !== key)
    void persist({ ...prefs, disabled }, active ? 'Modelo escondido do seletor.' : 'Modelo de volta ao seletor.')
  }
  const addModel = async (provider: Agent['runtime']) => {
    const id = draft.id.trim(), name = draft.name.trim()
    if (!id) { setNotice('Informe o id do modelo no provedor.'); return }
    if (prefs.custom.some(item => item.provider === provider && item.id === id)) { setNotice('Esse modelo já está na lista deste provedor.'); return }
    await persist({ ...prefs, custom: [...prefs.custom, { provider, id, name: name || id }] }, 'Modelo adicionado ao seletor.')
    setAdding(null); setDraft({ id: '', name: '' })
  }
  const refresh = async () => {
    setBusy(true); setNotice('')
    try { setInventory(await window.providersAPI.refresh()); setNotice('Catálogo atualizado.') }
    catch (cause) { setNotice(errorText(cause)) } finally { setBusy(false) }
  }
  const providers = (inventory?.providers || []).filter(provider => provider.models?.length || provider.id === 'opencode' || provider.id === 'claude' || prefs.custom.some(item => item.provider === provider.id))
  const authLabel = (id: string) => id === 'opencode' || id === 'claude' ? 'API Key' : 'CLI'
  return <div className="space-y-5">
    {providers.map(provider => {
      const models = provider.models || []
      const custom = prefs.custom.filter(item => item.provider === provider.id)
      const total = models.length + custom.length
      return <div key={provider.id} data-provider={provider.id} className="space-y-2.5">
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-md border border-[var(--border-default)] bg-[var(--bg-hover)] font-mono text-[11px] font-semibold text-[var(--accent-primary)]">{provider.name.slice(0, 1).toUpperCase()}</span>
            <span className="truncate text-[13.5px] font-semibold text-[var(--text-primary)]">{provider.name}</span>
            <span className={providerPillClass}>{authLabel(provider.id)}</span>
          </div>
          <span className="shrink-0 font-mono text-[11px] text-[var(--text-muted)]">{total} modelos</span>
        </div>
        <div className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-pane)]">
          {models.map(model => {
            const key = `${provider.id}:${model.id}`
            const active = !prefs.disabled.includes(key)
            return <div key={key} className="flex items-center justify-between gap-3 px-3.5 py-2.5 transition hover:bg-[var(--bg-hover)]">
              <span className="min-w-0 truncate text-[13px] text-[var(--text-primary)]">{model.name}</span>
              <button type="button" role="switch" aria-checked={active} aria-label={`Ativar modelo ${model.name}`} disabled={busy} onClick={() => toggle(key, active)}
                className={'flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ' + (active ? 'justify-end bg-[var(--accent-primary)]' : 'justify-start bg-[var(--bg-active)]')}>
                <span className="size-4 rounded-full bg-white shadow-sm" />
              </button>
            </div>
          })}
          {custom.map(model => {
            const key = `${provider.id}:${model.id}`
            const active = !prefs.disabled.includes(key)
            return <div key={key} className="flex items-center justify-between gap-3 px-3.5 py-2.5 transition hover:bg-[var(--bg-hover)]">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[13px] text-[var(--text-primary)]">{model.name}</span>
                <span className={providerPillClass}>adicionado</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <button type="button" aria-label={`Remover ${model.name}`} disabled={busy} onClick={() => void persist({ ...prefs, custom: prefs.custom.filter(item => !(item.provider === provider.id && item.id === model.id)) }, 'Modelo removido da lista.')} className="text-[var(--text-muted)] transition hover:text-destructive"><X className="size-3.5" /></button>
                <button type="button" role="switch" aria-checked={active} aria-label={`Ativar modelo ${model.name}`} disabled={busy} onClick={() => toggle(key, active)}
                  className={'flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ' + (active ? 'justify-end bg-[var(--accent-primary)]' : 'justify-start bg-[var(--bg-active)]')}>
                  <span className="size-4 rounded-full bg-white shadow-sm" />
                </button>
              </span>
            </div>
          })}
          {!models.length && !custom.length && <p className="px-3.5 py-3 text-[12px] text-[var(--text-muted)]">Nenhum modelo disponível ainda. Salve a chave e busque o catálogo.</p>}
        </div>
        {adding === provider.id ? <div className="flex flex-wrap items-center gap-2">
          <Input aria-label={`Id do modelo em ${provider.name}`} value={draft.id} onChange={event => setDraft(current => ({ ...current, id: event.target.value }))} placeholder="id no provedor (ex.: gpt-6-luna)" className="h-9 min-w-0 flex-1 border border-input bg-[var(--bg-pane)] px-3 font-mono text-xs" />
          <Input aria-label={`Nome do modelo em ${provider.name}`} value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} placeholder="nome exibido (opcional)" className="h-9 min-w-0 flex-1 border border-input bg-[var(--bg-pane)] px-3 text-xs" />
          <button type="button" disabled={busy} onClick={() => void addModel(provider.id as Agent['runtime'])} className={smallActionClass}>Salvar modelo</button>
          <button type="button" onClick={() => { setAdding(null); setDraft({ id: '', name: '' }) }} className={smallActionClass}>Cancelar</button>
        </div> : null}
        <div className="flex flex-wrap items-center justify-end gap-2 pt-0.5">
          <button type="button" disabled={busy} onClick={() => { setAdding(provider.id); setDraft({ id: '', name: '' }) }} className={smallActionClass}>+ Adicionar modelo</button>
          <button type="button" disabled={busy} onClick={() => void refresh()} className={smallActionClass}>Buscar lista de modelos</button>
        </div>
      </div>
    })}
    {notice && <p role="status" className="text-[11.5px] text-[var(--text-muted)]">{notice}</p>}
  </div>
}
function SkillsSection() {
  const [skills, setSkills] = useState<SkillInfo[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const refresh = async () => { try { setSkills(await window.skillsAPI.list()) } catch (cause) { setError(errorText(cause)) } }
  useEffect(() => { void refresh() }, [])
  const add = async () => {
    setBusy(true); setError('')
    try { const added = await window.skillsAPI.addFromFolder(); if (added) await refresh() }
    catch (cause) { setError(errorText(cause)) }
    finally { setBusy(false) }
  }
  const remove = async (id: string) => {
    setBusy(true); setError('')
    try { await window.skillsAPI.remove(id); await refresh() } catch (cause) { setError(errorText(cause)) } finally { setBusy(false) }
  }
  return <Field icon={GraduationCap} title="Skills no formato SKILL.md" description="O Boobot lê as skills já instaladas na sua máquina para o Codex e o Claude Code (pasta com SKILL.md) e você pode adicionar outras pastas. Só mostra o que existe; ainda não oferece as skills como ferramenta para os agentes dentro de uma conversa.">
    <ul className="divide-y divide-border/60 overflow-hidden rounded-md border border-border/60">
      {(skills || []).map(skill => <li key={skill.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
        <div className="min-w-0"><p className="truncate font-medium">{skill.name}</p><p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{skill.description}</p></div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="whitespace-nowrap rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">{SOURCE_LABEL[skill.source]}</span>
          {(skill.source === 'custom' || skill.source === 'learned') && <Button variant="ghost" size="icon" aria-label={`Remover ${skill.name}`} disabled={busy} onClick={() => void remove(skill.id)}><Trash2 className="size-3.5" /></Button>}
        </div>
      </li>)}
      {skills && !skills.length && <li className="px-3 py-3 text-xs text-muted-foreground">Nenhuma skill encontrada.</li>}
      {!skills && <li className="px-3 py-3 text-xs text-muted-foreground">Procurando…</li>}
    </ul>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Button variant="outline" size="sm" disabled={busy} onClick={() => void add()}><FolderPlus className="size-3.5" />Adicionar pasta de skill</Button>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  </Field>
}

function SpeechKeySettings() {
  const [configured, setConfigured] = useState(false), [key, setKey] = useState(''), [busy, setBusy] = useState(false), [feedback, setFeedback] = useState('')
  useEffect(() => { void window.appAPI.voiceStatus().then(status => setConfigured(status.voiceKeyConfigured)).catch(error => setFeedback(errorText(error))) }, [])
  const save = async (remove = false) => { setBusy(true); setFeedback(''); try { const status = remove ? await window.appAPI.voiceClearOpenRouterKey() : await window.appAPI.voiceSaveOpenRouterKey(key); setConfigured(status.voiceKeyConfigured); setKey(''); setFeedback(remove ? 'Chave removida.' : 'Chave de voz substituída e salva.') } catch (error) { setFeedback(errorText(error)) } finally { setBusy(false) } }
  return <Field icon={KeyRound} title="OpenRouter para leitura de mensagens" description="Chave usada pela síntese de voz das mensagens quando esse motor está selecionado. É independente da chave de decisão dos grupos."><FieldGroup><FormField><FieldLabel htmlFor="speech-router-key">Chave OpenRouter de voz</FieldLabel><Input id="speech-router-key" type="password" autoComplete="off" value={key} onChange={event => setKey(event.target.value)} placeholder={configured ? 'Chave configurada; cole outra para substituir' : 'Cole a chave OpenRouter'} /></FormField><div className="flex flex-wrap gap-2"><Button disabled={busy || !key.trim()} onClick={() => void save()}>{configured ? 'Substituir chave de voz' : 'Salvar chave de voz'}</Button>{configured && <Button variant="outline" disabled={busy} onClick={() => void save(true)}>Remover chave de voz</Button>}</div>{feedback && <p role="status" className="text-xs text-muted-foreground">{feedback}</p>}</FieldGroup></Field>
}

/**
 * Moldura das configurações: `PageShell` na rota dedicada ou as duas colunas do
 * overlay do design (nav de 238px + conteúdo central de 680px).
 */
function SettingsFrame({ embedded, nav, children }: { embedded: boolean; nav: React.ReactNode; children: React.ReactNode }) {
  if (embedded) {
    return <div className="flex min-h-0 flex-1 overflow-hidden bg-[var(--bg-pane)]">
      {nav}
      <div className="min-w-0 flex-1 overflow-y-auto px-8 py-7">
        <div className="max-w-[680px] space-y-5 pb-10">{children}</div>
      </div>
    </div>
  }
  return <PageShell title="Configurações" subtitle="Preferências deste computador" aside={nav}>
    <div role="region" aria-labelledby="settings-section-title" className="space-y-4">{children}</div>
  </PageShell>
}

/**
 * Página de Configurações: navegação de seções à esquerda e o conteúdo na coluna do PageShell.
 * `embedded` renderiza o mesmo conteúdo no formato do overlay do design (duas colunas, sem PageShell),
 * com as seções filtradas por `filter`.
 */
export function SettingsPage({ open = true, initialSection = 'geral', embedded = false, filter = '', onSectionChange }: { open?: boolean; initialSection?: SettingsSection; embedded?: boolean; filter?: string; onSectionChange?: (section: SettingsSection) => void }) {
  const [section, setSection] = useState<Section>('geral')
  const rivePreview = useRivePreview()
  useEffect(() => { if (open) setSection(initialSection) }, [open, initialSection])
  const [scopedInventory, setScopedInventory] = useState<ProviderSnapshot | null>(null)
  const [openCodeKey, setOpenCodeKey] = useState('')
  const [openCodeConfigured, setOpenCodeConfigured] = useState(false)
  const [openCodeFeedback, setOpenCodeFeedback] = useState('')
  const [openCodeSaving, setOpenCodeSaving] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [configured, setConfigured] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [assistantFeedback, setAssistantFeedback] = useState('')
  const [saving, setSaving] = useState(false)
  const [assistantAccess, setAssistantAccess] = useState({ canWrite: true, computerUse: false, approvalMode: 'ask' as Agent['approvalMode'], runtimePermissionMode: 'managed' as NonNullable<Agent['runtimePermissionMode']> })
  const [terminalEnabled, setTerminalEnabled] = useState(true)
  const [externalBrowserAlways, setExternalBrowserAlways] = useState(false)
  const [externalBrowserFeedback, setExternalBrowserFeedback] = useState('')
  const [terminalFeedback, setTerminalFeedback] = useState('')
  const [openRouterKey, setOpenRouterKey] = useState('')
  const [decisionStatus, setDecisionStatus] = useState<OpenRouterDecisionStatus>({ configured: false, modelId: 'typesafe/jev-1.13' })
  const [decisionModels, setDecisionModels] = useState<DecisionModel[]>([])
  const [decisionModelId, setDecisionModelId] = useState('typesafe/jev-1.13')
  const [decisionFeedback, setDecisionFeedback] = useState('')
  const [savingDecision, setSavingDecision] = useState(false)
  useEffect(() => { if (!open) { setApiKey(''); setOpenRouterKey('') } }, [open])
  useEffect(() => { if (!open || (section !== 'assistente' && section !== 'ferramentas')) return
    let active = true
    void window.appAPI.settingsPreferences().then(value => { if (!active) return; setAssistantAccess({ canWrite: value.canWrite ?? true, computerUse: value.computerUse, approvalMode: value.approvalMode, runtimePermissionMode: value.runtimePermissionMode || 'managed' }); setTerminalEnabled(value.terminalEnabled); setExternalBrowserAlways(value.externalBrowserAlways === true) }).catch(error => { if (active) setFeedback(String(error)) })
    return () => { active = false }
  }, [open, section])
  useEffect(() => { if (!open || section !== 'provedores') return; let active = true
    void window.appAPI.hasClaudeCredential().then(value => { if (active) setConfigured(value) }).catch(error => { if (active) setFeedback(String(error)) })
    return () => { active = false }
  }, [open, section])
  useEffect(() => { if (!open || section !== 'provedores') return; let active = true
    void window.providersAPI.list().then(value => { if (active) setScopedInventory(value) }).catch(() => undefined)
    return () => { active = false }
  }, [open, section])
  useEffect(() => { if (!open || section !== 'provedores') return; let active = true
    void window.appAPI.hasOpenCodeCredential().then(value => { if (active) setOpenCodeConfigured(value) }).catch(error => { if (active) setOpenCodeFeedback(errorText(error)) })
    return () => { active = false }
  }, [open, section])
  useEffect(() => { if (!open || section !== 'provedores') return; let active = true
    void window.appAPI.openRouterDecisionStatus().then(status => { if (!active) return; setDecisionStatus(status); setDecisionModelId(status.modelId) }).catch(error => { if (active) setDecisionFeedback(error instanceof Error ? error.message : 'Não foi possível carregar as configurações do OpenRouter.') })
    return () => { active = false }
  }, [open, section])
  const saveKey = async () => {
    setSaving(true); setFeedback('')
    try { await window.appAPI.saveClaudeCredential(apiKey); setApiKey(''); setConfigured(true); setFeedback('Chave protegida e salva neste computador.') }
    catch (error) { setFeedback(error instanceof Error ? error.message : 'Não foi possível salvar a chave.') }
    finally { setSaving(false) }
  }
  const saveOpenCodeKey = async () => {
    setOpenCodeSaving(true); setOpenCodeFeedback('')
    try { await window.appAPI.saveOpenCodeCredential(openCodeKey); setOpenCodeKey(''); setOpenCodeConfigured(true); setOpenCodeFeedback('Chave do OpenCode protegida e salva neste computador.') }
    catch (error) { setOpenCodeFeedback(errorText(error)) }
    finally { setOpenCodeSaving(false) }
  }
  const removeOpenCodeKey = async () => {
    setOpenCodeSaving(true); setOpenCodeFeedback('')
    try { await window.appAPI.clearOpenCodeCredential(); setOpenCodeKey(''); setOpenCodeConfigured(false); setOpenCodeFeedback('Chave do OpenCode removida. Os Boos do OpenCode param até você salvar outra.') }
    catch (error) { setOpenCodeFeedback(errorText(error)) }
    finally { setOpenCodeSaving(false) }
  }
  const removeKey = async () => { setSaving(true); setFeedback(''); try { await window.appAPI.clearClaudeCredential(); setApiKey(''); setConfigured(false); setFeedback('Chave Anthropic do Boobot removida. As credenciais do CLI foram preservadas.') } catch (error) { setFeedback(errorText(error)) } finally { setSaving(false) } }
  const updateAssistant = async (next: typeof assistantAccess) => {
    setAssistantAccess(next); setAssistantFeedback('')
    try { await window.appAPI.saveAssistantPreferences(next); setAssistantFeedback('Permissões do Assistente salvas.') }
    catch (error) { setAssistantFeedback(error instanceof Error ? error.message : 'Não foi possível salvar as permissões.') }
  }
  const updateExternalBrowserAlways = async (enabled: boolean) => {
    setExternalBrowserAlways(enabled); setExternalBrowserFeedback('')
    try { await window.appAPI.saveExternalBrowserAlways?.(enabled); setExternalBrowserFeedback(enabled ? 'Navegador real liberado para todos os agentes.' : 'Navegador real só com autorização por conversa.') }
    catch (error) { setExternalBrowserAlways(!enabled); setExternalBrowserFeedback(error instanceof Error ? error.message : 'Não foi possível salvar.') }
  }
  const updateTerminalAccess = async (enabled: boolean) => {
    setTerminalEnabled(enabled); setTerminalFeedback('')
    try { await window.appAPI.saveTerminalAccess(enabled); setTerminalFeedback(enabled ? 'Terminal habilitado para todos os agentes.' : 'Acesso ao terminal desativado para todos os agentes.') }
    catch (error) { setTerminalEnabled(!enabled); setTerminalFeedback(error instanceof Error ? error.message : 'Não foi possível salvar o acesso ao terminal.') }
  }
  const saveDecisionSettings = async () => {
    setSavingDecision(true); setDecisionFeedback('Validando a chave e salvando…')
    try {
      await window.appAPI.saveOpenRouterDecision(openRouterKey, decisionModelId)
      setOpenRouterKey(''); setDecisionStatus({ configured: true, modelId: decisionModelId }); setDecisionFeedback('Chave validada e armazenada com criptografia do sistema.')
    } catch (error) { setDecisionFeedback(error instanceof Error ? error.message : 'Não foi possível salvar as configurações do Jev.') }
    finally { setSavingDecision(false) }
  }
  const discoverDecisionModels = async () => {
    setSavingDecision(true); setDecisionFeedback('Buscando modelos de decisão no OpenRouter…')
    try {
      const catalog = await window.appAPI.openRouterDecisionModels(openRouterKey.trim() || undefined)
      setDecisionModels(catalog.models)
      setDecisionModelId(current => catalog.models.some(model => model.id === current) ? current : catalog.models[0]?.id || '')
      setDecisionFeedback(`${catalog.models.length} modelos de decisão encontrados no OpenRouter.`)
    } catch (error) {
      // Preservar opções já carregadas quando uma atualização de catálogo falha.
      setDecisionFeedback(error instanceof Error ? error.message : 'Não foi possível buscar os modelos de decisão.')
    } finally { setSavingDecision(false) }
  }
  const saveDecisionModel = async () => {
    setSavingDecision(true); setDecisionFeedback('Salvando o modelo…')
    try { await window.appAPI.saveOpenRouterDecisionModel(decisionModelId); setDecisionStatus(current => ({ ...current, modelId: decisionModelId })); setDecisionFeedback('Modelo de decisão salvo.') }
    catch (error) { setDecisionFeedback(error instanceof Error ? error.message : 'Não foi possível salvar o modelo.') }
    finally { setSavingDecision(false) }
  }
  const clearDecisionKey = async () => {
    try { await window.appAPI.clearOpenRouterDecision(); setDecisionStatus(current => ({ ...current, configured: false })); setDecisionFeedback('Chave removida. O modo automático usará o líder como fallback.') }
    catch (error) { setDecisionFeedback(error instanceof Error ? error.message : 'Não foi possível remover a chave.') }
  }

  const current = SECTIONS.find(item => item.id === section) || SECTIONS[0]
  const query = filter.trim().toLowerCase()
  const visibleSections = query ? SECTIONS.filter(item => item.label.toLowerCase().includes(query) || item.description.toLowerCase().includes(query)) : SECTIONS
  const selectSection = (id: Section) => { setSection(id); onSectionChange?.(id) }

  const nav = <nav aria-label="Seções de configurações" className={
    embedded
      ? 'w-[238px] shrink-0 space-y-1 overflow-y-auto border-r border-[var(--border-subtle)] bg-[var(--bg-rail)] p-3'
      : 'flex w-[var(--aside-w)] shrink-0 flex-col gap-px overflow-y-auto border-r border-border bg-chrome p-3 max-[720px]:px-1.5'
  }>
    {visibleSections.map(item => {
      const active = section === item.id
      return <button key={item.id} type="button" onClick={() => selectSection(item.id)} aria-current={active ? 'page' : undefined} title={item.label}
        className={embedded
          ? 'flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-[13px] transition ' + (active
            ? 'border-[var(--border-default)] bg-[var(--bg-hover)] font-semibold text-[var(--text-primary)] shadow-xs'
            : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]')
          : 'ds-nav-item flex h-9 shrink-0 items-center justify-start gap-2.5 rounded-md px-2.5 text-left text-[13px] font-medium whitespace-nowrap focus-visible:ring-0 max-[720px]:justify-center max-[720px]:px-0'}>
        <item.icon className={'size-4 shrink-0 ' + (embedded ? (active ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]') : '')} />
        <span className={embedded ? 'truncate' : 'max-[720px]:sr-only'}>{item.label}</span>
      </button>
    })}
    {embedded && !visibleSections.length ? <p className="px-3 py-2 text-[11.5px] text-[var(--text-muted)]">Nenhuma seção encontrada.</p> : null}
  </nav>

  if (!open) return null
  return <SettingsFrame embedded={embedded} nav={nav}>
      <div className="space-y-1"><h2 id="settings-section-title" className="text-[15px] font-semibold text-[var(--text-primary)]">{current.label}</h2><p className="text-[12.5px] leading-relaxed text-[var(--text-secondary)]">{current.description}</p></div>
        {section === 'geral' && <>
          <Field icon={Palette} title="Aparência" description="O Boobot usa um único sistema visual com dois modos. A escolha fica salva neste dispositivo."><ThemeSelector /></Field>
          <Field title="Animação dos Boos" description="O SVG original preserva brilho, sombra, acessórios e reações. O renderer Rive ainda está em desenvolvimento e não possui paridade visual.">
            <label className="flex items-start gap-3 text-sm">
              <Checkbox aria-label="Experimentar renderer Rive (incompleto)" checked={rivePreview} onCheckedChange={checked => setRivePreview(checked === true)} className="mt-1" />
              <span><span className="block font-medium">Experimentar renderer Rive (incompleto)</span><span className="mt-1 block text-xs text-muted-foreground">Desligado por padrão. Com a opção desligada, todos os Boos usam SVG. Ao ligar, apenas retratos compatíveis usam Rive; o restante continua em SVG. Reversível imediatamente.</span></span>
            </label>
          </Field>
        </>}
        {section === 'assistente' && <>
          <Field title="Assistente padrão" description="Escolha as permissões específicas do Assistente. A edição de arquivos respeita também a política do workspace.">
            <div className="divide-y divide-border rounded-md border border-border">
              <label className="flex items-center gap-3 px-3 py-2.5 text-sm"><Checkbox checked={assistantAccess.canWrite} onCheckedChange={checked => void updateAssistant({ ...assistantAccess, canWrite: checked === true })} /><span>Permitir edição de arquivos do workspace</span></label>
              <label className="flex items-start gap-3 px-3 py-2.5 text-sm"><Checkbox checked={assistantAccess.computerUse} onCheckedChange={checked => void updateAssistant({ ...assistantAccess, computerUse: checked === true })} className="mt-0.5" /><span><span className="font-medium">Permitir uso do navegador</span><span className="mt-0.5 block text-xs text-muted-foreground">Ações no navegador respeitam o modo de aprovação deste Assistente.</span></span></label>
            </div>
            <div className="space-y-2">
              <label className="block space-y-1.5 text-sm">Modo de aprovação do Assistente{assistantAccess.runtimePermissionMode === 'bypass' && <span className="ml-1 text-xs text-muted-foreground">(sem efeito no Acesso total)</span>}<Select value={assistantAccess.approvalMode} onValueChange={value => void updateAssistant({ ...assistantAccess, approvalMode: value as Agent['approvalMode'] })}><SelectTrigger aria-label="Modo de aprovação"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ask">Perguntar antes de cada ação</SelectItem><SelectItem value="automatic">Automático · pede só ações sensíveis (recomendado)</SelectItem><SelectItem value="bypass">Bypass · autonomia total</SelectItem></SelectContent></Select></label>
              <p data-tone={assistantAccess.approvalMode === 'bypass' ? 'warning' : undefined} className="rounded-md text-xs leading-5 text-muted-foreground data-[tone=warning]:border data-[tone=warning]:border-warning/30 data-[tone=warning]:bg-warning-soft data-[tone=warning]:px-3 data-[tone=warning]:py-2 data-[tone=warning]:text-foreground">Esta configuração vale somente para o Assistente padrão. Conversas com um Boo, como Atlas, usam o modo salvo no editor daquele agente. No Bypass, o terminal pode alterar outros caminhos do computador sem pedir confirmação; o Chief em Bypass também pode criar equipes e delegar dentro das permissões do workspace.</p>
            </div>
            <label className="block space-y-1.5 text-sm">Permissões do Codex<Select value={assistantAccess.runtimePermissionMode} onValueChange={value => void updateAssistant({ ...assistantAccess, runtimePermissionMode: value as NonNullable<Agent['runtimePermissionMode']> })}><SelectTrigger aria-label="Permissões do Codex"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="managed">Gerenciado · recomendado</SelectItem><SelectItem value="bypass">Acesso total · full access do Codex</SelectItem></SelectContent></Select></label>
            <p data-tone={assistantAccess.runtimePermissionMode === 'bypass' ? 'warning' : undefined} className="rounded-md text-xs leading-5 text-muted-foreground data-[tone=warning]:border data-[tone=warning]:border-warning/30 data-[tone=warning]:bg-warning-soft data-[tone=warning]:px-3 data-[tone=warning]:py-2 data-[tone=warning]:text-foreground">{assistantAccess.runtimePermissionMode === 'bypass' ? 'Acesso total: o Codex roda sem sandbox e sem pedir permissão, com shell e edição nativos ligados, e o Boobot não pede nenhuma confirmação, nem perguntas nem revisão de plano. O agente pode alterar qualquer arquivo e rodar qualquer comando no computador. As ações nativas aparecem no chat como atividade, mas sem o diff do Boobot.' : 'O Codex usa permissões gerenciadas pelo Politron. Ferramentas continuam limitadas ao workspace e ao modo de aprovação.'}</p>
            <ApprovalGrantList agentId={ASSISTANT_ID} />
            <p role="status" className="text-xs text-muted-foreground empty:hidden">{assistantFeedback}</p>
          </Field>
        </>}
        {section === 'ferramentas' && <>
          <Field title="Terminal · todos os agentes" description="Agentes com edição habilitada podem alterar arquivos do workspace. O terminal executa na pasta da conversa, mas não é isolado pelo sistema operacional. O modo Bypass de cada agente permite executar comandos sem confirmação.">
            <label className="flex items-start gap-3 text-sm"><Checkbox checked={terminalEnabled} onCheckedChange={checked => void updateTerminalAccess(checked === true)} className="mt-0.5" /><span><span className="font-medium">Habilitar terminal para todos os agentes</span><span className="mt-0.5 block text-xs text-muted-foreground">A alteração vale para o Assistente padrão e todos os agentes cadastrados.</span></span></label>
            <p role="status" className="text-xs text-muted-foreground">{terminalFeedback || (terminalEnabled ? 'Terminal habilitado para todos os agentes.' : 'Terminal desabilitado.')}</p>
          </Field>
          {window.appAPI.saveExternalBrowserAlways && <Field title="Navegador real · todos os agentes" description="Seu Brave/Chrome pela extensão oficial. Com isto marcado, agentes com uso do computador usam o navegador real sem pedir autorização em cada conversa, com acesso aos sites em que você está logado. Cada ação fica registrada na conversa.">
            <label className="flex items-start gap-3 text-sm"><Checkbox checked={externalBrowserAlways} onCheckedChange={checked => void updateExternalBrowserAlways(checked === true)} className="mt-0.5" /><span className="font-medium">Permitir que agentes usem meu navegador real</span></label>
            <p role="status" className="text-xs text-muted-foreground empty:hidden">{externalBrowserFeedback}</p>
          </Field>}
        </>}
        {section === 'provedores' && <>
          <ProvidersSection />
          <SettingsCard icon={<KeyRound className="size-4" />} title="Provedores por chave de API" badge={<span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10.5px] text-[var(--accent-primary)]">Em uso</span>} description="Conecte provedores externos com chave de API. A chave fica criptografada neste computador, fora do banco de conversas; os modelos aparecem no seletor do composer quando o catálogo responde.">
            <KeyProviderRow name="OpenCode" initial="O" authType="API Key" configured={openCodeConfigured} keyValue={openCodeKey} feedback={openCodeFeedback} busy={openCodeSaving}
              onKeyChange={setOpenCodeKey} onSave={() => void saveOpenCodeKey()} onRemove={() => void removeOpenCodeKey()}
              placeholder="cole a chave do OpenCode Console" models={providerModelCount(scopedInventory, 'opencode')} />
            <div className="border-t border-[var(--border-subtle)]" />
            <KeyProviderRow name="Claude Agent SDK" initial="C" authType="API Key" configured={configured} keyValue={apiKey} feedback={feedback} busy={saving}
              onKeyChange={setApiKey} onSave={() => void saveKey()} onRemove={() => void removeKey()}
              placeholder="sk-ant-…" models={providerModelCount(scopedInventory, 'claude')} />
            <div className="border-t border-[var(--border-subtle)]" />
            <ModelProvidersList />
          </SettingsCard>
          <SettingsCard icon={<Router className="size-4" />} title="OpenRouter para respostas em grupo" description="Informe sua chave OpenRouter e busque o catálogo. O Boobot mostra apenas modelos que aceitam decisões; TypeSafe/Jev é um deles. O texto novo, os participantes e até oito mensagens recentes vão ao OpenRouter para escolher um único agente. Confiança baixa ou falha usa o líder do grupo.">
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold text-[var(--text-secondary)]">Chave de API OpenRouter</label>
                <div className="flex gap-2">
                  <Input aria-label="Chave de API OpenRouter" type="password" autoComplete="off" value={openRouterKey} onChange={event => { setOpenRouterKey(event.target.value); setDecisionModels([]) }} placeholder={decisionStatus.configured ? 'Chave configurada; digite outra para substituir' : 'sk-or-v1-…'} className="h-9 min-w-0 flex-1 border border-input bg-[var(--bg-pane)] px-3 font-mono text-xs" />
                  <button type="button" disabled={savingDecision || (!openRouterKey.trim() && !decisionStatus.configured)} onClick={() => void discoverDecisionModels()} className={smallActionClass}>{savingDecision && decisionFeedback.startsWith('Buscando') ? 'Buscando…' : 'Buscar catálogo'}</button>
                </div>
              </div>
              {decisionStatus.configured && <div>
                <label className="mb-1.5 block text-[12px] font-semibold text-[var(--text-secondary)]">Modelo decisor de grupo</label>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={decisionModelId} onValueChange={setDecisionModelId}><SelectTrigger aria-label="Modelo de decisão" className="h-9 w-full max-w-sm border border-input bg-[var(--bg-pane)] px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>{(decisionModels.length ? decisionModels.map(model => ({ id: model.id, name: `${model.free ? 'Grátis · ' : ''}${model.name} · ${model.id}` })) : [{ id: decisionStatus.modelId, name: decisionStatus.modelId }]).map(model => <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>)}</SelectContent></Select>
                  <button type="button" disabled={savingDecision} onClick={() => void (decisionStatus.modelId === decisionModelId ? saveDecisionSettings() : saveDecisionModel())} className={smallActionClass}>{savingDecision ? 'Salvando…' : 'Salvar modelo'}</button>
                  <button type="button" disabled={savingDecision} onClick={() => void clearDecisionKey()} className={smallActionClass}>Remover chave</button>
                </div>
              </div>}
              <p role="status" className="text-[11.5px] text-[var(--text-muted)]">{decisionFeedback || (decisionStatus.configured ? 'OpenRouter configurado · ' + decisionStatus.modelId : 'Sem chave configurada')}</p>
            </div>
          </SettingsCard>
        </>}
        {section === 'imagens' && <Field icon={ImagePlus} title="Provedor de imagens" description="Quando você pede uma arte, capa ou criativo, o Boo usa a ferramenta generate_image com o provedor escolhido aqui e salva o arquivo na pasta da conversa. Sem provedor, os Boos não geram imagens."><ImageGenerationPanel /></Field>}
        {section === 'skills' && <>
          <SkillsSection />
        </>}
        {section === 'memoria' && <Field icon={Brain} title="Memória dos Boos" description="Essenciais entram em todo turno (até 8 KiB); pesquisáveis só aparecem quando o Boo busca. Os Boos tratam memórias como dados, nunca como ordens, e não guardam tokens nem senhas. Tudo fica no banco local do Boobot."><MemoryPanel /></Field>}
        {section === 'conexoes' && <><Field icon={Monitor} title="Este computador como host" description="Permita o acesso pelos seus outros computadores e gerencie o pareamento."><HostSettingsPanel /></Field></>}
        {section === 'computer-use' && <Field icon={MousePointerClick} title="Controle do Windows" description="O Boo vê janelas, clica, digita e abre programas como você, só depois da sua aprovação em cada conversa e só enquanto está executando."><ComputerUsePanel /></Field>}
        {section === 'telegram' && <Field icon={Send} title="Bot do Telegram" description="Crie um bot no @BotFather, cole o token e pareie seu celular. Só chats pareados conversam com o Boobot, e nenhuma ação é executada sem o seu toque em Aprovar."><TelegramPanel /></Field>}
        {section === 'atualizacoes' && <AppUpdatesPanel />}
        {section === 'voz' && <>
          <Field icon={AudioLines} title="Ligações do mascote" description="Configure aqui as chaves, transcrição e vozes. O mascote dentro do app e o flutuante usam estas mesmas preferências."><RealtimeSettingsPanel /></Field>
          <SpeechKeySettings />
        </>}
  </SettingsFrame>
}
