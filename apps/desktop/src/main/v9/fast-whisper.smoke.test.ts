import { describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
vi.mock('electron', () => ({
  app: { getPath: () => join(process.env.APPDATA || '', 'politron-desktop') },
}))
import { FastWhisperService } from './fast-whisper'

describe.skipIf(process.env.POLITRON_FAST_ASR_SMOKE !== '1')('transcricao real por Python persistente', () => {
  it('transcreve PT-BR duas vezes sem recarregar o modelo', async () => {
    const service = new FastWhisperService()
    expect(await service.installed()).toBe(true)
    try {
      const wav = new Uint8Array(await readFile(join(process.env.USERPROFILE || '', 'Music', 'Politron - Vozes PT-BR', 'pit-f1.wav')))
      const warm = performance.now()
      await service.warmup()
      console.info('startup_ms', Math.round(performance.now() - warm))
      const start = performance.now()
      const first = await service.transcribe(wav)
      console.info('first_ms', Math.round(performance.now() - start), 'text=', first)
      expect(first.toLowerCase()).toContain('politron')
      const secondStart = performance.now()
      const second = await service.transcribe(wav)
      console.info('second_ms', Math.round(performance.now() - secondStart), 'text=', second)
      expect(second.toLowerCase()).toContain('politron')
    } finally { service.close() }
  }, 160_000)
})
