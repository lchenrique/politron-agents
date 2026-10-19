import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { decisionModelsFromCatalog, OpenRouterDecisionService, parseRoutingDecision } from './decision-routing'

vi.mock('electron', () => ({ safeStorage: { isEncryptionAvailable: () => true, encryptString: (value: string) => Buffer.from(value), decryptString: (value: Buffer) => value.toString() } }))

const directories: string[] = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })
const directory = () => { const value = mkdtempSync(join(tmpdir(), 'politron-decider-')); directories.push(value); return value }
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('catálogo de modelos de decisão OpenRouter', () => {
  it('filtra só os modelos que anunciam modalidade decisions', () => {
    expect(decisionModelsFromCatalog({ data: [
      { id: 'typesafe/jev-1.13', name: 'Jev', architecture: { output_modalities: ['decisions'] } },
      { id: 'vendor/chat', name: 'Chat', architecture: { output_modalities: ['text'] } },
    ] })).toEqual([{ id: 'typesafe/jev-1.13', name: 'Jev' }])
  })
  it('inclui aliases dinâmicos ~ e continua filtrando somente decisões', () => {
    expect(decisionModelsFromCatalog({ data: [
      { id: '~typesafe/jev-latest', name: 'Jev Latest', architecture: { output_modalities: ['decisions'] } },
      { id: 'typesafe/jev-1.14', name: 'Jev 1.14', architecture: { output_modalities: ['decisions'] } },
      { id: '~vendor/chat-latest', name: 'Chat Latest', architecture: { output_modalities: ['text'] } },
      { id: 'vendor/no-modality', name: 'Indefinido' },
    ] })).toEqual([
      { id: 'typesafe/jev-1.14', name: 'Jev 1.14' },
      { id: '~typesafe/jev-latest', name: 'Jev Latest' },
    ])
  })
  it('preserva modelos :free e sinaliza planos gratuitos sem sufixo', () => {
    const models = decisionModelsFromCatalog({ data: [
      { id: 'inception/mercury-decide:free', name: 'Mercury Decide (free)', pricing: { prompt: '0', completion: '0' }, architecture: { output_modalities: ['decisions'] } },
      { id: 'respan/span-01-lite', name: 'Span 01 Lite', pricing: { prompt: '0', completion: '0' }, architecture: { output_modalities: ['decisions'] } },
      { id: 'typesafe/jev-1.14', name: 'Jev 1.14', pricing: { prompt: '0.000000042', completion: '0' }, architecture: { output_modalities: ['decisions'] } },
      { id: 'vendor/text:free', name: 'Free text', pricing: { prompt: '0', completion: '0' }, architecture: { output_modalities: ['text'] } },
    ] })
    expect(models?.find(item => item.id === 'inception/mercury-decide:free')?.free).toBe(true)
    expect(models?.find(item => item.id === 'respan/span-01-lite')?.free).toBe(true)
    expect(models?.find(item => item.id === 'typesafe/jev-1.14')?.free).toBeUndefined()
    expect(models?.some(item => item.id === 'vendor/text:free')).toBe(false)
  })
  it('rejeita catálogo inválido ou sem modelos de decisão', () => {
    expect(decisionModelsFromCatalog({ data: [{ id: 'vendor/chat', architecture: { output_modalities: ['text'] } }] })).toBeNull()
    expect(decisionModelsFromCatalog({})).toBeNull()
  })
})

describe('validação da decisão de roteamento', () => {
  const choices = ['agent-a', 'agent-b']
  it('aceita somente a opção oferecida com confiança suficiente e probabilidades coerentes', () => {
    expect(parseRoutingDecision({ answers: { routing: { choice: 'agent-b', probabilities: { 'agent-a': 0.1, 'agent-b': 0.9 } } } }, choices)).toEqual({ choice: 'agent-b', confidence: 0.9 })
  })
  it('falha de forma segura em resposta inválida, ambígua ou de baixa confiança', () => {
    expect(parseRoutingDecision({ answers: { routing: { choice: 'other', probabilities: { 'agent-a': 0.1, 'agent-b': 0.9 } } } }, choices)).toBeNull()
    expect(parseRoutingDecision({ answers: { routing: { choice: 'agent-a', probabilities: { 'agent-a': 0.51, 'agent-b': 0.49 } } } }, choices)).toBeNull()
    expect(parseRoutingDecision({ answers: { routing: { choice: 'agent-a', probabilities: { 'agent-a': 1.2, 'agent-b': -0.2 } } } }, choices)).toBeNull()
  })
})

