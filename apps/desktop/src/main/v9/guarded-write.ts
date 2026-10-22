import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

export type FileVersion = { exists: boolean; sha256: string | null }
export class FileVersionConflictError extends Error {}

const fingerprint = (content: Buffer) => createHash('sha256').update(content).digest('hex')
const writeTails = new Map<string, Promise<void>>()

function assertInside(root: string, target: string): void {
  const path = relative(root, target)
  if (path === '..' || path.startsWith('..' + sep) || isAbsolute(path)) throw new Error('Não é permitido acessar arquivos fora do projeto.')
}

async function resolveWriteTarget(root: string, relativePath: string) {
  if (typeof relativePath !== 'string' || !relativePath.trim() || relativePath.includes('\0') || isAbsolute(relativePath)) throw new Error('Caminho inválido para este projeto.')
  const canonicalRoot = await fs.realpath(root)
  const candidate = resolve(canonicalRoot, relativePath)
  assertInside(canonicalRoot, candidate)
  let parent: string
  try { parent = await fs.realpath(dirname(candidate)) }
  catch (error: any) { if (error?.code === 'ENOENT') throw new Error('A pasta de destino precisa existir antes de salvar.'); throw error }
  assertInside(canonicalRoot, parent)
  const target = join(parent, basename(candidate))
  let info: Awaited<ReturnType<typeof fs.lstat>> | undefined
  try { info = await fs.lstat(target) }
  catch (error: any) { if (error?.code !== 'ENOENT') throw error }
  if (info?.isSymbolicLink()) throw new Error('O destino não pode ser um link simbólico.')
  if (info && !info.isFile()) throw new Error('Selecione um arquivo comum.')
  return { canonicalRoot, target, info }
}

export function fileContentMatches(current: Buffer, proposed: Buffer): boolean {
  return current.equals(proposed)
}

export async function captureFileVersion(root: string, relativePath: string): Promise<FileVersion> {
  const { target, info } = await resolveWriteTarget(root, relativePath)
  if (!info) return { exists: false, sha256: null }
  return { exists: true, sha256: fingerprint(await fs.readFile(target)) }
}

function sameVersion(left: FileVersion, right: FileVersion): boolean {
  return left.exists === right.exists && left.sha256 === right.sha256
}

async function withFileLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = writeTails.get(key) || Promise.resolve()
  let release!: () => void
  const current = new Promise<void>(resolve => { release = resolve })
  writeTails.set(key, current)
  await previous
  try { return await operation() }
  finally {
    release()
    if (writeTails.get(key) === current) writeTails.delete(key)
  }
}

export async function commitFileWrite(input: {
  root: string
  relativePath: string
  content: Buffer
  expectedVersion: FileVersion
  signal?: AbortSignal
}): Promise<{ sha256: string; changed: boolean }> {
  if (!Buffer.isBuffer(input.content)) throw new Error('Conteúdo de arquivo inválido.')
  if (!input.expectedVersion || typeof input.expectedVersion.exists !== 'boolean' || (input.expectedVersion.exists ? !/^[a-f0-9]{64}$/.test(input.expectedVersion.sha256 || '') : input.expectedVersion.sha256 !== null)) throw new Error('Abra novamente o arquivo antes de salvar.')
  if (input.signal?.aborted) throw new Error('Execução interrompida antes de salvar.')
  const first = await resolveWriteTarget(input.root, input.relativePath)
  const lockPath = resolve(first.canonicalRoot, input.relativePath)
  const key = process.platform === 'win32' ? lockPath.toLowerCase() : lockPath
  return withFileLock(key, async () => {
    if (input.signal?.aborted) throw new Error('Execução interrompida antes de salvar.')
    const currentTarget = await resolveWriteTarget(input.root, input.relativePath)
    const currentVersion = currentTarget.info
      ? { exists: true, sha256: fingerprint(await fs.readFile(currentTarget.target)) }
      : { exists: false, sha256: null }
    if (!sameVersion(currentVersion, input.expectedVersion)) throw new FileVersionConflictError('O arquivo foi alterado no disco. Compare as alterações e recarregue antes de salvar.')
    const nextHash = fingerprint(input.content)
    if (currentTarget.info && fileContentMatches(await fs.readFile(currentTarget.target), input.content)) return { sha256: nextHash, changed: false }
    if (input.signal?.aborted) throw new Error('Execução interrompida antes de salvar.')

    const temporary = join(dirname(currentTarget.target), `.politron-save-${randomUUID()}.tmp`)
    try {
      await fs.writeFile(temporary, input.content, { flag: 'wx', mode: currentTarget.info ? Number(currentTarget.info.mode) & 0o7777 : 0o666 })
      const latest = await captureFileVersion(input.root, input.relativePath)
      if (!sameVersion(latest, input.expectedVersion)) throw new FileVersionConflictError('O arquivo mudou enquanto era salvo. Nenhuma alteração foi sobrescrita.')
      if (input.signal?.aborted) throw new Error('Execução interrompida antes de salvar.')
      await fs.rename(temporary, currentTarget.target)
      return { sha256: nextHash, changed: true }
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => undefined)
    }
  })
}
