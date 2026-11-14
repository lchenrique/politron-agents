import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import type { Workspace } from '../../shared/v9'
import { runGit } from './git-processes'
import type { GitWorkspaceService } from './git-workspaces'
import type { WorkspaceStore } from './store'

const execFileAsync = promisify(execFile)
/** Prefixo das branches de tarefa; worktrees de outros fluxos (board/...) não são tocados aqui. */
export const TASK_BRANCH_PREFIX = 'boo/'
const NO_PROMPT = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }

export const taskBranchName = (label: string) => {
  const slug = label.toLocaleLowerCase('en-US').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24).replace(/-+$/, '') || 'tarefa'
  return `${TASK_BRANCH_PREFIX}${slug}-${randomUUID().slice(0, 8)}`
}
/** Padrão ligado: só um "false" explícito desliga o isolamento. */
export const isolationEnabled = (workspace: Pick<Workspace, 'isolateTasks' | 'kind'>) => workspace.kind !== 'free' && workspace.isolateTasks !== false

/** Commita tudo o que estiver pendente no worktree. Devolve o hash curto ou null se não havia nada. */
export async function commitAll(path: string, message: string): Promise<string | null> {
  await runGit(path, ['add', '-A'])
  if (!await runGit(path, ['status', '--porcelain=v1'])) return null
  // Sem identidade Git configurada, o commit falharia; usa uma identidade local só para este commit.
  const identity = await runGit(path, ['config', 'user.email']).catch(() => '') ? [] : ['-c', 'user.name=Boobot', '-c', 'user.email=boobot@localhost']
  await runGit(path, [...identity, 'commit', '--no-verify', '-m', message])
  return runGit(path, ['rev-parse', '--short', 'HEAD'])
}

async function ghAvailable(): Promise<boolean> {
  try { await execFileAsync('gh', ['--version'], { windowsHide: true, timeout: 15_000 }); return true } catch { return false }
}
async function remoteOf(path: string): Promise<string | null> {
  const remotes = (await runGit(path, ['remote']).catch(() => '')).split(/\r?\n/).filter(Boolean)
  return remotes.includes('origin') ? 'origin' : remotes[0] ?? null
}
async function isAncestor(path: string, branch: string, base: string): Promise<boolean> {
  return runGit(path, ['merge-base', '--is-ancestor', branch, base]).then(() => true, () => false)
}

export interface TaskWorktreeHost {
  store: WorkspaceStore
  gitWorkspaces: GitWorkspaceService
  createWorktree(input: { sourceWorkspaceId: string; branch: string }): Promise<Workspace>
  emitChanged(): void
}

/** Cada tarefa que escreve roda num worktree `boo/<slug>-<id>`, termina em commit e pode virar PR; depois é limpo. */
export class TaskWorktrees {
  constructor(private readonly host: TaskWorktreeHost) {}

  /** Worktree próprio para a tarefa, ou undefined (opção desligada, sem git ou falha): aí segue na pasta de origem. */
  async isolate(sourceWorkspaceId: string, label: string, writes: boolean): Promise<Workspace | undefined> {
    const source = this.host.store.workspace(sourceWorkspaceId)
    if (!writes || !isolationEnabled(source) || source.permissions?.filesWrite === 'deny') return undefined
    try { await this.host.gitWorkspaces.inspect(source.path) } catch { return undefined }
    try { return await this.host.createWorktree({ sourceWorkspaceId: source.id, branch: taskBranchName(label) }) } catch { return undefined }
  }

  private task(workspaceId: string): Workspace & { branch: string } {
    const workspace = this.host.store.workspace(workspaceId)
    if (workspace.kind !== 'worktree' || !workspace.branch?.startsWith(TASK_BRANCH_PREFIX)) throw new Error('Este projeto não é um worktree de tarefa (branch boo/...).')
    if (workspace.archived) throw new Error('Este worktree de tarefa já foi limpo ou arquivado.')
    return workspace as Workspace & { branch: string }
  }
  private base(workspace: Workspace) { return workspace.baseBranch && workspace.baseBranch !== 'HEAD' ? workspace.baseBranch : null }
  private sourcePath(workspace: Workspace) { return workspace.parentWorkspaceId ? this.host.store.workspace(workspace.parentWorkspaceId).path : workspace.path }

