import { EventEmitter } from 'node:events'
import type { Model } from '../../shared/v9'
import type { AgentRuntime, RuntimeThread } from './agent-runtime'
import { execCli } from './cli-launch'

const EXECUTION_UNAVAILABLE = 'A integração do Antigravity ainda precisa limitar ferramentas, MCP e hooks antes de iniciar conversas no Boobot.'

/** `agy models` retorna slug e nome separados por tabulação, sem executar uma conversa. */
export function parseAntigravityModels(output: string): Model[] {
  const models = new Map<string, Model>()
  for (const line of output.split(/\r?\n/)) {
    const match = /^([a-z0-9][a-z0-9._-]*)\t+(.+)$/.exec(line.trim())
    if (!match) continue
    const [, id, name] = match
    models.set(id, { id, name: name.trim(), runtime: 'antigravity', isDefault: false, supportedEfforts: [] })
  }
  return [...models.values()]
}

/**
 * Catálogo oficial do CLI. A execução permanece bloqueada até existir uma configuração
 * por processo que preserve as permissões do Politron sem herdar ferramentas e hooks.
 * https://www.antigravity.google/docs/cli/headless/
 */
export class AntigravityRuntime extends EventEmitter implements AgentRuntime {
  private executable = process.platform === 'win32' ? 'agy.exe' : 'agy'

  async models(binaryPath?: string): Promise<Model[]> {
    if (binaryPath) this.executable = binaryPath
    let output: string
    try {
      const { stdout } = await execCli(this.executable, ['models'], {
        timeout: 10_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true,
      })
      output = stdout
    } catch {
      throw new Error('Não foi possível consultar os modelos do Antigravity. Verifique o login do CLI e atualize a detecção.')
    }
    const models = parseAntigravityModels(output)
    if (!models.length) throw new Error('O Antigravity não retornou um catálogo de modelos reconhecido.')
    return models
  }

  async thread(): Promise<RuntimeThread> { throw new Error(EXECUTION_UNAVAILABLE) }
  async send(): Promise<never> { throw new Error(EXECUTION_UNAVAILABLE) }
  respond(): void { /* O protocolo headless não aceita control_response. */ }
  async interrupt(): Promise<void> { /* Nenhuma execução é iniciada neste estágio. */ }
  close(): void { /* A consulta de catálogo usa um processo limitado por timeout. */ }
}
