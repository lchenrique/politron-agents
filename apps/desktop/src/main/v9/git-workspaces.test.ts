import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cloneGithubRepository, createProjectFolder, GitWorkspaceService, parseGithubRepository } from './git-workspaces'

const execFileAsync = promisify(execFile)
const temporaryDirectories: string[] = []
const git = async (cwd: string, ...args: string[]) => execFileAsync('git', args, { cwd, windowsHide: true, encoding: 'utf8' })

async function makeRepository() {
  const directory = await mkdtemp(join(tmpdir(), 'politron-git-workspaces-'))
  temporaryDirectories.push(directory)
  const sourcePath = join(directory, 'source')
  await mkdir(sourcePath)
  await git(sourcePath, 'init', '-b', 'main')
  await git(sourcePath, 'config', 'user.name', 'Politron Tests')
  await git(sourcePath, 'config', 'user.email', 'tests@example.invalid')
  await writeFile(join(sourcePath, 'README.md'), 'initial\n')
  await git(sourcePath, 'add', 'README.md')
  await git(sourcePath, 'commit', '-m', 'initial commit')
  return { directory, sourcePath, worktreeRoot: join(directory, 'worktrees') }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async directory => {
    for (let attempt = 0; attempt < 4; attempt++) {
      try { await rm(directory, { recursive: true, force: true, maxRetries: 2, retryDelay: 200 }); return }
      catch (error: unknown) { const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined; if (code !== 'EBUSY' || attempt === 3) throw error; await new Promise(resolve => setTimeout(resolve, 250)) }
    }
  }))
})

describe('GitWorkspaceService', () => {
  it('creates a branch worktree, reports status, refuses dirty removal, then removes it cleanly', async () => {
    const { sourcePath, worktreeRoot } = await makeRepository()
    const service = new GitWorkspaceService(worktreeRoot)
    const created = await service.createWorktree({ sourcePath, workspaceName: 'Instruções de Paz', branch: 'feature/fase-2' })

    expect(created.branch).toBe('feature/fase-2')
    expect(created.baseBranch).toBe('main')
    expect((await readFile(join(created.path, 'README.md'), 'utf8')).replace(/\r\n/g, '\n')).toBe('initial\n')
    expect(await service.inspect(created.path)).toEqual({ branch: 'feature/fase-2', changes: 0 })

    await writeFile(join(created.path, 'draft.txt'), 'unsaved\n')
    expect(await service.inspect(created.path)).toEqual({ branch: 'feature/fase-2', changes: 1 })
    await expect(service.removeWorktree(created.path)).rejects.toThrow('alterações locais')

    await rm(join(created.path, 'draft.txt'))
    expect(await service.inspect(created.path)).toEqual({ branch: 'feature/fase-2', changes: 0 })
    await service.removeWorktree(created.path)
    await expect(readFile(created.path)).rejects.toThrow()
  }, 30000)

  it('reuses only the matching registered worktree when recovery is explicitly enabled', async () => {
    const { sourcePath, worktreeRoot } = await makeRepository()
    const service = new GitWorkspaceService(worktreeRoot)
    const input = { sourcePath, workspaceName: 'Project', workspaceId: 'source-1', branch: 'board/task-1' }
    const created = await service.createWorktree(input)
    const recovered = await service.createWorktree({ ...input, reuseExisting: true })
    expect(recovered).toEqual(created)
    await expect(service.createWorktree(input)).rejects.toThrow('Já existe uma pasta')
  }, 30000)

  it('rejects invalid branch names and unregistered removal paths', async () => {
    const { sourcePath, worktreeRoot, directory } = await makeRepository()
    const service = new GitWorkspaceService(worktreeRoot)
    await expect(service.createWorktree({ sourcePath, workspaceName: 'Project', branch: '../escape' })).rejects.toThrow('branch')
    await expect(service.removeWorktree(directory)).rejects.toThrow('fora da pasta permitida')
  }, 30000)
})

describe('novo projeto: pasta local e clone do GitHub', () => {
  it('aceita só endereços do GitHub sem credenciais embutidas', () => {
    expect(parseGithubRepository('octocat/hello-world')).toEqual({ cloneUrl: 'https://github.com/octocat/hello-world.git', name: 'hello-world' })
    expect(parseGithubRepository('https://github.com/octocat/Hello.World.git')).toEqual({ cloneUrl: 'https://github.com/octocat/Hello.World.git', name: 'Hello.World' })
    expect(parseGithubRepository('git@github.com:octocat/hello-world.git')).toEqual({ cloneUrl: 'git@github.com:octocat/hello-world.git', name: 'hello-world' })
    for (const bad of ['https://user:token@github.com/o/r', 'ext::sh -c touch% /tmp/x', 'file:///c/repo', 'https://gitlab.com/o/r', '--upload-pack=x/r', 'o/..', 'https://github.com/o/r/tree/main']) expect(parseGithubRepository(bad)).toBeNull()
  })

  it('cria pasta nova e recusa destino ocupado ou nome com barras', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'politron-new-project-'))
    temporaryDirectories.push(parent)
    expect(await createProjectFolder(parent, 'landing')).toBe(join(await realpath(parent), 'landing'))
    await expect(createProjectFolder(parent, 'landing')).rejects.toThrow('Já existe uma pasta')
    await expect(createProjectFolder(parent, '../fora')).rejects.toThrow('nome de pasta simples')
  })

  it('valida repositório e destino antes de chamar o Git', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'politron-clone-'))
    temporaryDirectories.push(parent)
    await mkdir(join(parent, 'hello-world'))
    await writeFile(join(parent, 'hello-world', 'meu-trabalho.txt'), 'não apagar\n')
    await expect(cloneGithubRepository({ repository: 'https://example.com/x/y', parent })).rejects.toThrow('URL do GitHub')
    await expect(cloneGithubRepository({ repository: 'octocat/hello-world', parent })).rejects.toThrow('Já existe uma pasta')
    expect(await readFile(join(parent, 'hello-world', 'meu-trabalho.txt'), 'utf8')).toBe('não apagar\n')
    const aborted = new AbortController(); aborted.abort()
    await expect(cloneGithubRepository({ repository: 'octocat/hello-world', parent, name: 'cancelado' }, aborted.signal)).rejects.toThrow('cancelada')
    await expect(readFile(join(parent, 'cancelado'))).rejects.toThrow()
  })

  it('clona de verdade quando POLITRON_RUN_GITHUB_CLONE=1 e apaga só a pasta reservada em falha', async () => {
    if (process.env.POLITRON_RUN_GITHUB_CLONE !== '1') return
    const parent = await mkdtemp(join(tmpdir(), 'politron-clone-real-'))
    temporaryDirectories.push(parent)
    await expect(cloneGithubRepository({ repository: 'octocat/este-repositorio-nao-existe-politron', parent })).rejects.toThrow('Não foi possível acessar')
    await expect(readFile(join(parent, 'este-repositorio-nao-existe-politron'))).rejects.toThrow()
  }, 60000)
})
