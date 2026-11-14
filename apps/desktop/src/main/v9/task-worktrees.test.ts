// @vitest-environment node
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GitWorkspaceService } from './git-workspaces'
import { WorkspaceStore } from './store'
import { isolationEnabled, taskBranchName, TaskWorktrees } from './task-worktrees'

// Várias chamadas reais ao git por teste; no Windows, sob carga, 5 s é pouco.
vi.setConfig({ testTimeout: 60000 })
const execFileAsync = promisify(execFile)
const git = async (cwd: string, ...args: string[]) => (await execFileAsync('git', args, { cwd, windowsHide: true, encoding: 'utf8' })).stdout.trim()
const cleanup: { store: WorkspaceStore; directory: string }[] = []
afterEach(async () => {
  for (const { store, directory } of cleanup.splice(0)) { store.close(); await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) }
})

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'boobot-task-worktrees-'))
  const repo = join(directory, 'repo')
  await mkdir(repo)
  await git(repo, 'init', '-q', '-b', 'main')
  await git(repo, 'config', 'user.name', 'QA')
  await git(repo, 'config', 'user.email', 'qa@boobot.test')
  await writeFile(join(repo, 'README.md'), 'início\n')
  await git(repo, 'add', '.')
  await git(repo, 'commit', '-q', '-m', 'init')
  const store = new WorkspaceStore(join(directory, 'profile'))
  cleanup.push({ store, directory })
  const gitWorkspaces = new GitWorkspaceService(join(directory, 'worktrees'))
  const source = store.saveWorkspace({ name: 'Projeto', path: repo, branch: 'main' })
  let changed = 0
  const tasks = new TaskWorktrees({
    store, gitWorkspaces, emitChanged: () => { changed++ },
    createWorktree: async ({ sourceWorkspaceId, branch }) => {
      const origin = store.workspace(sourceWorkspaceId)
      const created = await gitWorkspaces.createWorktree({ sourcePath: origin.path, workspaceName: origin.name, workspaceId: origin.id, branch, baseBranch: origin.branch || undefined })
      return store.saveWorkspace({ name: branch, parentWorkspaceId: origin.id, kind: 'worktree', path: created.path, branch: created.branch, baseBranch: created.baseBranch })
    },
  })
  return { repo, store, source, tasks, changes: () => changed }
}

describe('worktrees de tarefa', () => {
  it('nome de branch boo/<slug>-<id curto> e opção ligada por padrão', () => {
    expect(taskBranchName('Lyra Ação!')).toMatch(/^boo\/lyra-acao-[0-9a-f]{8}$/)
    expect(isolationEnabled({ kind: 'local' })).toBe(true)
    expect(isolationEnabled({ kind: 'local', isolateTasks: false })).toBe(false)
    expect(isolationEnabled({ kind: 'free' })).toBe(false)
  })

  it('isola só quem escreve, só em git e só com a opção ligada', async () => {
    const { store, source, tasks } = await setup()
    expect(await tasks.isolate(source.id, 'Lyra', false)).toBeUndefined()
    store.saveWorkspace({ id: source.id, isolateTasks: false })
    expect(await tasks.isolate(source.id, 'Lyra', true)).toBeUndefined()
    store.saveWorkspace({ id: source.id, isolateTasks: true })
    const a = await tasks.isolate(source.id, 'Lyra', true)
    const b = await tasks.isolate(source.id, 'Lyra', true)
    expect(a?.branch).toMatch(/^boo\/lyra-/)
    expect(a?.path).not.toBe(b?.path)
    const plain = store.saveWorkspace({ name: 'Sem git', path: join(source.path, '..') })
    expect(await tasks.isolate(plain.id, 'Lyra', true)).toBeUndefined()
  })

  it('finish commita o pendente; sem remote o PR não é aberto e a branch fica local', async () => {
    const { repo, source, tasks } = await setup()
    const task = (await tasks.isolate(source.id, 'Lyra', true))!
    await writeFile(join(task.path, 'novo.txt'), 'trabalho\n')
    const note = await tasks.finish(task.id, 'Lyra: cria novo.txt')
    expect(note).toMatch(/1 commit\(s\) sobre main/)
    expect(note).toContain(task.id)
    expect(await git(task.path, 'status', '--porcelain')).toBe('')
    expect(await git(repo, 'log', '-1', '--format=%s', task.branch!)).toBe('Lyra: cria novo.txt')
    expect(await tasks.openPullRequest(task.id)).toMatch(/não tem remote/)
    expect(await tasks.finish(source.id, 'nada')).toBe('')
  })

  it('limpeza exige merge; depois do merge remove worktree, branch e arquiva', async () => {
    const { repo, store, source, tasks, changes } = await setup()
    const task = (await tasks.isolate(source.id, 'Dev', true))!
    await writeFile(join(task.path, 'a.txt'), 'a\n')
    await tasks.finish(task.id, 'Dev: a')
    await expect(tasks.cleanup(task.id)).rejects.toThrow(/ainda não foi integrada/)
    await git(repo, 'merge', '-q', '--ff-only', task.branch!)
    expect(await tasks.cleanup(task.id)).toMatch(/integrada/)
    expect(existsSync(task.path)).toBe(false)
    expect(await git(repo, 'branch', '--list', task.branch!)).toBe('')
    expect(store.workspace(task.id).archived).toBe(true)
    expect(changes()).toBeGreaterThan(0)
    await expect(tasks.cleanup(task.id)).rejects.toThrow(/já foi limpo/)
  })

  it('descarte apaga worktree com alterações e a branch', async () => {
    const { repo, source, tasks } = await setup()
    const task = (await tasks.isolate(source.id, 'Dev', true))!
    await writeFile(join(task.path, 'rascunho.txt'), 'x\n')
    expect(await tasks.cleanup(task.id, true)).toMatch(/descartados/)
    expect(existsSync(task.path)).toBe(false)
    expect(await git(repo, 'branch', '--list', task.branch!)).toBe('')
  })
})
