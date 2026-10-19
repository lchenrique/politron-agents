let current: HTMLAudioElement | null = null
let currentUrl: string | null = null
let playbackNumber = 0
let finishPlayback: (() => void) | null = null

export function stopVoice() {
  playbackNumber++
  const finish = finishPlayback
  finishPlayback = null
  if (finish) finish()
  if (current) { current.pause(); current.src = ''; current = null }
  if (currentUrl) { URL.revokeObjectURL(currentUrl); currentUrl = null }
  if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel()
}

export function textForSpeech(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' Trecho de código omitido. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[#*_~>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim().slice(0, 1450)
}

export async function speakVoice(text: string, onStarted?: () => void, options: { agentId?: string; concise?: boolean } = {}): Promise<void> {
  stopVoice()
  const ticket = playbackNumber
  const fullText = textForSpeech(text)
  const limit = options.concise ? 280 : 650
  const excerpt = fullText.slice(0, limit)
  const lastSentence = Math.max(excerpt.lastIndexOf('. '), excerpt.lastIndexOf('! '), excerpt.lastIndexOf('? '))
  const cleaned = fullText.length <= limit ? fullText : (lastSentence > 95 ? excerpt.slice(0, lastSentence + 1) : excerpt.replace(/\\s+\\S*$/, '').trim())
  if (!cleaned) return
  const result = await window.appAPI.voiceSpeak(cleaned, 1, options.agentId)
  if (playbackNumber !== ticket) return
  const data = result instanceof Uint8Array ? result : new Uint8Array(result)
  const mp3 = (data[0] === 73 && data[1] === 68 && data[2] === 51) || (data[0] === 0xff && (data[1] & 0xe0) === 0xe0)
  const url = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: mp3 ? 'audio/mpeg' : 'audio/wav' }))
  const player = new Audio(url)
  current = player
  currentUrl = url
  await new Promise<void>((resolve, reject) => {
    finishPlayback = resolve
    player.onended = () => { if (playbackNumber === ticket) stopVoice(); resolve() }
    player.onerror = () => { if (playbackNumber === ticket) stopVoice(); reject(new Error('Não foi possível reproduzir o áudio.')) }
    void player.play().then(() => { if (playbackNumber === ticket) onStarted?.() }).catch(error => { if (playbackNumber === ticket) stopVoice(); reject(error) })
  })
}

export function isPlayingVoice(): boolean { return !!current && !current.paused }
