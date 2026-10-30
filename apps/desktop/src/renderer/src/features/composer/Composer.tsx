import { useEffect, useRef, useState } from 'react'
import { ClipboardList, LoaderCircle, Mic, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ModelChoice, ModelProviderChoice } from './model-options'
import AIModelSelector, { type ModelSelection } from '@/components/kokonutui/ai-model-selector'
import type { Agent, FileChange, Message, ModelEffort, ModelRuntimeOptions } from '../../../../shared/v9'
import { QueuedMessages } from './QueuedMessages'
import { CompletedFileReview } from '../diff/CompletedFileReview'
import { INHERIT_MODEL_NAME, errorText } from '../app/appShellShared'
import { VoiceRecorder } from '../voice/voice-recorder'
import { PromptInput } from '@/components/ai/prompt-input'
import { MentionSuggestions } from './MentionSuggestions'
import { getMentionQuery, replaceMention, type MentionQuery } from './mentions'
import styles from './Composer.module.css'

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

export function Composer({ models, modelProviders, defaultModelName, defaultEffort, onModelChange, onSubmit, onStop, conversationId, reviewChanges = [], reviewKey = '', onVoiceNotice, mentionAgents = [], working = false, queued = [], canAttachImages = false, onCancelQueued, onSendQueuedNow }: {
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
  models: ComposerModel[]
  modelProviders?: ModelProviderChoice[]
  defaultModelName?: string
  defaultEffort?: Agent['effort']
  onModelChange: (model: string) => void
  onSubmit: (value: string, modelName: string, options: { files: File[]; effort: Agent['effort']; modelOptions: ModelRuntimeOptions; planMode?: boolean; delivery: 'queue' | 'now'; requestId: string }) => Promise<void>
  onStop: () => void
  onVoiceNotice?: (error: string) => void
}) {
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
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
  const retryRequest = useRef<{ signature: string; id: string } | null>(null)
  const submissionGeneration = useRef(0)
  const isImageFile = (file: File) => file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name)
  const activeConversation = useRef(conversationId)
  activeConversation.current = conversationId
  const busy = working || pendingSends > 0
  const recorder = useRef<VoiceRecorder | null>(null)
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

  useEffect(() => { setMention(null); dismissedMention.current = null }, [conversationId, mentionAgents])
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

  useEffect(() => () => { sequence.current++; recorder.current?.cancel(); recorder.current = null }, [conversationId])

  const notify = (cause: unknown) => { const message = errorText(cause); setError(message); onVoiceNotice?.(message) }
  const toggleRecord = async () => {
    if (recorder.current) { recorder.current.stop(); return }
    const current = ++sequence.current
    const next = new VoiceRecorder()
    recorder.current = next
    setError('')
    try {
      const installed = await window.appAPI.voiceStatus()
      if (!installed.transcription) throw new Error('Instale o modelo de transcrição local nas configurações de voz antes de gravar.')
      setRecording(true)
      const wav = await next.record()
      if (current !== sequence.current) return
      setRecording(false)
      setTranscribing(true)
      const transcript = (await window.appAPI.voiceTranscribe(wav)).trim()
      if (current !== sequence.current) return
      if (!transcript) throw new Error('Não consegui entender a gravação. Tente novamente.')
      setValue(currentValue => currentValue ? `${currentValue}${/\s$/.test(currentValue) ? '' : ' '}${transcript}` : transcript)
    } catch (cause) {
      if (current === sequence.current && !(cause instanceof Error && cause.message === 'Gravação cancelada.')) notify(cause)
    } finally {
      if (recorder.current === next) recorder.current = null
      if (current === sequence.current) { setRecording(false); setTranscribing(false) }
    }
  }

  const submit = async (rawValue = value, chosenFiles = files, delivery: 'queue' | 'now' = 'queue') => {
    const message = rawValue.trim()
    if ((!message && chosenFiles.length === 0) || pendingCount.current > 0) return
    const submittedConversation = conversationId
    const submittedGeneration = submissionGeneration.current
    const submittedFiles = chosenFiles
    const signature = JSON.stringify([submittedConversation, message, delivery, submittedFiles.map(file => [file.name, file.size, file.type, file.lastModified])])
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
    } finally { if (submissionGeneration.current === submittedGeneration) { pendingCount.current--; setPendingSends(pendingCount.current) } }
  }

  const runQueued = async (action: () => Promise<void>) => { try { await action() } catch (cause) { notify(cause) } }
  // Editar tira a mensagem da fila e devolve o texto ao campo; anexos de imagem já enviados ao host não voltam.
  const editQueued = (message: Message) => runQueued(async () => {
    await (onCancelQueued ? onCancelQueued(message.id) : window.appAPI.cancelQueuedMessage(message.id))
    setValue(current => current.trim() ? `${current}

${message.text}` : message.text)
    pendingCaret.current = Number.MAX_SAFE_INTEGER
  })

  return <div className={styles.root}>
    <div className={styles.column}>
      {reviewChanges.length > 0 && <CompletedFileReview key={reviewKey} changes={reviewChanges} />}
      <QueuedMessages messages={queued} onEdit={editQueued} onSendNow={message => runQueued(() => onSendQueuedNow ? onSendQueuedNow(message.id) : window.appAPI.sendQueuedNow(message.id))} onRemove={message => runQueued(() => onCancelQueued ? onCancelQueued(message.id) : window.appAPI.cancelQueuedMessage(message.id))} />
      <PromptInput
        className={styles.promptCard}
        inline
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
        submitDisabled={pendingSends > 0}
        accept={`${canAttachImages ? 'image/png,image/jpeg,image/webp,' : ''}text/*,.md,.txt,.json,.csv,.ts,.tsx,.js,.jsx,.css,.html,.xml,.yaml,.yml`}
        onStop={onStop}
        submitLabel={working ? 'Adicionar à fila' : 'Enviar mensagem'}
        placeholder={working ? 'Enter adiciona à fila · Ctrl/Cmd+Enter envia para o turno em andamento' : 'Escreva uma mensagem…'}
        onSubmit={(message, selection) => { void submit(message, selection.files) }}
        trailingControls={working && <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 rounded-full" aria-label="Parar geração" title="Parar geração" onClick={onStop}><Square className="size-4 fill-current" /></Button>}
        extraControls={<>
          <Button type="button" size="sm" variant={planMode ? 'secondary' : 'ghost'}
            aria-label="Modo planejamento" aria-pressed={planMode}
            title={planMode ? 'Planejamento ativo: não altera arquivos' : 'Ativar planejamento sem alterações'}
            disabled={busy} onClick={() => setPlanMode(current => !current)}
            className="size-8 shrink-0 rounded-full p-0 text-muted-foreground hover:text-foreground aria-pressed:bg-primary-soft aria-pressed:text-primary-soft-foreground">
            <ClipboardList className="size-4" />
          </Button>
          <AIModelSelector key={conversationId} compact models={models} providers={modelProviders}
            value={{ model: model === INHERIT_OPTION ? INHERIT_MODEL_NAME : model.id || model.name, effort: selectedEffort, ...modelOptions }}
            onChange={changeModel} disabled={busy} />
          <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground" aria-label={recording ? 'Parar gravação de voz' : 'Gravar áudio'} title={recording ? 'Parar e transcrever' : 'Ditado por voz local'} disabled={transcribing} onClick={() => void toggleRecord()}>
            {transcribing ? <LoaderCircle /> : recording ? <Square /> : <Mic />}
          </Button>
        </>}
      />
      {(recording || transcribing) && <p role="status" className="px-3 pt-1 text-[11px] text-muted-foreground">{recording ? 'Gravando áudio… clique no quadrado para transcrever.' : 'Transcrevendo sua fala localmente…'}</p>}
      {error && <p role="alert" className="px-3 pt-1 text-[11px] text-destructive">{error}</p>}
    </div>
  </div>
}
