import { ModelPicker, type ModelOption, type ModelEffort } from '@/components/ai/model-picker'
import { ArrowUpIcon } from '@solar-icons/react/linear/arrow-up'
import { CloseCircleIcon as CloseIcon } from '@solar-icons/react/linear/close-circle'
import { PromptToolsMenu, promptTools, type PromptTool } from '@/components/ai/prompt-tools-menu'
import { StopIcon as SquareIcon } from '@solar-icons/react/linear/stop'
import * as React from 'react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from 'cn'

interface PromptInputProps extends Omit<React.ComponentProps<'form'>, 'onSubmit'> {
  defaultValue?: string
  model?: string
  models?: ModelOption[]
  moreModels?: ModelOption[]
  onModelChange?: (model: string) => void
  effort?: ModelEffort
  onEffortChange?: (effort: ModelEffort) => void
  onSubmit?: (
    value: string,
    selection: { model: string; effort: ModelEffort; tool?: PromptTool; files: File[] },
  ) => void
  onToolSelect?: (tool: PromptTool) => void
  onFilesChange?: (files: File[]) => void
  files?: File[]
  onValueChange?: (value: string) => void
  onStop?: () => void
  onExtraAction?: () => void
  extraControls?: ReactNode
  /** Controles logo à esquerda do botão de enviar. */
  trailingControls?: ReactNode
  suggestions?: ReactNode
  textareaRef?: React.Ref<HTMLTextAreaElement>
  onCaretChange?: (value: string, caret: number) => void
  onTextareaKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement>
  mentionListId?: string
  mentionActiveId?: string
  mentionOpen?: boolean
  showModelPicker?: boolean
  showAttachments?: boolean
  textareaLabel?: string
  accept?: string
  pending?: boolean
  submitDisabled?: boolean
  placeholder?: string
  submitLabel?: string
  value?: string
}

const chipEnterClass =
  'transition-[opacity,scale,background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] starting:scale-95 starting:opacity-0 motion-reduce:starting:scale-100'

