import AI_Prompt, { type PromptModel } from '@/components/kokonutui/ai-prompt'

export function Composer({ models, defaultModelName, onModelChange, onSubmit, onStop }: {
  models: PromptModel[]
  defaultModelName?: string
  onModelChange: (model: string) => void
  onSubmit: (value: string, modelName: string, options: { files: File[] }) => Promise<void>
  onStop: () => void
}) {
  return <div className="shrink-0 px-4 pb-4 pt-2 sm:px-8">
    <div className="mx-auto max-w-3xl">
      <AI_Prompt
        models={models}
        defaultModel={defaultModelName}
        onModelChange={onModelChange}
        placeholder="Peça qualquer coisa ou use @ para escolher os agentes…"
        headerText=""
        commands={[]}
        onSubmit={onSubmit}
        onStop={onStop}
      />
      <p className="mt-2 px-2 text-center text-[10px] text-muted-foreground">Agentes podem errar. Confira ações realizadas nos arquivos do grupo.</p>
    </div>
  </div>
}
