export async function toWav(blob: Blob): Promise<Uint8Array> {
  const context = new AudioContext()
  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer())
    const count = Math.ceil(audio.duration * 16000)
    if (count < 4000 || count > 480000) throw new Error('Grave entre 0,25 e 30 segundos.')
    const offline = new OfflineAudioContext(1, count, 16000)
    const buffer = offline.createBuffer(1, audio.length, audio.sampleRate)
    const mono = buffer.getChannelData(0)
    for (let channel = 0; channel < audio.numberOfChannels; channel++) {
      const values = audio.getChannelData(channel)
      for (let i = 0; i < mono.length; i++) mono[i] += values[i] / audio.numberOfChannels
    }
    const source = offline.createBufferSource()
    source.buffer = buffer
    source.connect(offline.destination)
    source.start()
    const samples = (await offline.startRendering()).getChannelData(0)
    const output = new Uint8Array(44 + samples.length * 2)
    const view = new DataView(output.buffer)
    const four = (i: number, word: string) => { for (let n = 0; n < word.length; n++) view.setUint8(i + n, word.charCodeAt(n)) }
    four(0, 'RIFF'); view.setUint32(4, output.length - 8, true); four(8, 'WAVE')
    four(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
    view.setUint16(22, 1, true); view.setUint32(24, 16000, true); view.setUint32(28, 32000, true)
    view.setUint16(32, 2, true); view.setUint16(34, 16, true); four(36, 'data')
    view.setUint32(40, samples.length * 2, true)
    for (let i = 0; i < samples.length; i++) {
      const n = Math.max(-1, Math.min(1, samples[i]))
      view.setInt16(44 + i * 2, n < 0 ? n * 32768 : n * 32767, true)
    }
    return output
  } finally { await context.close().catch(() => undefined) }
}

export class VoiceRecorder {
  private media: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private context: AudioContext | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private partialTimer: ReturnType<typeof setInterval> | null = null
  private cancelled = false
  private stopRequested = false

  async record(autoSilence = false, onLevel?: (value: number) => void, onPartial?: (wav: Uint8Array) => Promise<void>, partialMs = 1800): Promise<Uint8Array> {
    if (this.media) throw new Error('Microfone ocupado.')
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Microfone indisponível.')
    this.cancelled = false
    this.stopRequested = false
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      if (this.stopRequested) throw new Error('Gravação cancelada.')
      this.context = new AudioContext()
      const analyser = this.context.createAnalyser()
      analyser.fftSize = 1024
      this.context.createMediaStreamSource(this.stream).connect(analyser)
      const data = new Uint8Array(analyser.fftSize)
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type))
      const media = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined)
      this.media = media
      const chunks: Blob[] = []
      media.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      const started = performance.now()
      let lastSpeech = started
      let heardSpeech = false
      const result = new Promise<Uint8Array>((resolve, reject) => {
        media.onstop = () => {
          const cancelled = this.cancelled
          this.cleanup()
          if (cancelled) { reject(new Error('Gravação cancelada.')); return }
          void toWav(new Blob(chunks, { type: media.mimeType })).then(resolve, reject)
        }
        media.onerror = () => { this.cleanup(); reject(new Error('Falha ao gravar áudio.')) }
      })
      media.start(200)
      let partialBusy = false
      this.partialTimer = onPartial ? setInterval(() => {
        if (partialBusy || !chunks.length || media.state !== 'recording') return
        partialBusy = true
        void toWav(new Blob([...chunks], { type: media.mimeType })).then(wav => onPartial(wav)).catch(() => undefined).finally(() => { partialBusy = false })
      }, partialMs) : null
      this.timer = setInterval(() => {
        analyser.getByteTimeDomainData(data)
        const rms = Math.sqrt(data.reduce((sum, sample) => sum + (sample - 128) ** 2, 0) / data.length) / 128
        onLevel?.(rms)
        const now = performance.now()
        if (rms > 0.025) { lastSpeech = now; heardSpeech = true }
        if (now - started > 28000 || autoSilence && heardSpeech && now - lastSpeech > 850) this.stop()
      }, 130)
      return await result
    } catch (error) { this.cleanup(); throw error }
  }

  stop() {
    if (this.media?.state === 'recording') this.media.stop()
    else if (!this.media) this.stopRequested = true
  }

  cancel() { this.cancelled = true; this.stop(); if (!this.media) this.cleanup() }
  private cleanup() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (this.partialTimer) clearInterval(this.partialTimer)
    this.partialTimer = null
    this.stream?.getTracks().forEach(track => track.stop())
    this.stream = null
    this.media = null
    const context = this.context
    this.context = null
    if (context) void context.close().catch(() => undefined)
  }
}