  /** Ao fim com sucesso: commit do que ficou pendente. Devolve uma linha para o resultado da tarefa. */
  async finish(workspaceId: string, summary: string): Promise<string> {
    let workspace: Workspace & { branch: string }
    try { workspace = this.task(workspaceId) } catch { return '' }
    try {
      const hash = await commitAll(workspace.path, summary.replace(/\s+/g, ' ').trim().slice(0, 72) || 'Tarefa concluída pelo Boobot')
      const base = this.base(workspace)
      const ahead = base ? Number(await runGit(workspace.path, ['rev-list', '--count', `${base}..HEAD`]).catch(() => '0')) : 1
      const committed = hash ? ` Commit ${hash} criado com as alterações pendentes.` : ''
      return ahead ? `Branch ${workspace.branch}${base ? `: ${ahead} commit(s) sobre ${base}` : ''}.${committed} Para abrir PR, o Chief usa task_branch_pr com project_id ${workspace.id}.` : `Branch ${workspace.branch} sem alterações.`
    } catch (error) {
      return `Não foi possível commitar na branch ${workspace.branch}: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  /** Por que o PR não pode ser aberto agora (sem remote ou sem gh), ou null se pode. */
  async pullRequestBlocker(workspaceId: string): Promise<string | null> {
    const workspace = this.task(workspaceId)
    if (!await remoteOf(workspace.path)) return 'O repositório não tem remote; a branch fica local.'
    if (!await ghAvailable()) return 'GitHub CLI (gh) não encontrado; instale e autentique o gh.'
    return null
  }

  /** Abre PR com gh. Sem gh ou sem remote, deixa a branch local e explica. */
  async openPullRequest(workspaceId: string): Promise<string> {
    const workspace = this.task(workspaceId)
    await commitAll(workspace.path, `Alterações da tarefa ${workspace.branch}`)
    const base = this.base(workspace)
    if (base && await isAncestor(workspace.path, 'HEAD', base)) return `A branch ${workspace.branch} não tem commits além de ${base}; nada para abrir PR.`
    const remote = await remoteOf(workspace.path)
    if (!remote) return `O repositório não tem remote. A branch ${workspace.branch} ficou local em ${workspace.path}.`
    if (!await ghAvailable()) return `GitHub CLI (gh) não encontrado. A branch ${workspace.branch} ficou local em ${workspace.path}; instale e autentique o gh para abrir o PR.`
    try {
      await execFileAsync('git', ['-C', workspace.path, 'push', '-u', remote, workspace.branch], { windowsHide: true, timeout: 5 * 60_000, env: NO_PROMPT })
      const { stdout } = await execFileAsync('gh', ['pr', 'create', '--fill', '--head', workspace.branch, ...(base ? ['--base', base] : [])], { cwd: workspace.path, windowsHide: true, timeout: 2 * 60_000, env: NO_PROMPT })
      return `PR aberto: ${stdout.trim().split(/\r?\n/).pop()}`
    } catch (error) {
      const detail = String((error as { stderr?: string }).stderr || (error as Error).message || '').trim().split(/\r?\n/).slice(-2).join(' ')
      return `Não foi possível abrir o PR da branch ${workspace.branch}: ${detail.slice(0, 400)}`
    }
  }

  /** Remove worktree e branch. Sem discard, exige merge (local ou PR merged no GitHub); discard apaga o trabalho. */
  async cleanup(workspaceId: string, discard = false): Promise<string> {
    const workspace = this.task(workspaceId)
    const source = this.sourcePath(workspace)
    if (!discard) {
      const status = await this.host.gitWorkspaces.inspect(workspace.path)
      if (status.changes) throw new Error('O worktree tem alterações não commitadas. Commite, abra o PR ou descarte.')
      const base = this.base(workspace)
      const merged = (base && await isAncestor(source, workspace.branch, base))
        || (await ghAvailable() && await execFileAsync('gh', ['pr', 'view', workspace.branch, '--json', 'state', '-q', '.state'], { cwd: source, windowsHide: true, timeout: 60_000, env: NO_PROMPT }).then(({ stdout }) => stdout.trim() === 'MERGED', () => false))
      if (!merged) throw new Error(`A branch ${workspace.branch} ainda não foi integrada${base ? ` em ${base}` : ''}. Faça o merge ou use discard para descartar.`)
    }
    await this.host.gitWorkspaces.removeWorktree(workspace.path, discard)
    await runGit(source, ['branch', '-D', workspace.branch]).catch(() => undefined)
    this.host.store.updateWorkspace({ ...workspace, archived: true })
    this.host.emitChanged()
    return discard ? `Worktree e branch ${workspace.branch} descartados.` : `Branch ${workspace.branch} integrada; worktree removido.`
  }
}
