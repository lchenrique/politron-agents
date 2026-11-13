import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LoaderCircle, Mic, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ModelChoice } from './model-options'
import type { ModelSelection } from '@/components/kokonutui/ai-model-selector'
import type { Agent, FileChange, Message, ModelEffort, ModelRuntimeOptions } from '../../../../shared/v9'
import { QueuedMessages } from './QueuedMessages'
import { CompletedFileReview } from '../diff/CompletedFileReview'
import { INHERIT_MODEL_NAME, agentModelLabel, errorText } from '../app/appShellShared'
import { VoiceRecorder } from '../voice/voice-recorder'
import { PromptInput } from '@/components/ai/prompt-input'
import { AgentChip } from './AgentChip'
import { ModelMenu } from './ModelMenu'
import { PermissionChip } from './PermissionChip'
import { AttachMenu } from './AttachMenu'
import { MentionSuggestions } from './MentionSuggestions'
import { getMentionQuery, replaceMention, type MentionQuery } from './mentions'
import styles from './Composer.module.css'

function ComposerFrame({ children }: { children: ReactNode }) {
  return <div className={styles.root}><div className={styles.column}>{children}</div></div>
}

export type ComposerModel = ModelChoice
const INHERIT_OPTION: ComposerModel = { name: INHERIT_MODEL_NAME, description: 'Cada participante usa o modelo configurado no seu perfil' }
const modelByName = (models: ComposerModel[], name?: string) => models.find(item => item.enabled !== false && ((item.id || item.name) === name || item.name === name))
const initialModelOptions = (models: ComposerModel[], name?: string): ModelRuntimeOptions => {
  const model = modelByName(models, name)
  return {
    ...(model?.defaultServiceTier && model.serviceTiers?.some(item => item.id === model.defaultServiceTier) ? { serviceTier: model.defaultServiceTier } : {}),
    ...(model?.defaultVariant && model.variants?.some(item => item.id === model.defaultVariant) ? { variant: model.defaultVariant } : {}),
  }
}

