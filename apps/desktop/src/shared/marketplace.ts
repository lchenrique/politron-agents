/** Equipes prontas do Marketplace: catálogo local e gratuito, lido de `resources/marketplace`. */
export interface MarketplaceMember {
  /** Chave estável dentro da equipe (ex.: "diretor"). */
  key: string
  name: string
  alias: string
  /** Papel em poucas palavras (ex.: "Roteirista"). */
  role: string
  description: string
  /** A "alma" do Boo: vira `Agent.instructions`. */
  instructions: string
  color: string
  pitsHeadAccessory?: string
  /** Slugs das skills do Marketplace (nome da pasta em `skills/`). */
  skills: string[]
}

export interface MarketplaceTeam {
  id: string
  name: string
  area: string
  description: string
  /** `key` do membro que lidera a conversa em grupo. */
  leader: string
  members: MarketplaceMember[]
}

export interface HireTeamInput {
  teamId: string
  /** Projeto de destino; ausente = equipe global (livre). */
  workspaceId?: string
  runtime: 'codex' | 'claude' | 'pi' | 'opencode' | 'antigravity'
  model?: string
}

export interface HireTeamResult {
  agentIds: string[]
  conversationId: string
}
