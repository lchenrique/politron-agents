import type { ProviderId, ProviderInfo } from '../../../../shared/providers'
import type { ModelEffort, ModelOptionChoice } from '../../../../shared/v9'

export interface ModelChoice {
  id?: string
  name: string
  provider?: string
  providerId?: string
  enabled?: boolean
  description?: string
  efforts?: ModelEffort[]
  defaultEffort?: ModelEffort
  serviceTiers?: ModelOptionChoice[]
  defaultServiceTier?: string
  variants?: ModelOptionChoice[]
  defaultVariant?: string
  supportsFastMode?: boolean
}

export interface ModelProviderChoice {
  id: string
  name: string
  description?: string
  emptyMessage?: string
}

const PROVIDER_ORDER: ProviderId[] = ['codex', 'claude', 'opencode', 'pi']
const PROVIDER_NAMES: Record<ProviderId, string> = {
  codex: 'Codex', claude: 'Claude', opencode: 'OpenCode', pi: 'Pi',
}

/** Mantém o catálogo completo para consulta e distingue os modelos que podem responder. */
export function modelOptions(providers: ProviderInfo[]): { models: ModelChoice[]; providers: ModelProviderChoice[] } {
  const ordered = providers.map(provider => ({
    ...provider,
    models: provider.models ? [...new Map(provider.models.map(model => [model.id, model])).values()] : null,
  })).sort((left, right) => PROVIDER_ORDER.indexOf(left.id) - PROVIDER_ORDER.indexOf(right.id))
  return {
    providers: ordered.map(provider => {
      const count = provider.models?.length || 0
      const catalogLabel = `${count} ${count === 1 ? 'modelo disponível' : 'modelos disponíveis'}`
      return {
        id: provider.id,
        name: PROVIDER_NAMES[provider.id],
        description: !provider.found ? 'Não instalado neste computador.'
          : provider.executable === true ? `${catalogLabel} para conversar. As ferramentas do Boobot seguem o papel e as permissões da conversa.`
            : count ? `${catalogLabel} para consulta. Este provedor ainda não pode responder nas conversas.`
              : 'Este provedor ainda não pode responder nas conversas.',
        emptyMessage: provider.modelReason || (!provider.found
          ? 'Este CLI não está instalado neste computador.'
          : 'Nenhum catálogo de modelos disponível para este CLI.'),
      }
    }),
    models: ordered.flatMap(provider => (provider.models || []).map(model => ({
      id: `${provider.id}:${model.id}`,
      name: model.name,
      providerId: provider.id,
      provider: PROVIDER_NAMES[provider.id],
      enabled: provider.executable === true,
      description: model.description,
      efforts: model.supportedEfforts,
      defaultEffort: model.defaultEffort,
      serviceTiers: model.serviceTiers,
      defaultServiceTier: model.defaultServiceTier,
      variants: model.variants,
      defaultVariant: model.defaultVariant,
      supportsFastMode: model.supportsFastMode,
    }))),
  }
}
