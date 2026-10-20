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
    expect(providers.every(provider => provider.path === 'C:/Usuário Novo/cli.exe' && provider.version === '2.0')).toBe(true)
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
      { id: 'local/modelo', name: 'https://example.test/a//b/*literal*/' },
    ])
  })

  it('ignora entradas malformadas sem impedir a leitura dos outros provedores', async () => {
    installedClis()
    const home = fakeHome()
    writeFileSync(join(home, '.pi', 'agent', 'models.json'), JSON.stringify({ providers: { invalid: { models: 'oops' }, local: { models: [null, { id: 12 }, { id: 'valid', name: {} }, { id: '' }] } } }))
    writeFileSync(join(home, '.config', 'opencode', 'opencode.json'), JSON.stringify({ provider: { missing: null, broken: { models: 'oops' }, valid: { models: { okay: { name: 12 }, invalid: null } } } }))
    const { detectProviders } = await import('./detect')
    const providers = await detectProviders(home)
    expect(providers.find(p => p.id === 'pi')?.models).toEqual([{ id: 'local/valid', name: 'valid' }])
    expect(providers.find(p => p.id === 'opencode')?.models).toEqual([{ id: 'valid/okay', name: 'okay' }])
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

  it('reporta os cinco provedores e aceita RPC válido mesmo quando --version falha', async () => {
    execFileMock.mockImplementation((command: string, args: string[], _opts: unknown, callback: (error: unknown, result: { stdout: string; stderr: string }) => void) => {
      if (command === 'where' || command === 'which') {
        const binary = args.at(-1)!
        const known = ['codex', 'claude', 'agy', 'opencode', 'pi']
        callback(known.includes(binary) ? null : new Error('not found'), { stdout: known.includes(binary) ? `C:\\tools\\${binary}.exe\n` : '', stderr: '' })
        return
      }
      if (args[0] === '--version') {
        const binary = command.split(/[\\/]/).at(-1)?.replace(/\.(?:exe|cmd|bat)$/i, '')
        if (binary === 'codex') return callback(null, { stdout: 'codex-cli 0.160.1\n', stderr: '' })
        if (binary === 'claude') return callback(null, { stdout: '2.1.282 (Claude Code)\n', stderr: '' })
        if (binary === 'agy') return callback(null, { stdout: '1.4.0\n', stderr: '' })
        if (binary === 'pi') return callback(new Error('version timeout'), { stdout: '', stderr: '' })
        if (binary === 'opencode') return callback(new Error('postinstall not run'), { stdout: '', stderr: '' })
      }
      callback(new Error('unexpected call: ' + command), { stdout: '', stderr: '' })
    })
    const { detectProviders } = await import('./detect')
    const providers = await detectProviders(fakeHome(), { runtimeModels: {
      pi: async () => ({ models: [{ id: 'anthropic/claude-opus-4-6', name: 'claude-opus-4-6 (anthropic)' }], source: 'runtime' }),
    } })
    expect(providers.find(p => p.id === 'codex')).toMatchObject({ found: true, version: 'codex-cli 0.160.1', models: null })
    expect(providers.find(p => p.id === 'claude')).toMatchObject({ found: true, version: '2.1.282 (Claude Code)', models: null })
    // Antigravity não tem fonte local conhecida de modelos ainda; listar exigiria chamar o CLI, que pode travar esperando login.
    expect(providers.find(p => p.id === 'antigravity')).toMatchObject({ found: true, version: '1.4.0', models: null })
    // Instalado mas com --version falhando continua "encontrado", só sem versão.
    expect(providers.find(p => p.id === 'opencode')).toMatchObject({ found: true, version: null, models: [{ id: '9router/oc/big-pickle', name: 'oc/big-pickle' }] })
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
    expect(providers).toHaveLength(5)
  }, 30_000)
})
