import { randomUUID } from 'node:crypto'
import type { ActivityTool, CommandEvidence, CommandResult } from '../../shared/v9'
import { createCommandEvidence, runCommand } from './command-evidence'
import { finishedTool, startedTool } from './tool-activity'

/** "Pronto com prova": no máximo 3 continuações automáticas para corrigir uma verificação que falhou. */
export const MAX_VERIFY_ATTEMPTS = 3
export const VERIFY_TIMEOUT_MS = 300_000
const SUMMARY_MAX = 4000

export interface VerifyTurnInput {
  command: string; cwd: string; attempt: number; signal?: AbortSignal
  runId: string; agentId: string; agentName: string; conversationId: string; workspaceId: string
}
export interface VerifyTurnHost {
  putCommandEvidence(evidence: CommandEvidence): void
  /** Mensagem de atividade na conversa; devolve um atualizador para o estado final. */
  activity(text: string, tool: ActivityTool): (text: string, tool: ActivityTool) => void
  run?: typeof runCommand
}

/** Verifica só turnos de execução concluídos que mexeram em arquivos, ou que já são a correção de uma verificação. */
export function shouldVerify(input: { command?: string; status: string; planMode?: boolean; changedFiles?: boolean; verifyAttempt?: number }): boolean {
  return !!input.command?.trim() && input.status === 'completed' && !input.planMode && (!!input.changedFiles || (input.verifyAttempt ?? 0) > 0)
}

/** O final da saída costuma ter o erro; o começo, o contexto. Fica com os dois, até ~4 KB. */
export function summarizeOutput(output: string, max = SUMMARY_MAX): string {
  const clean = output.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim()
  if (clean.length <= max) return clean
  const head = Math.floor(max / 4)
  return `${clean.slice(0, head)}\n[… ${clean.length - max} caracteres omitidos …]\n${clean.slice(-(max - head))}`
}

export function verifyContinuationInput(command: string, result: CommandResult, attempt: number): string {
  const ending = result.status === 'timed_out' ? `excedeu ${VERIFY_TIMEOUT_MS / 1000} s` : `terminou com código ${result.exitCode ?? 'desconhecido'}`
  return `Notificação automática (não é uma mensagem do usuário): a verificação do projeto falhou depois das suas alterações. Comando: ${command} (${ending}).\nSaída resumida:\n${summarizeOutput(result.output)}\n\nCorrija a causa nos arquivos e conclua; o Boobot roda a verificação de novo ao fim do turno. Correção automática ${attempt} de ${MAX_VERIFY_ATTEMPTS}. Não altere nem desative a verificação para fazê-la passar.`
}

/** Roda o comando, registra evidência e atividade. Devolve o texto da continuação quando o agente deve corrigir. */
export async function verifyTurn(host: VerifyTurnHost, input: VerifyTurnInput): Promise<{ passed: boolean; retry: string | null; evidence: CommandEvidence }> {
  const createdAt = new Date().toISOString()
  const started = startedTool('workspace_run_command', { command: input.command }, value => value)
  const update = host.activity(`Verificando antes de dar como pronto · ${input.command}`, started)
  const result = await (host.run ?? runCommand)(input.command, input.cwd, input.signal, { timeoutMs: VERIFY_TIMEOUT_MS })
  const evidence = createCommandEvidence({ runId: input.runId, toolCallId: `verify:${randomUUID()}`, agentId: input.agentId, conversationId: input.conversationId, workspaceId: input.workspaceId, command: input.command, cwd: input.cwd }, result, createdAt)
  host.putCommandEvidence(evidence)
  const passed = result.status === 'completed'
  const output = `${summarizeOutput(result.output)}\nCódigo de saída: ${result.exitCode ?? 'desconhecido'}.\nEvidência: ${evidence.id}`
  const tool = finishedTool(started, passed ? 'completed' : 'failed', output, value => value)
  const next = input.attempt + 1
  const retry = !passed && result.status !== 'interrupted' && next <= MAX_VERIFY_ATTEMPTS ? verifyContinuationInput(input.command, result, next) : null
  update(passed
    ? `Verificação passou · ${input.command}`
    : result.status === 'interrupted' ? `Verificação interrompida · ${input.command}`
      : retry ? `Verificação falhou · ${input.command}. Devolvida a ${input.agentName} para corrigir (${next} de ${MAX_VERIFY_ATTEMPTS}).`
        : `Verificação falhou · ${input.command}. Limite de ${MAX_VERIFY_ATTEMPTS} correções automáticas atingido; revise o resultado.`, tool)
  return { passed, retry, evidence }
}
