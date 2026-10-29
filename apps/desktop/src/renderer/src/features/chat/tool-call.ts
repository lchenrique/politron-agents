import type { Message } from '../../../../shared/v9'
import { activityCategory, type ActivityCategory } from '../../../../shared/activity'
import type { DshToolCall, DshToolKind, DshToolState } from '@/components/dsh/tool/types'

/** Duração no formato do DSH (message-chrome.formatRunDuration), com unidades em PT-BR: "57s", "1min 23s", "1h 2min 3s". */
export function formatRunDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor(total / 60) % 60
  const seconds = total % 60
  return `${hours > 0 ? `${hours}h ` : ''}${total >= 60 ? `${minutes}min ` : ''}${seconds}s`
}

const SEPARATOR = ' · '
const READ_LINES_MAX = 400

const parseArgs = (value: string | undefined): Record<string, unknown> => {
  if (!value) return {}
  try { const parsed: unknown = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {} } catch { return {} }
}
const str = (value: unknown) => typeof value === 'string' ? value : ''
const oneLine = (value: string) => value.replace(/\s+/g, ' ').trim()
/** Saída do terminal sem o rodapé que o Boobot acrescenta para o modelo (código de saída e id da evidência). */
const terminalOutput = (value: string) => value.replace(/(\n\[Saída truncada em 32 KB\.\])?\n(Código de saída: [^\n]*|Comando encerrado após [^\n]*|Execução interrompida\.)\nEvidência: [^\n]*$/, '')

const TITLES: Partial<Record<ActivityCategory, string>> = { realBrowser: 'Navegador real', browser: 'Navegador interno', delegation: 'Delegação', followUp: 'Delegação', learning: 'Aprendizado' }

/** Estado visível: a chamada que ficou "em execução" num turno que já acabou foi interrompida. */
function stateOf(message: Message, turnActive: boolean): DshToolState {
  const status = message.tool?.status
  if (status === 'running' || (!status && message.status === 'running')) return turnActive ? 'running' : 'interrupted'
  if (status === 'failed' || (!status && message.status === 'failed')) return 'error'
  if (!status && ['interrupted', 'cancelled'].includes(message.status)) return 'interrupted'
  return 'success'
}

/**
 * Converte uma mensagem de atividade na forma neutra das linhas do DSH. Com `message.tool` usa nome, argumentos,
 * saída e código de saída; sem ele (histórico antigo) lê o texto "Categoria · detalhe".
 */
export function activityToolCall(message: Message, turnActive: boolean): DshToolCall {
  const [head = '', ...rest] = message.text.split('\n')
  const parts = head.split(SEPARATOR)
  const label = parts[0] || ''
  const detail = parts.slice(1).join(SEPARATOR)
  const category = activityCategory(message.text)
  const tool = message.tool
  const args = parseArgs(tool?.args)
  const output = tool?.output
  const state = stateOf(message, turnActive)
  const base = { id: message.id, state, durationMs: tool?.finishedAt ? Date.parse(tool.finishedAt) - Date.parse(tool.startedAt) : undefined, ...(state === 'error' && output ? { errorSummary: output.split('\n')[0] } : {}) }
  const generic = (kind: DshToolKind = 'generic'): DshToolCall => ({ ...base, kind, title: TITLES[category] ?? label, summary: oneLine(detail), input: tool?.args, output })
  const name = tool?.name
  if (category === 'terminal' && (name === undefined || name === 'workspace_run_command' || name === 'workspace_start_process')) {
    const command = str(args.command) || detail
    return { ...base, kind: 'bash', summary: '', input: tool?.args, terminal: { command, output: output === undefined ? undefined : terminalOutput(output), exitCode: tool?.exitCode, background: name === 'workspace_start_process' } }
  }
  if (category === 'read' && (name === undefined || name === 'workspace_read')) {
    const path = tool?.path ?? str(args.path) ?? detail
    const lines = output !== undefined && state === 'success' ? output.split('\n') : undefined
    return { ...base, kind: 'read', path: path || detail, summary: path || detail, read: lines && { lines: lines.slice(0, READ_LINES_MAX).map((text, index) => ({ number: index + 1, text })), totalLines: lines.length } }
  }
  if (name === 'workspace_list') {
    let paths: string[] | undefined
    try { const parsed: unknown = output ? JSON.parse(output) : undefined; if (Array.isArray(parsed)) paths = parsed.map(entry => `${str((entry as { name?: unknown }).name)}${(entry as { type?: unknown }).type === 'directory' ? '/' : ''}`) } catch { /* saída truncada: só o resumo */ }
    return { ...base, kind: 'search', title: 'Listar', summary: tool?.path || detail || '.', search: paths && { kind: 'paths', paths, total: paths.length, truncated: false } }
  }
  if (category === 'edit') return { ...base, kind: 'write', path: tool?.path || detail, summary: tool?.path || detail, output }
  if (category === 'search') return { ...base, kind: 'search', title: 'Buscar no histórico', summary: str(args.query) || detail, output, input: tool?.args }
  // Navegador real: o texto já traz a prévia redigida do código depois da primeira linha.
  if (category === 'realBrowser') return { ...base, kind: 'code', title: TITLES.realBrowser, summary: oneLine(detail), input: rest.join('\n') || tool?.args, output }
  return generic()
}

