import { afterEach, describe, expect, it, vi } from 'vitest'
import { openGeminiLive } from './gemini-live'
import type { RealtimeEvent } from '../../../shared/realtime'

class FakeSocket {
  static instance: FakeSocket
  static OPEN = 1
  readyState = 1
  binaryType = 'blob'
  sent: Record<string, unknown>[] = []
  private listeners = new Map<string, (event: any) => void>()
  constructor(_url: string) { FakeSocket.instance = this }
  addEventListener(name: string, callback: (event: any) => void) { this.listeners.set(name, callback) }
  send(value: string) { this.sent.push(JSON.parse(value)) }
  message(value: unknown) { this.listeners.get('message')?.({ data: JSON.stringify(value) }) }
  open() { this.listeners.get('open')?.({}) }
  close() { this.readyState = 3; this.listeners.get('close')?.({ code: 1000, reason: '' }) }
}
afterEach(() => vi.unstubAllGlobals())

describe('Gemini Live como interface de voz do mesmo Boo', () => {
  it('não responde como outro agente; só fala a resposta autorizada do runtime real', async () => {
    vi.stubGlobal('WebSocket', FakeSocket)
    const events: RealtimeEvent[] = []
    const onUtterance = vi.fn(async (_utterance: string) => {
      session!.narrate?.('Sou Atlas, e posso propor novos Boos com sua aprovação.')
    })
    const opening = openGeminiLive({
      key: 'fake', model: 'gemini-live-fake', voice: 'Aoede',
      instructions: 'Agente Atlas.', tools: [{ name: 'acesso_indevido', description: 'Nunca expor', parameters: {}, run: vi.fn() }],
      emit: event => events.push(event),
      onUtterance,
    })
    const ws = FakeSocket.instance
    ws.open()
    const setup = ws.sent[0].setup as Record<string, unknown>
    expect(setup.tools).toBeUndefined()
    ws.message({ setupComplete: true })
    const session = await opening

    ws.message({ serverContent: {
      inputTranscription: { text: 'Cria um Boo especialista.' },
      modelTurn: { parts: [{ inlineData: { data: 'VOICE_INCORRECT', mimeType: 'audio/pcm;rate=24000' } }] },
      outputTranscription: { text: 'Não posso criar agentes.' },
      turnComplete: true,
    } })
    expect(events.filter(event => event.type === 'audio')).toHaveLength(0)
    expect(events.filter(event => event.type === 'transcript' && event.role === 'agent')).toHaveLength(0)
    await vi.waitFor(() => expect(onUtterance).toHaveBeenCalledOnce())
    expect(onUtterance).toHaveBeenCalledWith('Cria um Boo especialista.')
    const last = ws.sent[ws.sent.length - 1]
    expect(JSON.stringify(last)).toContain('FALA_DO_BOO: Sou Atlas')

    ws.message({ serverContent: {
      modelTurn: { parts: [{ inlineData: { data: 'VOICE_CORRECT', mimeType: 'audio/pcm;rate=24000' } }] },
      outputTranscription: { text: 'Sou Atlas, e posso propor novos Boos com sua aprovação.' },
      turnComplete: true,
    } })
    expect(events.filter(event => event.type === 'audio')).toEqual([
      { type: 'audio', data: 'VOICE_CORRECT', sampleRate: 24000 },
    ])
    expect(events).toContainEqual({ type: 'transcript', role: 'user', text: 'Cria um Boo especialista.', final: true })
    session.close()
  })
})
