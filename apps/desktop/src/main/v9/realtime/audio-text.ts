/** Funções puras do pipeline de voz: sem Electron, sem rede, fáceis de testar. */

export function int16ToFloat32(pcm: Int16Array): Float32Array {
  const out = new Float32Array(pcm.length)
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 32768
  return out
}

export function float32ToInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]))
    out[i] = value < 0 ? value * 32768 : value * 32767
  }
  return out
}

export function int16ToBase64(pcm: Int16Array): string {
  return Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).toString('base64')
}

/** WAV mono 16 bits, o formato mais simples que o endpoint de transcrição aceita. */
export function wavFromFloat32(samples: Float32Array, sampleRate: number): Uint8Array {
  const pcm = float32ToInt16(samples)
  const out = new Uint8Array(44 + pcm.byteLength)
  const view = new DataView(out.buffer)
  const ascii = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)) }
  ascii(0, 'RIFF'); view.setUint32(4, out.length - 8, true); ascii(8, 'WAVE')
  ascii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  ascii(36, 'data'); view.setUint32(40, pcm.byteLength, true)
  out.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), 44)
  return out
}

/** Lê a taxa de um mime como 'audio/pcm;rate=24000'; Gemini Live responde em 24 kHz quando não informa. */
export function sampleRateFromMime(mime: string | undefined, fallback = 24000): number {
  const match = /rate=(\d+)/.exec(mime || '')
  const rate = match ? Number(match[1]) : fallback
  return rate >= 8000 && rate <= 48000 ? rate : fallback
}

/**
 * Acumula texto que chega em pedaços e libera frases completas, para a voz começar a falar
 * na primeira frase em vez de esperar a resposta inteira.
 */
export class SentenceBuffer {
  private pending = ''
  constructor(private readonly minChars = 24) {}
  push(delta: string): string[] {
    this.pending += delta
    const ready: string[] = []
    for (;;) {
      const match = /[.!?…;:](?=\s)|\n/.exec(this.pending.slice(this.minChars - 1))
      if (!match) break
      const end = this.minChars - 1 + match.index + match[0].length
      const sentence = this.pending.slice(0, end).trim()
      this.pending = this.pending.slice(end)
      if (sentence) ready.push(sentence)
    }
    return ready
  }
  flush(): string[] {
    const rest = this.pending.trim()
    this.pending = ''
    return rest ? [rest] : []
  }
}

/** Remove marcação que soaria estranha em voz alta (o modelo às vezes ignora o pedido de não usar markdown). */
export function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, '$1$2')
    .replace(/[*_#>]+/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Whisper inventa frases conhecidas em trechos curtos de silêncio ou ruído. Descartar evita
 * o agente responder a "Obrigado por assistir" que ninguém disse.
 */
const HALLUCINATIONS = [
  /^obrigad[oa]( por assistir)?[.!]?$/i,
  /legendas? (pela|por) comunidade/i,
  /amara\.org/i,
  /^tchau[.!]?$/i,
  /^\.*$/,
  /inscreva-se/i,
  /^thank you( for watching)?[.!]?$/i,
]
export function isLikelyHallucination(text: string, seconds: number): boolean {
  const clean = text.trim()
  if (!clean) return true
  return seconds < 2.5 && HALLUCINATIONS.some(pattern => pattern.test(clean))
}
