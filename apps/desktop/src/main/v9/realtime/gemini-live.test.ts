import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RealtimeEvent } from '../../../shared/realtime'
import { openGeminiLive } from './gemini-live'

/** WebSocket falso que registra o que o Politron manda e deixa o teste simular o servidor do Gemini. */
class FakeSocket extends EventTarget {
  static OPEN = 1
  static last: FakeSocket
  readyState = 0
  binaryType = 'blob'
  sent: { setup?: { model: string; generationConfig: { responseModalities: string[]; speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: string } } } }; tools: { functionDeclarations: { name: string }[] }[] }; realtimeInput?: { audio: { mimeType: string } }; toolResponse?: { functionResponses: unknown[] } }[] = []
  constructor(readonly url: string) { super(); FakeSocket.last = this; queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event('open')) }) }
  send(data: string) { this.sent.push(JSON.parse(data)) }
  close() { this.readyState = 3 }
  server(message: unknown) { const event = new MessageEvent('message', { data: JSON.stringify(message) }); this.dispatchEvent(event) }
}

afterEach(() => vi.unstubAllGlobals())

describe('Gemini Live', () => {
  it('configura a sessão, repassa áudio, toca a resposta, trata interrupção e executa ferramenta', async () => {
    vi.stubGlobal('WebSocket', FakeSocket)
    const events: RealtimeEvent[] = []
    const run = vi.fn().mockResolvedValue('Tarefa enviada para Nina.')
    const opening = openGeminiLive({ key: 'chave-de-teste-123456789', model: 'gemini-live-x', voice: 'Kore', instructions: 'Seja breve.', emit: event => events.push(event),
      tools: [{ name: 'delegar_tarefa', description: 'd', parameters: { type: 'object' }, run }] })
    await vi.waitFor(() => expect(FakeSocket.last?.sent.length).toBe(1))
    const socket = FakeSocket.last
    expect(socket.url).toContain('key=chave-de-teste-123456789')
    expect(socket.binaryType).toBe('arraybuffer')
    const setup = socket.sent[0].setup!
    expect(setup.model).toBe('models/gemini-live-x')
    expect(setup.generationConfig.responseModalities).toEqual(['AUDIO'])
    expect(setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Kore')
    expect(setup.tools[0].functionDeclarations[0].name).toBe('delegar_tarefa')

    socket.server({ setupComplete: {} })
    const session = await opening
    session.pushAudio(new Int16Array([1, 2, 3]))
    expect(socket.sent[1].realtimeInput!.audio.mimeType).toBe('audio/pcm;rate=16000')

    socket.server({ serverContent: { inputTranscription: { text: 'corrige o login' } } })
    socket.server({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'AAAA' } }] } } })
    expect(events).toContainEqual({ type: 'audio', data: 'AAAA', sampleRate: 24000 })
    expect(events).toContainEqual({ type: 'transcript', role: 'user', text: 'corrige o login', final: true })

    socket.server({ serverContent: { interrupted: true } })
    expect(events).toContainEqual({ type: 'interrupted' })

    socket.server({ toolCall: { functionCalls: [{ id: 'f1', name: 'delegar_tarefa', args: { tarefa: 'corrigir login' } }] } })
    await vi.waitFor(() => expect(socket.sent.some(message => message.toolResponse)).toBe(true))
    expect(run).toHaveBeenCalledWith({ tarefa: 'corrigir login' })
    expect(socket.sent.find(message => message.toolResponse)!.toolResponse!.functionResponses[0]).toEqual({ id: 'f1', name: 'delegar_tarefa', response: { result: 'Tarefa enviada para Nina.' } })
    session.close()
  })

  it('explica falha de chave quando o servidor fecha antes de aceitar a sessão', async () => {
    vi.stubGlobal('WebSocket', FakeSocket)
    const opening = openGeminiLive({ key: 'chave-ruim-0000000000000', model: 'm', voice: 'Puck', instructions: '', tools: [], emit: () => undefined })
    await vi.waitFor(() => expect(FakeSocket.last?.sent.length).toBe(1))
    FakeSocket.last.dispatchEvent(Object.assign(new Event('close'), { code: 1008, reason: 'API key not valid' }))
    await expect(opening).rejects.toThrow(/recusou a sessão/)
  })
})
