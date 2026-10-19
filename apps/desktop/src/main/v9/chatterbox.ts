import { app } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, promises as fs } from 'node:fs'
import { join } from 'node:path'
import { createInterface, type Interface } from 'node:readline'
import { chatterboxPython } from './chatterbox-python'

type Pending = { resolve: (data: Uint8Array) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }

/**
 * Motor TTS local de alta qualidade: Chatterbox Multilingual V3 PT-BR.
 * Não instala nem chama APIs pagas. Python e os pesos ficam fora do projeto, em userData.
 * STT continua no sherpa-onnx (Whisper).
 */
export class ChatterboxService {
  private readonly root = app.getPath('userData')
  private readonly envDir = join(this.root, 'chatterbox-venv')
  private readonly python = join(this.envDir, 'Scripts', 'python.exe')
  private readonly source = join(this.root, 'chatterbox-ptbr-code', 'chatterbox', 'src', 'chatterbox', 'tts.py')
  private readonly runtime = join(this.root, 'chatterbox-runtime.py')
  private readonly marker = join(this.root, 'chatterbox-ptbr-ready.json')
  private process: ChildProcessWithoutNullStreams | null = null
  private reader: Interface | null = null
  private installPromise: Promise<void> | null = null
  private queue = Promise.resolve()
  private pending = new Map<number, Pending>()
  private nextId = 0
  private stderr = ''

  async status(): Promise<boolean> {
    return existsSync(this.python) && existsSync(this.source) && existsSync(this.marker)
  }

  private async ensureScript(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true })
    await fs.writeFile(this.runtime, chatterboxPython, 'utf8')
  }

  private async run(command: string, args: string[], timeout = 15 * 60_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd: this.root, windowsHide: true, shell: false,
        env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1', PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', POLITRON_CHATTERBOX_ROOT: this.root, HF_HOME: join(this.root, 'chatterbox-cache') } })
      let errorText = ''
      const failTimeout = setTimeout(() => { child.kill(); reject(new Error('A instalação do Chatterbox excedeu o tempo permitido.')) }, timeout)
      child.stdout?.on('data', () => undefined)
      child.stderr?.on('data', (chunk: Buffer) => { errorText = (errorText + chunk.toString()).slice(-4500) })
      child.on('error', error => { clearTimeout(failTimeout); reject(new Error('Não foi possível executar ' + command + ': ' + error.message)) })
      child.on('exit', code => {
        clearTimeout(failTimeout)
        if (code === 0) resolve()
        else reject(new Error('Falha na instalação do Chatterbox (' + command + '): ' + (errorText || 'código ' + code)))
      })
    })
  }

  async install(): Promise<void> {
    if (this.installPromise) return this.installPromise
    if (await this.status()) return
    this.installPromise = (async () => {
      await this.ensureScript()
      if (!existsSync(this.source)) {
        await this.run('git', ['clone', '--depth', '1', 'https://huggingface.co/spaces/ResembleAI/Chatterbox-Multilingual-TTS-pt-br', join(this.root, 'chatterbox-ptbr-code')])
      }
      if (!existsSync(this.python)) await this.run('uv', ['venv', '--python', '3.11', this.envDir])
      // Instalação CPU-only: esta máquina possui GPU Intel integrada (sem CUDA).
      await this.run('uv', ['pip', 'install', '--python', this.python, '--index', 'https://download.pytorch.org/whl/cpu', 'torch==2.8.0', 'torchaudio==2.8.0'])
      await this.run('uv', ['pip', 'install', '--python', this.python,
        'numpy==1.26.4', 'resampy==0.4.3', 'librosa==0.10.0',
        's3tokenizer', 'transformers==4.46.3', 'diffusers==0.29.0',
        'omegaconf==2.3.0', 'resemble-perth==1.0.1', 'silero-vad==5.1.2',
        'conformer==0.3.2', 'safetensors', 'huggingface_hub'])
      // HF transfere mais de 3 GB. Não marcar como instalado antes de concluir.
      await this.run(this.python, ['-u', this.runtime, 'install'], 45 * 60_000)
      await fs.writeFile(this.marker, JSON.stringify({ engine: 'chatterbox-pt-br', version: 1, installedAt: new Date().toISOString() }), 'utf8')
    })()
    try { await this.installPromise } finally { this.installPromise = null }
  }

  private async start(): Promise<ChildProcessWithoutNullStreams> {
    if (this.process && this.process.exitCode === null) return this.process
    await this.ensureScript()
    const child = spawn(this.python, ['-u', this.runtime, 'serve'], { cwd: this.root, windowsHide: true,
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', POLITRON_CHATTERBOX_ROOT: this.root, HF_HOME: join(this.root, 'chatterbox-cache') } })
    this.process = child
    this.stderr = ''
    child.stderr.on('data', (chunk: Buffer) => { this.stderr = (this.stderr + chunk.toString()).slice(-2000) })
    this.reader = createInterface({ input: child.stdout })
    this.reader.on('line', line => {
      try {
        const value = JSON.parse(line) as { id: number; wav?: string; error?: string }
        const pending = this.pending.get(value.id)
        if (!pending) return
        clearTimeout(pending.timer)
        this.pending.delete(value.id)
        if (value.error) pending.reject(new Error(value.error))
        else if (!value.wav) pending.reject(new Error('Chatterbox não retornou áudio.'))
        else {
          const data = Buffer.from(value.wav, 'base64')
          // Copiar para um Uint8Array gerenciado pelo V8 (Electron proíbe buffers externos).
          pending.resolve(Uint8Array.from(data))
        }
      } catch { /* linhas que não pertencem ao protocolo são ignoradas */ }
    })
    const lost = (error: Error) => {
      if (this.process !== child) return
      this.process = null
      this.reader?.close()
      this.reader = null
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer)
        pending.reject(new Error('O Chatterbox encerrou: ' + error.message + (this.stderr ? ' — ' + this.stderr.slice(-500) : '')))
      }
      this.pending.clear()
    }
    child.on('error', lost)
    child.on('exit', code => lost(new Error('código ' + code)))
    return child
  }

  private async synthesize(text: string, speed: number): Promise<Uint8Array> {
    const child = await this.start()
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('Chatterbox demorou mais de 5 minutos na CPU. Use uma frase menor ou uma GPU dedicada.'))
        child.kill()
      }, 300_000)
      this.pending.set(id, { resolve, reject, timer })
      child.stdin.write(JSON.stringify({ id, text, speed }) + '\n')
    })
  }

  async speak(text: string, speed = 1): Promise<Uint8Array> {
    if (!(await this.status())) throw new Error('Instale o Chatterbox PT-BR (cerca de 3,2 GB de modelos) para usar a voz.')
    if (typeof text !== 'string' || !text.trim()) throw new Error('O texto não pode estar vazio.')
    if (!Number.isFinite(speed) || speed < 0.75 || speed > 1.5) throw new Error('Velocidade de voz inválida.')
    // A inferência da CPU pode ser muito lenta; limitar por requisição para manter a interface responsiva.
    const shortText = text.slice(0, 450)
    const task = this.queue.then(() => this.synthesize(shortText, speed))
    this.queue = task.then(() => undefined, () => undefined)
    return task
  }

  close(): void {
    this.reader?.close()
    this.reader = null
    this.process?.kill()
    this.process = null
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Serviço de voz encerrado.'))
    }
    this.pending.clear()
  }
}
