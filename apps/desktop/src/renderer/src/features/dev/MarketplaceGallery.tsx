/** Prévia de desenvolvimento do Marketplace com o catálogo real; contratar só simula. */
import type { Snapshot } from '../../../../shared/v9'
import type { MarketplaceTeam } from '../../../../shared/marketplace'
import instagram from '../../../../main/marketplace/catalog/teams/instagram/team.json'
import { emptySnapshot } from '../app/appShellShared'
import { MarketplacePage } from '../marketplace/MarketplacePage'

const api = (window.appAPI ||= {} as typeof window.appAPI)
api.marketplaceTeams = async () => [instagram as MarketplaceTeam]
api.hireTeam = async () => { await new Promise(resolve => setTimeout(resolve, 600)); return { agentIds: [], conversationId: 'demo' } }
const at = '2026-10-31T00:00:00.000Z'
const snapshot = { ...emptySnapshot, workspaces: [
  { id: 'loja', name: 'Loja da Ana', kind: 'local', path: 'C:/loja', branch: null, baseBranch: null, parentWorkspaceId: null, instructions: '', defaultAgentIds: ['a'], changes: 0, archived: false, createdAt: at },
  { id: 'blog', name: 'Blog', kind: 'local', path: 'C:/blog', branch: null, baseBranch: null, parentWorkspaceId: null, instructions: '', defaultAgentIds: ['a', 'b', 'c', 'd', 'e'], changes: 0, archived: false, createdAt: at },
] } as unknown as Snapshot

export default function MarketplaceGallery() {
  return <div className="flex h-dvh flex-col bg-background"><MarketplacePage snapshot={snapshot} models={[]} onHired={() => undefined} onNotice={() => undefined} /></div>
}
