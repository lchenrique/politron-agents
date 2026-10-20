import { afterEach, describe, expect, it, vi } from 'vitest'
import { execCli } from './cli-launch'
import { readOpenCodeModels } from './opencode-models'

vi.mock('./cli-launch', () => ({ execCli: vi.fn() }))
afterEach(() => vi.resetAllMocks())

describe('catálogo efetivo do OpenCode', () => {
  it('consulta o executável detectado e mantém IDs completos sem duplicatas', async () => {
    vi.mocked(execCli).mockResolvedValue({ stdout: 'aviso sem modelo\n9router/oc/modelo\nopenai/gpt\n9router/oc/modelo\n', stderr: '' })
    expect(await readOpenCodeModels('C:/Outro usuário/CLI/opencode.cmd')).toEqual({
      models: [{ id: '9router/oc/modelo', name: '9router/oc/modelo' }, { id: 'openai/gpt', name: 'openai/gpt' }], source: 'runtime',
    })
    expect(execCli).toHaveBeenCalledWith('C:/Outro usuário/CLI/opencode.cmd', ['models', '--pure'], expect.objectContaining({ timeout: 25_000, windowsHide: true }))
  })

  it('não habilita modelos de configuração quando o CLI falha', async () => {
    vi.mocked(execCli).mockRejectedValue(new Error('CLI indisponível'))
    await expect(readOpenCodeModels()).rejects.toThrow('CLI indisponível')
  })

  it('recusa saída sem IDs válidos', async () => {
    vi.mocked(execCli).mockResolvedValue({ stdout: 'Faça login para continuar\n', stderr: '' })
    await expect(readOpenCodeModels()).rejects.toThrow('catálogo de modelos reconhecido')
  })
})
