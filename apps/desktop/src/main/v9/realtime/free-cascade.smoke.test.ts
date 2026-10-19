import { describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { RealtimeEvent } from '../../../shared/realtime'
import { float32ToInt16 } from './audio-text'
import { loadPiper, openFreeCascade } from './free-cascade'

/**
 * Ponta a ponta com modelos reais (Silero VAD + Piper pt-BR), com ASR e runtime do agente simulados.
 * Rode com POLITRON_REALTIME_MODELS apontando para a pasta com silero_vad.onnx e vits-piper-pt_BR-faber-medium/.
 */
const dir = process.env.POLITRON_REALTIME_MODELS
const ready = !!dir && existsSync(join(dir, 'silero_vad.onnx'))

function resample(samples: Float32Array, from: number, to: number): Float32Array {
  const out = new Float32Array(Math.floor(samples.length * to / from))
  for (let i = 0; i < out.length; i++) out[i] = samples[Math.min(samples.length - 1, Math.floor(i * from / to))]
  return out
}

describe.skipIf(!ready)('modo gratuito de ponta a ponta', () => {
  it('detecta a fala, transcreve e fala a resposta do agente', async () => {
    const piperDir = join(dir!, 'vits-piper-pt_BR-faber-medium')
    const tts = await loadPiper(piperDir)
    const spoken = await tts.generateAsync({ text: 'Olá, tudo bem? Preciso de ajuda com o login.', sid: 0, speed: 1 })
    const speech = resample(spoken.samples, spoken.sampleRate, 16000)
    const silence = new Float32Array(16000)
    const input = new Float32Array(silence.length * 2 + speech.length)
    input.set(silence, 0); input.set(speech, silence.length)

    vi.stubGlobal('fetch', vi.fn(async (url: string) => String(url).includes('transcriptions')
      ? new Response(JSON.stringify({ text: 'Olá, tudo bem? Preciso de ajuda com o login.' }))
      : new Response('{}')))

    const events: RealtimeEvent[] = []
    const session = await openFreeCascade({ groqKey: 'k'.repeat(30), vadPath: join(dir!, 'silero_vad.onnx'), piperDir, generateResponse: async () => 'Claro, posso ajudar com o login agora. Qual erro aparece?', emit: event => events.push(event) })
    const started = Date.now()
    const pcm = float32ToInt16(input)
    for (let i = 0; i < pcm.length; i += 960) session.pushAudio(pcm.slice(i, i + 960))

    await vi.waitFor(() => expect(events.some(event => event.type === 'transcript' && event.role === 'agent' && event.final)).toBe(true), { timeout: 20_000, interval: 50 })
    await vi.waitFor(() => expect(events.filter(event => event.type === 'audio').length).toBeGreaterThanOrEqual(2), { timeout: 20_000, interval: 50 })
    const firstAudio = events.findIndex(event => event.type === 'audio')
    expect(events.find(event => event.type === 'transcript' && event.role === 'user')).toMatchObject({ text: 'Olá, tudo bem? Preciso de ajuda com o login.' })
    expect(firstAudio).toBeGreaterThan(-1)
    console.log(`[smoke] primeira voz em ${Date.now() - started} ms após empurrar o áudio`)
    session.close()
    vi.unstubAllGlobals()
  }, 60_000)
})
