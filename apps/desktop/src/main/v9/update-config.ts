import type { ReleaseChannel } from '../../shared/updates'

export type UpdateFeeds = Partial<Record<ReleaseChannel, string>>

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
export function defaultUpdateChannel(version: string): ReleaseChannel {
  return version.includes('-') ? 'beta' : 'stable'
}
