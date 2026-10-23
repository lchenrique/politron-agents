/** Decodes the locally generated PCM WAV into the format expected by realtime:event. */
export function pocketWavToAudio(wav: Uint8Array): { data: string; sampleRate: number } {
  const bytes = Buffer.from(wav)
  if (bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.toString('ascii', 8, 12) !== 'WAVE') throw new Error('PocketTTS retornou um WAV inválido.')
  let format = 0, channels = 0, bits = 0, rate = 0
  let pcm: Buffer | null = null
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const kind = bytes.toString('ascii', offset, offset + 4)
    const size = bytes.readUInt32LE(offset + 4)
    const start = offset + 8
    if (size > bytes.length - start) throw new Error('WAV PocketTTS truncado.')
    if (kind === 'fmt ' && size >= 16) {
      format = bytes.readUInt16LE(start)
      channels = bytes.readUInt16LE(start + 2)
      rate = bytes.readUInt32LE(start + 4)
      bits = bytes.readUInt16LE(start + 14)
    }
    if (kind === 'data') pcm = bytes.subarray(start, start + size)
    offset = start + size + (size % 2)
  }
  if (format !== 1 || channels !== 1 || bits !== 16 ||
    rate < 8000 || rate > 48000 || !pcm || pcm.length === 0 || pcm.length % 2 !== 0)
    throw new Error('PocketTTS precisa gerar PCM mono de 16 bits.')
  return { data: pcm.toString('base64'), sampleRate: rate }
}
