import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mocks = vi.hoisted(() => ({
  userData: { value: '' },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((key: string) => Buffer.from('encrypted:' + key, 'utf8')),
    decryptString: vi.fn((bytes: Buffer) => bytes.toString('utf8').replace(/^encrypted:/, '')),
  },
}))
vi.mock('electron', () => ({ app: { getPath: () => mocks.userData.value }, safeStorage: mocks.safeStorage }))
import { OpenRouterVoiceService, FREE_SPEECH_MODEL } from './openrouter-voice'

let directory: string
const fetchMock = vi.fn()
const mp3 = Uint8Array.from([73, 68, 51, 3, 0, 0, 0, 0, 0, 6, 1, 2, 3, 4])
const secret = 'sk-or-v1-test12345678901234567890'
const ok = () => new Response(mp3, { status: 200, headers: { 'content-type': 'audio/mpeg' } })

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'politron-openrouter-voice-'))
  mocks.userData.value = directory
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('AbortSignal', { timeout: () => undefined })
  delete process.env.OPENROUTER_API_KEY
  fetchMock.mockReset()
})
afterEach(() => { vi.unstubAllGlobals(); rmSync(directory, { force: true, recursive: true }) })

function sent(index: number) {
  const [url, options] = fetchMock.mock.calls[index] as [string, RequestInit]
  return { url, options, body: JSON.parse(options.body as string) }
}

describe('Voz Fish Audio fixa em português brasileiro', () => {
  it('rejeita síntese sem chave e jamais envia modelo pago', async () => {
    const service = new OpenRouterVoiceService()
    expect(await service.provider()).toBe('realtime')
    await expect(service.speak('Olá mundo', 1)).rejects.toThrow(/Configure uma chave OpenRouter/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('cria uma referência neutra PT-BR e a reutiliza para sempre na mesma voz', async () => {
    const service = new OpenRouterVoiceService()
    await service.saveKey(secret)
    fetchMock.mockImplementation(async () => ok())
    expect(await service.defaultVoiceReady()).toBe(false)
    const first = await service.speak('Oi, tudo bem?', 1, 'pit-a')
    expect(Array.from(first)).toEqual(Array.from(mp3))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const sample = sent(0)
    expect(sample.url).toBe('https://openrouter.ai/api/v1/audio/speech')
    expect(sample.body.model).toBe(FREE_SPEECH_MODEL)
    expect(sample.body.input).toMatch(/português brasileiro/)
    expect(sample.body.instructions).toMatch(/Brazilian Portuguese/)
    expect(sample.body.input_references).toBeUndefined()
    expect((sample.options.headers as Record<string, string>).authorization).toBe('Bearer ' + secret)
    expect(sample.options.redirect).toBe('error')
    expect(sent(1).body.input).toBe('Oi, tudo bem?')
    expect(sent(1).body.input_references).toEqual([
      { type: 'input_audio', input_audio: { data: 'data:audio/mpeg;base64,' + Buffer.from(mp3).toString('base64') } },
      { type: 'text', text: sample.body.input },
    ])
    expect(await service.defaultVoiceReady()).toBe(true)
    expect(Array.from(readFileSync(join(directory, 'voice-references', 'default.mp3')))).toEqual(Array.from(mp3))
    await service.speak('Oi, tudo bem?', 1, 'pit-a')
    expect(fetchMock).toHaveBeenCalledTimes(2) // cache das respostas repetidas
    await service.speak('Outra frase', 1, 'pit-b')
    expect(sent(2).body.input_references).toEqual(sent(1).body.input_references)
  })

  it('mantém a referência de voz após reiniciar o serviço', async () => {
    const firstSession = new OpenRouterVoiceService()
    await firstSession.saveKey(secret)
    fetchMock.mockImplementation(async () => ok())
    await firstSession.speak('Primeira frase', 1, 'pit-a')
    const nextSession = new OpenRouterVoiceService()
    expect(await nextSession.defaultVoiceReady()).toBe(true)
    await nextSession.speak('Outra frase', 1, 'pit-a')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(sent(2).body.input_references).toEqual(sent(1).body.input_references)
  })

  it('não sorteia duas vozes gerais quando as chamadas iniciais acontecem juntas', async () => {
    const service = new OpenRouterVoiceService()
    await service.saveKey(secret)
    fetchMock.mockImplementation(async () => ok())
    await Promise.all([service.speak('Oi A', 1, 'pit-a'), service.speak('Oi B', 1, 'pit-b')])
    expect(fetchMock).toHaveBeenCalledTimes(3) // uma referência + duas falas
    expect(sent(1).body.input_references).toEqual(sent(2).body.input_references)
  })

  it('permite uma voz por agente e voltar à voz geral, sem trocar sozinho', async () => {
    const service = new OpenRouterVoiceService()
    await service.saveKey(secret)
    fetchMock.mockImplementation(async () => ok())
    await service.speak('Teste', 1, 'pit-a')
    await service.newVoice('pit-b')
    expect(readFileSync(join(directory, 'voice-references', 'agent-pit-b.mp3')).length).toBe(mp3.length)
    await service.speak('Fala do pit B', 1, 'pit-b')
    expect(sent(3).body.input_references).toBeDefined()
    await service.resetAgentVoice('pit-b')
    await service.speak('Outra fala B', 1, 'pit-b')
    expect(sent(4).body.input_references).toEqual(sent(1).body.input_references)
  })

  it('não usa voz aleatória depois de uma falha de referência', async () => {
    const service = new OpenRouterVoiceService()
    await service.saveKey(secret)
    fetchMock.mockResolvedValueOnce(new Response('{"error":"bad"}', { status: 200, headers: { 'content-type': 'application/json' } }))
    await expect(service.speak('Oi', 1)).rejects.toThrow(/em vez de áudio MP3/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(await service.defaultVoiceReady()).toBe(false)
    fetchMock.mockResolvedValueOnce(new Response('limit', { status: 429 }))
    await expect(service.speak('Oi', 1)).rejects.toThrow(/Limite de solicitações gratuitas/)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('mantém a escolha das vozes aprovadas dos Pits após reabrir', async () => {
    const service = new OpenRouterVoiceService()
    await service.setProvider('pits')
    expect(await new OpenRouterVoiceService().provider()).toBe('pits')
  })

  it('mantém o Chatterbox apenas como escolha manual', async () => {
    const service = new OpenRouterVoiceService()
    await service.setProvider('local')
    expect(await service.provider()).toBe('local')
    await service.setProvider('openrouter')
    expect(await service.provider()).toBe('openrouter')
  })
})
