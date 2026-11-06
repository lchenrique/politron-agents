import { useEffect, useId, useState } from 'react'
import { AudioLines, Download, FolderPlus, GraduationCap, ImagePlus, KeyRound, Monitor, Palette, Plug, Router, Trash2, Wrench, X } from 'lucide-react'
import { ASSISTANT_ID, type Agent, type DecisionModel, type OpenRouterDecisionStatus } from '../../../../shared/v9'
import type { ProviderSnapshot } from '../../../../shared/providers'
import type { SkillInfo } from '../../../../shared/skills'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Modal } from '@/components/dsh'
import { ThemeSelector } from '@/components/ide/ThemeSelector'
import { errorText } from './appShellShared'
import { setRivePreview, useRivePreview } from './booRendererPreference'
import { RealtimeSettingsPanel } from '../realtime/RealtimeCall'
import { HostSettingsPanel } from '../hosts/HostSettingsPanel'
import { ApprovalGrantList } from '../editors/ApprovalGrantList'
import { AppUpdatesPanel } from './AppUpdatesPanel'
import { ImageGenerationPanel } from './ImageGenerationPanel'
import { Field as FormField, FieldGroup, FieldLabel } from '@/components/ui/field'
import css from './SettingsPage.module.css'

export type SettingsSection = 'geral' | 'assistente' | 'ferramentas' | 'provedores' | 'imagens' | 'skills' | 'voz' | 'conexoes' | 'atualizacoes'
type Section = SettingsSection
const SECTIONS: { id: Section; label: string; icon: typeof Palette; description: string }[] = [
  { id: 'geral', label: 'Geral', icon: Palette, description: 'Modo visual do Boobot e animação dos Boos neste dispositivo.' },
  { id: 'assistente', label: 'Assistente', icon: KeyRound, description: 'Permissões e modo de aprovação do Assistente padrão.' },
  { id: 'ferramentas', label: 'Ferramentas', icon: Wrench, description: 'Recursos compartilhados por todos os agentes, como o terminal.' },
  { id: 'provedores', label: 'Provedores', icon: Plug, description: 'CLIs detectadas, chaves de API e o modelo que escolhe quem responde em grupo.' },
  { id: 'imagens', label: 'Geração de imagens', icon: ImagePlus, description: 'Quem gera as imagens pedidas aos Boos: Codex, Antigravity ou uma chave de API.' },
  { id: 'skills', label: 'Skills', icon: GraduationCap, description: 'Skills SKILL.md encontradas nesta máquina e pastas adicionadas por você.' },
  { id: 'voz', label: 'Voz em tempo real', icon: AudioLines, description: 'Chaves, transcrição e vozes das ligações e da leitura de mensagens.' },
  { id: 'conexoes', label: 'Conexões', icon: Monitor, description: 'Acesso a este computador pelos seus outros computadores.' },
  { id: 'atualizacoes', label: 'Atualizações', icon: Download, description: 'Versão instalada, canal de atualização e instalação de novas versões.' },
]
const SOURCE_LABEL: Record<SkillInfo['source'], string> = { codex: 'Codex', claude: 'Claude Code', custom: 'Adicionada aqui', learned: 'Aprendida por um agente', marketplace: 'Marketplace' }

