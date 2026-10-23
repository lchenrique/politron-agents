import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mocks = vi.hoisted(() => ({ root: '', pocketSpeak: vi.fn(), loadPiper: vi.fn(), generate: vi.fn() }))
vi.mock('electron', () => ({ app: { getPath: () => mocks.root } }))
vi.mock('./chatterbox', () => ({ ChatterboxService: class { status = async () => false } }))
vi.mock('./fast-whisper', () => ({ FastWhisperService: class { installed = async () => false } }))
vi.mock('./pit-voices', () => ({ PIT_VOICE_CHOICES: [], PitVoiceService: class { installed = async () => false } }))
vi.mock('./pocket-voices', () => ({ PocketVoiceService: class { installed = async () => true; speak = mocks.pocketSpeak } }))
vi.mock('./realtime/free-cascade', () => ({ loadPiper: mocks.loadPiper }))
import { VoiceService } from './voice'
import { RealtimeSettingsStore } from './realtime/settings'

beforeEach(() => {
  mocks.root = mkdtempSync(join(tmpdir(), 'boobot-chat-voice-'))
  vi.clearAllMocks()
  mocks.pocketSpeak.mockResolvedValue(new Uint8Array([1, 2]))
  mocks.generate.mockResolvedValue({ samples: new Float32Array([0, 0.2]), sampleRate: 22050 })
  mocks.loadPiper.mockResolvedValue({ generateAsync: mocks.generate })
  for (const voice of ['faber-medium', 'dii-high']) {
    const dir = join(mocks.root, 'realtime-models', 'vits-piper-pt_BR-' + voice)
    mkdirSync(join(dir, 'espeak-ng-data'), { recursive: true })
    writeFileSync(join(dir, 'pt_BR-' + voice + '.onnx'), 'fixture')
    writeFileSync(join(dir, 'tokens.txt'), 'fixture')
  }
})
afterEach(() => { vi.restoreAllMocks(); rmSync(mocks.root, { recursive: true, force: true }) })

it('o botão do chat segue PocketTTS do realtime e encaminha o Boo sem chave externa', async () => {
  await new RealtimeSettingsStore(mocks.root).saveSettings({ ttsEngine: 'pocket' })
  await expect(new VoiceService().speak('Olá, Boo!', 1, 'boo-1')).resolves.toEqual(new Uint8Array([1, 2]))
  expect(mocks.pocketSpeak).toHaveBeenCalledWith('Olá, Boo!', 'boo-1')
})

it('Piper prefere a voz do Boo e usa a geral quando não há substituição', async () => {
  await new RealtimeSettingsStore(mocks.root).saveSettings({ ttsEngine: 'piper', piperVoice: 'faber', piperAgentVoices: { 'boo-1': 'dii' } })
  const service = new VoiceService()
  const wav = await service.speak('Olá!', 1, 'boo-1')
  expect(Buffer.from(wav).toString('ascii', 0, 4)).toBe('RIFF')
  expect(mocks.loadPiper).toHaveBeenLastCalledWith(expect.stringContaining('dii-high'), 'dii')
  await service.speak('Outra frase!', 1, 'boo-sem-voz')
  expect(mocks.loadPiper).toHaveBeenLastCalledWith(expect.stringContaining('faber-medium'), 'faber')
  expect(mocks.generate).toHaveBeenCalledWith({ text: 'Outra frase!', sid: 0, speed: 1, enableExternalBuffer: false })
})
