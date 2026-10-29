import { promises as fs } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { parseGitStatus, runGit } from './git-processes'
import { basename, isAbsolute, relative, resolve, sep } from 'node:path'

const execFileAsync = promisify(execFile)

/** Aceita owner/repo ou URL do GitHub (HTTPS/SSH). Só github.com: evita transportes como ext:: e file://. */
export function parseGithubRepository(value: string): { cloneUrl: string; name: string } | null {
  const input = value.trim()
  const match = /^(?:https:\/\/(?:www\.)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)?([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/.exec(input)
  if (!match || match[2] === '.' || match[2] === '..') return null
  const [, owner, repo] = match
  return { cloneUrl: input.startsWith('git@') || input.startsWith('ssh://') ? `git@github.com:${owner}/${repo}.git` : `https://github.com/${owner}/${repo}.git`, name: repo }
}

export function validProjectFolderName(value: string): string {
  const name = value.trim()
  // Caracteres de controle (< 0x20) também são inválidos em nomes de pasta no Windows.
  const hasControl = [...name].some(char => char.charCodeAt(0) < 32)
  if (!name || name === '.' || name === '..' || name.length > 120 || hasControl || /[<>:"/\\|?*]/.test(name) || /[. ]$/.test(name)) throw new Error('Use um nome de pasta simples, sem barras nem caracteres especiais.')
  return name
}

/** Reserva o destino com mkdir não recursivo: atômico, falha se a pasta já existir. A pasta criada é inequivocamente nossa. */
async function reserveProjectFolder(parent: string, name: string): Promise<string> {
  const realParent = await fs.realpath(resolve(parent)).catch(() => { throw new Error('A pasta de destino não existe mais. Escolha outra.') })
  const target = resolve(realParent, validProjectFolderName(name))
  try { await fs.mkdir(target) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`Já existe uma pasta chamada "${basename(target)}" neste local. Escolha outro nome ou outro destino.`)
    throw error
  }
  return target
}

/** Cria uma pasta vazia nova; nunca reaproveita uma existente. */
export const createProjectFolder = reserveProjectFolder

/** Clona com a autenticação Git já configurada, sem prompt de senha; em falha ou cancelamento remove só a pasta que esta chamada reservou. */
export async function cloneGithubRepository(input: { repository: string; parent: string; name?: string }, signal?: AbortSignal): Promise<string> {
  const repository = parseGithubRepository(input.repository)
  if (!repository) throw new Error('Informe uma URL do GitHub ou owner/repositório válido, por exemplo octocat/hello-world.')
  if (signal?.aborted) throw new Error('Clonagem cancelada. Nenhuma pasta foi mantida.')
  const target = await reserveProjectFolder(input.parent, input.name?.trim() || repository.name)
  try {
    await execFileAsync('git', ['clone', '--', repository.cloneUrl, target], { windowsHide: true, signal, timeout: 15 * 60_000, maxBuffer: 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' } })
    return target
  } catch (caught) {
    const error = caught as NodeJS.ErrnoException & { stderr?: string }
    await fs.rm(target, { recursive: true, force: true, maxRetries: 2 }).catch(() => undefined)
    if (signal?.aborted || error.name === 'AbortError') throw new Error('Clonagem cancelada. Nenhuma pasta foi mantida.')
    const detail = String(error.stderr || '')
    // stderr do Git não é repassado: pode conter URLs de remotos configurados.
    if (/not found|authentication|could not read|permission denied|terminal prompts disabled/i.test(detail)) throw new Error('Não foi possível acessar o repositório. Confira o endereço e se a autenticação do Git/GitHub neste computador tem acesso a ele.')
    if (error.code === 'ENOENT') throw new Error('Git não encontrado neste computador. Instale o Git para clonar repositórios.')
    throw new Error('A clonagem falhou. Verifique a conexão e tente novamente.')
  }
}

const isWithin = (parent: string, target: string) => {
  const rel = relative(parent, target)
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
}

const safeSegment = (value: string) => {
  const segment = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56)
    .replace(/-+$/g, '')
  return segment || 'workspace'
}

export type GitWorkspaceInfo = { branch: string | null; changes: number }
export type CreatedGitWorktree = { path: string; branch: string; baseBranch: string }

/** Creates and removes Git worktrees beneath one controlled directory. */
export class GitWorkspaceService {
  private readonly root: string
  private readonly statusReads = new Map<string, Promise<GitWorkspaceInfo>>()

  constructor(worktreeRoot: string) {
    this.root = resolve(worktreeRoot)
  }

  async inspect(path: string, signal?: AbortSignal): Promise<GitWorkspaceInfo> {
    const directory = resolve(path)
    const existing = !signal && this.statusReads.get(directory)
    if (existing) return existing
    const read = runGit(directory, ['status', '--porcelain=v1', '--branch', '--untracked-files=all'], signal, !!signal).then(parseGitStatus)
    if (signal) return read
    this.statusReads.set(directory, read)
    try { return await read } finally { if (this.statusReads.get(directory) === read) this.statusReads.delete(directory) }
  }

  async diff(path: string): Promise<string> {
    const directory = resolve(path)
    const tracked = await runGit(directory, ['diff', '--no-ext-diff', '--unified=3', 'HEAD', '--']).catch(() => '')
    const untracked = await runGit(directory, ['ls-files', '--others', '--exclude-standard']).catch(() => '')
    const additions: string[] = []
    for (const file of untracked.split('\n').filter(Boolean).slice(0, 100)) {
      const data = await fs.readFile(resolve(directory, file)).catch(() => null)
      if (!data) continue
      if (data.includes(0)) { additions.push(`diff --git a/${file} b/${file}\nnew file mode 100644\nBinary file`); continue }
      const body = data.subarray(0, 200_000).toString('utf8').split('\n').map(line => `+${line}`).join('\n')
      additions.push(`diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n${body}${data.length > 200_000 ? '\n... arquivo truncado ...' : ''}`)
    }
    return [tracked, ...additions].filter(Boolean).join('\n')
  }

  async createWorktree(input: { sourcePath: string; workspaceName: string; workspaceId?: string; branch: string; baseBranch?: string; reuseExisting?: boolean }): Promise<CreatedGitWorktree> {
    const source = resolve(input.sourcePath)
    const sourceRoot = resolve(await runGit(source, ['rev-parse', '--show-toplevel']))
    const branch = input.branch.trim()
    const validBranch = await runGit(sourceRoot, ['check-ref-format', '--branch', branch]).then(() => true, () => false)
    if (!validBranch) throw new Error('Nome de branch inválido.')

    await fs.mkdir(this.root, { recursive: true })
    const realRoot = await fs.realpath(this.root)
    const workspaceName = safeSegment(input.workspaceName || basename(sourceRoot))
    const group = input.workspaceId ? `${workspaceName}-${safeSegment(input.workspaceId).slice(0, 8)}` : workspaceName
    const branchPart = safeSegment(branch.replace(/\//g, '-'))
    const projectRoot = resolve(realRoot, group)
    await fs.mkdir(projectRoot, { recursive: true })
    const realProjectRoot = await fs.realpath(projectRoot)
    if (!isWithin(realRoot, realProjectRoot) || realProjectRoot === realRoot) throw new Error('O diretório do workspace está fora da pasta permitida.')
    const target = resolve(realProjectRoot, branchPart)
    if (!isWithin(realRoot, target) || target === realRoot) throw new Error('O destino do worktree está fora da pasta permitida.')
    const baseBranch = input.baseBranch?.trim() || await runGit(sourceRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD']).catch(() => 'HEAD')
    try {
      await fs.lstat(target)
      if (input.reuseExisting) {
        const realTarget = await fs.realpath(target)
        const entries = await runGit(sourceRoot, ['worktree', 'list', '--porcelain'])
        const registered = entries.split(/\r?\n\r?\n/).some(entry => {
          const path = entry.split(/\r?\n/).find(line => line.startsWith('worktree '))?.slice('worktree '.length)
          const registeredBranch = entry.split(/\r?\n/).find(line => line.startsWith('branch '))?.slice('branch '.length)
          return Boolean(path && registeredBranch === `refs/heads/${branch}` && resolve(path) === realTarget)
        })
        const worktreeRoot = await runGit(realTarget, ['rev-parse', '--show-toplevel']).then(resolve, () => '')
        if (registered && worktreeRoot === realTarget) return { path: realTarget, branch, baseBranch }
      }
      throw new Error('Já existe uma pasta para este worktree.')
    } catch (error: unknown) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error
    }

    await runGit(sourceRoot, ['worktree', 'add', '-b', branch, target, baseBranch])
    return { path: target, branch, baseBranch }
  }

  async removeWorktree(path: string): Promise<void> {
    const target = resolve(path)
    await fs.mkdir(this.root, { recursive: true })
    const realRoot = await fs.realpath(this.root)
    const realTarget = await fs.realpath(target)
    if (!isWithin(realRoot, realTarget) || realTarget === realRoot) throw new Error('O worktree está fora da pasta permitida.')

    const gitDirectory = await runGit(realTarget, ['rev-parse', '--git-common-dir']).catch(() => '')
    if (!gitDirectory) throw new Error('Este caminho não é um worktree Git válido.')
    const sourceRoot = resolve(realTarget, gitDirectory, '..')

    const worktrees = await runGit(sourceRoot, ['worktree', 'list', '--porcelain'])
    const registeredPath = worktrees.split('\n').some(line => line.startsWith('worktree ') && resolve(line.slice('worktree '.length)) === realTarget)
    if (!registeredPath) throw new Error('O Git não reconhece este caminho como worktree registrado.')
    const status = await runGit(realTarget, ['status', '--porcelain=v1', '--untracked-files=all'])
    if (status) throw new Error('Não é possível remover um worktree com alterações locais.')

    await runGit(sourceRoot, ['worktree', 'remove', realTarget])
  }
}
