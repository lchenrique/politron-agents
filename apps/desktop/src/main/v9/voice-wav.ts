export function encodeWave(samples: Float32Array, sampleRate: number): Uint8Array {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 48000) throw new Error('Taxa de áudio inválida.')
  const bytes = new Uint8Array(44 + samples.length * 2)
  const view = new DataView(bytes.buffer)
  const name = (offset: number, value: string) => { for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index)) }
  name(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); name(8, 'WAVE')
  name(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  name(36, 'data'); view.setUint32(40, samples.length * 2, true)
  for (let index = 0; index < samples.length; index++) {
    const value = Math.max(-1, Math.min(1, samples[index]))
    view.setInt16(44 + index * 2, value < 0 ? value * 32768 : value * 32767, true)
  }
  return bytes
}

export function decodeWave(bytes: Uint8Array): { samples: Float32Array; sampleRate: number } {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 44 || bytes.byteLength > 4_000_000) throw new Error('Áudio inválido ou muito longo.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const str = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4))
  if (str(0) !== 'RIFF' || str(8) !== 'WAVE') throw new Error('Envie áudio WAV válido.')
  let cursor = 12, channels = 0, sampleRate = 0, bitDepth = 0, audioFormat = 0, dataOffset = -1, dataLength = 0
  while (cursor + 8 <= bytes.length) {
    const length = view.getUint32(cursor + 4, true)
    const offset = cursor + 8
    if (length > bytes.length - offset) throw new Error('Áudio WAV incompleto.')
    if (str(cursor) === 'fmt ') {
      if (length < 16) throw new Error('Cabeçalho WAV inválido.')
      audioFormat = view.getUint16(offset, true)
      channels = view.getUint16(offset + 2, true)
      sampleRate = view.getUint32(offset + 4, true)
      bitDepth = view.getUint16(offset + 14, true)
    } else if (str(cursor) === 'data') { dataOffset = offset; dataLength = length; break }
    cursor = offset + length + (length % 2)
  }
  if (dataOffset < 0 || audioFormat !== 1 || channels !== 1 || bitDepth !== 16 || sampleRate !== 16000 || dataLength % 2) {
    throw new Error('O áudio precisa ser WAV PCM mono 16 kHz de 16 bits.')
  }
  const count = dataLength / 2
  if (count < 4000 || count > 16000 * 30) throw new Error('Grave entre 0,25 e 30 segundos de áudio.')
  const samples = new Float32Array(count)
  for (let i = 0; i < count; i++) samples[i] = view.getInt16(dataOffset + i * 2, true) / 32768
  return { samples, sampleRate }
}
