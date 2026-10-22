import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Mic, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ModelChoice, ModelProviderChoice } from './model-options'
import AIModelSelector, { type ModelSelection } from '@/components/kokonutui/ai-model-selector'
import type { Agent, FileChange, ModelEffort } from '../../../../shared/v9'
import { CompletedFileReview } from '../diff/CompletedFileReview'
import { INHERIT_MODEL_NAME, errorText } from '../app/appShellShared'
import { VoiceRecorder } from '../voice/voice-recorder'
import { PromptInput } from '@/components/ai/prompt-input'
import { MentionSuggestions } from './MentionSuggestions'
import { getMentionQuery, replaceMention, type MentionQuery } from './mentions'

export type ComposerModel = ModelChoice
const INHERIT_OPTION: ComposerModel = { name: INHERIT_MODEL_NAME, description: 'Cada participante usa o modelo configurado no seu perfil' }

export function Composer({ models, modelProviders, defaultModelName, defaultEffort, onModelChange, onSubmit, onStop, conversationId, reviewChanges = [], reviewKey = '', onVoiceNotice, mentionAgents = [], working = false, canSteer = false }: {
  reviewChanges?: FileChange[]
  reviewKey?: string
  working?: boolean
  canSteer?: boolean
  conversationId?: string
  mentionAgents?: Agent[]
  models: ComposerModel[]
  modelProviders?: ModelProviderChoice[]
  defaultModelName?: string
  defaultEffort?: Agent['effort']
  onModelChange: (model: string) => void
  onSubmit: (value: string, modelName: string, options: { files: File[]; effort: Agent['effort'] }) => Promise<void>
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
  const [pendingSends, setPendingSends] = useState(0)
  const pendingCount = useRef(0)
  const submissionGeneration = useRef(0)
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
  }

  useEffect(() => {
    try { setValue(draftKey ? localStorage.getItem(draftKey) || '' : '') } catch { setValue('') }
    setFiles([])
    setMention(null)
    submissionGeneration.current++
    pendingCount.current = 0
    setPendingSends(0)
  }, [conversationId, draftKey])

  useEffect(() => {
    setModelName(defaultModelName || INHERIT_MODEL_NAME)
    setEffort(defaultEffort || 'medium')
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

  const submit = async (rawValue = value, chosenFiles = files) => {
    const message = rawValue.trim()
    if ((!message && chosenFiles.length === 0) || ((working || pendingCount.current > 0) && !canSteer)) return
    const submittedConversation = conversationId
    const submittedGeneration = submissionGeneration.current
    const submittedFiles = chosenFiles
    pendingCount.current++
    setPendingSends(pendingCount.current)
    setError('')
    setValue('')
    setFiles([])
    try {
      await onSubmit(message, model === INHERIT_OPTION ? INHERIT_MODEL_NAME : model.id || model.name, { files: submittedFiles, effort: selectedEffort })
    } catch (cause) {
      if (activeConversation.current === submittedConversation) { setValue(current => current || message); setFiles(current => current.length ? current : submittedFiles); notify(cause) }
    } finally { if (submissionGeneration.current === submittedGeneration) { pendingCount.current--; setPendingSends(pendingCount.current) } }
  }

  return <div className="shrink-0 px-3 pb-2 pt-1 sm:px-6">
    <div className="mx-auto max-w-3xl">
      {reviewChanges.length > 0 && <CompletedFileReview key={reviewKey} changes={reviewChanges} />}
      <PromptInput
        className="rounded-2xl border border-border/90 bg-card shadow-sm transition-[border-color,box-shadow] duration-150 dark:border-foreground/25 dark:shadow-[0_8px_28px_rgba(0,0,0,0.24)] focus-within:border-ring/70 focus-within:ring-2 focus-within:ring-ring/15 dark:focus-within:border-foreground/45"
        value={value}
        onValueChange={setValue}
        textareaRef={textareaRef}
        onCaretChange={updateMention}
        mentionOpen={mention !== null && mentionAgents.length > 0}
        mentionListId={mentionListId}
        mentionActiveId={mentionOptions[activeMention] ? `${mentionListId}-${mentionOptions[activeMention].id}` : undefined}
        onTextareaKeyDown={event => {
          if (!mention || event.nativeEvent.isComposing || event.keyCode === 229) return
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
        }}
        suggestions={mention && mentionAgents.length > 0 ? <MentionSuggestions id={mentionListId} agents={mentionOptions} activeIndex={activeMention} onSelect={chooseMention} /> : null}
        files={files}
        onFilesChange={setFiles}
        showModelPicker={false}
        pending={busy && !canSteer}
        onStop={onStop}
        submitLabel={busy && canSteer ? 'Enviar instrução durante a execução' : 'Enviar mensagem'}
        placeholder={busy && canSteer ? 'Acrescente uma instrução à tarefa em andamento…' : 'Escreva uma mensagem…'}
        onSubmit={(message, selection) => { void submit(message, selection.files) }}
        extraControls={<>
          {busy && canSteer && <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 rounded-full" aria-label="Parar geração" onClick={onStop}><Square /></Button>}
          <AIModelSelector key={conversationId} models={models} providers={modelProviders}
            value={{ model: model === INHERIT_OPTION ? INHERIT_MODEL_NAME : model.id || model.name, effort: selectedEffort }}
            onChange={changeModel} disabled={busy} />
          <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 rounded-full" aria-label={recording ? 'Parar gravação de voz' : 'Gravar áudio'} title={recording ? 'Parar e transcrever' : 'Ditado por voz local'} disabled={transcribing} onClick={() => void toggleRecord()}>
            {transcribing ? <LoaderCircle /> : recording ? <Square /> : <Mic />}
          </Button>
        </>}
      />
      {(recording || transcribing) && <p role="status" className="px-3 pt-1 text-[11px] text-muted-foreground">{recording ? 'Gravando áudio… clique no quadrado para transcrever.' : 'Transcrevendo sua fala localmente…'}</p>}
      {error && <p role="alert" className="px-3 pt-1 text-[11px] text-destructive">{error}</p>}
    </div>
  </div>
}
