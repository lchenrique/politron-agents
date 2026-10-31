import type { Approval } from '../../../shared/v9'

// Visão restrita dos membros privados exercitados por testes do broker.
// O cast fica nos testes; não amplia a API pública de produção.
export interface ServiceInternals {
  active: Map<string, AbortController>
  contexts: Map<string, unknown>
  callTool(context: unknown, name: string, args: Record<string, unknown>, callId?: string): Promise<unknown>
  requestApproval(context: unknown, kind: Approval['kind'], details: Approval['details'], sensitive?: boolean, alwaysAsk?: boolean): Promise<boolean>
}
