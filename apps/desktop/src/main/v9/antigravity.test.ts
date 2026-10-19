// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseAntigravityModels } from './antigravity'

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
})
