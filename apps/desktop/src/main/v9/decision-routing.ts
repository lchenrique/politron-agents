import { safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'

export const DEFAULT_DECISION_MODEL = 'typesafe/jev-1.13'
// A rota sem filtro retorna apenas modelos de texto por padrão.
// A Decisions API precisa do catálogo dedicado à modalidade decisions.
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models?output_modalities=decisions'
const OPENROUTER_DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions'
// Aliases dinâmicos do OpenRouter começam com ~ (ex.: ~typesafe/jev-latest).
const MODEL_ID = /^~?[a-z0-9][a-z0-9._/-]{1,119}(?::free)?$/i

type DecisionCatalogEntry = { id?: unknown; name?: unknown; architecture?: { output_modalities?: unknown }; pricing?: { prompt?: unknown; completion?: unknown; request?: unknown } }
export type DecisionModel = { id: string; name: string; free?: boolean }
export type DecisionModelCatalog = { source: 'openrouter'; models: DecisionModel[] }
type SecretStore = { has(): Promise<boolean>; load(): Promise<string | null>; save(value: string): Promise<void>; clear(): Promise<void> }

class EncryptedDecisionKey implements SecretStore {
  private readonly path: string
  constructor(directory: string) { this.path = join(directory, 'openrouter-decision-key.enc') }
  async has() { try { return (await fs.stat(this.path)).isFile() } catch { return false } }
  async load() {
    try {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('O armazenamento seguro do sistema está indisponível.')
      return safeStorage.decryptString(await fs.readFile(this.path))
    } catch (error: unknown) { if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return null; throw error }
  }
  async save(value: string) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('O armazenamento seguro do sistema está indisponível.')
    await fs.writeFile(this.path, safeStorage.encryptString(value), { mode: 0o600 })
  }
  async clear() { await fs.rm(this.path, { force: true }) }
}

function validModelId(value: unknown): value is string { return typeof value === 'string' && MODEL_ID.test(value) }

export function decisionModelsFromCatalog(body: unknown): DecisionModel[] | null {
  if (!body || typeof body !== 'object' || !Array.isArray((body as { data?: DecisionCatalogEntry[] }).data)) return null
  const result = new Map<string, DecisionModel>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- resposta din�mica do servidor/protocolo; tipar exigiria refatorar os chamadores
  for (const item of (body as any).data) {
    if (!item || typeof item !== 'object' || !validModelId(item.id)) continue
    const modalities = item.architecture?.output_modalities
    if (!Array.isArray(modalities) || !modalities.includes('decisions')) continue
    const pricing = item.pricing
    const free = item.id.endsWith(':free') || (pricing && pricing.prompt !== undefined && pricing.completion !== undefined &&
      Number(pricing.prompt) === 0 && Number(pricing.completion) === 0 &&
      (pricing.request === undefined || Number(pricing.request) === 0))
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : item.id
    result.set(item.id, { id: item.id, name, ...(free ? { free: true } : {}) })
  }
  if (!result.size) return null
  const models = [...result.values()].sort((a, b) => a.name.localeCompare(b.name))
  const jevIndex = models.findIndex(model => model.id === DEFAULT_DECISION_MODEL)
  if (jevIndex > 0) models.unshift(...models.splice(jevIndex, 1))
  return models.slice(0, 100)
}

export function parseRoutingDecision(body: unknown, validChoices: string[], minimumConfidence = 0.6): { choice: string; confidence: number } | null {
  if (!body || typeof body !== 'object') return null
  const answers = (body as { answers?: { routing?: { choice: string; probabilities?: Record<string, unknown> } } }).answers
  const answer = answers?.routing
  if (!answer || typeof answer !== 'object' || !validChoices.includes(answer.choice)) return null
  const probabilities = answer.probabilities
  if (!probabilities || typeof probabilities !== 'object' || Array.isArray(probabilities)) return null
  const values = Object.entries(probabilities) as Array<[string, unknown]>
  if (values.length !== validChoices.length || values.some(([key, value]) => !validChoices.includes(key) || typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)) return null
  const sum = values.reduce((total, [, value]) => total + (value as number), 0)
  if (Math.abs(sum - 1) > 0.1) return null
  const confidence = probabilities[answer.choice]
  const highest = Math.max(...values.map(([, value]) => value as number))
  if (typeof confidence !== 'number' || confidence !== highest || confidence < minimumConfidence) return null
  return { choice: answer.choice, confidence }
}

