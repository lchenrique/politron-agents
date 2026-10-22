import { describe, expect, it } from 'vitest'
import type { DynamicTool } from './codex'
import { fingerprintTools } from './tool-contract'

const first: DynamicTool = { type: 'function', name: 'workspace_read', description: 'Lê arquivos.', inputSchema: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } } }
const second: DynamicTool = { type: 'function', name: 'workspace_list', description: 'Lista arquivos.', inputSchema: { type: 'object', properties: { path: { type: 'string' } } } }

describe('fingerprintTools', () => {
  it('usa serialização canônica independente da ordem de ferramentas e chaves', () => {
    const reordered: DynamicTool = { ...first, inputSchema: { properties: { path: { type: 'string' } }, required: ['path'], type: 'object' } }
    expect(fingerprintTools([first, second], 1)).toBe(fingerprintTools([second, reordered], 1))
  })

  it('invalida a sessão quando descrição, schema ou versão do broker muda', () => {
    const descriptionChange = { ...first, description: 'Lê conteúdo de arquivos.' }
    const schemaChange = { ...first, inputSchema: { ...first.inputSchema, required: [] } }
    const baseline = fingerprintTools([first], 1)
    expect(fingerprintTools([descriptionChange], 1)).not.toBe(baseline)
    expect(fingerprintTools([schemaChange], 1)).not.toBe(baseline)
    expect(fingerprintTools([first], 2)).not.toBe(baseline)
  })
})
