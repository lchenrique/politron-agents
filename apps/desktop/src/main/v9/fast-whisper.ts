import { app } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

const SCRIPT = [
  'import sys, json, base64, io',
  'from faster_whisper import WhisperModel',
  'from pathlib import Path',
  'root = Path(sys.argv[1])',
  'model = WhisperModel("small", device="cpu", compute_type="int8", cpu_threads=4, num_workers=1, download_root=str(root), local_files_only=True)',
  'print(json.dumps({"ready": True}), flush=True)',
  'for line in sys.stdin.buffer:',
  '    try:',
  '        msg = json.loads(line)',
  '        wav = io.BytesIO(base64.b64decode(msg["wav"]))',
  '        segments, info = model.transcribe(wav, language="pt", beam_size=3, vad_filter=False, condition_on_previous_text=False, without_timestamps=True, no_speech_threshold=0.65)',
  '        text = " ".join(s.text.strip() for s in segments).strip()',
  '        print(json.dumps({"id": msg["id"], "text": text}, ensure_ascii=True), flush=True)',
  '    except Exception as error:',
  '        print(json.dumps({"id": msg.get("id") if "msg" in locals() else None, "error": str(error)}, ensure_ascii=True), flush=True)',
].join('\n')

export class FastWhisperService {
  private readonly home = join(app.getPath('userData'), 'voice-models', 'whisper-fast')
  private child: ChildProcessWithoutNullStreams | null = null
  private starting: Promise<void> | null = null
  private nextId = 0
  private requests = new Map<number, { resolve: (text: string) => void; reject: (error: Error) => void; timeout: ReturnType<typeof setTimeout> }>()

  async installed(): Promise<boolean> {
    const python = join(this.home, '.venv', 'Scripts', 'python.exe')
    const models = join(this.home, 'models')
    const exists = async (path: string) => !!(await fs.stat(path).catch(() => null))
    return (await exists(python)) && (await exists(models))
  }

  warmup(): Promise<void> {
    if (this.starting) return this.starting
    const executable = join(this.home, '.venv', 'Scripts', 'python.exe')
    const models = join(this.home, 'models')
    const child = spawn(executable, ['-u', '-c', SCRIPT, models], { windowsHide: true, stdio: 'pipe' })
    this.child = child
    this.starting = new Promise<void>((resolve, reject) => {
      let ready = false
      let errors = ''
      const initTimer = setTimeout(() => {
        if (!ready) fail(new Error('Inicializacao do transcritor excedeu 60 segundos.'))
      }, 60_000)
      const fail = (error: Error) => {
        clearTimeout(initTimer)
        if (!ready) reject(error)
        if (this.child === child) { this.child = null; this.starting = null }
        for (const req of this.requests.values()) { clearTimeout(req.timeout); req.reject(error) }
        this.requests.clear()
        child.kill()
      }
      child.stderr.on('data', chunk => { errors = (errors + String(chunk)).slice(-2000) })
      const lines = createInterface({ input: child.stdout })
      lines.on('line', raw => {
        let message: { ready?: boolean; id?: number; text?: string; error?: string }
        try { message = JSON.parse(raw) } catch { return }
        if (message.ready && !ready) { ready = true; clearTimeout(initTimer); resolve(); return }
        if (typeof message.id !== 'number') return
        const req = this.requests.get(message.id)
        if (!req) return
        this.requests.delete(message.id)
        clearTimeout(req.timeout)
        if (message.error) req.reject(new Error('Transcricao: ' + message.error))
        else req.resolve(String(message.text || ''))
      })
      child.on('error', error => fail(error))
      child.on('exit', code => { if (this.child === child) fail(new Error('Transcritor local encerrado (' + code + '). ' + errors.slice(-350))) })
    })
    return this.starting
  }

  async transcribe(wav: Uint8Array, timeoutMs = 35_000): Promise<string> {
    await this.warmup()
    const child = this.child
    if (!child || !child.stdin.writable) throw new Error('Transcritor indisponivel.')
    const id = ++this.nextId
    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.requests.delete(id)
        reject(new Error('Transcricao demorou mais de ' + Math.round(timeoutMs / 1000) + ' segundos.'))
      }, timeoutMs)
      this.requests.set(id, { resolve, reject, timeout })
      child.stdin.write(JSON.stringify({ id, wav: Buffer.from(wav).toString('base64') }) + '\n', error => {
        if (!error) return
        const req = this.requests.get(id)
        if (req) { this.requests.delete(id); clearTimeout(req.timeout); reject(error) }
      })
    })
  }

  close() {
    this.child?.kill()
    this.child = null
    this.starting = null
    for (const req of this.requests.values()) { clearTimeout(req.timeout); req.reject(new Error('Transcritor fechado.')) }
    this.requests.clear()
  }
}
