import { ASSISTANT_ID, type Agent, type Snapshot } from '../../../../shared/v9'

export const assistantPlaceholder: Agent = { id: ASSISTANT_ID, name: 'Assistente', alias: 'assistente', description: '', instructions: '', runtime: 'codex', model: '', color: '#6366f1', avatar: '', canWrite: false, computerUse: false, approvalMode: 'ask', revision: 1, createdAt: '' }
export const emptySnapshot: Snapshot = { assistant: assistantPlaceholder, agents: [], workspaces: [], conversations: [], messages: [], runs: [], fileChanges: [], approvals: [], terminalEnabled: true }
export const errorText = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir essa ação.'
export const aliasFor = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-')

/** Sentinela do composer: nenhuma mudança de modelo/esforço para este envio, cada participante usa o que está configurado no seu perfil. */
export const INHERIT_MODEL_NAME = 'Usar o modelo do agente'

/** Mesma escala de esforço do editor de agente, em rótulos para o seletor do composer. */
export const EFFORT_LEVELS: NonNullable<Agent['effort']>[] = ['low', 'medium', 'high', 'xhigh', 'max']
export const EFFORT_LABELS: Record<NonNullable<Agent['effort']>, string> = { low: 'Baixo', medium: 'Equilibrado', high: 'Alto', xhigh: 'Muito alto', max: 'Máximo' }
export const effortFromLabel = (label: string): NonNullable<Agent['effort']> | undefined => EFFORT_LEVELS.find(level => EFFORT_LABELS[level] === label)
