import { safeWebUrl } from '../../../../shared/platform-browser'
import type { Workspace } from '../../../../shared/v9'

export type MessageLinkTarget = { kind: 'anchor' } | { kind: 'url'; url: string } | { kind: 'file'; path: string } | { kind: 'blocked' }
const blocked: MessageLinkTarget = { kind: 'blocked' }

/**
 * Classifica o href de um link Markdown explícito. Não acessa disco: o caminho relativo
 * ainda é revalidado no processo principal contra a pasta do workspace ao ler o arquivo.
 */
export function classifyMessageLink(href: string | undefined): MessageLinkTarget {
  const value = href?.trim()
  if (!value) return blocked
  if (value.startsWith('#')) return { kind: 'anchor' }
  // Qualquer esquema (inclusive "C:" de caminho absoluto do Windows) só passa se for HTTP/HTTPS.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) { const url = safeWebUrl(value); return url ? { kind: 'url', url } : blocked }
  if (/^[\\/]/.test(value) || value.includes('?')) return blocked
  let path = value.split('#')[0]
  try { path = decodeURIComponent(path) } catch { return blocked }
  if (path.includes('\0')) return blocked
  const segments = path.replace(/\\/g, '/').split('/').filter(segment => segment && segment !== '.')
  if (!segments.length || segments.includes('..') || /^[a-z]:/i.test(segments[0]) || /^[\\/]/.test(path)) return blocked
  return { kind: 'file', path: segments.join('/') }
}

/** Projeto livre recebe um diretório interno gerenciado: para links, conta como conversa sem pasta de projeto. */
export function linkFileWorkspaceId(workspace: Pick<Workspace, 'id' | 'kind'> | undefined): string | null {
  return workspace && workspace.kind !== 'free' ? workspace.id : null
}
