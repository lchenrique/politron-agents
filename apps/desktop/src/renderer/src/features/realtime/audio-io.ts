/** Captura e reprodução de áudio para a conversa em tempo real, sem bibliotecas externas. */

const CAPTURE_RATE = 16000
/** ~60 ms por pacote: curto para latência baixa, longo o bastante para não inundar o IPC. */
const CHUNK_SAMPLES = 960

const WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buffer = new Float32Array(${CHUNK_SAMPLES}); this.length = 0 }
  process(inputs) {
    const input = inputs[0] && inputs[0][0]
    if (!input) return true
    for (let i = 0; i < input.length; i++) {
      this.buffer[this.length++] = input[i]
      if (this.length === this.buffer.length) {
        const pcm = new Int16Array(this.length)
        let energy = 0
        for (let n = 0; n < this.length; n++) {
          const value = Math.max(-1, Math.min(1, this.buffer[n]))
          energy += value * value
          pcm[n] = value < 0 ? value * 32768 : value * 32767
        }
        this.port.postMessage({ pcm: pcm.buffer, level: Math.sqrt(energy / this.length) }, [pcm.buffer])
        this.length = 0
      }
    }
    return true
  }
}
registerProcessor('pcm-capture', PcmCapture)
`

export class MicCapture {
  private stream: MediaStream | null = null
  private context: AudioContext | null = null
  private node: AudioWorkletNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private mute: GainNode | null = null

  async start(onChunk: (pcm: ArrayBuffer, level: number) => void): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microfone indisponível neste computador.')
    // O próprio Chromium reamostra o microfone para 16 kHz, o formato que Gemini e o VAD local esperam.
    this.context = new AudioContext({ sampleRate: CAPTURE_RATE })
    // Inicie o contexto e peça o microfone no mesmo gesto do clique; a conexão com o provedor pode demorar.
    const resumed = this.context.resume()
    const stream = navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    this.stream = await stream
    await resumed
    if (this.context.state !== 'running') throw new Error('O áudio do microfone foi suspenso pelo sistema. Desligue e ligue novamente para reativá-lo.')
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }))
    try { await this.context.audioWorklet.addModule(url) } finally { URL.revokeObjectURL(url) }
    this.node = new AudioWorkletNode(this.context, 'pcm-capture')
    this.node.port.onmessage = event => onChunk(event.data.pcm, event.data.level)
    this.source = this.context.createMediaStreamSource(this.stream)
    this.mute = this.context.createGain()
    this.mute.gain.value = 0
    // Mantém o AudioWorklet no grafo ativo sem devolver o microfone aos alto-falantes.
    this.source.connect(this.node)
    this.node.connect(this.mute)
    this.mute.connect(this.context.destination)
  }

  stop(): void {
    this.node?.port.close(); this.node?.disconnect(); this.node = null
    this.source?.disconnect(); this.source = null
    this.mute?.disconnect(); this.mute = null
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = null
    void this.context?.close().catch(() => undefined); this.context = null
  }
}

export class PcmPlayer {
  private context = new AudioContext()
  private sources = new Set<AudioBufferSourceNode>()
  private nextTime = 0

  constructor(private readonly onPlaybackEnded?: () => void) {}

  async resume(): Promise<void> {
    await this.context.resume()
    if (this.context.state !== 'running') throw new Error('A reprodução de áudio está suspensa. Clique novamente em Ligar para reativá-la.')
  }

  /** Enfileira um trecho PCM 16 bits mono (base64) para tocar logo depois do anterior, sem lacunas. */
  enqueue(base64: string, sampleRate: number): void {
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0))
    const pcm = new Int16Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 2))
    if (!pcm.length) return
    const buffer = this.context.createBuffer(1, pcm.length, sampleRate)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 32768
    const source = this.context.createBufferSource()
    source.buffer = buffer
    source.connect(this.context.destination)
    const startAt = Math.max(this.context.currentTime + 0.02, this.nextTime)
    source.start(startAt)
    this.nextTime = startAt + buffer.duration
    this.sources.add(source)
    source.onended = () => {
      this.sources.delete(source)
      if (!this.sources.size) this.onPlaybackEnded?.()
    }
  }

  /** Verdadeiro enquanto ainda há voz do agente tocando (com uma pequena cauda para o eco do alto-falante). */
  isPlaying(tailSeconds = 0.35): boolean {
    return this.sources.size > 0 || this.context.currentTime < this.nextTime + tailSeconds
  }

  flush(): void {
    for (const source of this.sources) { try { source.stop() } catch { /* já parou */ } }
    this.sources.clear()
    this.nextTime = 0
  }

  close(): void { this.flush(); void this.context.close().catch(() => undefined) }
}
