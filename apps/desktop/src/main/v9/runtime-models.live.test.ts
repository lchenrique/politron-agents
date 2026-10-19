// @vitest-environment node
import { tmpdir } from 'node:os'
import { expect, it, vi } from 'vitest'
import { CodexRuntime } from './codex'
import { ClaudeRuntime } from './claude'
import { detectProviders } from './providers/detect'

vi.mock('electron', () => ({ BrowserWindow: {}, ipcMain: {} }))

it.skipIf(process.env.POLITRON_RUN_MODEL_DISCOVERY !== '1')('consulta apenas catálogos dos CLIs locais, sem enviar mensagem', async () => {
  const codex = new CodexRuntime()
  const claude = new ClaudeRuntime(tmpdir(), async () => null)
  try {
    const providers = await detectProviders(undefined, { runtimeModels: {
      codex: async () => ({ models: await codex.models(), source: 'runtime' }),
      claude: async binaryPath => ({ models: await claude.models(binaryPath), source: 'runtime' }),
    } })
    console.info(JSON.stringify({ probe: 'cli-models', providers: providers.map(provider => ({
      id: provider.id, found: provider.found, operational: provider.operational,
      modelCount: provider.models?.length ?? null, source: provider.modelSource,
      reason: provider.modelReason, models: provider.models?.slice(0, 4).map(model => ({ id: model.id, efforts: model.supportedEfforts })),
    })) }))
    expect(providers).toHaveLength(5)
    expect(providers.some(provider => provider.models?.length)).toBe(true)
  } finally { codex.close(); claude.close() }
}, 45000)
