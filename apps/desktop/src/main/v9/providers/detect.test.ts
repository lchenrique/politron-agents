import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { PassThrough } from 'node:stream'
import { join } from 'node:path'

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [], fromWebContents: vi.fn().mockReturnValue({}) }, ipcMain: { handle: vi.fn(), removeHandler: vi.fn() } }))

const dirs: string[] = []
const { crossSpawnMock } = vi.hoisted(() => ({ crossSpawnMock: vi.fn() }))
vi.mock('cross-spawn', () => ({ default: crossSpawnMock }))
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); crossSpawnMock.mockReset(); vi.unstubAllGlobals() })
function installedClis() {
  execFileMock.mockImplementation((command: string, args: string[], _opts: unknown, callback: (error: unknown, result: { stdout: string; stderr: string }) => void) => {
    callback(null, { stdout: command === 'where' || command === 'which' ? `C:/tools/${args.at(-1)}.exe\n` : '1.0\n', stderr: '' })
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
  it('tenta a próxima instalação no PATH quando a primeira está quebrada', async () => {
    execFileMock.mockImplementation((command: string, args: string[], _opts: unknown, callback: (error: unknown, output: { stdout: string; stderr: string }) => void) => {
      if (command === 'where' || command === 'which') return callback(null, { stdout: 'C:/antigo/cli.exe\nC:/Usuário Novo/cli.exe\n', stderr: '' })
      if (command.includes('/antigo/')) return callback(new Error('ENOEXEC'), { stdout: '', stderr: '' })
      callback(null, { stdout: '2.0\n', stderr: '' })
    })
    const { detectProviders } = await import('./detect')
    const providers = await detectProviders(fakeHome())
    // OpenCode entrou por API key, então só os CLIs de verdade passam pelo PATH aqui.
    expect(providers.filter(provider => provider.id !== 'opencode').every(provider => provider.path === 'C:/Usuário Novo/cli.exe' && provider.version === '2.0')).toBe(true)
  })

  it('sonda a versão pelo shim localizado no PATH do Windows', async () => {
    vi.stubGlobal('process', new Proxy(process, {
      get: (target, key) => key === 'platform' ? 'win32' : Reflect.get(target, key),
    }))
    execFileMock.mockImplementation((command: string, args: string[], _options: unknown, callback: (error: unknown, output: { stdout: string; stderr: string }) => void) => {
      if (command === 'where' && args[0] === 'codex') return callback(null, { stdout: 'C:\\npm\\codex.cmd\r\n', stderr: '' })
      if (command === 'where') return callback(new Error('not found'), { stdout: '', stderr: '' })
      if (args[0] === '--version') return callback(null, { stdout: 'codex-cli 0.160.1\n', stderr: '' })
      callback(new Error('unexpected call'), { stdout: '', stderr: '' })
    })
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() })
    crossSpawnMock.mockImplementation(() => {
      setImmediate(() => { child.stdout.end('codex-cli 0.160.1\n'); child.stderr.end(); child.emit('close', 0, null) })
      return child
    })
    const { detectProviders } = await import('./detect')
    await detectProviders(fakeHome(), { runtimeModels: { codex: async () => ({ models: [{ id: 'gpt', name: 'GPT' }], source: 'runtime' }) } })
    expect(crossSpawnMock).toHaveBeenCalledWith('C:\\npm\\codex.cmd', ['--version'], expect.objectContaining({ windowsHide: true, stdio: 'pipe' }))
  })

  it('informa ausência do catálogo do Pi sem inventar modelos', async () => {
    installedClis()
    const home = fakeHome()
    rmSync(join(home, '.pi', 'agent', 'models.json'))
    const { detectProviders } = await import('./detect')
    const providers = await detectProviders(home)
    expect(providers.find(p => p.id === 'pi')).toMatchObject({ models: null, modelReason: 'Arquivo de configuração não encontrado.' })
  })

  it('OpenCode é provedor de API: sem chave fica indisponível e explica onde configurar', async () => {
    installedClis()
    const { detectProviders } = await import('./detect')
    const provider = (await detectProviders(fakeHome())).find(p => p.id === 'opencode')
    expect(provider).toMatchObject({ found: false, operational: false, executable: false, models: null })
    expect(provider?.modelReason).toMatch(/Configurações → Provedores/)
  })

  it('OpenCode com chave consulta o catálogo do Console pelo loader injetado', async () => {
    installedClis()
    const { detectProviders } = await import('./detect')
    const providers = await detectProviders(fakeHome(), {
      hasOpenCodeKey: async () => true,
      runtimeModels: { opencode: async () => ({ models: [{ id: 'big-pickle', name: 'Big Pickle' }], source: 'runtime' }) },
    })
    expect(providers.find(p => p.id === 'opencode')).toMatchObject({ found: true, operational: true, executable: true, version: 'API', models: [{ id: 'big-pickle', name: 'Big Pickle' }] })
  })

  it('OpenCode com chave salva, mas catálogo fora do ar, não fica executável', async () => {
    installedClis()
    const { detectProviders } = await import('./detect')
    const providers = await detectProviders(fakeHome(), {
      hasOpenCodeKey: async () => true,
      runtimeModels: { opencode: async () => { throw new Error('tempo limite') } },
    })
    expect(providers.find(p => p.id === 'opencode')).toMatchObject({ found: true, executable: false, models: null, modelReason: expect.stringMatching(/tempo limite/) })
  })

  it('ignora entradas malformadas sem impedir a leitura dos outros provedores', async () => {
    installedClis()
    const home = fakeHome()
    writeFileSync(join(home, '.pi', 'agent', 'models.json'), JSON.stringify({ providers: { invalid: { models: 'oops' }, local: { models: [null, { id: 12 }, { id: 'valid', name: {} }, { id: '' }] } } }))
    const { detectProviders } = await import('./detect')
    const providers = await detectProviders(home)
    expect(providers.find(p => p.id === 'pi')?.models).toEqual([{ id: 'local/valid', name: 'valid' }])
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

  it('reporta os quatro provedores e aceita RPC válido mesmo quando --version falha', async () => {
    execFileMock.mockImplementation((command: string, args: string[], _opts: unknown, callback: (error: unknown, result: { stdout: string; stderr: string }) => void) => {
      if (command === 'where' || command === 'which') {
        const binary = args.at(-1)!
        const known = ['codex', 'claude', 'opencode', 'pi']
        callback(known.includes(binary) ? null : new Error('not found'), { stdout: known.includes(binary) ? `C:\\tools\\${binary}.exe\n` : '', stderr: '' })
        return
      }
      if (args[0] === '--version') {
        const binary = command.split(/[\\/]/).at(-1)?.replace(/\.(?:exe|cmd|bat)$/i, '')
        if (binary === 'codex') return callback(null, { stdout: 'codex-cli 0.160.1\n', stderr: '' })
        if (binary === 'claude') return callback(null, { stdout: '2.1.282 (Claude Code)\n', stderr: '' })
        if (binary === 'pi') return callback(new Error('version timeout'), { stdout: '', stderr: '' })
      }
      callback(new Error('unexpected call: ' + command), { stdout: '', stderr: '' })
    })
    const { detectProviders } = await import('./detect')
    const providers = await detectProviders(fakeHome(), { runtimeModels: {
      pi: async () => ({ models: [{ id: 'anthropic/claude-opus-4-6', name: 'claude-opus-4-6 (anthropic)' }], source: 'runtime' }),
    } })
    expect(providers.find(p => p.id === 'codex')).toMatchObject({ found: true, version: 'codex-cli 0.160.1', models: null })
    expect(providers.find(p => p.id === 'claude')).toMatchObject({ found: true, version: '2.1.282 (Claude Code)', models: null })
    // OpenCode não usa CLI: sem chave salva, fica indisponível com o motivo.
    expect(providers.find(p => p.id === 'opencode')).toMatchObject({ found: false, operational: false, models: null })
    expect(providers.find(p => p.id === 'pi')).toMatchObject({ found: true, operational: true, executable: true, version: null, modelReason: undefined, models: [{ id: 'anthropic/claude-opus-4-6', name: 'claude-opus-4-6 (anthropic)' }] })
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
    expect(providers).toHaveLength(4)
  }, 30_000)
})
