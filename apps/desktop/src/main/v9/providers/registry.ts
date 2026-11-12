import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ProviderId, ProviderInfo, ProviderSnapshot } from '../../../shared/providers'
import { detectProviders } from './detect'

const IDS: ProviderId[] = ['codex', 'claude', 'opencode', 'pi']

/** Inventário persistente. Abrir Configurações ou Composer não executa nenhum CLI. */
export class ProviderRegistry {
  private readonly path: string
  private snapshot: ProviderSnapshot | null = null
  private reading: Promise<ProviderSnapshot> | null = null
  private scanning: Promise<ProviderSnapshot> | null = null
  private readonly listeners = new Set<(snapshot: ProviderSnapshot) => void>()

  constructor(
    directory: string,
    private readonly scan: () => Promise<ProviderInfo[]> = () => detectProviders(undefined, {}),
  ) {
    this.path = join(directory, 'provider-inventory.json')
  }

  onChanged(listener: (snapshot: ProviderSnapshot) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async list(): Promise<ProviderSnapshot> {
    if (this.snapshot) return this.snapshot
    if (this.reading) return this.reading
    this.reading = this.load()
    try { return await this.reading } finally { this.reading = null }
  }

  private async load(): Promise<ProviderSnapshot> {
    try {
      const input: unknown = JSON.parse(await fs.readFile(this.path, 'utf8'))
      if (this.valid(input)) {
        this.snapshot = input
        return input
      }
    } catch { /* Arquivo inexistente/inválido: detectar uma única vez. */ }
    return this.refresh()
  }

  private valid(input: unknown): input is ProviderSnapshot {
    if (!input || typeof input !== 'object') return false
    const data = input as Partial<ProviderSnapshot>
    return data.catalogVersion === 7 && typeof data.checkedAt === 'string' && Number.isFinite(Date.parse(data.checkedAt)) &&
      Array.isArray(data.providers) && data.providers.length === IDS.length &&
      IDS.every(id => data.providers?.some(item => item && item.id === id &&
        typeof item.name === 'string' && typeof item.found === 'boolean' &&
        (item.models === null || Array.isArray(item.models))))
  }

  async refresh(): Promise<ProviderSnapshot> {
    if (this.scanning) return this.scanning
    this.scanning = (async () => {
      const providers = await this.scan()
      const next: ProviderSnapshot = {
        catalogVersion: 7,
        providers: providers.map(provider => ({
          ...provider,
          models: provider.models?.filter(model => typeof model.id === 'string' &&
            typeof model.name === 'string').slice(0, 1500) ?? null,
        })),
        checkedAt: new Date().toISOString(),
      }
      // Nunca persiste chaves, tokens ou dados dos usuários; apenas catálogo e diagnósticos.
      await fs.mkdir(dirname(this.path), { recursive: true })
      const temporary = this.path + '.tmp'
      try {
        await fs.writeFile(temporary, JSON.stringify(next), { mode: 0o600 })
        await fs.rename(temporary, this.path)
      } catch {
        // Falha de disco não deve impedir que o usuário utilize o resultado em memória.
        await fs.rm(temporary, { force: true }).catch(() => undefined)
      }
      this.snapshot = next
      for (const listener of this.listeners) listener(next)
      return next
    })()
    try { return await this.scanning } finally { this.scanning = null }
  }
}
