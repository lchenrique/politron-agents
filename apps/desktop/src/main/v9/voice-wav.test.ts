import { describe, expect, it } from 'vitest'
import { decodeWave, encodeWave } from './voice-wav'

describe('áudio local protegido do Politron', () => {
  it('preserva amostras PCM 16 kHz na conversão WAV', () => {
    const samples = new Float32Array(16000)
    for (let i = 0; i < samples.length; i++) samples[i] = Math.sin(i / 13) * 0.32
    const wave = encodeWave(samples, 16000)
    const decoded = decodeWave(wave)
    expect(decoded.sampleRate).toBe(16000)
    expect(decoded.samples.length).toBe(samples.length)
    expect(Math.abs(decoded.samples[500] - samples[500])).toBeLessThan(0.0001)
  })
  it('rejeita arquivos falsos, formatos incompatíveis e áudio longo demais', () => {
    expect(() => decodeWave(new Uint8Array(100))).toThrow(/WAV válido/)
    expect(() => decodeWave(encodeWave(new Float32Array(16000), 44100))).toThrow(/16 kHz/)
    expect(() => decodeWave(encodeWave(new Float32Array(16000 * 31), 16000))).toThrow(/muito longo|30 segundos/)
    expect(() => decodeWave(encodeWave(new Float32Array(2000), 16000))).toThrow(/0,25/)
  })
})
