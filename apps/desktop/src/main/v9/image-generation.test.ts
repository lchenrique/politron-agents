// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findImageData, ImageGenerationService, NOT_CONFIGURED, type CliRunner } from './image-generation'

vi.mock('electron', () => ({ safeStorage: { isEncryptionAvailable: () => true, encryptString: (value: string) => Buffer.from('enc:' + value), decryptString: (value: Buffer) => value.toString().slice(4) } }))

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const directories: string[] = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })
const directory = () => { const value = mkdtempSync(join(tmpdir(), 'boobot-imagens-')); directories.push(value); return value }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const loggedIn: CliRunner = async (_binary, args) => ({ code: 0, stdout: args[0] === 'login' ? 'Logged in using ChatGPT' : 'gemini-3\tGemini 3', stderr: '' })

describe('configuração da geração de imagens', () => {
  it('começa desativada e recusa gerar com orientação para Configurações', async () => {
    const service = new ImageGenerationService(directory(), { run: loggedIn })
    expect((await service.settings()).provider).toBe('off')
    await expect(service.generate('um gato')).rejects.toThrow(NOT_CONFIGURED)
  })

  it('guarda a chave criptografada fora do JSON e nunca a devolve no status', async () => {
    const dir = directory()
    const service = new ImageGenerationService(dir, { run: loggedIn })
    await expect(service.save({ provider: 'api', apiProvider: 'openai', model: '' })).rejects.toThrow(/Cole a chave/)
    const status = await service.save({ provider: 'api', apiProvider: 'openai', model: '' }, 'sk-test-0123456789abcdefghij')
    expect(status).toMatchObject({ provider: 'api', apiProvider: 'openai', model: 'gpt-image-2.5-flare', keys: { openai: true, gemini: false, openrouter: false }, engines: { codex: { available: true } } })
    expect(JSON.stringify(status)).not.toContain('sk-test')
    const { readFileSync } = await import('node:fs')
    expect(readFileSync(join(dir, 'image-generation.json'), 'utf8')).not.toContain('sk-test')
    expect((await service.clearKey('openai')).keys.openai).toBe(false)
  })

  it('mostra motor não logado ou ausente com o motivo', async () => {
    const notLogged = new ImageGenerationService(directory(), { run: async () => ({ code: 1, stdout: 'Not logged in', stderr: '' }) })
    expect((await notLogged.engineAvailability()).reason).toMatch(/não parece logado/)
    const missing = new ImageGenerationService(directory(), { run: async () => { throw new Error('ENOENT') } })
    expect(await missing.engineAvailability()).toEqual({ available: false, reason: 'O Codex não foi encontrado neste computador.' })
  })
})

describe('provedores por chave de API', () => {
  it.each([
    ['openai', 'https://api.openai.com/v1/images/generations', { data: [{ b64_json: PNG.toString('base64') }] }],
    ['openrouter', 'https://openrouter.ai/api/v1/images', { data: [{ b64_json: PNG.toString('base64'), media_type: 'image/png' }] }],
    ['gemini', 'https://generativelanguage.googleapis.com/v1beta/interactions', { steps: [{ type: 'model_output', content: [{ type: 'text', text: 'ok' }, { type: 'image', mime_type: 'image/png', data: PNG.toString('base64') }] }] }],
  ] as const)('%s envia o prompt e decodifica a imagem', async (apiProvider, url, body) => {
    const fetcher = vi.fn(async () => json(body))
    const service = new ImageGenerationService(directory(), { run: loggedIn, fetcher: fetcher as unknown as typeof fetch })
    await service.save({ provider: 'api', apiProvider, model: '' }, 'chave-de-teste-0123456789')
    const image = await service.generate('capa de carrossel', '1024x1024')
    expect(image.mimeType).toBe('image/png')
    expect(image.bytes.equals(PNG)).toBe(true)
    const [calledUrl, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(calledUrl).toBe(url)
    expect(String(init.body)).toContain('capa de carrossel')
  })

  it('traduz chave recusada e resposta sem imagem', async () => {
    const service = new ImageGenerationService(directory(), { run: loggedIn, fetcher: (async () => json({ error: { message: 'bad key' } }, 401)) as unknown as typeof fetch })
    await service.save({ provider: 'api', apiProvider: 'openai', model: 'gpt-image-1' }, 'chave-de-teste-0123456789')
    await expect(service.generate('x')).rejects.toThrow(/foi recusada/)
    const empty = new ImageGenerationService(directory(), { run: loggedIn, fetcher: (async () => json({ data: [] })) as unknown as typeof fetch })
    await empty.save({ provider: 'api', apiProvider: 'openai', model: 'gpt-image-1' }, 'chave-de-teste-0123456789')
    await expect(empty.generate('x')).rejects.toThrow(/sem imagem/)
  })

  it('acha a imagem em respostas generateContent e data URL', () => {
    expect(findImageData({ candidates: [{ content: { parts: [{ text: 'a' }, { inlineData: { mimeType: 'image/png', data: 'AAA' } }] } }] })).toBe('AAA')
    expect(findImageData({ choices: [{ message: { images: [{ image_url: { url: 'data:image/png;base64,BBB' } }] } }] })).toBe('data:image/png;base64,BBB')
  })
})

describe('motores logados', () => {
  it('Codex: lê a imagem que a ferramenta image_gen gravou na pasta da thread, sem shell', async () => {
    const home = directory()
    const run = vi.fn<CliRunner>(async (_binary, args) => {
      if (args[0] !== 'exec') return { code: 0, stdout: 'Logged in', stderr: '' }
      const folder = join(home, '.codex', 'generated_images', 'thread-1')
      mkdirSync(folder, { recursive: true }); writeFileSync(join(folder, 'ig_1.png'), PNG)
      return { code: 0, stdout: '{"type":"thread.started","thread_id":"thread-1"}\n', stderr: '' }
    })
    const previous = process.env.CODEX_HOME; delete process.env.CODEX_HOME
    try {
      const service = new ImageGenerationService(directory(), { run, home })
      await service.save({ provider: 'codex', apiProvider: 'openai', model: '' })
      expect((await service.generate('mascote')).bytes.equals(PNG)).toBe(true)
      const args = run.mock.calls.find(call => call[1][0] === 'exec')![1]
      expect(args).toEqual(expect.arrayContaining(['--enable', 'image_generation', '--disable', 'shell_tool', '-s', 'read-only']))
      expect(args.at(-1)).toContain('mascote')
    } finally { if (previous !== undefined) process.env.CODEX_HOME = previous }
  })

})

// Geração real: BOOBOT_RUN_IMAGE_LIVE=codex npx vitest run src/main/v9/image-generation.test.ts
it.skipIf(process.env.BOOBOT_RUN_IMAGE_LIVE !== 'codex')('gera uma imagem real com o motor logado', async () => {
  const provider = 'codex' as const
  const service = new ImageGenerationService(directory())
  expect((await service.engineAvailability()).available).toBe(true)
  await service.save({ provider, apiProvider: 'openai', model: '' })
  const image = await service.generate('Ícone flat de um pequeno robô sorridente, fundo liso.', '1024x1024')
  expect(['image/png', 'image/jpeg', 'image/webp']).toContain(image.mimeType)
  expect(image.bytes.length).toBeGreaterThan(1000)
  if (process.env.BOOBOT_IMAGE_LIVE_OUT) writeFileSync(process.env.BOOBOT_IMAGE_LIVE_OUT, image.bytes)
}, 6 * 60_000)
