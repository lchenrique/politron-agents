import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [], fromWebContents: vi.fn().mockReturnValue({}) }, ipcMain: { handle: vi.fn(), removeHandler: vi.fn() } }))

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function installedClis() {
  execFileMock.mockImplementation((command: string, args: string[], _opts: unknown, callback: (error: unknown, result: { stdout: string; stderr: string }) => void) => {
    callback(null, { stdout: command === 'where' || command === 'which' ? `C:/tools/${args[0]}.exe\n` : '1.0\n', stderr: '' })
  })
}
function fakeHome() {
  const home = mkdtempSync(join(tmpdir(), 'politron-providers-'))
  dirs.push(home)
  mkdirSync(join(home, '.pi', 'agent'), { recursive: true })
  writeFileSync(join(home, '.pi', 'agent', 'models.json'), JSON.stringify({ providers: { anthropic: { models: [{ id: 'claude-opus-4-6', name: 'claude-opus-4-6 (anthropic)' }] } } }))
  mkdirSync(join(home, '.config', 'opencode'), { recursive: true })
  writeFileSync(join(home, '.config', 'opencode', 'opencode.json'), JSON.stringify({ provider: { '9router': { models: { 'oc/big-pickle': { name: 'oc/big-pickle' } } } } }))
  return home
}

const execFileMock = vi.fn()
vi.mock('node:child_process', () => {
  const execFile = (...args: unknown[]) => execFileMock(...args)
  return { execFile, default: { execFile } }
})

