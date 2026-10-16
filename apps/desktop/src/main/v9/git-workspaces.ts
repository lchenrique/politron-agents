import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { promisify } from 'node:util'
import { basename, isAbsolute, relative, resolve, sep } from 'node:path'

const execFileAsync = promisify(execFile)
const runGit = async (cwd: string, args: string[]) => {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], {
    windowsHide: true,
    maxBuffer: 1024 * 1024,
    encoding: 'utf8'
  })
  return stdout.trimEnd()
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

  constructor(worktreeRoot: string) {
    this.root = resolve(worktreeRoot)
  }

  async inspect(path: string): Promise<GitWorkspaceInfo> {
    const directory = resolve(path)
    const branchName = await runGit(directory, ['symbolic-ref', '--quiet', '--short', 'HEAD']).catch(() => '')
    const status = await runGit(directory, ['status', '--porcelain=v1', '--untracked-files=all'])
    return { branch: branchName || null, changes: status ? status.split('\n').length : 0 }
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

  async createWorktree(input: { sourcePath: string; workspaceName: string; workspaceId?: string; branch: string; baseBranch?: string }): Promise<CreatedGitWorktree> {
    const source = resolve(input.sourcePath)
    const sourceRoot = resolve(await runGit(source, ['rev-parse', '--show-toplevel']))
    const branch = input.branch.trim()
    const validBranch = await execFileAsync('git', ['check-ref-format', '--branch', branch], {
      cwd: sourceRoot,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
      encoding: 'utf8'
    }).then(() => true, () => false)
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
    try {
      await fs.lstat(target)
      throw new Error('Já existe uma pasta para este worktree.')
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error
    }

    const baseBranch = input.baseBranch?.trim() || await runGit(sourceRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD']).catch(() => 'HEAD')
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
