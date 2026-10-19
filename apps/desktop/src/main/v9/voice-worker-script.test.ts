import { afterEach, describe, expect, it } from 'vitest'
import { Worker } from 'node:worker_threads'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { voiceWorkerScript } from './voice-worker-script'

const folders: string[] = []
afterEach(() => folders.splice(0).forEach(folder => rmSync(folder, { recursive: true, force: true })))

describe('voz sherpa-onnx compatível com Electron', () => {
  it('desativa buffers externos no TTS e produz áudio WAV transferível', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'politron-tts-test-'))
    folders.push(dir)
    const mock = join(dir, 'sherpa-mock.cjs')
    writeFileSync(mock, `
      class GenerationConfig { constructor() {} }
      class OfflineTts {
        constructor() {}
        generate(options) {
          if (options.enableExternalBuffer !== false || options.generationConfig !== undefined) throw Error('External buffers are not allowed')
          return { samples: new Float32Array([0, 0.2, -0.2, 0]), sampleRate: 22050 }
        }
      }
      module.exports = { GenerationConfig, OfflineTts }
    `)
    const worker = new Worker(voiceWorkerScript, { eval: true, workerData: { modulePath: mock, modelsDir: dir } })
    try {
      const result = await new Promise<{ id: number; wav?: Uint8Array; error?: string }>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Tempo limite do TTS')), 10_000)
        worker.once('message', message => { clearTimeout(timeout); resolve(message) })
        worker.once('error', error => { clearTimeout(timeout); reject(error) })
        worker.postMessage({ id: 1, operation: 'speak', text: 'Olá', speed: 1 })
      })
      expect(result.error).toBeUndefined()
      const wav = result.wav!
      expect(ArrayBuffer.isView(wav)).toBe(true)
      expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF')
      expect(wav.length).toBe(52)
      expect(new DataView(wav.buffer, wav.byteOffset, wav.byteLength).getUint32(24, true)).toBe(22050)
    } finally {
      await worker.terminate()
    }
  })
})