describe('detecção de CLIs de agente instaladas', () => {
  it('informa ausência dos arquivos de configuração sem inventar catálogo', async () => {
    installedClis()
    const home = fakeHome()
    rmSync(join(home, '.pi', 'agent', 'models.json'))
    rmSync(join(home, '.config', 'opencode', 'opencode.json'))
    const { detectProviders } = await import('./detect')
    const providers = await detectProviders(home)
    for (const id of ['pi', 'opencode']) expect(providers.find(p => p.id === id)).toMatchObject({ models: null, modelReason: 'Arquivo de configuração não encontrado.' })
  })

  it.each([null, 'texto', [], { provider: [] }, { provider: null }, { provider: 'texto' }])('recusa configuração sem mapa válido de provedores: %j', async config => {
    installedClis()
    const home = fakeHome()
    writeFileSync(join(home, '.config', 'opencode', 'opencode.json'), JSON.stringify(config))
    const { detectProviders } = await import('./detect')
    const providers = await detectProviders(home)
    expect(providers.find(p => p.id === 'opencode')).toMatchObject({ models: null, modelReason: expect.stringMatching(/ausente ou inválido/) })
    expect(providers.find(p => p.id === 'pi')?.models).toHaveLength(1)
  })

  it('interpreta JSONC com comentários, vírgulas finais e barras dentro de strings', async () => {
    installedClis()
    const home = fakeHome()
    rmSync(join(home, '.config', 'opencode', 'opencode.json'))
    writeFileSync(join(home, '.config', 'opencode', 'opencode.jsonc'), `{
      // Catálogo local
      "provider": { "local": { "models": {
        "modelo": { "name": "https://example.test/a//b/*literal*/", },
      }, }, },
    }`)
    const { detectProviders } = await import('./detect')
    expect((await detectProviders(home)).find(p => p.id === 'opencode')?.models).toEqual([
      { id: 'modelo', name: 'https://example.test/a//b/*literal*/' },
    ])
  })

  it('ignora entradas malformadas sem impedir a leitura dos outros provedores', async () => {
    installedClis()
    const home = fakeHome()
    writeFileSync(join(home, '.pi', 'agent', 'models.json'), JSON.stringify({ providers: { invalid: { models: 'oops' }, local: { models: [null, { id: 12 }, { id: 'valid', name: {} }, { id: '' }] } } }))
    writeFileSync(join(home, '.config', 'opencode', 'opencode.json'), JSON.stringify({ provider: { missing: null, broken: { models: 'oops' }, valid: { models: { okay: { name: 12 }, invalid: null } } } }))
    const { detectProviders } = await import('./detect')
    const providers = await detectProviders(home)
    expect(providers.find(p => p.id === 'pi')?.models).toEqual([{ id: 'valid', name: 'valid' }])
    expect(providers.find(p => p.id === 'opencode')?.models).toEqual([{ id: 'okay', name: 'okay' }])
  })

  it('recusa JSONC com erro de sintaxe em vez de aceitar o resultado parcial do parser', async () => {
    installedClis()
    const home = fakeHome()
    rmSync(join(home, '.config', 'opencode', 'opencode.json'))
    writeFileSync(join(home, '.config', 'opencode', 'opencode.jsonc'), '{"provider":{"local":{"models":{"partial":{}}}}} trailing')
    const { detectProviders } = await import('./detect')
    const provider = (await detectProviders(home)).find(p => p.id === 'opencode')
    expect(provider?.models).toBeNull()
    expect(provider?.modelReason).toMatch(/inválid/i)
  })

  it('não ignora JSON inválido presente usando outro catálogo silenciosamente', async () => {
    installedClis()
    const home = fakeHome()
    writeFileSync(join(home, '.config', 'opencode', 'opencode.json'), '{"provider":')
    writeFileSync(join(home, '.config', 'opencode', 'opencode.jsonc'), '{"provider":{"local":{"models":{"other":{}}}}}')
    const { detectProviders } = await import('./detect')
    expect((await detectProviders(home)).find(p => p.id === 'opencode')).toMatchObject({ models: null, modelReason: expect.stringMatching(/inválid/) })
  })

  it('consulta modelos reais por loader injetado e informa ausência de credencial', async () => {
    installedClis()
    const { detectProviders } = await import('./detect')
    const providers = await detectProviders(fakeHome(), { runtimeModels: {
      codex: async () => ({ models: [{ id: 'actual', name: 'Modelo disponível' }], source: 'runtime' }),
      claude: async () => ({ models: null, reason: 'Configure uma chave de API Anthropic no Politron.' }),
    } })
    expect(providers.find(p => p.id === 'codex')).toMatchObject({ models: [{ id: 'actual', name: 'Modelo disponível' }], modelSource: 'runtime' })
    expect(providers.find(p => p.id === 'claude')).toMatchObject({ models: null, modelReason: 'Configure uma chave de API Anthropic no Politron.' })
  })

  it('limita loaders travados e preserva o catálogo de outros provedores', async () => {
    installedClis()
    const { detectProviders } = await import('./detect')
    const providers = await detectProviders(fakeHome(), { modelTimeoutMs: 10, runtimeModels: {
      codex: () => new Promise(() => {}),
      claude: async () => { throw new Error('Falha ao consultar Claude.') },
    } })
    expect(providers.find(p => p.id === 'codex')).toMatchObject({ models: null, modelReason: expect.stringMatching(/tempo/i) })
    expect(providers.find(p => p.id === 'claude')).toMatchObject({ models: null, modelReason: 'Falha ao consultar Claude.' })
    expect(providers.find(p => p.id === 'pi')?.models).toHaveLength(1)
  })

  it('reporta os cinco provedores, com versão para quem respondeu a --version', async () => {
    execFileMock.mockImplementation((command: string, args: string[], _opts: unknown, callback: (error: unknown, result: { stdout: string; stderr: string }) => void) => {
      if (command === 'where' || command === 'which') {
        const binary = args[0]
        const known = ['codex', 'claude', 'agy', 'opencode', 'pi']
        callback(known.includes(binary) ? null : new Error('not found'), { stdout: known.includes(binary) ? `C:\\tools\\${binary}.exe\n` : '', stderr: '' })
        return
      }
      if (args[0] === '--version') {
        if (command === 'codex') return callback(null, { stdout: 'codex-cli 0.160.1\n', stderr: '' })
        if (command === 'claude') return callback(null, { stdout: '2.1.282 (Claude Code)\n', stderr: '' })
        if (command === 'agy') return callback(null, { stdout: '1.4.0\n', stderr: '' })
        if (command === 'pi') return callback(null, { stdout: '0.84.1\n', stderr: '' })
        if (command === 'opencode') return callback(new Error('postinstall not run'), { stdout: '', stderr: '' })
      }
      callback(new Error('unexpected call: ' + command), { stdout: '', stderr: '' })
    })
    const { detectProviders } = await import('./detect')
    const providers = await detectProviders(fakeHome())
    expect(providers.find(p => p.id === 'codex')).toMatchObject({ found: true, version: 'codex-cli 0.160.1', models: null })
    expect(providers.find(p => p.id === 'claude')).toMatchObject({ found: true, version: '2.1.282 (Claude Code)', models: null })
    // Antigravity não tem fonte local conhecida de modelos ainda; listar exigiria chamar o CLI, que pode travar esperando login.
    expect(providers.find(p => p.id === 'antigravity')).toMatchObject({ found: true, version: '1.4.0', models: null })
    // Instalado mas com --version falhando continua "encontrado", só sem versão.
    expect(providers.find(p => p.id === 'opencode')).toMatchObject({ found: true, version: null, models: [{ id: 'oc/big-pickle', name: 'oc/big-pickle' }] })
    expect(providers.find(p => p.id === 'pi')).toMatchObject({ found: true, version: '0.84.1', models: [{ id: 'claude-opus-4-6', name: 'claude-opus-4-6 (anthropic)' }] })
  })

  it('marca como não encontrado quando o binário não está no PATH', async () => {
    execFileMock.mockImplementation((_command: string, _args: string[], _opts: unknown, callback: (error: unknown, result: { stdout: string; stderr: string }) => void) => callback(new Error('not found'), { stdout: '', stderr: '' }))
    const { detectProviders } = await import('./detect')
    const load = vi.fn().mockResolvedValue({ models: [] })
    const providers = await detectProviders(fakeHome(), { runtimeModels: { codex: load, claude: load } })
    expect(providers.every(p => p.found === false && p.version === null && p.path === null)).toBe(true)
    expect(load).not.toHaveBeenCalled()
  })
})

