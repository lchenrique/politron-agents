// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ProviderInfo } from '../../../shared/providers'
import { ProviderRegistry } from './registry'

vi.mock('./detect', () => ({ detectProviders: vi.fn() }))

const directories: string[] = []
const fakeDirectory = () => {
  const directory = mkdtempSync(join(tmpdir(), 'politron-provider-cache-'))
  directories.push(directory)
  return directory
}

const fixture = (): ProviderInfo[] => ([
  { id: 'codex', name: 'Codex', binary: 'codex', found: true, operational: true, executable: true, version: '0.160', path: '/codex', modelSource: 'runtime', models: [{ id: 'gpt-x', name: 'GPT X' }] },
  { id: 'claude', name: 'Claude Code', binary: 'claude', found: true, operational: true, executable: false, version: '2.1', path: '/claude', models: null },
  { id: 'opencode', name: 'OpenCode', binary: 'opencode', found: true, operational: false, executable: false, version: null, path: '/opencode', modelSource: 'configuration', models: [{ id: 'model-local', name: 'Local' }] },
  { id: 'pi', name: 'Pi', binary: 'pi', found: false, version: null, path: null, models: null },
])

afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })

describe('inventário persistente de CLIs', () => {
  it('varre uma vez na primeira leitura e reutiliza cache simultâneo e reinicializações', async () => {
    const directory = fakeDirectory()
    const scan = vi.fn(async () => fixture())
    const registry = new ProviderRegistry(directory, scan)
    const [first, second] = await Promise.all([registry.list(), registry.list()])
    expect(first).toEqual(second)
    expect(scan).toHaveBeenCalledTimes(1)
    expect((await registry.list()).providers).toHaveLength(4)
    const again = new ProviderRegistry(directory, vi.fn(async () => { throw new Error('Não deve detectar') }))
    expect((await again.list()).providers.find(item => item.id === 'opencode')?.operational).toBe(false)
    expect(scan).toHaveBeenCalledTimes(1)
  })

  it('só atualiza mediante ação explícita e notifica consumidores', async () => {
    const directory = fakeDirectory()
    const scan = vi.fn(async () => fixture())
    const registry = new ProviderRegistry(directory, scan)
    const listener = vi.fn()
    const off = registry.onChanged(listener)
    await registry.list()
    const previous = await registry.list()
    expect(scan).toHaveBeenCalledTimes(1)
    expect(previous.providers.find(item => item.id === 'codex')?.executable).toBe(true)
    await Promise.all([registry.refresh(), registry.refresh()])
    expect(scan).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenCalledTimes(2)
    off()
    await registry.refresh()
    expect(listener).toHaveBeenCalledTimes(2)
    expect(scan).toHaveBeenCalledTimes(3)
  })
})