/** Atividade do passo (DSH process-activity) para títulos dos grupos e do status ao vivo. */
export type StepActivity = 'read' | 'search' | 'edit' | 'commands' | 'code' | 'webFetch' | 'subagents' | 'tools'

export function stepActivity(call: DshToolCall, message: Message): StepActivity {
  const category = activityCategory(message.text)
  if (category === 'browser' || category === 'realBrowser') return 'webFetch'
  if (category === 'delegation' || category === 'followUp') return 'subagents'
  switch (call.kind) {
    case 'read': return 'read'
    case 'search': return 'search'
    case 'edit': case 'write': return 'edit'
    case 'bash': return 'commands'
    case 'code': return 'code'
    default: return 'tools'
  }
}

const RUNNING: Record<StepActivity, string> = {
  read: 'Lendo arquivos', search: 'Buscando', edit: 'Editando arquivos', commands: 'Executando comandos', code: 'Executando código',
  webFetch: 'Navegando', subagents: 'Coordenando Boos', tools: 'Usando ferramentas',
}
const DONE: Record<StepActivity, string> = {
  read: 'Leu arquivos', search: 'Buscou', edit: 'Editou arquivos', commands: 'Executou comandos', code: 'Executou código',
  webFetch: 'Navegou na web', subagents: 'Coordenou Boos', tools: 'Usou ferramentas',
}

/** Título do grupo encerrado (DSH step-process.processTitle): até três categorias, as mais frequentes primeiro, sem contagens. */
export function processTitle(activities: StepActivity[]): string {
  const counts = new Map<StepActivity, number>()
  for (const activity of activities) counts.set(activity, (counts.get(activity) || 0) + 1)
  const ranked = [...counts].sort((left, right) => right[1] - left[1]).map(([activity]) => DONE[activity])
  const [first, ...others] = ranked
  if (!first) return 'Analisou o pedido'
  const continuation = (label: string) => label.charAt(0).toLowerCase() + label.slice(1)
  if (others.length === 1) return `${first} e ${continuation(others[0]!)}`
  const title = [first, ...others.slice(0, 2).map(continuation)].join(', ')
  return ranked.length > 3 ? `${title} etc.` : title
}

/** Passo ao vivo para o status do turno: "Executando comandos · node --version". */
export function liveStep(call: DshToolCall, activity: StepActivity): string {
  const detail = oneLine(call.terminal?.command || call.summary).slice(0, 160)
  return detail ? `${RUNNING[activity]}${SEPARATOR}${detail}` : RUNNING[activity]
}
