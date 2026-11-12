import { ASSISTANT_ID, type Agent, type Snapshot } from '../../../../shared/v9'

export const assistantPlaceholder: Agent = { id: ASSISTANT_ID, name: 'Assistente', alias: 'assistente', description: '', instructions: '', runtime: 'codex', model: '', color: '#6366f1', avatar: '', canWrite: true, computerUse: false, approvalMode: 'ask', revision: 1, createdAt: '' }
/** Rótulos curtos do modo de aprovação do Boo, do mais restrito ao mais solto. */
export const APPROVAL_MODE_LABEL: Record<Agent['approvalMode'], string> = { ask: 'Perguntar', automatic: 'Automático', bypass: 'Acesso total' }
export const emptySnapshot: Snapshot = { assistant: assistantPlaceholder, agents: [], workspaces: [], conversations: [], messages: [], runs: [], fileChanges: [], approvals: [], terminalEnabled: true }
// O Electron prefixa erros de ipcRenderer.invoke com o nome do canal; o usuário só precisa da mensagem.
// Canal sem handler: preload/renderer novos sobre um processo principal antigo (ex.: `electron-vite dev` sem -w não recompila o main).
export const errorText = (error: unknown) => {
  if (!(error instanceof Error)) return 'Não foi possível concluir essa ação.'
  const missing = /No handler registered for '([^']+)'/.exec(error.message)?.[1]
  if (missing) return `O processo principal do Boobot está desatualizado e não conhece "${missing}". Reinicie o app (no modo dev, pare e rode npm run dev de novo).`
  return error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
}
export const aliasFor = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-')

/** Sentinela do composer: nenhuma mudança de modelo/esforço para este envio, cada participante usa o que está configurado no seu perfil. */
export const INHERIT_MODEL_NAME = 'Usar o modelo do agente'

/** Nome de exibição do modelo configurado no Boo (o catálogo usa a chave `provedor:modelo`). */
export const agentModelLabel = (agent: Pick<Agent, 'runtime' | 'model'> | null | undefined, models: readonly { id?: string; name: string }[]) => {
  if (!agent?.model) return undefined
  const key = `${agent.runtime}:${agent.model}`
  return models.find(model => (model.id || model.name) === key)?.name || agent.model
}

/** Mesma escala de esforço do editor de agente, em rótulos para o seletor do composer. */
export const EFFORT_LEVELS: NonNullable<Agent['effort']>[] = ['low', 'medium', 'high', 'xhigh', 'max']
export const EFFORT_LABELS: Record<NonNullable<Agent['effort']>, string> = { low: 'Baixo', medium: 'Equilibrado', high: 'Alto', xhigh: 'Muito alto', max: 'Máximo' }
export const effortFromLabel = (label: string): NonNullable<Agent['effort']> | undefined => EFFORT_LEVELS.find(level => EFFORT_LABELS[level] === label)
