// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { AntigravityRuntime, parseAntigravityModels } from './antigravity'

const { execFileMock, crossSpawnMock } = vi.hoisted(() => ({ execFileMock: vi.fn(), crossSpawnMock: vi.fn() }))
vi.mock('node:child_process', async importOriginal => {
  const original = await importOriginal<typeof import('node:child_process')>()
  return { ...original, execFile: execFileMock, default: { ...original, execFile: execFileMock } }
})
vi.mock('cross-spawn', () => ({ default: crossSpawnMock }))

afterEach(() => { vi.unstubAllGlobals(); execFileMock.mockReset(); crossSpawnMock.mockReset() })

describe('catálogo real Antigravity', () => {
  it('interpreta o TSV devolvido por agy models sem inventar níveis de esforço', () => {
    const rows = 'Fetching available models...\n' +
      'gemini-3.8-flash-high\tGemini 3.8 Flash (High)\n' +
      'claude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)\n' +
      'gpt-oss-120b-medium\tGPT-OSS 120B (Medium)\n'
    const models = parseAntigravityModels(rows)
    expect(models.map(model => model.id)).toEqual(['gemini-3.8-flash-high', 'claude-sonnet-4-6', 'gpt-oss-120b-medium'])
    expect(models.every(model => model.runtime === 'antigravity' && model.supportedEfforts?.length === 0)).toBe(true)
  })

  it('executa o shim .cmd do Antigravity no Windows usando shell', async () => {
    vi.stubGlobal('process', new Proxy(process, {
      get: (target, key) => key === 'platform' ? 'win32' : Reflect.get(target, key),
    }))
    const path = 'C:\\tools\\agy.cmd'
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(),
    })
    execFileMock.mockImplementation((_command: string, _args: string[], _options: unknown, callback: (error: null, output: { stdout: string; stderr: string }) => void) => {
      callback(null, { stdout: 'gemini-flash\tGemini Flash\n', stderr: '' })
    })
    crossSpawnMock.mockImplementation(() => {
      setImmediate(() => {
        child.stdout.end('gemini-flash\tGemini Flash\n')
        child.stderr.end()
        child.emit('close', 0, null)
      })
      return child
    })
    await expect(new AntigravityRuntime().models(path)).resolves.toMatchObject([{ id: 'gemini-flash' }])
    expect(crossSpawnMock).toHaveBeenCalledWith(path, ['models'], expect.objectContaining({ windowsHide: true, stdio: 'pipe' }))
  })
})
