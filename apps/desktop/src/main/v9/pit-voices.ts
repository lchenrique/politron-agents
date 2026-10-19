import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const execFileAsync = promisify(execFile)
const SAFE_AGENT = /^[a-zA-Z0-9_-]{1,100}$/
export const PIT_VOICE_CHOICES = [
  { id: 'f1', name: 'F1', engine: 'Supertonic 2', sample: 'pit-f1.wav' },
  { id: 'f2', name: 'F2', engine: 'Supertonic 2', sample: 'pit-f2.wav' },
  { id: 'f3', name: 'F3', engine: 'Supertonic 2', sample: 'pit-f3.wav' },
  { id: 'f4', name: 'F4', engine: 'Supertonic 2', sample: 'pit-f4.wav' },
  { id: 'm1', name: 'M1', engine: 'Supertonic 2', sample: 'pit-m1.wav' },
  { id: 'm1-young', name: 'M1 Jovem', engine: 'Supertonic 2', sample: 'pit-m1-jovem.wav' },
  { id: 'dora', name: 'Dora', engine: 'Kokoro', sample: 'kokoro-dora.wav' },
  { id: 'alex', name: 'Alex', engine: 'Kokoro', sample: 'kokoro-alex.wav' },
  { id: 'santa', name: 'Santa', engine: 'Kokoro', sample: 'kokoro-santa.wav' },
] as const

export type PitVoiceId = typeof PIT_VOICE_CHOICES[number]['id']
export type PitVoiceSelection = { defaultVoiceId: PitVoiceId; agentVoiceIds: Record<string, PitVoiceId> }
function isVoice(value: unknown): value is PitVoiceId {
  return PIT_VOICE_CHOICES.some(voice => voice.id === value)
}

// A unica geracao de voz para os Pits usa os modelos locais previamente instalados.
// Sem API externa, sem sorteio de timbre e sem enviar o texto da conversa para terceiros.
const PYTHON_SPEECH = [
  'import sys, base64',
  'from pathlib import Path',
  'voice, encoded, output, home = sys.argv[1:5]',
  'text = base64.b64decode(encoded).decode("utf-8")',
  'root = Path(home)',
  'if voice in ("f1","f2","f3","f4","m1","m1-young"):',
  '    from supertonic import TTS',
  '    tts = TTS(model="supertonic-2", auto_download=True)',
  '    style = tts.get_voice_style(voice.split("-")[0].upper())',
  '    audio, _ = tts.synthesize(text, voice_style=style, lang="pt", total_steps=4)',
  '    tts.save_audio(audio, output)',
  'elif voice in ("dora","alex","santa"):',
  '    from misaki.espeak import EspeakG2P',
  '    from kokoro_onnx import Kokoro',
  '    import soundfile as sf',
  '    phonemes, _ = EspeakG2P(language="pt-br")(text)',
  '    base = root / "kokoro-samples"',
  '    tts = Kokoro(str(base / "kokoro-v1.0.onnx"), str(base / "voices-v1.0.bin"))',
  '    audio, rate = tts.create(phonemes, voice={"dora":"pf_dora","alex":"pm_alex","santa":"pm_santa"}[voice], speed=1.0, is_phonemes=True)',
  '    sf.write(output, audio, rate, subtype="PCM_16")',
  'else:',
  '    raise ValueError("Invalid voice")',
].join('\n')

export class PitVoiceService {
  private readonly root: string
  private readonly settings: string
  private readonly models: string
  private readonly samples: string
  private readonly cache = new Map<string, Uint8Array>()
  private readonly pending = new Map<string, Promise<Uint8Array>>()

  constructor(root = app.getPath('userData'), samples = join(app.getPath('music'), 'Politron - Vozes PT-BR')) {
    this.root = root
    this.settings = join(root, 'pit-voices.json')
    this.models = join(root, 'voice-models')
    this.samples = samples
  }

  async installed(): Promise<boolean> {
    const exists = async (path: string) => !!(await fs.stat(path).catch(() => null))
    const supertonic = join(this.models, 'supertonic', '.venv', 'Scripts', 'python.exe')
    const kokoro = join(this.models, 'kokoro-samples')
    return await Promise.all([
      exists(supertonic),
      exists(join(kokoro, '.venv', 'Scripts', 'python.exe')),
      exists(join(kokoro, 'kokoro-v1.0.onnx')),
      exists(join(kokoro, 'voices-v1.0.bin')),
    ]).then(results => results.every(Boolean))
  }

