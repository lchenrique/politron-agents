import AI_Prompt, { type PromptModel } from '@/components/kokonutui/ai-prompt'
import type { Agent } from '../../../../shared/v9'
import { EFFORT_LABELS, EFFORT_LEVELS, INHERIT_MODEL_NAME, effortFromLabel } from '../app/appShellShared'

const EFFORT_OPTIONS = EFFORT_LEVELS.map(level => EFFORT_LABELS[level])
const INHERIT_OPTION: PromptModel = { name: INHERIT_MODEL_NAME, description: 'Cada participante usa o modelo configurado no seu perfil' }

export function Composer({ models, defaultModelName, defaultEffort, onModelChange, onSubmit, onStop, conversationId }: {
  conversationId?: string
  models: PromptModel[]
  defaultModelName?: string
  defaultEffort?: Agent['effort']
  onModelChange: (model: string) => void
  onSubmit: (value: string, modelName: string, options: { files: File[]; effort: Agent['effort'] }) => Promise<void>
  onStop: () => void
}) {
  // "Usar o modelo do agente" não tem efforts: ao escolhê-lo, o botão de esforço some e nada é sobrescrito no envio.
  const withEffort = [INHERIT_OPTION, ...models.map(model => ({ ...model, efforts: model.efforts ?? EFFORT_OPTIONS, defaultEffort: model.defaultEffort ?? EFFORT_LABELS[defaultEffort || 'medium'] }))]
  return <div className="shrink-0 px-3 pb-2 pt-1 sm:px-6">
    <div className="mx-auto max-w-3xl">
      <AI_Prompt
        key={conversationId}
        draftKey={conversationId ? 'politron.composer.draft.' + conversationId : undefined}
        models={withEffort}
        defaultModel={defaultModelName}
        onModelChange={onModelChange}
        placeholder="Peça qualquer coisa ou use @ para escolher os agentes…"
        headerText=""
        commands={[]}
        onSubmit={(value, modelName, options) => onSubmit(value, modelName, { files: options.files, effort: effortFromLabel(options.effort || '') })}
        onStop={onStop}
      />
    </div>
  </div>
}
