/** Lista do que nunca fazer: vale mesmo em Acesso total e recusa a ação sem pedir aprovação. */
export interface BlockedActionRules {
  /** git push --force/-f (ou refspec +main) para main ou master. */
  forcePushMain: boolean
  /** rm -rf, del, Remove-Item e afins com alvo fora da pasta do workspace (ou a própria pasta). */
  deleteOutsideWorkspace: boolean
  /** Escrever em .env.production, .env.prod e variantes. */
  productionEnvWrite: boolean
  /** Expressões regulares extras, sem diferenciar maiúsculas, testadas contra comandos. */
  patterns: string[]
}

export const DEFAULT_BLOCKED_ACTIONS: BlockedActionRules = { forcePushMain: true, deleteOutsideWorkspace: true, productionEnvWrite: true, patterns: [] }
