import { safeWebUrl } from '../../../../shared/platform-browser'
import type { Workspace } from '../../../../shared/v9'

export type MessageLinkTarget = { kind: 'anchor' } | { kind: 'url'; url: string } | { kind: 'file'; path: string } | { kind: 'blocked' }
const blocked: MessageLinkTarget = { kind: 'blocked' }

type AbsolutePath = { flavor: 'windows' | 'posix'; root: string; segments: string[] }

function normalizeAbsolutePath(value: string): AbsolutePath | null {
  const normalized = value.replace(/\\/g, '/').replace(/^\/([a-z]:\/)/i, '$1')
  const windows = /^([a-z]):\/(.*)$/i.exec(normalized)
  const posix = !windows && normalized.startsWith('/') && !normalized.startsWith('//')
  if (!windows && !posix) return null
  const flavor = windows ? 'windows' : 'posix'
  const root = windows ? windows[1].toLowerCase() + ':' : '/'
  const rest = windows ? windows[2] : normalized.slice(1)
  const segments: string[] = []
  for (const segment of rest.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (!segments.length) return null
      segments.pop()
    } else {
      if (segment.includes('\0')) return null
      segments.push(segment)
    }
  }
  return { flavor, root, segments }
}

function absoluteFilePath(value: string): string | null {
  if (/^file:/i.test(value)) {
    try {
      const url = new URL(value)
      if (url.protocol !== 'file:' || (url.hostname && url.hostname.toLowerCase() !== 'localhost') || url.search) return null
      return decodeURIComponent(url.pathname)
    } catch { return null }
  }
  if (!/^[a-z]:[\\/]/i.test(value) && !/^[\\/]/.test(value)) return null
  if (value.includes('?')) return null
  try { return decodeURIComponent(value.split('#')[0]) } catch { return null }
}

function relativePathWithinWorkspace(value: string, workspaceRoot: string | undefined): string | null {
  if (!workspaceRoot) return null
  const candidate = normalizeAbsolutePath(value)
  const root = normalizeAbsolutePath(workspaceRoot)
  if (!candidate || !root || candidate.flavor !== root.flavor) return null
  const sameRoot = candidate.flavor === 'windows'
    ? candidate.root.toLowerCase() === root.root.toLowerCase()
    : candidate.root === root.root
  if (!sameRoot || candidate.segments.length <= root.segments.length) return null
  const sameSegment = (left: string, right: string) => candidate.flavor === 'windows'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right
  if (!root.segments.every((segment, index) => sameSegment(segment, candidate.segments[index]))) return null
  return candidate.segments.slice(root.segments.length).join('/') || null
}

/**
 * Classifica links Markdown. Links absolutos locais só viram arquivos relativos quando
 * ficam dentro do workspace ativo; o processo principal ainda valida o caminho no disco.
 */
export function classifyMessageLink(href: string | undefined, workspaceRoot?: string): MessageLinkTarget {
  const value = href?.trim()
  if (!value) return blocked
  if (value.startsWith('#')) return { kind: 'anchor' }
  if (/^file:/i.test(value) || /^[a-z]:[\\/]/i.test(value) || /^[\\/]/.test(value)) {
    const absolutePath = absoluteFilePath(value)
    const path = absolutePath && relativePathWithinWorkspace(absolutePath, workspaceRoot)
    return path ? { kind: 'file', path } : blocked
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) { const url = safeWebUrl(value); return url ? { kind: 'url', url } : blocked }
  if (value.includes('?')) return blocked
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
