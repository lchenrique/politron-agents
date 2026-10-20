import type { ProviderModelCatalog } from '../../shared/providers'
import { execCli } from './cli-launch'

/** Consulta a configuração efetiva do próprio CLI, inclusive XDG_CONFIG_HOME e OPENCODE_CONFIG. */
export async function readOpenCodeModels(binaryPath = 'opencode'): Promise<ProviderModelCatalog> {
  const { stdout } = await execCli(binaryPath, ['models', '--pure'], {
    timeout: 25_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true,
  })
  const ids = [...new Set(stdout.split(/\r?\n/).map(line => line.trim())
    .filter(line => /^[^\s/]+\/[^\s]+$/.test(line)))]
  if (!ids.length) throw new Error('O OpenCode não retornou um catálogo de modelos reconhecido.')
  return { models: ids.map(id => ({ id, name: id })), source: 'runtime' }
}
