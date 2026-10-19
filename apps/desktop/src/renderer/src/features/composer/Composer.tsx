import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, FileText, LoaderCircle, Mic, Paperclip, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ModelSelector, EffortSelector, type ModelChoice, type ModelProviderChoice } from './ModelSelector'
import { Textarea } from '@/components/ui/textarea'
import type { Agent, ModelEffort } from '../../../../shared/v9'
import { INHERIT_MODEL_NAME, errorText } from '../app/appShellShared'
import { VoiceRecorder } from '../voice/voice-recorder'

export type ComposerModel = ModelChoice
const INHERIT_OPTION: ComposerModel = { name: INHERIT_MODEL_NAME, description: 'Cada participante usa o modelo configurado no seu perfil' }
const MAX_HEIGHT = 220

export function Composer({ models, modelProviders, defaultModelName, defaultEffort, onModelChange, onSubmit, onStop, conversationId, onVoiceNotice, working = false, canSteer = false }: {
  working?: boolean
  canSteer?: boolean
  conversationId?: string
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const draftKey = conversationId ? 'politron.composer.draft.' + conversationId : undefined
  const model = modelName === INHERIT_MODEL_NAME ? INHERIT_OPTION : models.find(item => item.enabled !== false && ((item.id || item.name) === modelName || item.name === modelName)) || INHERIT_OPTION
  const efforts = model === INHERIT_OPTION ? [] : model.efforts || []
  const selectedEffort = efforts.includes(effort) ? effort : model.defaultEffort && efforts.includes(model.defaultEffort) ? model.defaultEffort : efforts[0]
  const changeModel = (next: string) => {
    const chosen = next === INHERIT_MODEL_NAME ? INHERIT_OPTION : models.find(item => (item.id || item.name) === next)
    if (!chosen || chosen.enabled === false) return
    setModelName(next)
    onModelChange(next)
    setEffort(chosen.defaultEffort || chosen.efforts?.[0] || 'medium')
  }

  useEffect(() => {
    try { setValue(draftKey ? localStorage.getItem(draftKey) || '' : '') } catch { setValue('') }
    setFiles([])
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

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = '36px'
    textarea.style.height = `${Math.min(MAX_HEIGHT, Math.max(36, textarea.scrollHeight))}px`
    textarea.style.overflowY = textarea.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden'
  }, [value])

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
      textareaRef.current?.focus()
    } catch (cause) {
      if (current === sequence.current && !(cause instanceof Error && cause.message === 'Gravação cancelada.')) notify(cause)
    } finally {
      if (recorder.current === next) recorder.current = null
      if (current === sequence.current) { setRecording(false); setTranscribing(false) }
    }
  }

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const additions = Array.from(incoming)
    if (additions.length) setFiles(current => [...current, ...additions])
  }, [])

  const submit = async () => {
    const message = value.trim()
    if ((!message && files.length === 0) || ((working || pendingCount.current > 0) && !canSteer)) return
    const submittedConversation = conversationId
    const submittedGeneration = submissionGeneration.current
    const submittedFiles = files
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

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit() }
  }

  return <div className="shrink-0 px-3 pb-2 pt-1 sm:px-6">
    <div className="mx-auto max-w-3xl">
      <div className="rounded-2xl border border-input bg-background shadow-sm focus-within:ring-1 focus-within:ring-ring">
        {files.length > 0 && <div className="flex flex-wrap gap-1.5 px-3 pt-3">{files.map((file, index) => <span key={`${file.name}-${index}`} className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground"><FileText className="size-3 shrink-0" /><span className="max-w-52 truncate">{file.name}</span><button type="button" aria-label={`Remover ${file.name}`} className="rounded-sm hover:text-foreground" onClick={() => setFiles(current => current.filter((_, at) => at !== index))}><X className="size-3" /></button></span>)}</div>}
        <Textarea
          ref={textareaRef}
          aria-label="Message"
          value={value}
          onChange={event => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={event => { if (event.clipboardData.files.length) addFiles(event.clipboardData.files) }}
          onDrop={event => { event.preventDefault(); addFiles(event.dataTransfer.files) }}
          onDragOver={event => event.preventDefault()}
          placeholder={busy && canSteer ? 'Acrescente uma instrução à tarefa em andamento…' : 'Escreva uma mensagem…'}
          className="min-h-[36px] resize-none border-0 bg-transparent px-4 py-2.5 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          style={{ height: 36, overflowY: 'hidden' }}
        />
        <div className="flex min-h-11 items-center gap-1.5 px-2 pb-1.5">
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={event => { if (event.target.files) addFiles(event.target.files); event.target.value = '' }} />
          <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 rounded-full text-muted-foreground" aria-label="Anexar arquivos" title="Anexar arquivos" onClick={() => fileInputRef.current?.click()}><Paperclip className="size-4" /></Button>
          <ModelSelector key={conversationId} models={models} providers={modelProviders} value={model === INHERIT_OPTION ? INHERIT_MODEL_NAME : model.id || model.name} onValueChange={changeModel} disabled={busy} />
          <EffortSelector efforts={efforts} value={selectedEffort || 'medium'} onValueChange={setEffort} disabled={busy} />
          <span className="flex-1" />
          <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 rounded-full" aria-label={recording ? 'Parar gravação de voz' : 'Gravar áudio'} title={recording ? 'Parar e transcrever' : 'Ditado por voz local'} disabled={transcribing} onClick={() => void toggleRecord()}>
            {transcribing ? <LoaderCircle /> : recording ? <Square /> : <Mic />}
          </Button>
          {busy && <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 rounded-full" aria-label="Parar geração" onClick={onStop}><Square /></Button>}
          <Button type="button" size="icon" className="size-8 shrink-0 rounded-full" aria-label={busy && canSteer ? 'Enviar instrução durante a execução' : 'Enviar mensagem'} title={busy && !canSteer ? 'Este provedor exige aguardar a conclusão da tarefa' : busy ? 'Enviar instrução para a tarefa atual' : 'Enviar mensagem'} disabled={(!value.trim() && files.length === 0) || (busy && !canSteer)} onClick={() => void submit()}><ArrowUp /></Button>
        </div>

      </div>
      {(recording || transcribing) && <p role="status" className="px-3 pt-1 text-[11px] text-muted-foreground">{recording ? 'Gravando áudio… clique no quadrado para transcrever.' : 'Transcrevendo sua fala localmente…'}</p>}
      {error && <p role="alert" className="px-3 pt-1 text-[11px] text-destructive">{error}</p>}
    </div>
  </div>
}