function Field({ icon: Icon, title, description, children }: { icon?: typeof Palette; title: string; description: string; children: React.ReactNode }) {
  const titleId = useId()
  return <section aria-labelledby={titleId} className="ds-panel p-4 sm:p-5">
    <div className="flex items-start gap-3">
      {Icon && <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-soft-foreground"><Icon className="size-4" /></span>}
      <div className="min-w-0"><h3 id={titleId} className="ds-section-title">{title}</h3><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p></div>
    </div>
    <div className="mt-4 space-y-4 border-t border-border pt-4">{children}</div>
  </section>
}

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
  return <Field icon={Plug} title="CLIs de agentes instaladas" description="O inventário fica salvo no dispositivo. A atualização só é executada quando você solicita. Modelos de configurações locais não garantem autenticação ou suporte à execução no Boobot.">
    <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
      {(inventory?.providers || []).map(provider => <li key={provider.id} className="px-3 py-2.5 text-sm">
        <details>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span aria-hidden="true" className={'size-2 rounded-full ' + (provider.executable ? 'bg-success' : provider.found ? 'bg-warning' : 'bg-muted-foreground/30')} />
              <span className="font-medium">{provider.name}</span>
            </div>
            <span className="text-right text-xs text-muted-foreground">
              {provider.found ? provider.version || 'Binário localizado' : 'Não encontrado'}
              {provider.models && <span className="ml-2 rounded-full border border-border/60 px-1.5 py-0.5 text-[10px]">{provider.models.length} modelos</span>}
            </span>
          </summary>
          {provider.found && <p className="mt-1.5 text-xs text-muted-foreground">{provider.executable ? provider.id === 'opencode' || provider.id === 'antigravity' ? 'Disponível para conversa; ferramentas de código ainda não integradas neste adaptador.' : 'CLI disponível. Acesso a cada modelo depende das credenciais, assinatura ou saldo do provedor.' : provider.operational === false ? 'Instalação encontrada, mas o executável não respondeu' : 'Detectado; execução neste Boobot ainda não habilitada'}</p>}
          {provider.modelReason && <p className="mt-1 text-xs text-muted-foreground">{provider.modelReason}</p>}
          {provider.modelSource && <p className="mt-1 text-xs text-muted-foreground">{provider.modelSource === 'runtime' ? 'Catálogo do runtime' : 'Configuração local (acesso não verificado)'}</p>}
          {!!provider.models?.length && <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto border-t border-border/50 pt-2 text-xs text-muted-foreground">
            {provider.models.map(model => <li key={model.id} className="truncate">{model.name}</li>)}
          </ul>}
        </details>
      </li>)}
      {!inventory && <li className="px-3 py-3 text-xs text-muted-foreground">Carregando inventário salvo…</li>}
    </ul>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Button variant="outline" size="sm" disabled={checking} onClick={() => void refresh()}>{checking ? 'Atualizando…' : 'Atualizar detecção'}</Button>
      {inventory?.checkedAt && <span className="text-[11px] text-muted-foreground">Última verificação: {new Date(inventory.checkedAt).toLocaleString('pt-BR')}</span>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  </Field>
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

export function SettingsPage({ open, onOpenChange, initialSection = 'geral' }: { open: boolean; onOpenChange: (open: boolean) => void; initialSection?: SettingsSection }) {
  const [section, setSection] = useState<Section>('geral')
  const rivePreview = useRivePreview()
  useEffect(() => { if (open) setSection(initialSection) }, [open, initialSection])
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
    void window.appAPI.openRouterDecisionStatus().then(status => { if (!active) return; setDecisionStatus(status); setDecisionModelId(status.modelId) }).catch(error => { if (active) setDecisionFeedback(error instanceof Error ? error.message : 'Não foi possível carregar as configurações do OpenRouter.') })
    return () => { active = false }
  }, [open, section])
  const saveKey = async () => {
    setSaving(true); setFeedback('')
    try { await window.appAPI.saveClaudeCredential(apiKey); setApiKey(''); setConfigured(true); setFeedback('Chave protegida e salva neste computador.') }
    catch (error) { setFeedback(error instanceof Error ? error.message : 'Não foi possível salvar a chave.') }
    finally { setSaving(false) }
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

  return <Modal open={open} onClose={() => onOpenChange(false)} title="Configurações" headless backdropBlur={false}
    className={css.dialog}>
    {/* Em janelas estreitas a navegação vira uma faixa rolável acima do conteúdo; o X do diálogo fica fora das duas áreas de rolagem. */}
      <button type="button" aria-label="Fechar" onClick={() => onOpenChange(false)}
        className="absolute right-3 top-3 z-20 flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <X className="size-4" aria-hidden="true" />
      </button>
      <nav aria-label="Seções de configurações" className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-chrome p-2 pr-12 sm:flex-col sm:gap-px sm:overflow-y-auto sm:overflow-x-hidden sm:border-b-0 sm:border-r sm:p-2.5">
        <p className="ds-eyebrow hidden px-2 pb-2 pt-1.5 sm:block">Configurações</p>
        {SECTIONS.map(item => <Button key={item.id} type="button" variant={null} size={null} onClick={() => setSection(item.id)} aria-current={section === item.id ? 'page' : undefined}
          className="ds-nav-item flex h-8 shrink-0 items-center justify-start gap-2.5 whitespace-nowrap rounded-md px-2.5 text-left text-[13px] font-medium focus-visible:ring-0">
          <item.icon className="size-4 shrink-0" />{item.label}
        </Button>)}
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <header className="flex shrink-0 items-start gap-3 border-b border-border px-5 py-4 sm:px-8 sm:py-5 sm:pr-14">
          <span aria-hidden="true" className="mt-0.5 hidden size-9 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground sm:flex"><current.icon className="size-[18px]" /></span>
          <div className="min-w-0">
            <h2 id="settings-section-title" className="ds-page-title text-xl">{current.label}</h2>
            <p className="mt-0.5 max-w-2xl text-[13px] leading-5 text-muted-foreground">{current.description}</p>
          </div>
        </header>
        <div role="region" aria-labelledby="settings-section-title" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-8 sm:py-6">
        <div className="mx-auto max-w-3xl space-y-4">
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
          <Field icon={Router} title="OpenRouter para respostas em grupo" description="Informe sua chave OpenRouter e busque o catálogo. O Boobot mostra apenas modelos que aceitam decisões; TypeSafe/Jev é um deles. A chave fica criptografada neste computador. O texto novo, os participantes e até oito mensagens recentes são enviados ao OpenRouter para escolher um único agente. Confiança baixa ou falha usa o líder do grupo.">
            <label className="block space-y-1.5 text-xs font-medium">Chave de API OpenRouter<Input aria-label="Chave de API OpenRouter" type="password" autoComplete="off" value={openRouterKey} onChange={event => { setOpenRouterKey(event.target.value); setDecisionModels([]) }} placeholder={decisionStatus.configured ? 'Chave configurada; digite outra para substituir' : 'sk-or-…'} className="h-10 w-fullborder border-input bg-background px-3 font-mono text-xs" /></label>
            <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={savingDecision || (!openRouterKey.trim() && !decisionStatus.configured)} onClick={() => void discoverDecisionModels()}>{savingDecision && decisionFeedback.startsWith('Buscando') ? 'Buscando…' : 'Buscar modelos de decisão'}</Button>{decisionStatus.configured && <Button variant="outline" disabled={savingDecision} onClick={() => void clearDecisionKey()}>Remover chave</Button>}</div>
            {decisionModels.length > 0 && <><label className="block space-y-1.5 text-xs font-medium">Modelo de decisão<Select value={decisionModelId} onValueChange={setDecisionModelId}><SelectTrigger aria-label="Modelo de decisão" className="h-10 w-fullborder border-input bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>{decisionModels.map(model => <SelectItem key={model.id} value={model.id}>{model.free ? 'Grátis · ' : ''}{model.name} · {model.id}</SelectItem>)}</SelectContent></Select></label><div className="flex flex-wrap gap-2"><Button disabled={savingDecision || !openRouterKey.trim()} onClick={() => void saveDecisionSettings()}>{savingDecision ? 'Validando…' : 'Validar e salvar chave'}</Button>{decisionStatus.configured && decisionStatus.modelId !== decisionModelId && <Button variant="outline" disabled={savingDecision} onClick={() => void saveDecisionModel()}>Salvar modelo</Button>}</div></>}
            <p role="status" className="text-xs text-muted-foreground">{decisionFeedback || (decisionStatus.configured ? 'OpenRouter configurado · ' + decisionStatus.modelId : 'Sem chave configurada')}</p>
          </Field>
          <Field icon={KeyRound} title="Claude Agent SDK" description="Configure uma chave de API Anthropic. Ela é criptografada pelo sistema operacional e não é salva no banco de conversas.">
            <label className="block space-y-1.5 text-xs font-medium">Chave de API<Input aria-label="Chave de API Anthropic" type="password" autoComplete="off" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={configured ? 'Chave configurada; digite outra para substituir' : 'sk-ant-…'} className="h-10 w-fullborder border-input bg-background px-3 font-mono text-xs" /></label>
            <div className="flex flex-wrap items-center justify-between gap-3"><span role="status" className="min-w-0 flex-1 basis-56 text-xs text-muted-foreground">{feedback || (configured ? 'Chave Anthropic configurada' : 'Sem chave Anthropic no Boobot; o CLI pode usar suas credenciais próprias')}</span><div className="flex flex-wrap gap-2"><Button disabled={saving || !apiKey.trim()} onClick={() => void saveKey()}>{saving ? 'Salvando…' : configured ? 'Substituir chave Anthropic' : 'Salvar chave'}</Button>{configured && <Button variant="outline" disabled={saving} onClick={() => void removeKey()}>Remover chave Anthropic</Button>}</div></div>
          </Field>
        </>}
        {section === 'imagens' && <Field icon={ImagePlus} title="Provedor de imagens" description="Quando você pede uma arte, capa ou criativo, o Boo usa a ferramenta generate_image com o provedor escolhido aqui e salva o arquivo na pasta da conversa. Sem provedor, os Boos não geram imagens."><ImageGenerationPanel /></Field>}
        {section === 'skills' && <>
          <SkillsSection />
        </>}
        {section === 'conexoes' && <><Field icon={Monitor} title="Este computador como host" description="Permita o acesso pelos seus outros computadores e gerencie o pareamento."><HostSettingsPanel /></Field></>}
        {section === 'atualizacoes' && <AppUpdatesPanel />}
        {section === 'voz' && <>
          <Field icon={AudioLines} title="Ligações do mascote" description="Configure aqui as chaves, transcrição e vozes. O mascote dentro do app e o flutuante usam estas mesmas preferências."><RealtimeSettingsPanel /></Field>
          <SpeechKeySettings />
        </>}
        </div>
        </div>
      </div>
  </Modal>
}