describe('IPC do diagnóstico de provedores', () => {
  it('registra list e refresh no processo principal, sem redetectar no list', async () => {
    const { ipcMain } = await import('electron')
    const { registerProviderDetectionIpc } = await import('./detect')
    const snapshot = { providers: [], checkedAt: '2026-10-18T20:00:00Z' }
    const registry = {
      list: vi.fn().mockResolvedValue(snapshot),
      refresh: vi.fn().mockResolvedValue(snapshot),
      onChanged: vi.fn(() => () => undefined),
    }
    const off = registerProviderDetectionIpc({}, registry)
    const handlerFor = (channel: string) => vi.mocked(ipcMain.handle).mock.calls.slice().reverse().find(call => call[0] === channel)?.[1]
    const event = { sender: {} } as Electron.IpcMainInvokeEvent
    expect(handlerFor('providers:list')).toBeTypeOf('function')
    expect(handlerFor('providers:refresh')).toBeTypeOf('function')
    expect(await handlerFor('providers:list')!(event)).toEqual(snapshot)
    expect(await handlerFor('providers:refresh')!(event)).toEqual(snapshot)
    expect(registry.list).toHaveBeenCalledOnce()
    expect(registry.refresh).toHaveBeenCalledOnce()
    off()
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('providers:refresh')
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('providers:list')
  })

  it('repassa loaders, valida a janela e remove apenas seu handler ao encerrar', async () => {
    installedClis()
    const { BrowserWindow, ipcMain } = await import('electron')
    const { registerProviderDetectionIpc } = await import('./detect')
    const load = vi.fn().mockResolvedValue({ models: [{ id: 'actual', name: 'Modelo disponível' }], source: 'runtime' })
    const remove = registerProviderDetectionIpc({ runtimeModels: { codex: load } })
    const handler = vi.mocked(ipcMain.handle).mock.calls.at(-1)![1]
    const sender = {} as Electron.WebContents
    const event = { sender } as Electron.IpcMainInvokeEvent
    const providers = await handler(event)
    expect(providers.find((provider: { id: string }) => provider.id === 'codex')).toMatchObject({ models: [{ id: 'actual', name: 'Modelo disponível' }], modelSource: 'runtime' })
    expect(load).toHaveBeenCalledOnce()
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValueOnce(null)
    expect(() => handler(event)).toThrow('Janela do Politron indisponível.')
    remove()
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('providers:detect')
  })
})

describe('detecção com binários reais desta máquina', () => {
  it.skipIf(process.env.POLITRON_SKIP_REAL_CLI_SMOKE)('encontra os CLIs reais instalados e lê a versão', async () => {
    vi.doUnmock('node:child_process')
    vi.resetModules()
    const { detectProviders } = await import('./detect')
    const providers = await detectProviders()
    for (const provider of providers) console.log(`[smoke] ${provider.id}: found=${provider.found} version=${provider.version ?? '(sem versão)'} path=${provider.path ?? '-'} modelos=${provider.models?.length ?? '(n/d)'}`)
    expect(providers).toHaveLength(5)
  }, 30_000)
})
