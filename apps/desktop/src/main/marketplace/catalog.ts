import { existsSync, promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { MarketplaceMember, MarketplaceTeam } from '../../shared/marketplace'

/** Empacotado: `resources/marketplace`; em desenvolvimento e testes: a pasta do código. */
export function marketplaceRoot(): string {
  const packaged = process.resourcesPath ? join(process.resourcesPath, 'marketplace') : ''
  return packaged && existsSync(packaged) ? packaged : join(process.cwd(), 'src', 'main', 'marketplace', 'catalog')
}

const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''

function member(value: unknown): MarketplaceMember | null {
  const raw = (value || {}) as Record<string, unknown>
  const item = { key: text(raw.key), name: text(raw.name), alias: text(raw.alias), role: text(raw.role), description: text(raw.description), instructions: text(raw.instructions), color: text(raw.color), pitsHeadAccessory: text(raw.pitsHeadAccessory) || undefined, skills: Array.isArray(raw.skills) ? raw.skills.map(text).filter(Boolean) : [] }
  return item.key && item.name && item.alias && item.instructions ? item : null
}

/** Lê `teams/<id>/team.json`; equipe malformada é ignorada para não derrubar a tela inteira. */
export async function loadTeams(root = marketplaceRoot()): Promise<MarketplaceTeam[]> {
  const dir = join(root, 'teams')
  let entries: string[]
  try { entries = (await fs.readdir(dir, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name) } catch { return [] }
  const teams = await Promise.all(entries.map(async entry => {
    try {
      const raw = JSON.parse(await fs.readFile(join(dir, entry, 'team.json'), 'utf8')) as Record<string, unknown>
      const members = (Array.isArray(raw.members) ? raw.members : []).map(member).filter((item): item is MarketplaceMember => !!item)
      const team: MarketplaceTeam = { id: text(raw.id) || entry, name: text(raw.name), area: text(raw.area), description: text(raw.description), leader: text(raw.leader) || members[0]?.key || '', members }
      return team.name && members.length ? team : null
    } catch (error) { console.error(`[Marketplace] Equipe ${entry} inválida`, error); return null }
  }))
  return teams.filter((team): team is MarketplaceTeam => !!team).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}
