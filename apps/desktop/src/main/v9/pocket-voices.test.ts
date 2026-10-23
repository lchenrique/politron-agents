import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({ app: { getPath: () => 'C:/nonexistent-voice-root' } }))
const processMock = vi.hoisted(() => ({ execFile: vi.fn() }))
vi.mock('node:child_process', async importOriginal => {
  const original = await importOriginal<typeof import('node:child_process')>()
  return { ...original, execFile: processMock.execFile, default: { ...original, execFile: processMock.execFile } }
})
import { PocketVoiceService } from './pocket-voices'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'boobot-pocket-voice-')) })
afterEach(() => rmSync(root, { recursive: true, force: true }))

function wav() {
  const data = Buffer.alloc(84)
  data.write('RIFF', 0, 'ascii')
  data.writeUInt32LE(data.length - 8, 4)
  data.write('WAVE', 8, 'ascii')
  data.write('fmt ', 12, 'ascii')
  return data
}
describe('Identidades de voz PocketTTS locais', () => {
  it('sintetiza com a voz feminina do Boo e usa a masculina geral quando herda', async () => {
    mkdirSync(join(root, 'bin'), { recursive: true })
    writeFileSync(join(root, 'bin', process.platform === 'win32' ? 'pocket-tts.exe' : 'pocket-tts'), Buffer.alloc(1_000_001))
    processMock.execFile.mockImplementation((_command, args, _options, callback) => {
      writeFileSync(args[args.indexOf('--output-path') + 1], wav())
      callback(null, '', '')
    })
    const service = new PocketVoiceService(root)
    await service.setVoice('rafael')
    await service.setVoice('vera', 'boo-1')
    await service.speak('Olá!', 'boo-1')
    expect(processMock.execFile.mock.lastCall?.[1]).toContain('vera')
    await service.speak('Outra frase!', 'boo-2')
    expect(processMock.execFile.mock.lastCall?.[1]).toContain('rafael')
    await service.setVoice(null, 'boo-1')
    await service.speak('Usando a geral!', 'boo-1')
    expect(processMock.execFile.mock.lastCall?.[1]).toContain('rafael')
  })
  it('começa desativado e nunca inicia servidor ou faz download só para listar vozes', async () => {
    const service = new PocketVoiceService(root)
    expect(await service.info()).toEqual({
      installed: false,
      choices: [
        { id: 'rafael', name: 'Rafael · masculina' },
        { id: 'vera', name: 'Vera · feminina' },
        { id: 'cosette', name: 'Cosette · feminina' },
        { id: 'marius', name: 'Marius · masculina' },
      ],
      selection: { defaultVoiceId: 'rafael', agentVoiceIds: {} },
    })
    await expect(service.speak('Olá, Boo!')).rejects.toThrow(/Instale o executável local/)
  })
  it('importa áudio local e vincula vozes a Boos persistentemente, sem paths externos', async () => {
    const source = join(root, 'referencia.wav')
    writeFileSync(source, wav())
    const first = new PocketVoiceService(root)
    const imported = await first.importVoice(source)
    const newId = imported.choices.find(voice => voice.name.startsWith('Boo ·'))?.id
    expect(newId).toMatch(/^[a-z0-9]+$/)
    await first.setVoice(newId!)
    await first.setVoice('rafael', 'boo-1')
    const state = await new PocketVoiceService(root).info()
    expect(state.selection).toEqual({ defaultVoiceId: newId, agentVoiceIds: { 'boo-1': 'rafael' } })
    await first.setVoice(null, 'boo-1')
    expect((await first.info()).selection.agentVoiceIds).toEqual({})
    await expect(first.setVoice('bad/path')).rejects.toThrow(/não disponível/)
    await expect(first.setVoice('rafael', '../unsafe')).rejects.toThrow(/Boo inválido/)
  })
  it('não importa extensão executável ou WAV forjado', async () => {
    const bad = join(root, 'arquivo.wav')
    writeFileSync(bad, Buffer.alloc(85))
    const service = new PocketVoiceService(root)
    await expect(service.importVoice(bad)).rejects.toThrow(/inválido/)
    await expect(service.importVoice(join(root, 'arquivo.exe'))).rejects.toThrow(/WAV, MP3/)
  })
  it('identifica identidades safetensors e rejeita cabeçalhos inválidos', async () => {
    const file = join(root, 'voz.safetensors')
    const header = Buffer.from(JSON.stringify({foo: {dtype:'F32', shape:[1], data_offsets:[0,4]}}))
    const prefix = Buffer.alloc(8)
    prefix.writeBigUInt64LE(BigInt(header.length))
    writeFileSync(file, Buffer.concat([prefix, header, Buffer.alloc(4)]))
    const service = new PocketVoiceService(root)
    expect((await service.importVoice(file)).choices).toHaveLength(5)
    writeFileSync(file, Buffer.alloc(60))
    await expect(service.importVoice(file)).rejects.toThrow(/inválido/)
  })
})
