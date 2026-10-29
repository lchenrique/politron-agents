import { describe, expect, it } from 'vitest'
import { clipText, finishedTool, reasoningText, redactSecrets, startedTool, TOOL_OUTPUT_MAX } from './tool-activity'

const keep = (value: string) => value

describe('prévia de ferramentas na transcrição', () => {
  it('remove segredos conhecidos e valores de chaves', () => {
    const value = redactSecrets(`OPENAI_API_KEY=sk-${'x'.repeat(30)}\nAuthorization: Bearer ${'y'.repeat(30)}\npassword: hunter2hunter\nnome=ok`)
    expect(value).not.toMatch(/sk-x|yyyy|hunter2/)
    expect(value).toContain('nome=ok')
    expect(value).toContain('OPENAI_API_KEY=')
  })

  it('trunca a saída e lê o código de saída de comandos', () => {
    const tool = startedTool('workspace_run_command', { command: 'node --version' }, keep)
    expect(tool.status).toBe('running')
    expect(tool.path).toBeUndefined()
    const done = finishedTool(tool, 'completed', `${'a'.repeat(TOOL_OUTPUT_MAX + 50)}\nCódigo de saída: 2.\nEvidência: e1`, keep)
    expect(done.output!.length).toBeLessThan(TOOL_OUTPUT_MAX + 30)
    expect(done.output).toMatch(/\[truncado\]$/)
    expect(finishedTool(tool, 'completed', 'v24\nCódigo de saída: 0.\nEvidência: e1', keep).exitCode).toBe(0)
    expect(clipText('abc', 5)).toBe('abc')
  })

  it('caminho só para ferramentas de arquivo e redator de URL do chamador aplicado', () => {
    expect(startedTool('workspace_read', { path: 'a.txt' }, keep).path).toBe('a.txt')
    expect(startedTool('browser_open', { path: 'a.txt' }, keep).path).toBeUndefined()
    expect(startedTool('browser_open', { url: 'https://a.com/?q=1' }, value => value.replace('?q=1', '')).args).not.toContain('q=1')
  })

  it('lê summary ou content do raciocínio', () => {
    expect(reasoningText({ summary: ['a', { text: 'b' }] })).toBe('a\n\nb')
    expect(reasoningText({ summary: [], content: ['c'] })).toBe('c')
    expect(reasoningText({})).toBe('')
  })
})