  async selection(): Promise<PitVoiceSelection> {
    const fallback: PitVoiceSelection = { defaultVoiceId: 'f1', agentVoiceIds: {} }
    try {
      const raw = JSON.parse(await fs.readFile(this.settings, 'utf8')) as Record<string, unknown>
      const agents = raw.agentVoiceIds
      if (agents && typeof agents === 'object' && !Array.isArray(agents)) {
        for (const [agent, voice] of Object.entries(agents)) {
          if (SAFE_AGENT.test(agent) && !['__proto__', 'constructor', 'prototype'].includes(agent) && isVoice(voice)) fallback.agentVoiceIds[agent] = voice
        }
      }
      if (isVoice(raw.defaultVoiceId)) fallback.defaultVoiceId = raw.defaultVoiceId
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return fallback
      throw error
    }
    return fallback
  }

  async setPreset(voiceId: PitVoiceId | null, agentId?: string): Promise<PitVoiceSelection> {
    if (agentId !== undefined && (!SAFE_AGENT.test(agentId) || ['__proto__', 'constructor', 'prototype'].includes(agentId))) throw new Error('Identificador de Pit invalido.')
    if (voiceId !== null && !isVoice(voiceId)) throw new Error('Voz não aprovada para os Boos.')
    if (!agentId && voiceId === null) throw new Error('A voz geral precisa estar selecionada.')
    const next = await this.selection()
    if (agentId) {
      if (voiceId === null) delete next.agentVoiceIds[agentId]
      else next.agentVoiceIds[agentId] = voiceId
    } else next.defaultVoiceId = voiceId!
    await fs.mkdir(this.root, { recursive: true })
    await fs.writeFile(this.settings, JSON.stringify(next, null, 2), { mode: 0o600 })
    this.cache.clear()
    return next
  }

  async sample(voiceId: string): Promise<Uint8Array> {
    const voice = PIT_VOICE_CHOICES.find(item => item.id === voiceId)
    if (!voice) throw new Error('Voz não aprovada para os Boos.')
    const wav = await fs.readFile(join(this.samples, voice.sample))
    if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.length > 10_000_000) throw new Error('Amostra WAV invalida.')
    return Uint8Array.from(wav)
  }

  async speak(text: string, agentId?: string): Promise<Uint8Array> {
    if (typeof text !== 'string' || !text.trim() || text.length > 1600) throw new Error('Texto de voz invalido.')
    if (agentId && (!SAFE_AGENT.test(agentId) || ['__proto__', 'constructor', 'prototype'].includes(agentId))) throw new Error('Identificador de Pit invalido.')
    const selection = await this.selection()
    const voiceId = (agentId && selection.agentVoiceIds[agentId]) || selection.defaultVoiceId
    const key = voiceId + ':' + text
    const previous = this.cache.get(key)
    if (previous) return previous
    const running = this.pending.get(key)
    if (running) return running
    if (!(await this.installed())) throw new Error('Os motores locais Supertonic e Kokoro nao estao instalados.')
    const task = this.generate(voiceId, text).then(wav => {
      this.cache.set(key, wav)
      if (this.cache.size > 18) this.cache.delete(this.cache.keys().next().value!)
      return wav
    }).finally(() => { this.pending.delete(key) })
    this.pending.set(key, task)
    return task
  }

  private async generate(voice: PitVoiceId, text: string): Promise<Uint8Array> {
    const folder = join(this.root, 'pit-voice-generated')
    await fs.mkdir(folder, { recursive: true })
    const filename = join(folder, randomUUID() + '.wav')
    const elevated = filename.replace(/\.wav$/, '-young.wav')
    const isKokoro = ['dora', 'alex', 'santa'].includes(voice)
    const python = join(this.models, isKokoro ? 'kokoro-samples' : 'supertonic', '.venv', 'Scripts', 'python.exe')
    try {
      await execFileAsync(python, ['-c', PYTHON_SPEECH, voice, Buffer.from(text, 'utf8').toString('base64'), filename, this.models], { timeout: 120_000, windowsHide: true, maxBuffer: 1024 * 1024 })
      if (voice === 'm1-young') {
        // Mesmo tratamento de timbre usado na amostra M1 Jovem aprovada.
        await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-i', filename, '-af', 'asetrate=44100*1.085,aresample=44100,atempo=0.921658986', elevated], { timeout: 45_000, windowsHide: true })
      }
      const bytes = await fs.readFile(voice === 'm1-young' ? elevated : filename)
      if (bytes.length < 44 || bytes.length > 12_000_000 || bytes.toString('ascii', 0, 4) !== 'RIFF') throw new Error('O sintetizador nao gerou um WAV valido.')
      // Electron nao aceita Node Buffers externos via IPC.
      return Uint8Array.from(bytes)
    } finally {
      await Promise.all([fs.rm(filename, { force: true }), fs.rm(elevated, { force: true })])
    }
  }
}
