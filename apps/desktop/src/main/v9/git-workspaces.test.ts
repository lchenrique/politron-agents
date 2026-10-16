import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { GitWorkspaceService } from './git-workspaces'

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
      catch (error: any) { if (error?.code !== 'EBUSY' || attempt === 3) throw error; await new Promise(resolve => setTimeout(resolve, 250)) }
    }
  }))
})

describe('GitWorkspaceService', () => {
  it('creates a branch worktree, reports status, refuses dirty removal, then removes it cleanly', async () => {
    const { sourcePath, worktreeRoot } = await makeRepository()
    const service = new GitWorkspaceService(worktreeRoot)
    const created = await service.createWorktree({ sourcePath, projectName: 'Instruções de Paz', branch: 'feature/fase-2' })

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

  it('rejects invalid branch names and unregistered removal paths', async () => {
    const { sourcePath, worktreeRoot, directory } = await makeRepository()
    const service = new GitWorkspaceService(worktreeRoot)
    await expect(service.createWorktree({ sourcePath, projectName: 'Project', branch: '../escape' })).rejects.toThrow('branch')
    await expect(service.removeWorktree(directory)).rejects.toThrow('fora da pasta permitida')
  }, 30000)
})
