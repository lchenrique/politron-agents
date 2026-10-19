import { describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'
const root = join(process.env.APPDATA || '', 'politron-desktop')
vi.mock('electron', () => ({
  app: { getPath: (name: string) => name === 'music'
    ? join(process.env.USERPROFILE || '', 'Music')
    : join(process.env.APPDATA || '', 'politron-desktop') },
}))
import { PitVoiceService } from './pit-voices'

// Opt-in test; usa os modelos reais da maquina conectada, sem solicitar API paga.
describe.skipIf(process.env.POLITRON_VOICE_SMOKE !== '1')('audio real Supertonic / Kokoro', () => {
  it('gera WAV reproduzivel com F1, Dora e M1 Jovem', async () => {
    const service = new PitVoiceService(root)
    expect(await service.installed()).toBe(true)
    const id = 'smoke-pit'
    try {
      for (const voice of ['f1', 'dora', 'm1-young'] as const) {
        await service.setPreset(voice, id)
        const bytes = await service.speak('Oi, eu sou um Pit do Politron!', id)
        expect(bytes[0]).toBe('R'.charCodeAt(0))
        expect(bytes.length).toBeGreaterThan(10_000)
        console.info(voice, bytes.length)
      }
    } finally {
      await service.setPreset(null, id)
    }
  }, 180_000)
})
