import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, ipcMain: { handle: vi.fn(), on: vi.fn() }, safeStorage: { isEncryptionAvailable: () => false } }))

import { SentenceBuffer, float32ToInt16, int16ToFloat32, isLikelyHallucination, sampleRateFromMime, speakable, wavFromFloat32 } from './audio-text'
import { chatStream } from './groq'
import { RealtimeService, voiceInstructions } from './service'
import type { Agent } from '../../../shared/v9'

afterEach(() => vi.unstubAllGlobals())

describe('frases para a voz começar cedo', () => {
  it('libera cada frase completa assim que termina, sem esperar o resto da resposta', () => {
    const buffer = new SentenceBuffer()
    expect(buffer.push('Claro, posso te ajudar com isso agora. ')).toEqual(['Claro, posso te ajudar com isso agora.'])
    expect(buffer.push('Me conta qual tela está')).toEqual([])
    expect(buffer.push(' com problema? Ok')).toEqual(['Me conta qual tela está com problema?'])
    expect(buffer.flush()).toEqual(['Ok'])
  })

  it('não corta número decimal nem frase curta demais', () => {
    const buffer = new SentenceBuffer()
    expect(buffer.push('Sim. A versão 3.5 é a mais nova do projeto todo. ')).toEqual(['Sim. A versão 3.5 é a mais nova do projeto todo.'])
  })

  it('tira markdown que soaria estranho falado', () => {
    expect(speakable('**Pronto!** Veja o `login.ts` e [o guia](http://x).')).toBe('Pronto! Veja o login.ts e o guia.')
  })
})

describe('áudio', () => {
  it('converte PCM ida e volta sem estourar', () => {
    const samples = Float32Array.from([0, 0.5, -0.5, 1, -1, 2])
    const back = int16ToFloat32(float32ToInt16(samples))
    expect(back[1]).toBeCloseTo(0.5, 3)
    expect(back[5]).toBeCloseTo(1, 3)
  })

  it('gera WAV mono 16 bits com cabeçalho correto', () => {
    const wav = wavFromFloat32(new Float32Array(16000), 16000)
    const view = new DataView(wav.buffer)
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF')
    expect(view.getUint32(24, true)).toBe(16000)
    expect(view.getUint32(40, true)).toBe(32000)
  })

  it('lê a taxa do mime do Gemini e usa 24 kHz quando falta', () => {
    expect(sampleRateFromMime('audio/pcm;rate=24000')).toBe(24000)
    expect(sampleRateFromMime('audio/pcm')).toBe(24000)
  })

  it('descarta alucinação conhecida do Whisper só em trechos curtos', () => {
    expect(isLikelyHallucination('Obrigado por assistir.', 1.2)).toBe(true)
    expect(isLikelyHallucination('Legendas pela comunidade Amara.org', 1)).toBe(true)
    expect(isLikelyHallucination('Obrigado, era isso mesmo.', 1.5)).toBe(false)
    expect(isLikelyHallucination('Obrigado.', 4)).toBe(false)
  })
})

describe('Groq em streaming', () => {
  const sse = (events: unknown[]) => {
    const text = events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n'
    const bytes = new TextEncoder().encode(text)
    // Quebra no meio de uma linha para garantir que o parser junta pedaços.
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(bytes.slice(0, 37)); controller.enqueue(bytes.slice(37)); controller.close() } }))
  }

  it('entrega o texto em pedaços e junta chamadas de ferramenta fragmentadas', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sse([
      { choices: [{ delta: { content: 'Vou ' } }] },
      { choices: [{ delta: { content: 'mandar.' } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'delegar_tarefa', arguments: '{"tarefa":' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"corrigir login"}' } }] } }] },
    ]))
    vi.stubGlobal('fetch', fetchMock)
    const chunks = []
    for await (const chunk of chatStream('k'.repeat(30), 'openai/gpt-oss-20b', [{ role: 'user', content: 'oi' }], [], new AbortController().signal)) chunks.push(chunk)
    expect(chunks.filter(chunk => chunk.type === 'text').map(chunk => chunk.type === 'text' && chunk.delta).join('')).toBe('Vou mandar.')
    expect(chunks.at(-1)).toEqual({ type: 'tools', calls: [{ id: 'c1', type: 'function', function: { name: 'delegar_tarefa', arguments: '{"tarefa":"corrigir login"}' } }] })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.reasoning_effort).toBe('low')
    expect(body.include_reasoning).toBe(false)
  })

  it('traduz limite gratuito estourado em mensagem clara', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('rate limit', { status: 429 })))
    const run = async () => { for await (const _ of chatStream('k'.repeat(30), 'llama', [], [], new AbortController().signal)) { /* consome */ } }
    await expect(run()).rejects.toThrow(/Limite gratuito do Groq/)
  })
})

