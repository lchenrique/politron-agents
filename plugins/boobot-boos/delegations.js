// Delegações do Chief a um Boo: uma sessão nova do Boo, no projeto, com a tarefa. O estado vem do log da própria sessão (último turno),
// então sobrevive a reinícios e não depende de eventos em memória. Funções puras: o DSH (criar sessão, prompt, inspect) fica em index.js.
import { randomUUID } from 'node:crypto'

export const MAX_DELEGATIONS = 200
export const MAX_SUMMARY = 1500
const MAX_TASK = 4000

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text)

/** Texto de uma mensagem (blocos `text` concatenados). */
export const textOf = message => (Array.isArray(message?.content) ? message.content.filter(block => block?.type === 'text').map(block => block.text).join('\n').trim() : '')

/**
 * Lê o log da sessão do Boo e diz em que pé a delegação está.
 * running: há turno aberto, ou ainda não houve nenhum; done: último turno concluiu; blocked: parou esperando alguém (aprovação, pergunta);
 * failed: erro, aborto ou limite de tokens. O resumo é a última resposta do Boo antes do fim do turno.
 */
export function analyze(events) {
  let lastStart = -1
  let lastEnd = -1
  let reason
  for (const event of events ?? []) {
    if (event.type === 'turn/start') lastStart = event.seq
    if (event.type === 'turn/end') { lastEnd = event.seq; reason = event.data?.reason }
  }
  if (lastEnd < 0 || lastStart > lastEnd) return { state: 'running' }
  let summary = ''
  for (const event of events) if (event.type === 'assistant/message' && event.seq < lastEnd && event.seq > lastStart - 1) summary = textOf(event.data?.message) || summary
  const kind = reason?.kind ?? 'completed'
  const base = { summary: clip(summary, MAX_SUMMARY), endKind: kind }
  if (kind === 'completed') return { state: 'done', ...base }
  if (kind === 'blocked') return { state: 'blocked', ...base }
  return { state: 'failed', ...base, error: kind === 'error' ? String(reason?.error?.message ?? 'erro do modelo') : `turno terminou: ${kind}` }
}

/** Texto enviado à sessão de origem (o Chief) quando a delegação termina. Marcado como automático para o Chief não confundir com o usuário. */
export function notificationText(delegation, outcome) {
  const head = { done: 'CONCLUÍDA', failed: 'FALHOU', blocked: 'PAROU E PRECISA DE VOCÊ' }[outcome.state] ?? outcome.state
  return [
    `[DELEGAÇÃO ${head} — mensagem automática do Boobot, não é do usuário]`,
    `Boo: ${delegation.name} (${delegation.handle}) | Projeto: ${delegation.projectTitle} | Conversa do Boo: ${delegation.sessionId}`,
    `Tarefa delegada: ${clip(delegation.task, 300)}`,
    outcome.state === 'failed' && outcome.error && `Motivo: ${outcome.error}`,
    outcome.state === 'blocked' && 'O Boo parou esperando uma aprovação ou resposta na conversa dele; o usuário precisa abri-la.',
    outcome.summary ? `Resultado:\n${outcome.summary}` : 'O Boo não deixou um resumo escrito; abra a conversa dele para ver o que foi feito.',
  ].filter(Boolean).join('\n')
}

/** Prompt entregue ao Boo na sessão nova: quem delegou, onde, e como devolver o resultado. */
export function taskPrompt({ chiefName, project, task }) {
  return [
    `Tarefa delegada por ${chiefName} (o Chief). Projeto: ${project.title}. A pasta de trabalho desta conversa é ${project.path}; faça as alterações do projeto lá.`,
    '',
    task,
    '',
    'Ao terminar, responda com um resumo objetivo: o que foi feito, arquivos alterados e pendências. Esse resumo é entregue ao Chief automaticamente quando você parar de trabalhar. Se algo impedir a tarefa, diga o que faltou em vez de improvisar.',
  ].join('\n')
}

export function createDelegation(input, now = new Date().toISOString()) {
  const task = typeof input.task === 'string' ? input.task.trim() : ''
  if (!task) throw new Error('Informe a tarefa a delegar.')
  if (task.length > MAX_TASK) throw new Error(`A tarefa passa de ${MAX_TASK} caracteres.`)
  return {
    id: randomUUID(), agentId: input.agentId, handle: input.handle, name: input.name, workspaceId: input.workspaceId, projectTitle: input.projectTitle,
    sessionId: input.sessionId, originSessionId: input.originSessionId ?? null, task, status: 'running', summary: '', error: null,
    startedAt: now, finishedAt: null, notified: null,
  }
}

/** Aplica o resultado da análise do log à delegação (só sai de `running`/`blocked`; estados finais não mudam). */
export function applyOutcome(delegation, outcome, now = new Date().toISOString()) {
  if (outcome.state === 'running') return delegation
  if (delegation.status === 'done' || delegation.status === 'failed') return delegation
  const finished = outcome.state === 'done' || outcome.state === 'failed'
  return { ...delegation, status: outcome.state, summary: outcome.summary ?? '', error: outcome.error ?? null, finishedAt: finished ? now : null }
}

/** Mantém no máximo MAX_DELEGATIONS, descartando as concluídas mais antigas primeiro (nunca as em andamento). */
export function prune(list) {
  if (list.length <= MAX_DELEGATIONS) return list
  const finished = list.filter(item => item.status === 'done' || item.status === 'failed').sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  const drop = new Set(finished.slice(0, list.length - MAX_DELEGATIONS).map(item => item.id))
  return list.filter(item => !drop.has(item.id))
}

/** `notified` guarda o último status avisado ao Chief: "parou" e depois "concluiu" geram dois avisos, e o mesmo status nunca é avisado duas vezes. */
export const needsNotice = item => Boolean(item.originSessionId) && item.status !== 'running' && item.notified !== item.status

/** Delegações que ainda precisam de atenção do Host: sem desfecho, ou com desfecho ainda não avisado ao Chief. */
export const pending = list => list.filter(item => item.status === 'running' || needsNotice(item))
