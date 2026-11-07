import { promises as fs } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, isAbsolute, relative, resolve, sep } from 'node:path'
import { captureFileVersion, commitFileWrite } from './guarded-write'

export interface ProjectFileEntry { name: string; path: string; directory: boolean }

const ignored = new Set(['node_modules', '.git', '.next', '.turbo', 'dist', 'build', '.cache', 'coverage'])
const MAX_FILE_BYTES = 1024 * 1024
const fingerprint = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex')

async function withinProject(root: string, requestedPath: string): Promise<string> {
  if (typeof requestedPath !== 'string' || requestedPath.includes('\0') || isAbsolute(requestedPath)) {
    throw new Error('Caminho inválido para este projeto.')
  }
  const canonicalRoot = await fs.realpath(root)
  const candidate = resolve(canonicalRoot, requestedPath)
  const lexical = relative(canonicalRoot, candidate)
  if (lexical === '..' || lexical.startsWith('..' + sep) || isAbsolute(lexical)) {
    throw new Error('Não é permitido acessar arquivos fora do projeto.')
  }
  const canonicalTarget = await fs.realpath(candidate)
  const physical = relative(canonicalRoot, canonicalTarget)
  if (physical === '..' || physical.startsWith('..' + sep) || isAbsolute(physical)) {
    throw new Error('Links para fora do projeto não são permitidos.')
  }
  return canonicalTarget
}

export async function listProjectDirectory(root: string, directory = ''): Promise<ProjectFileEntry[]> {
  const target = await withinProject(root, directory)
  if (!(await fs.stat(target)).isDirectory()) throw new Error('Selecione uma pasta válida.')
  const entries = await fs.readdir(target, { withFileTypes: true })
  return entries
    .filter(entry => !entry.isSymbolicLink() && !ignored.has(entry.name))
    .slice(0, 600)
    .map(entry => ({
      name: entry.name,
      path: [directory.replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''), entry.name].filter(Boolean).join('/'),
      directory: entry.isDirectory(),
    }))
    .sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name, 'pt-BR', { numeric: true }))
}

/** Caminho absoluto validado (pasta ou arquivo) para abrir fora do Boobot; '' é a raiz do projeto. */
export async function resolveProjectPath(root: string, requestedPath: string): Promise<{ path: string; directory: boolean }> {
  const target = await withinProject(root, requestedPath)
  return { path: target, directory: (await fs.stat(target)).isDirectory() }
}

const IMAGE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' }
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

/** Imagem do projeto como data URL para a prévia do painel (tipo decidido pela extensão, até 10 MB). */
export async function readProjectImage(root: string, filePath: string): Promise<{ path: string; dataUrl: string }> {
  const mime = IMAGE_TYPES[filePath.split('.').pop()?.toLowerCase() || '']
  if (!mime) throw new Error('Formato de imagem sem prévia.')
  const target = await withinProject(root, filePath)
  const stat = await fs.stat(target)
  if (!stat.isFile()) throw new Error('Selecione um arquivo válido.')
  if (stat.size > MAX_IMAGE_BYTES) throw new Error('Imagem maior que 10 MB. Abra-a em um programa externo.')
  return { path: filePath, dataUrl: `data:${mime};base64,${(await fs.readFile(target)).toString('base64')}` }
}

export async function readProjectText(root: string, filePath: string): Promise<{ path: string; name: string; content: string; hash: string }> {
  if (!filePath || filePath === '.') throw new Error('Selecione um arquivo.')
  const target = await withinProject(root, filePath)
  const stat = await fs.stat(target)
  if (!stat.isFile()) throw new Error('Selecione um arquivo válido.')
  if (stat.size > MAX_FILE_BYTES) throw new Error('Arquivo maior que 1 MB. Abra-o em um editor externo.')
  const buffer = await fs.readFile(target)
  if (buffer.includes(0)) throw new Error('Arquivos binários não possuem prévia de texto.')
  return { path: filePath, name: basename(target), content: buffer.toString('utf8'), hash: fingerprint(buffer) }
}

export async function writeProjectText(root: string, filePath: string, content: string, expectedHash: string): Promise<{ path: string; hash: string }> {
  if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES || content.includes('\0')) {
    throw new Error('Somente arquivos de texto de até 1 MB podem ser salvos.')
  }
  if (typeof expectedHash !== 'string' || !/^[a-f0-9]{64}$/.test(expectedHash)) {
    throw new Error('Abra novamente o arquivo antes de salvar.')
  }
  const target = await withinProject(root, filePath)
  const info = await fs.stat(target)
  if (!info.isFile()) throw new Error('Selecione um arquivo existente.')
  if (info.size > MAX_FILE_BYTES) throw new Error('Arquivo original excede 1 MB.')
  const original = await fs.readFile(target)
  if (original.includes(0)) throw new Error('Arquivos binários não podem ser editados.')
  if (fingerprint(original) !== expectedHash) {
    throw new Error('O arquivo foi alterado no disco por outro processo ou agente. Compare as alterações e recarregue antes de salvar.')
  }
  const next = Buffer.from(content, 'utf8')
  const canonicalRoot = await fs.realpath(root)
  const actualPath = relative(canonicalRoot, target)
  const current = await captureFileVersion(canonicalRoot, actualPath)
  if (!current.exists || current.sha256 !== expectedHash) throw new Error('O arquivo foi alterado no disco por outro processo ou agente. Compare as alterações e recarregue antes de salvar.')
  const saved = await commitFileWrite({ root: canonicalRoot, relativePath: actualPath, content: next, expectedVersion: { exists: true, sha256: expectedHash } })
  return { path: filePath, hash: saved.sha256 }
}