describe('decisor OpenRouter', () => {
  it('busca o catálogo somente depois de receber uma chave e filtra modelos de decisão', async () => {
    const keyStore = { has: vi.fn(async () => false), load: vi.fn(async () => null), save: vi.fn(), clear: vi.fn() }
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      return response({ data: [
        { id: 'typesafe/jev-1.13', name: 'Jev', architecture: { output_modalities: ['decisions'] } },
        { id: 'openai/gpt-chat', name: 'Chat', architecture: { output_modalities: ['text'] } },
      ] })
    })
    const service = new OpenRouterDecisionService(directory(), { keyStore, fetcher })
    await expect(service.models()).rejects.toThrow('Informe e salve uma chave OpenRouter')
    await expect(service.models('sk-or-test-key-1234567890123456')).resolves.toEqual({ source: 'openrouter', models: [{ id: 'typesafe/jev-1.13', name: 'Jev' }] })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(String(fetcher.mock.calls[0][0])).toBe('https://openrouter.ai/api/v1/models?output_modalities=decisions')
    expect((fetcher.mock.calls[0][1]?.headers as Record<string, string>).authorization).toBe('Bearer sk-or-test-key-1234567890123456')
  })
  it('aceita salvar aliases oficiais do OpenRouter como modelo de decisão', async () => {
    const keyStore = { has: vi.fn(async () => false), load: vi.fn(async () => null), save: vi.fn(), clear: vi.fn() }
    const service = new OpenRouterDecisionService(directory(), { keyStore, fetcher: vi.fn<typeof fetch>() })
    await service.saveModel('~typesafe/jev-latest')
    expect(await service.status()).toEqual({ configured: false, modelId: '~typesafe/jev-latest' })
    await service.saveModel('inception/mercury-decide:free')
    expect(await service.status()).toEqual({ configured: false, modelId: 'inception/mercury-decide:free' })
  })
  it('não apresenta catálogo genérico quando o OpenRouter recusa a chave', async () => {
    const keyStore = { has: vi.fn(async () => false), load: vi.fn(async () => null), save: vi.fn(), clear: vi.fn() }
    const service = new OpenRouterDecisionService(directory(), { keyStore, fetcher: vi.fn(async () => response({ error: 'unauthorized' }, 401)) })
    await expect(service.models('sk-or-test-key-1234567890123456')).rejects.toThrow('A chave OpenRouter foi recusada')
  })
  it('persiste o modelo de decisão sem guardar a chave nas configurações', async () => {
    const keyStore = { has: vi.fn(async () => false), load: vi.fn(async () => null), save: vi.fn(), clear: vi.fn() }
    const dataDirectory = directory()
    const service = new OpenRouterDecisionService(dataDirectory, { keyStore, fetcher: vi.fn<typeof fetch>() })
    await service.saveModel('perplexity/pplx-decider-v1.1-27b')
    expect(await service.status()).toEqual({ configured: false, modelId: 'perplexity/pplx-decider-v1.1-27b' })
  })

  it('usa a Decisions API com contexto recente e retorna somente agente validado', async () => {
    const keyStore = { has: vi.fn(async () => true), load: vi.fn(async () => 'sk-or-test-key-1234567890123456'), save: vi.fn(), clear: vi.fn() }
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe('https://openrouter.ai/api/alpha/decisions')
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer sk-or-test-key-1234567890123456')
      const body = JSON.parse(String(init?.body))
      expect(body.questions.routing.criteria).toHaveProperty('agent-a')
      expect(body.state.recentMessages).toHaveLength(1)
      return response({ answers: { routing: { choice: 'agent-b', probabilities: { 'agent-a': 0.05, 'agent-b': 0.95 } } } })
    })
    const service = new OpenRouterDecisionService(directory(), { keyStore, fetcher })
    const result = await service.choose({ message: 'Ajuste o layout', conversation: 'Frontend', agents: [
      { id: 'agent-a', name: 'Atlas', description: 'Frontend' }, { id: 'agent-b', name: 'Nox', description: 'Backend' },
    ], history: [{ author: 'Você', text: 'Estamos trabalhando no projeto.' }] })
    expect(result).toEqual({ agentId: 'agent-b', confidence: 0.95 })
  })
  it('retorna fallback em erro HTTP, catálogo inválido ou pouca confiança', async () => {
    const keyStore = { has: vi.fn(async () => true), load: vi.fn(async () => 'sk-or-test-key-1234567890123456'), save: vi.fn(), clear: vi.fn() }
    const lowConfidence = vi.fn<typeof fetch>(async () => response({ answers: { routing: { choice: 'agent-a', probabilities: { 'agent-a': 0.55, 'agent-b': 0.45 } } } }))
    const service = new OpenRouterDecisionService(directory(), { keyStore, fetcher: lowConfidence })
    const input = { message: 'Oi', conversation: 'Grupo', agents: [{ id: 'agent-a', name: 'A', description: '' }, { id: 'agent-b', name: 'B', description: '' }], history: [] }
    expect(await service.choose(input)).toBeNull()
    lowConfidence.mockImplementation(async () => response({ error: 'invalid key' }, 401))
    expect(await service.choose(input)).toBeNull()
  })
})
