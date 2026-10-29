/** CLIs de agente de código que o Politron sabe procurar na máquina, inspirado na detecção do Paseo. */
export type ProviderId = 'codex' | 'claude' | 'opencode' | 'pi' | 'antigravity'

export interface ProviderModel {
  id: string; name: string
  description?: string
  isDefault?: boolean
  supportedEfforts?: import('./v9').ModelEffort[]
  defaultEffort?: import('./v9').ModelEffort
  serviceTiers?: import('./v9').ModelOptionChoice[]
  defaultServiceTier?: string
  variants?: import('./v9').ModelOptionChoice[]
  defaultVariant?: string
  supportsFastMode?: boolean
}

export interface ProviderModelCatalog {
  models: ProviderModel[] | null
  source?: 'runtime' | 'configuration'
  reason?: string
}

export interface ProviderInfo {
  id: ProviderId
  name: string
  binary: string
  found: boolean
  version: string | null
  path: string | null
  /** Catálogo retornado pelo runtime ou configuração local; null quando indisponível. */
  models: ProviderModel[] | null
  modelSource?: ProviderModelCatalog['source']
  modelReason?: string
  /** O Politron possui um adaptador capaz de executar este provedor e um catálogo do runtime. */
  executable?: boolean
  /** Binário encontrado não significa que o comando --version funcione. */
  operational?: boolean
}

export interface ProviderSnapshot {
  providers: ProviderInfo[]
  checkedAt: string | null
  catalogVersion?: number
}

export interface ProvidersAPI {
  /** Consulta apenas o último inventário persistido (inicializa uma vez se não houver). */
  list(): Promise<ProviderSnapshot>
  /** Solicita nova varredura explícita. */
  refresh(): Promise<ProviderSnapshot>
  /** Compatibilidade com consumidores antigos: nova varredura explícita. */
  detect(): Promise<ProviderInfo[]>
  onChanged(callback: (snapshot: ProviderSnapshot) => void): () => void
}
