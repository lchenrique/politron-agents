import { describe, expect, it } from 'vitest'
import { pocketWavToAudio } from './pocket-audio'
import { wavFromFloat32 } from './audio-text'

describe('PocketTTS conectado à voz em tempo real', () => {
  it('converte o WAV de saída para PCM transmitido ao player', () => {
    const input = wavFromFloat32(Float32Array.from([0, 0.5, -0.5, 1]), 24000)
    const result = pocketWavToAudio(input)
    expect(result.sampleRate).toBe(24000)
    const bytes = Buffer.from(result.data, 'base64')
    expect(bytes.byteLength).toBe(8)
    expect(bytes.readInt16LE(2)).toBeGreaterThan(16000)
  })
  it('não transmite áudio incompleto nem WAV em formato não suportado', () => {
    const wav = wavFromFloat32(Float32Array.from([0.1]), 24000)
    const wrongChannels = Uint8Array.from(wav)
    new DataView(wrongChannels.buffer).setUint16(22, 2, true)
    expect(() => pocketWavToAudio(wrongChannels)).toThrow(/PCM mono/)
    expect(() => pocketWavToAudio(wav.subarray(0, 39))).toThrow(/inválido|truncado/)
  })
})