export class OpenRouterDecisionService {
  private readonly keyStore: SecretStore
  private readonly settingsPath: string
  private readonly fetcher: typeof fetch
  constructor(directory: string, options: { keyStore?: SecretStore; fetcher?: typeof fetch } = {}) {
    this.keyStore = options.keyStore || new EncryptedDecisionKey(directory)
    this.settingsPath = join(directory, 'openrouter-decision-settings.json')
    this.fetcher = options.fetcher || fetch
  }
  private async readModel() {
    try {
      const raw = JSON.parse(await fs.readFile(this.settingsPath, 'utf8'))
      return validModelId(raw?.modelId) ? raw.modelId : DEFAULT_DECISION_MODEL
    } catch { return DEFAULT_DECISION_MODEL }
  }
  async status() { return { configured: await this.keyStore.has(), modelId: await this.readModel() } }
  async models(apiKey?: string): Promise<DecisionModelCatalog> {
    const key = typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim() : await this.keyStore.load()
    if (!key || key.length < 20 || key.length > 500) throw new Error('Informe e salve uma chave OpenRouter antes de buscar os modelos.')
    let response: Response
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    try {
      response = await this.fetcher(OPENROUTER_MODELS_URL, { headers: { accept: 'application/json', authorization: `Bearer ${key}` }, signal: controller.signal, redirect: 'error' })
    } catch {
      throw new Error('Não foi possível conectar ao catálogo OpenRouter. Confira sua conexão e tente novamente.')
    } finally { clearTimeout(timer) }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      if (response.status === 401 || response.status === 403) throw new Error('A chave OpenRouter foi recusada. Confira a chave e tente novamente.')
      throw new Error(`O catálogo OpenRouter respondeu com erro (${response.status}). Tente novamente.`)
    }
    const models = decisionModelsFromCatalog(await response.json())
    if (!models) throw new Error('O catálogo OpenRouter não retornou modelos compatíveis com decisões.')
    return { source: 'openrouter', models }
  }
  async testKey(key: string, modelId: string): Promise<void> {
    const cleanKey = typeof key === 'string' ? key.trim() : ''
    if (cleanKey.length < 20 || cleanKey.length > 500) throw new Error('Informe uma chave OpenRouter válida.')
    if (!validModelId(modelId)) throw new Error('Escolha um modelo de decisão válido.')
    const result = await this.request(cleanKey, modelId, { message: 'teste de conexão', conversation: 'teste', agents: [{ id: 'respond', name: 'Resposta', description: 'Confirma a conexão.' }, { id: 'fallback', name: 'Fallback', description: 'Alternativa de teste.' }], history: [] }, AbortSignal.timeout(5000), 0)
    if (!result) throw new Error('Não foi possível validar a chave/modelo. Confira a chave e os créditos da conta OpenRouter.')
  }
  async save(key: string, modelId: string): Promise<void> {
    const cleanKey = typeof key === 'string' ? key.trim() : ''
    if (cleanKey.length < 20 || cleanKey.length > 500) throw new Error('Informe uma chave OpenRouter válida.')
    if (!validModelId(modelId)) throw new Error('Escolha um modelo de decisão válido.')
    await this.keyStore.save(cleanKey)
    await fs.writeFile(this.settingsPath, JSON.stringify({ modelId }), { mode: 0o600 })
  }
  async saveModel(modelId: string): Promise<void> {
    if (!validModelId(modelId)) throw new Error('Escolha um modelo de decisão válido.')
    await fs.writeFile(this.settingsPath, JSON.stringify({ modelId }), { mode: 0o600 })
  }
  async clear() { await this.keyStore.clear() }
  async choose(input: { message: string; conversation: string; agents: Array<{ id: string; name: string; description: string }>; history: Array<{ author: string; text: string }> }, signal?: AbortSignal): Promise<{ agentId: string; confidence: number } | null> {
    const key = await this.keyStore.load()
    if (!key || input.agents.length < 2) return null
    const modelId = await this.readModel()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1400)
    const abort = () => controller.abort(signal?.reason)
    signal?.addEventListener('abort', abort, { once: true })
    try {
      const result = await this.request(key, modelId, input, controller.signal, 0.6)
      return result ? { agentId: result.choice, confidence: result.confidence } : null
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
  }
  private async request(key: string, modelId: string, input: { message: string; conversation: string; agents: Array<{ id: string; name: string; description: string }>; history: Array<{ author: string; text: string }> }, signal: AbortSignal, minimumConfidence: number) {
    if (input.agents.length < 2) return null
    const criteria = Object.fromEntries(input.agents.map(agent => [agent.id, `${agent.name}: ${agent.description || 'Agente do grupo.'}`]))
    const state = { conversation: input.conversation, participants: input.agents.map(({ id, name, description }) => ({ id, name, description: description.slice(0, 240) })), recentMessages: input.history.slice(-8).map(item => ({ author: item.author, text: item.text.slice(0, 500) })), newMessage: input.message.slice(0, 2000) }
    try {
      const response = await this.fetcher(OPENROUTER_DECISIONS_URL, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json', 'x-openrouter-title': 'Boobot' }, body: JSON.stringify({ model: modelId, state, questions: { routing: { type: 'choice', instructions: 'Escolha o único agente mais adequado para responder à nova mensagem. Use o contexto recente. Não escolha mais de um agente.', criteria } } }), signal, redirect: 'error' })
      if (!response.ok) { await response.body?.cancel().catch(() => undefined); return null }
      return parseRoutingDecision(await response.json(), input.agents.map(agent => agent.id), minimumConfidence)
    } catch { return null }
  }
}
