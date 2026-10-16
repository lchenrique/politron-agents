import { ASSISTANT_ID, type Agent, type Snapshot } from '../../../../shared/v9'

export const assistantPlaceholder: Agent = { id: ASSISTANT_ID, name: 'Assistente', alias: 'assistente', description: '', instructions: '', runtime: 'codex', model: '', color: '#6366f1', avatar: '', canWrite: false, computerUse: false, approvalMode: 'ask', revision: 1, createdAt: '' }
export const emptySnapshot: Snapshot = { assistant: assistantPlaceholder, agents: [], projects: [], workspaces: [], conversations: [], messages: [], runs: [], fileChanges: [], approvals: [] }
export const errorText = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir essa ação.'
export const aliasFor = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