function PromptInput({
  className,
  defaultValue = '',
  onValueChange,
  onStop,
  onExtraAction,
  extraControls,
  trailingControls,
  suggestions,
  textareaRef: forwardedTextareaRef,
  onCaretChange,
  onTextareaKeyDown,
  mentionListId,
  mentionActiveId,
  mentionOpen = false,
  showModelPicker = true,
  showAttachments = true,
  textareaLabel = 'Message',
  accept,
  value: valueProp,
  model,
  models = [],
  moreModels = [],
  onModelChange,
  effort,
  onEffortChange,
  onSubmit,
  onToolSelect,
  onFilesChange,
  files: filesProp,
  pending = false,
  submitDisabled = false,
  placeholder = 'Ask anything…',
  submitLabel = 'Enviar mensagem',
  ...props
}: PromptInputProps) {
  const [internalValue, setInternalValue] = useState(defaultValue)
  const value = valueProp ?? internalValue
  const setValue = (next: string) => {
    if (valueProp === undefined) setInternalValue(next)
    onValueChange?.(next)
  }
  const [selectedTool, setSelectedTool] = useState<PromptTool>()
  const [internalFiles, setInternalFiles] = useState<File[]>([])
  const files = filesProp ?? internalFiles
  const updateFiles = (next: File[]) => {
    if (filesProp === undefined) setInternalFiles(next)
    onFilesChange?.(next)
  }
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [internalModel, setInternalModel] = useState(
    models.find((item) => !item.requiresUpgrade)?.id ?? '',
  )
  const [internalEffort, setInternalEffort] = useState<ModelEffort>('medium')
  const selectedModel = model ?? internalModel
  const selectedEffort = effort ?? internalEffort
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function resizeTextarea(element: HTMLTextAreaElement) {
    element.style.height = '0px'
    element.style.height = `${Math.max(36, Math.min(element.scrollHeight, 220))}px`
  }

  useLayoutEffect(() => {
    if (textareaRef.current) resizeTextarea(textareaRef.current)
  }, [value])

  function submitPrompt() {
    const prompt = value.trim()
    if ((!prompt && !files.length) || pending) return
    onSubmit?.(prompt, { model: selectedModel, effort: selectedEffort, tool: selectedTool, files })
    if (valueProp === undefined) {
      updateFiles([])
      setValue('')
    }
  }

  return (
    <form
      data-slot="prompt-input"
      className={cn(
        'relative w-full rounded-[16px] border border-border bg-card p-2.5 shadow-[0_1px_0_rgb(0_0_0/0.04),0_6px_8px_-6px_rgb(0_0_0/0.08)]',
        className,
      )}
      onSubmit={(event) => {
        event.preventDefault()
        submitPrompt()
      }}
      {...props}
    >
      {showAttachments && <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        aria-label="Upload files"
        onChange={(event) => {
          const next = [...files, ...Array.from(event.target.files ?? [])]
          updateFiles(next)
          event.target.value = ''
        }}
      />}
      {(files.length > 0 || selectedTool) && (
        <div className="flex flex-wrap gap-2 px-2 py-1">
          {selectedTool && (
            <Button
              type="button"
              variant="secondary"
              size="xs"
              className={chipEnterClass}
              onClick={() => setSelectedTool(undefined)}
              aria-label="Clear selected tool"
            >
              {promptTools.find((tool) => tool.id === selectedTool)?.label}
              <CloseIcon />
            </Button>
          )}
          {files.map((file, index) => (
            <Button
              key={`${file.name}-${index}`}
              type="button"
              variant="secondary"
              size="xs"
              className={cn('max-w-48', chipEnterClass)}
              aria-label={`Remove ${file.name}`}
              onClick={() => {
                const next = files.filter((_, fileIndex) => fileIndex !== index)
                updateFiles(next)
              }}
            >
              <span className="truncate">{file.name}</span>
              <CloseIcon />
            </Button>
          ))}
        </div>
      )}
      <Textarea
        ref={(element) => {
          textareaRef.current = element
          if (typeof forwardedTextareaRef === 'function') forwardedTextareaRef(element)
          else if (forwardedTextareaRef) forwardedTextareaRef.current = element
        }}
        aria-label={textareaLabel}
        role={mentionOpen ? 'combobox' : undefined}
        aria-autocomplete={mentionOpen ? 'list' : undefined}
        aria-expanded={mentionOpen ? true : undefined}
        aria-controls={mentionOpen ? mentionListId : undefined}
        aria-activedescendant={mentionOpen ? mentionActiveId : undefined}
        className="min-h-[36px] resize-none rounded-md border-0 bg-transparent px-2 py-1.5 text-[15px]/6 font-[450] tracking-normal shadow-none placeholder:font-normal focus-visible:ring-0 md:text-[15px]/6 dark:bg-transparent"
        onChange={(event) => {
          setValue(event.target.value)
          resizeTextarea(event.target)
          onCaretChange?.(event.target.value, event.target.selectionStart)
        }}
        onClick={event => onCaretChange?.(event.currentTarget.value, event.currentTarget.selectionStart)}
        onKeyUp={event => onCaretChange?.(event.currentTarget.value, event.currentTarget.selectionStart)}
        onPaste={(event) => {
          if (showAttachments && event.clipboardData.files.length) {
            const next = [...files, ...Array.from(event.clipboardData.files)]
            updateFiles(next)
          }
        }}
        onDrop={(event) => {
          event.preventDefault()
          if (showAttachments && event.dataTransfer.files.length) {
            const next = [...files, ...Array.from(event.dataTransfer.files)]
            updateFiles(next)
          }
        }}
        onDragOver={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          onTextareaKeyDown?.(event)
          if (event.defaultPrevented) return
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
            event.preventDefault()
            submitPrompt()
          }
        }}
        placeholder={placeholder}
        rows={1}
        value={value}
      />
      {suggestions}
      <div className="flex items-center justify-between gap-2 pt-2">
        <div className="flex min-w-0 items-center gap-1">
          {showAttachments && <Button type="button" variant="ghost" size="icon" aria-label="Anexar arquivos" title="Anexar arquivos" onClick={() => { if (onExtraAction) onExtraAction(); else fileInputRef.current?.click() }}><span aria-hidden="true">＋</span></Button>}
          {showModelPicker && <PromptToolsMenu
            onSelect={(tool) => {
              if (tool === 'files') fileInputRef.current?.click()
              else setSelectedTool(tool)
              onToolSelect?.(tool)
            }}
          />}
          {showModelPicker && <ModelPicker
            models={models}
            moreModels={moreModels}
            value={selectedModel}
            effort={selectedEffort}
            onValueChange={(next) => {
              if (model === undefined) setInternalModel(next)
              onModelChange?.(next)
            }}
            onEffortChange={(next) => {
              if (effort === undefined) setInternalEffort(next)
              onEffortChange?.(next)
            }}
          />}
          {extraControls}
        </div>
        <div className="flex shrink-0 items-center gap-1">
        {trailingControls}
        <Button
          aria-label={pending ? 'Parar geração' : submitLabel}
          className="rounded-full border-0 bg-primary bg-linear-to-b from-[color-mix(in_oklch,var(--primary),var(--primary-foreground)_30%)] to-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(0,0,0,0.18)] shadow-none hover:brightness-110 dark:bg-none"
          variant="default"
          disabled={submitDisabled || !pending && !value.trim() && !files.length}
          size="icon-lg"
          type={pending ? 'button' : 'submit'}
          onClick={pending ? onStop : undefined}
        >
          <span className="grid *:col-start-1 *:row-start-1 *:transition-[opacity,scale] *:duration-150 *:ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:*:transition-opacity">
            <ArrowUpIcon
              aria-hidden="true"
              className={cn('place-self-center', pending && 'scale-75 opacity-0')}
            />
            <SquareIcon
              aria-hidden="true"
              className={cn(
                'size-3 place-self-center fill-current',
                !pending && 'scale-75 opacity-0',
              )}
            />
          </span>
        </Button>
        </div>
      </div>
    </form>
  )
}

export { PromptInput }
export type { PromptInputProps }
