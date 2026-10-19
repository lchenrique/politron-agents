import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mocks = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({
  app: { getPath: (name: string) => name === 'music' ? mocks.root : mocks.root },
}))
import { PitVoiceService, PIT_VOICE_CHOICES } from './pit-voices'

let root: string
let samples: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'politron-pit-voice-'))
  samples = join(root, 'Music', 'Politron - Vozes PT-BR')
  mkdirSync(samples, { recursive: true })
  mocks.root = root
})
afterEach(() => { rmSync(root, { recursive: true, force: true }) })

describe('vozes aprovadas dos Pits', () => {
  it('expoe apenas as nove vozes aprovadas', () => {
    expect(PIT_VOICE_CHOICES.map(voice => voice.id)).toEqual(['f1','f2','f3','f4','m1','m1-young','dora','alex','santa'])
  })
  it('persiste a voz geral e as vozes individuais entre instancias', async () => {
    const first = new PitVoiceService(root, samples)
    expect(await first.selection()).toEqual({ defaultVoiceId: 'f1', agentVoiceIds: {} })
    await first.setPreset('dora')
    await first.setPreset('alex', 'pit-1')
    await first.setPreset('santa', 'pit-2')
    const second = new PitVoiceService(root, samples)
    expect(await second.selection()).toEqual({
      defaultVoiceId: 'dora',
      agentVoiceIds: { 'pit-1': 'alex', 'pit-2': 'santa' },
    })
    await second.setPreset(null, 'pit-1')
    expect(await first.selection()).toEqual({ defaultVoiceId: 'dora', agentVoiceIds: { 'pit-2': 'santa' } })
  })
  it('rejeita vozes nao aprovadas e ids de agente perigosos', async () => {
    const service = new PitVoiceService(root, samples)
    await expect(service.setPreset('m3' as never)).rejects.toThrow(/aprovada/)
    await expect(service.setPreset('dora', '../path')).rejects.toThrow(/invalido/)
    await expect(service.setPreset(null)).rejects.toThrow(/geral/)
  })
  it('entrega amostras como Uint8Array, sem buffer externo no IPC', async () => {
    const fake = Buffer.concat([Buffer.from('RIFF', 'ascii'), Buffer.alloc(80)])
    writeFileSync(join(samples, 'kokoro-dora.wav'), fake)
    const sample = await new PitVoiceService(root, samples).sample('dora')
    expect(sample).toBeInstanceOf(Uint8Array)
    expect(sample).not.toBeInstanceOf(Buffer)
    expect(sample.length).toBe(fake.length)
    await expect(new PitVoiceService(root, samples).sample('m3')).rejects.toThrow(/aprovada/)
  })
})
