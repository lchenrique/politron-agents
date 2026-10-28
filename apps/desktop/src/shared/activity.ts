/** Atividade de ferramentas no chat: rótulos gravados como `Categoria · detalhe` e resumos por modelo (sem LLM). */

export type ActivityCategory = 'realBrowser' | 'browser' | 'terminal' | 'read' | 'edit' | 'search' | 'delegation' | 'other'

const PREFIXES: [string, ActivityCategory][] = [
  ['Navegador real', 'realBrowser'], ['Navegador interno', 'browser'], ['Terminal', 'terminal'],
  ['Leitura', 'read'], ['Edição', 'edit'], ['Busca', 'search'], ['Delegação', 'delegation'],
]
const SEPARATOR = ' · '

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
const PAST: Record<ActivityCategory, (count: number) => string> = {
  realBrowser: count => `usou o navegador real (${plural(count, 'ação', 'ações')})`,
  browser: count => `usou o navegador interno (${plural(count, 'ação', 'ações')})`,
  terminal: count => `executou ${plural(count, 'comando', 'comandos')}`,
  read: count => `leu ${plural(count, 'arquivo', 'arquivos')}`,
  edit: count => `editou ${plural(count, 'arquivo', 'arquivos')}`,
  search: count => `fez ${plural(count, 'busca', 'buscas')}`,
  delegation: count => `delegou ${plural(count, 'tarefa', 'tarefas')}`,
  other: count => `usou ${plural(count, 'ferramenta', 'ferramentas')}`,
}
const PRESENT: Record<ActivityCategory, [string, string]> = {
  realBrowser: ['Usando seu navegador real', 'ações'], browser: ['Usando o navegador interno', 'ações'], terminal: ['Executando comando', 'comandos'],
  read: ['Lendo arquivos', 'arquivos'], edit: ['Editando arquivos', 'arquivos'], search: ['Buscando', 'buscas'], delegation: ['Delegando tarefa', 'tarefas'], other: ['Usando ferramentas', 'ferramentas'],
}

const clip = (value: unknown, max = 120) => {
  const line = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}
const join = (label: string, detail: string) => detail ? `${label}${SEPARATOR}${detail}` : label

/** Rótulo de uma chamada de ferramenta do Politron, ou null para as que já têm cartão próprio (aprovações, perguntas). */
export function toolActivityText(name: string, args: Record<string, unknown>): string | null {
  if (name === 'ask_user' || name.startsWith('propose_') || name === 'external_browser_request') return null
  switch (name) {
    case 'browser_open': return join('Navegador interno', `Abrir ${clip(args.url)}`)
    case 'browser_observe': return join('Navegador interno', 'Ler a página')
    case 'browser_click': return join('Navegador interno', 'Clicar')
    case 'browser_fill': return join('Navegador interno', 'Preencher campo')
    case 'browser_key': return join('Navegador interno', 'Pressionar tecla')
    case 'browser_scroll': return join('Navegador interno', 'Rolar a página')
    case 'workspace_run_command': case 'workspace_start_process': return join('Terminal', clip(args.command))
    case 'workspace_process_status': return join('Terminal', 'Consultar processo')
    case 'workspace_stop_process': return join('Terminal', 'Encerrar processo')
    case 'workspace_read': return join('Leitura', clip(args.path))
    case 'workspace_list': return join('Leitura', clip(args.path) || '.')
    case 'read_skill': return join('Leitura', `skill ${clip(args.id)}`)
    case 'workspace_write': return join('Edição', clip(args.path))
    case 'search_history': return join('Busca', clip(args.query))
    case 'ask_agent': return join('Delegação', clip(args.agent))
    case 'delegation_result': return join('Delegação', 'Consultar resultado')
    default: return join('Ferramenta', name)
  }
}

export function activityCategory(text: string): ActivityCategory {
  return PREFIXES.find(([prefix]) => text === prefix || text.startsWith(prefix + SEPARATOR))?.[1] || 'other'
}

const hostOf = (value: string) => { try { return new URL(value).host || value } catch { return value } }

/** Passo atual no presente: categoria da última ação, com contador das ações seguidas da mesma categoria. */
export function activityNow(texts: string[]): string {
  const last = texts.at(-1)
  if (!last) return ''
  const category = activityCategory(last)
  let count = 0
  for (let index = texts.length - 1; index >= 0 && activityCategory(texts[index]!) === category; index--) count++
  const detail = last.split('\n')[0]!.split(SEPARATOR).slice(1).join(SEPARATOR)
  if (category === 'browser' && detail.startsWith('Abrir ')) return `Abrindo ${hostOf(detail.slice(6))} no navegador`
  const [label, unit] = PRESENT[category]
  return count > 1 ? `${label} (${count} ${unit})` : label
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}min${seconds % 60 ? ` ${seconds % 60}s` : ''}`
}

/** Resumo no passado, categorias na ordem em que apareceram: "Usou o navegador real (6 ações) · executou 2 comandos · 38s". */
export function activitySummary(texts: string[], durationMs?: number): string {
  const counts = new Map<ActivityCategory, number>()
  for (const text of texts) { const category = activityCategory(text); counts.set(category, (counts.get(category) || 0) + 1) }
  const parts = [...counts].map(([category, count]) => PAST[category](count))
  if (durationMs !== undefined && durationMs >= 1000) parts.push(formatDuration(durationMs))
  const summary = parts.join(SEPARATOR)
  return summary.charAt(0).toUpperCase() + summary.slice(1)
}
