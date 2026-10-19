import { describe, expect, it } from 'vitest'
import type { ProviderInfo } from '../../../../shared/providers'
import { modelOptions } from './model-options'

const provider = (id: ProviderInfo['id'], name: string, executable: boolean, ids: string[]): ProviderInfo => ({
  id, name, binary: id, found: true, executable, operational: true, version: '1.0', path: '/tool/' + id,
  modelSource: 'runtime',
  models: ids.map(id => ({ id, name: id })),
})

describe('seletor por provedor', () => {
  it('lista as cinco CLIs e permite OpenCode/Antigravity com o runtime de chat', () => {
    const inventory = [
      provider('codex', 'Codex', true, ['gpt-a']),
      provider('claude', 'Claude', true, ['haiku']),
      provider('antigravity', 'Antigravity', true, ['gemini-flash']),
      provider('opencode', 'OpenCode', true, ['open-model']),
      provider('pi', 'Pi', true, ['anthropic/opus']),
    ]
    const { models, providers } = modelOptions(inventory)
    expect(providers.map(item => item.name)).toEqual(['Codex', 'Claude', 'Antigravity', 'OpenCode', 'Pi'])
    expect(models.find(item => item.id === 'pi:anthropic/opus')?.enabled).toBe(true)
    expect(models.find(item => item.id === 'antigravity:gemini-flash')?.enabled).toBe(true)
    expect(models.find(item => item.id === 'opencode:open-model')?.enabled).toBe(true)
    expect(providers.find(item => item.id === 'antigravity')?.description).toMatch(/conversar/)
  })
})
