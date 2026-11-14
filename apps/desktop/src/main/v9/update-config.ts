import type { ReleaseChannel } from '../../shared/updates'

export type UpdateFeeds = Partial<Record<ReleaseChannel, string>>
export interface GithubReleases { owner: string; repo: string }
/** O que o app passa ao electron-updater; nunca inclui token. */
export type UpdateFeedOptions =
  | { provider: 'generic'; url: string }
  | { provider: 'github'; owner: string; repo: string; private: false }

/** Public read-only HTTPS feeds. No GitHub token or private repository URL in clients. */
export function parseUpdateFeeds(raw: unknown): UpdateFeeds {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const input = raw as Record<string, unknown>
  const result: UpdateFeeds = {}
  for (const key of ['stable', 'beta'] as const) {
    const value = input[key]
    if (typeof value !== 'string') continue
    try {
      const url = new URL(value)
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !url.hostname) continue
      result[key] = url.toString().replace(/\/$/, '')
    } catch { /* Invalid URLs remain unconfigured. */ }
  }
  return result
}

const GITHUB_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})$/
/** `{ "github": { "owner": "...", "repo": "..." } }` em update-feed.json; campos extras (como token) são ignorados. */
export function parseGithubReleases(raw: unknown): GithubReleases | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const github = (raw as Record<string, unknown>).github
  if (!github || typeof github !== 'object' || Array.isArray(github)) return null
  const { owner, repo } = github as Record<string, unknown>
  return typeof owner === 'string' && typeof repo === 'string' && GITHUB_NAME.test(owner) && GITHUB_NAME.test(repo)
    ? { owner, repo } : null
}

/** Feed HTTPS do canal tem prioridade; sem ele, usa as Releases públicas do GitHub. */
export function updateFeedOptions(feeds: UpdateFeeds, github: GithubReleases | null, channel: ReleaseChannel): UpdateFeedOptions | null {
  const url = feeds[channel]
  if (url) return { provider: 'generic', url }
  if (github) return { provider: 'github', owner: github.owner, repo: github.repo, private: false }
  return null
}

/** Traduz os erros mais comuns do GitHub para uma orientação acionável. */
export function describeUpdateError(message: string, options: UpdateFeedOptions | null): string {
  if (options?.provider === 'github' && /\b(404|401|403)\b|not found|authentication/i.test(message))
    return `Não foi possível ler as Releases de ${options.owner}/${options.repo}. O repositório precisa ser público (ou as releases precisam ser publicadas num repositório público) e ter ao menos uma release publicada com latest.yml.`
  return message.slice(0, 350)
}

export function defaultUpdateChannel(version: string): ReleaseChannel {
  return version.includes('-') ? 'beta' : 'stable'
}
