/** Gatilhos automáticos: um evento externo vira uma mensagem numa conversa, pelo mesmo envio do Composer. */
export type TriggerSource =
  | { kind: 'folder'; path: string }
  | { kind: 'github-issue'; label: string }
  | { kind: 'github-ci' }

export interface Trigger {
  id: string; name: string; source: TriggerSource
  /** Conversa que recebe a mensagem; em grupo vale o roteamento normal (líder ou roteador). */
  conversationId: string
  /** Modelo com variáveis entre chaves, por exemplo {arquivos}, {titulo}, {url}. */
  template: string
  enabled: boolean
  lastFiredAt: string | null; lastError: string | null
  /** Itens do GitHub já vistos (issues ou execuções de CI), para só disparar com novidades. */
  seen?: string[]
  createdAt: string; updatedAt: string
}

export interface TriggerAvailability { github: { available: boolean; reason: string | null } }

export const TRIGGER_VARIABLES: Record<TriggerSource['kind'], string[]> = {
  folder: ['pasta', 'arquivos', 'quantidade'],
  'github-issue': ['numero', 'titulo', 'url', 'label'],
  'github-ci': ['workflow', 'branch', 'url', 'titulo'],
}

export const DEFAULT_TRIGGER_TEMPLATES: Record<TriggerSource['kind'], string> = {
  folder: 'Arquivos novos ou alterados em {pasta}:\n{arquivos}\n\nVerifique o que mudou e diga se algo precisa de atenção.',
  'github-issue': 'Issue nova com a label {label}: #{numero} {titulo}\n{url}\n\nLeia a issue e proponha o próximo passo.',
  'github-ci': 'O CI falhou no workflow {workflow} (branch {branch}): {titulo}\n{url}\n\nInvestigue a causa e proponha a correção.',
}

/** Troca {variavel} pelo valor; variáveis desconhecidas ficam como estão. */
export function renderTriggerTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => Object.prototype.hasOwnProperty.call(values, key) ? values[key] : whole)
}

export interface TriggersAPI {
  list(): Promise<Trigger[]>
  availability(): Promise<TriggerAvailability>
  save(input: Partial<Trigger>): Promise<Trigger>
  remove(id: string): Promise<void>
}