describe('persona da ligação', () => {
  it('mantém a identidade do Pit, pede respostas curtas e manda trabalho real pela ferramenta', () => {
    const prompt = voiceInstructions({ name: 'Nina', description: 'frontend', instructions: 'Cuide da interface.' } as Agent, 'Usuário: oi')
    expect(prompt).toContain('Você é Nina, frontend,')
    expect(prompt).toContain('executar_tarefa')
    expect(prompt).toContain('Usuário: oi')
  })
})


describe('ferramentas de gestão durante ligação por voz', () => {
  const getTools = (service: RealtimeService, agent: Agent) =>
    (service as unknown as { voiceTools: (conversationId: string, agent: Agent) => Array<{ name: string; run: (args: Record<string, unknown>) => Promise<string> }> }).voiceTools('conv-chief-voice', agent)

  it('anuncia ao Chief a criação de Boos e a autoedição, em vez de negar capacidades reais', () => {
    const chief = { id: 'chief-voice', role: 'chief', name: 'Atlas', instructions: 'Coordene Boos.' } as Agent
    const prompt = voiceInstructions(chief, 'Atlas: criar agentes está fora das minhas capacidades.')
    expect(prompt).toContain('propor_criacao_boo')
    expect(prompt).toContain('editar_meu_perfil')
    expect(prompt).toContain('aprovação')
    expect(prompt).toContain('Não repita limitações falsas')
  })

  it('encaminha pedidos de criar Boo e editar perfil ao motor do mesmo agente', async () => {
    const app = { respondToAgent: vi.fn().mockResolvedValue('Proposta enviada para aprovação.') }
    const service = new RealtimeService('D:/tmp/boobot-realtime-tests', app as never, 30)
    const chief = { id: 'chief-voice', role: 'chief', name: 'Atlas' } as Agent
    const tools = getTools(service, chief)
    expect(tools.map(tool => tool.name)).toEqual(['executar_tarefa', 'propor_criacao_boo', 'editar_meu_perfil'])
    expect(await tools.find(tool => tool.name === 'propor_criacao_boo')!.run({ tarefa: 'Crie um Boo especialista em design' })).toContain('Proposta enviada')
    expect(app.respondToAgent).toHaveBeenCalledWith('conv-chief-voice', expect.stringContaining('propose_boos'), chief.id)
    expect(await tools.find(tool => tool.name === 'editar_meu_perfil')!.run({ tarefa: 'Mude sua cor para azul' })).toContain('Proposta enviada')
    expect(app.respondToAgent).toHaveBeenCalledWith('conv-chief-voice', expect.stringContaining('propose_self_profile'), chief.id)
  })

  it('não expõe criação de agente a Boos comuns', () => {
    const service = new RealtimeService('D:/tmp/boobot-realtime-tests', { respondToAgent: vi.fn() } as never)
    const regular = { id: 'normal-voice', role: 'agent', name: 'Nina' } as Agent
    expect(getTools(service, regular).map(tool => tool.name)).toEqual(['executar_tarefa', 'editar_meu_perfil'])
  })
})