export function Composer({ models, defaultModelName, inheritModelName, defaultEffort, onModelChange, onSubmit, onStop, conversationId, reviewChanges = [], reviewKey = '', onVoiceNotice, mentionAgents = [], working = false, queued = [], canAttachImages = false, onCancelQueued, onSendQueuedNow, recipientName, recipientApprovalMode, onApprovalModeChange, onUndoRun, sessionAgents, onAddParticipant }: {
  /** Boo que recebe a mensagem: o campo diz "Mensagem para <Boo>". */
  recipientName?: string
  /** Modo de aprovação do Boo que recebe a mensagem; vira o chip de autonomia do composer. */
  recipientApprovalMode?: Agent['approvalMode']
  onApprovalModeChange?: (mode: Agent['approvalMode']) => void
  /** Desfaz a última execução com alterações (backup automático por run). */
  onUndoRun?: () => void
  reviewChanges?: FileChange[]
  reviewKey?: string
  working?: boolean
  /** Mensagens do usuário que aguardam a vez (status queued). */
  queued?: Message[]
  onCancelQueued?: (messageId: string) => Promise<void>
  onSendQueuedNow?: (messageId: string) => Promise<void>
  canAttachImages?: boolean
  conversationId?: string
  mentionAgents?: Agent[]
  /** Equipe inteira para o chip do destinatário: escolher um Boo de fora o coloca na sessão. */
  sessionAgents?: Agent[]
  onAddParticipant?: (agent: Agent) => void
  models: ComposerModel[]
  defaultModelName?: string
  /** Nome do modelo que o Boo destinatário usa: é o rótulo exibido enquanto a seleção é herança. */
  inheritModelName?: string
  defaultEffort?: Agent['effort']
  onModelChange: (model: string) => void
  onSubmit: (value: string, modelName: string, options: { files: File[]; effort: Agent['effort']; modelOptions: ModelRuntimeOptions; planMode?: boolean; delivery: 'queue' | 'now'; requestId: string }) => Promise<void>
  onStop: () => void
  onVoiceNotice?: (error: string) => void
}) {
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [levels, setLevels] = useState<number[]>([])
  const [error, setError] = useState('')
  const [value, setValue] = useState('')
  const [mention, setMention] = useState<MentionQuery | null>(null)
  const [activeMention, setActiveMention] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingCaret = useRef<number | null>(null)
  const dismissedMention = useRef<string | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [modelName, setModelName] = useState(defaultModelName || INHERIT_MODEL_NAME)
  const [effort, setEffort] = useState<ModelEffort>(defaultEffort || 'medium')
  const [modelOptions, setModelOptions] = useState<ModelRuntimeOptions>(() => initialModelOptions(models, defaultModelName))
  const modelsRef = useRef(models)
  modelsRef.current = models
  const [planMode, setPlanMode] = useState(false)
  const [pendingSends, setPendingSends] = useState(0)
  const pendingCount = useRef(0)
  const inFlight = useRef(new Set<string>())
  const retryRequest = useRef<{ signature: string; id: string } | null>(null)
  const submissionGeneration = useRef(0)
  const isImageFile = (file: File) => file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name)
  const activeConversation = useRef(conversationId)
  activeConversation.current = conversationId
  const busy = working || pendingSends > 0
  const recorder = useRef<VoiceRecorder | null>(null)
  const recordingStarted = useRef(false)
  const sequence = useRef(0)
  const draftKey = conversationId ? 'politron.composer.draft.' + conversationId : undefined
  const mentionListId = 'composer-mentions'
  const normalized = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
  const mentionOptions = mention ? mentionAgents.filter(agent => agent.alias && (normalized(agent.alias).includes(normalized(mention.query)) || normalized(agent.name).includes(normalized(mention.query)))) : []

  const updateMention = (text: string, caret: number) => {
    const next = getMentionQuery(text, caret)
    const key = next ? `${next.start}:${next.end}:${next.query}` : null
    if (key !== dismissedMention.current) dismissedMention.current = null
    setMention(key && key === dismissedMention.current ? null : next)
    setActiveMention(0)
  }

  const chooseMention = (agent: Agent) => {
    if (!mention) return
    const next = replaceMention(value, mention, agent.alias)
    pendingCaret.current = next.caret
    setValue(next.text)
    setMention(null)
  }

  useEffect(() => {
    if (pendingCaret.current === null || !textareaRef.current) return
    const caret = pendingCaret.current
    pendingCaret.current = null
    textareaRef.current.focus()
    textareaRef.current.setSelectionRange(caret, caret)
  }, [value])

  // Destinatário escolhido na pílula. A escolha vira menção no texto, então o roteamento
  // que já existe (@alias) endereça só para esse Boo. Um Boo de fora da sessão entra nela.
  const [target, setTarget] = useState<Agent | null>(null)
  const chooseTarget = (agent: Agent) => {
    setTarget(agent)
    const inSession = (mentionAgents || []).some(item => item.id === agent.id)
    if (!inSession && onAddParticipant) {
      // Escolher um Boo que não participa da conversa o coloca na sessão, em vez de só
      // escrever a menção (que o roteamento ignoraria).
      onAddParticipant(agent)
      return
    }
    if (!agent.alias) return
    const mention = `@${agent.alias}`
    setValue(current => (current.startsWith(mention) ? current : `${mention} ${current}`.trimEnd()))
  }
  // Atualizar os participantes da mesma conversa não deve apagar o destinatário escolhido.
  useEffect(() => { setMention(null); dismissedMention.current = null; setTarget(null) }, [conversationId])
  // Herança mostra o modelo real de quem responde: o alvo escolhido na pílula manda;
  // sem escolha, vale o Boo que o AppShell já resolveu para esta conversa.
  const inheritLabel = (target ? agentModelLabel(target, models) : undefined) || inheritModelName
  const model = modelName === INHERIT_MODEL_NAME ? INHERIT_OPTION : models.find(item => item.enabled !== false && ((item.id || item.name) === modelName || item.name === modelName)) || INHERIT_OPTION
  const efforts = model === INHERIT_OPTION ? [] : model.efforts || []
  const selectedEffort = efforts.includes(effort) ? effort : model.defaultEffort && efforts.includes(model.defaultEffort) ? model.defaultEffort : efforts[0]
  const selectedServiceTier = modelOptions.serviceTier === null ? undefined
    : model.serviceTiers?.some(item => item.id === modelOptions.serviceTier) ? modelOptions.serviceTier
      : model.defaultServiceTier && model.serviceTiers?.some(item => item.id === model.defaultServiceTier) ? model.defaultServiceTier : undefined
  const selectedVariant = model.variants?.some(item => item.id === modelOptions.variant) ? modelOptions.variant
    : model.defaultVariant && model.variants?.some(item => item.id === model.defaultVariant) ? model.defaultVariant : undefined
  const changeModel = (selection: ModelSelection) => {
    const next = selection.model
    const chosen = next === INHERIT_MODEL_NAME ? INHERIT_OPTION : models.find(item => (item.id || item.name) === next)
    if (!chosen || chosen.enabled === false) return
    if (next !== modelName) {
      setModelName(next)
      onModelChange(next)
    }
    const supported = chosen.efforts || []
    const nextEffort = selection.effort && supported.includes(selection.effort) ? selection.effort
      : chosen.defaultEffort && supported.includes(chosen.defaultEffort) ? chosen.defaultEffort : supported[0]
    setEffort(nextEffort || 'medium')
    setModelOptions({
      ...(selection.serviceTier && chosen.serviceTiers?.some(item => item.id === selection.serviceTier) ? { serviceTier: selection.serviceTier } : {}),
      ...(selection.variant && chosen.variants?.some(item => item.id === selection.variant) ? { variant: selection.variant } : {}),
      ...(selection.fastMode === true && chosen.supportsFastMode ? { fastMode: true } : {}),
    })
  }

  useEffect(() => {
    try { setValue(draftKey ? localStorage.getItem(draftKey) || '' : '') } catch { setValue('') }
    setFiles([])
    setMention(null)
    retryRequest.current = null
    submissionGeneration.current++
    pendingCount.current = 0
    setPendingSends(0)
  }, [conversationId, draftKey])

  useEffect(() => {
    setModelName(defaultModelName || INHERIT_MODEL_NAME)
    setEffort(defaultEffort || 'medium')
    setModelOptions(initialModelOptions(modelsRef.current, defaultModelName))
  }, [defaultModelName, defaultEffort])

  useEffect(() => {
    try {
      if (draftKey) { if (value) localStorage.setItem(draftKey, value); else localStorage.removeItem(draftKey) }
    } catch { /* O rascunho continua disponível enquanto a conversa estiver aberta. */ }
  }, [draftKey, value])

  useEffect(() => () => {
    sequence.current++
    recorder.current?.cancel()
    recorder.current = null
    recordingStarted.current = false
    setRecording(false)
    setTranscribing(false)
    setLevels([])
  }, [conversationId])

  const notify = (cause: unknown) => { const message = errorText(cause); setError(message); onVoiceNotice?.(message) }
  const toggleRecord = async () => {
    if (recorder.current) {
      if (recordingStarted.current) recorder.current.stop()
      else {
        sequence.current++
        recorder.current.cancel()
        recorder.current = null
        recordingStarted.current = false
        setRecording(false)
        setTranscribing(false)
        setLevels([])
      }
      return
    }
    const current = ++sequence.current
    const next = new VoiceRecorder()
    recorder.current = next
    setError('')
    try {
      const installed = await window.appAPI.voiceStatus()
      if (current !== sequence.current || recorder.current !== next) return
      if (!installed.transcription) throw new Error('Instale o modelo de transcrição local nas configurações de voz antes de gravar.')
      recordingStarted.current = true
      setRecording(true)
      setLevels([])
      let inserted = ''
      const apply = (text: string) => setValue(currentValue => {
        const base = inserted && currentValue.endsWith(inserted) ? currentValue.slice(0, currentValue.length - inserted.length).replace(/\s+$/, '') : currentValue
        inserted = text
        return text ? (base ? `${base}${/\s$/.test(base) ? '' : ' '}${text}` : text) : base
      })
      const wav = await next.record(false, level => setLevels(old => [...old.slice(-31), Math.min(1, level * 4)]),
        async partialWav => {
          const partial = (await window.appAPI.voiceTranscribe(partialWav)).trim()
          if (current === sequence.current && recorder.current === next && partial) apply(partial)
        })
      if (current !== sequence.current) return
      setRecording(false)
      setTranscribing(true)
      const transcript = (await window.appAPI.voiceTranscribe(wav)).trim()
      if (current !== sequence.current) return
      if (!transcript && !inserted) throw new Error('Não consegui entender a gravação. Tente novamente.')
      if (transcript) apply(transcript)
    } catch (cause) {
      if (current === sequence.current && !(cause instanceof Error && cause.message === 'Gravação cancelada.')) notify(cause)
    } finally {
      if (recorder.current === next) { recorder.current = null; recordingStarted.current = false }
      if (current === sequence.current) { setRecording(false); setTranscribing(false) }
    }
  }

  const submit = async (rawValue = value, chosenFiles = files, delivery: 'queue' | 'now' = 'queue') => {
    const message = rawValue.trim()
    if (!message && chosenFiles.length === 0) return
    const submittedConversation = conversationId
    const submittedGeneration = submissionGeneration.current
    const submittedFiles = chosenFiles
    const signature = JSON.stringify([submittedConversation, message, delivery, submittedFiles.map(file => [file.name, file.size, file.type, file.lastModified])])
    // O campo nunca trava: só um duplo envio idêntico ainda em andamento é ignorado (o host também deduplica por requestId).
    if (inFlight.current.has(signature)) return
    inFlight.current.add(signature)
    const requestId = retryRequest.current?.signature === signature ? retryRequest.current.id : crypto.randomUUID()
    const selectedModelOptions = {
      ...(selectedServiceTier ? { serviceTier: selectedServiceTier } : {}),
      ...(selectedVariant ? { variant: selectedVariant } : {}),
      ...(model.supportsFastMode && modelOptions.fastMode ? { fastMode: true } : {}),
    }
    retryRequest.current = { signature, id: requestId }
    pendingCount.current++
    setPendingSends(pendingCount.current)
    setError('')
    setValue('')
    setFiles([])
    setPlanMode(false)
    try {
      await onSubmit(message, model === INHERIT_OPTION ? INHERIT_MODEL_NAME : model.id || model.name,
        { files: submittedFiles, effort: selectedEffort, modelOptions: selectedModelOptions, planMode, delivery, requestId })
      if (retryRequest.current?.id === requestId) retryRequest.current = null
    } catch (cause) {
      if (activeConversation.current === submittedConversation) { setValue(current => current || message); setFiles(current => current.length ? current : submittedFiles); setPlanMode(planMode); notify(cause) }
    } finally { inFlight.current.delete(signature); if (submissionGeneration.current === submittedGeneration) { pendingCount.current--; setPendingSends(pendingCount.current) } }
  }

  const runQueued = async (action: () => Promise<void>) => { try { await action() } catch (cause) { notify(cause) } }
  // Editar tira a mensagem da fila e devolve o texto ao campo; anexos de imagem já enviados ao host não voltam.
  const editQueued = (message: Message) => runQueued(async () => {
    await (onCancelQueued ? onCancelQueued(message.id) : window.appAPI.cancelQueuedMessage(message.id))
    setValue(current => current.trim() ? `${current}

${message.text}` : message.text)
    pendingCaret.current = Number.MAX_SAFE_INTEGER
  })

  // Seletor do mock: fica no próprio composer (o menu lista os modelos ativos de todos os provedores).
  const modelPicker = <ModelMenu
    label={model === INHERIT_OPTION ? (inheritLabel || INHERIT_MODEL_NAME) : model.name}
    options={models.filter(item => item.enabled !== false).map(item => ({ id: item.id || item.name, name: item.name, provider: item.provider }))}
    value={model === INHERIT_OPTION ? '' : (model.id || model.name)}
    inheritLabel={inheritLabel}
    disabled={busy}
    onSelect={id => changeModel({ model: id || INHERIT_MODEL_NAME })}
    onOpenProviders={() => window.dispatchEvent(new CustomEvent('boobot:open-settings', { detail: 'provedores' }))}
  />

  return <ComposerFrame>
      {reviewChanges.length > 0 && <CompletedFileReview key={reviewKey} changes={reviewChanges} onUndo={onUndoRun} />}
      <QueuedMessages messages={queued} onEdit={editQueued} onSendNow={message => runQueued(() => onSendQueuedNow ? onSendQueuedNow(message.id) : window.appAPI.sendQueuedNow(message.id))} onRemove={message => runQueued(() => onCancelQueued ? onCancelQueued(message.id) : window.appAPI.cancelQueuedMessage(message.id))} />
      <PromptInput
        className={styles.promptCard}
        stacked
        minTextareaHeight={34}
        maxTextareaHeight={132}
        leadingChip={mentionAgents.length > 0 || recipientApprovalMode ? <>
          {(sessionAgents || mentionAgents).length > 0 ? <AgentChip agents={sessionAgents || mentionAgents} selected={target} onSelect={chooseTarget} /> : null}
          {recipientApprovalMode && onApprovalModeChange ? <PermissionChip mode={recipientApprovalMode} disabled={busy} onSelect={onApprovalModeChange} /> : null}
        </> : undefined}
        value={value}
        onValueChange={setValue}
        textareaRef={textareaRef}
        onCaretChange={updateMention}
        mentionOpen={mention !== null && mentionAgents.length > 0}
        mentionListId={mentionListId}
        mentionActiveId={mentionOptions[activeMention] ? `${mentionListId}-${mentionOptions[activeMention].id}` : undefined}
        onTextareaKeyDown={event => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return
          if (mention) {
            if (event.key === 'Escape') {
            event.preventDefault()
            dismissedMention.current = `${mention.start}:${mention.end}:${mention.query}`
            setMention(null)
            } else if (event.key === 'ArrowDown' && mentionOptions.length) {
            event.preventDefault()
            setActiveMention(index => (index + 1) % mentionOptions.length)
            } else if (event.key === 'ArrowUp' && mentionOptions.length) {
            event.preventDefault()
            setActiveMention(index => (index - 1 + mentionOptions.length) % mentionOptions.length)
            } else if ((event.key === 'Enter' || event.key === 'Tab') && mentionOptions.length) {
            event.preventDefault()
            chooseMention(mentionOptions[activeMention] || mentionOptions[0])
            } else if (event.key === 'Enter') event.preventDefault()
            return
          }
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && working) {
            event.preventDefault()
            const hasImage = files.some(file => file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name))
            if (hasImage) {
              setError('Imagens não podem ser enviadas diretamente ao turno em andamento. Use Enter para adicioná-las à fila.')
              return
            }
            void submit(value, files, 'now')
          }
        }}
        suggestions={mention && mentionAgents.length > 0 ? <MentionSuggestions id={mentionListId} agents={mentionOptions} activeIndex={activeMention} onSelect={chooseMention} /> : null}
        files={files}
        onFilesChange={setFiles}
        showModelPicker={false}
        pending={false}
        submitDisabled={false}
        accept={`${canAttachImages ? 'image/png,image/jpeg,image/webp,' : ''}text/*,.md,.txt,.json,.csv,.ts,.tsx,.js,.jsx,.css,.html,.xml,.yaml,.yml`}
        onStop={onStop}
        submitLabel={working ? 'Adicionar à fila' : 'Enviar mensagem'}
        placeholder={working ? 'Enter adiciona à fila · Ctrl/Cmd+Enter envia para o turno em andamento' : `Envie uma mensagem para ${target?.name || recipientName || 'o Boo'}…`}
        onSubmit={(message, selection) => { void submit(message, selection.files) }}
        trailingControls={working && <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 rounded-full" aria-label="Parar geração" title="Parar geração" onClick={onStop}><Square className="size-4 fill-current" /></Button>}
        attachTrigger={openFiles => <AttachMenu openFiles={openFiles} planMode={planMode} disabled={busy}
          onTogglePlanMode={() => setPlanMode(current => !current)} />}
        extraControls={<>
          {modelPicker}
          <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0 rounded-full text-muted-foreground hover:text-foreground" aria-label={recording ? 'Parar gravação de voz' : 'Gravar áudio'} title={recording ? 'Parar e transcrever' : 'Ditado por voz local'} disabled={transcribing} onClick={() => void toggleRecord()}>
            {transcribing ? <LoaderCircle className="size-3.5 animate-spin" /> : recording ? <Square className="size-3.5 fill-current" /> : <Mic className="size-3.5" />}
          </Button>
        </>}
      />
      {(recording || transcribing) && <div className="flex items-center gap-2 px-3 pt-1 text-[11px] text-muted-foreground">
        {recording && <span aria-hidden="true" data-testid="dictation-wave" className="flex h-5 items-center gap-0.5">{Array.from({ length: 32 }, (_, i) => { const level = levels[levels.length - 32 + i] ?? 0; return <span key={i} className="w-0.5 rounded-full bg-primary/70 transition-[height] duration-100" style={{ height: `${Math.max(12, Math.round(level * 100))}%` }} /> })}</span>}
        <p role="status">{recording ? 'Ouvindo… o texto aparece enquanto você fala. Clique no quadrado para finalizar.' : 'Finalizando a transcrição localmente…'}</p>
      </div>}
      {error && <p role="alert" className="px-3 pt-1 text-[11px] text-destructive">{error}</p>}
  </ComposerFrame>
}
