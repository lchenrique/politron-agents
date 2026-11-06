/** Memória dos Boos: fatos curtos guardados só no banco local do Boobot. */
export type MemoryScope = 'global' | 'agent' | 'workspace'
export type MemoryKind = 'preferencia' | 'fato' | 'decisao' | 'resumo'
export type MemoryInclusion = 'essencial' | 'pesquisavel'
export type MemoryOrigin = 'usuario' | 'agente'

export const MEMORY_TEXT_LIMIT = 500
export const MEMORY_KINDS: MemoryKind[] = ['preferencia', 'fato', 'decisao', 'resumo']
export const MEMORY_KIND_LABEL: Record<MemoryKind, string> = { preferencia: 'Preferência', fato: 'Fato', decisao: 'Decisão', resumo: 'Resumo de trabalho' }
export const MEMORY_SCOPE_LABEL: Record<MemoryScope, string> = { global: 'Global', agent: 'Boo', workspace: 'Projeto' }

export interface Memory {
  id: string
  scope: MemoryScope
  /** agentId no escopo agent, workspaceId no escopo workspace, vazio no global. */
  ownerId: string
  text: string
  kind: MemoryKind | null
  inclusion: MemoryInclusion
  /** Inclusão escolhida pelo usuário: o agente não pode mudar. */
  inclusionLocked: boolean
  origin: MemoryOrigin
  agentId: string | null
  conversationId: string | null
  createdAt: string
  updatedAt: string
}

export interface MemoryInput {
  id?: string
  scope?: MemoryScope
  ownerId?: string
  text?: string
  kind?: MemoryKind | null
  inclusion?: MemoryInclusion
}

export interface MemoryFilter { scope?: MemoryScope; ownerId?: string; origin?: MemoryOrigin; query?: string; limit?: number }

export interface MemoryAPI {
  list(filter?: MemoryFilter): Promise<Memory[]>
  save(input: MemoryInput): Promise<Memory>
  remove(id: string): Promise<void>
  /** Abre o diálogo de salvar e grava todas as memórias em JSON; devolve o caminho ou null se cancelado. */
  exportJson(): Promise<string | null>
}
