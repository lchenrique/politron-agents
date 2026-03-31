import { EventEmitter } from "events"
import { spawn } from "child_process"
import * as path from "path"

export interface GitWorktree {
  path: string
  branch: string
  agentId: string
  teamId: string
  createdAt: string
}

export interface CreateWorktreeInput {
  basePath: string // e.g., "/projects/meu-app"
  teamSlug: string // e.g., "auth"
  agentSlug: string // e.g., "frontend-dev"
  branchName: string // e.g., "team/auth/login-flow"
  agentId: string
  teamId: string
}

export interface WorktreeResult {
  success: boolean
  worktree?: GitWorktree
  error?: string
}

export class GitWorktreeService extends EventEmitter {
  private worktrees: Map<string, GitWorktree> = new Map() // key: worktreePath

  /**
   * Creates a git worktree for an agent
   * Path format: {basePath}/.vibeide/worktrees/{teamSlug}-{agentSlug}
   */
  async createWorktree(input: CreateWorktreeInput): Promise<WorktreeResult> {
    const { basePath, teamSlug, agentSlug, branchName, agentId, teamId } = input

    const worktreeDir = path.join(basePath, ".vibeide", "worktrees")
    const worktreePath = path.join(worktreeDir, `${teamSlug}-${agentSlug}`)

    try {
      // Ensure the worktrees directory exists
      await this.runGitCommand(["rev-parse"], basePath)

      // Create branch and worktree from current HEAD
      await this.runGitCommand(
        ["worktree", "add", "-b", branchName, worktreePath, "HEAD"],
        basePath
      )

      const worktree: GitWorktree = {
        path: worktreePath,
        branch: branchName,
        agentId,
        teamId,
        createdAt: new Date().toISOString(),
      }

      this.worktrees.set(worktreePath, worktree)
      this.emit("worktree:created", worktree)

      return { success: true, worktree }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.emit("worktree:error", { path: worktreePath, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Removes a git worktree
   */
  async removeWorktree(worktreePath: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Get the repo root from the worktree path
      const repoRoot = await this.findRepoRoot(worktreePath)
      if (!repoRoot) {
        return { success: false, error: "Could not find repository root" }
      }

      await this.runGitCommand(
        ["worktree", "remove", worktreePath, "--force"],
        repoRoot
      )

      this.worktrees.delete(worktreePath)
      this.emit("worktree:removed", { path: worktreePath })

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.emit("worktree:error", { path: worktreePath, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Lists all worktrees in a repository
   */
  async listWorktrees(basePath: string): Promise<GitWorktree[]> {
    try {
      const output = await this.runGitCommand(
        ["worktree", "list", "--porcelain"],
        basePath
      )

      const worktrees: GitWorktree[] = []
      const entries = output.split("\n\n").filter(Boolean)

      for (const entry of entries) {
        const lines = entry.split("\n")
        let worktreePath = ""
        let branch = ""

        for (const line of lines) {
          if (line.startsWith("worktree ")) {
            worktreePath = line.replace("worktree ", "").trim()
          } else if (line.startsWith("branch ")) {
            branch = line.replace("branch ", "").trim()
          }
        }

        if (worktreePath) {
          // Check if this is our managed worktree
          if (worktreePath.includes(".vibeide/worktrees/")) {
            const stored = this.worktrees.get(worktreePath)
            if (stored) {
              worktrees.push(stored)
            } else {
              // Reconstruct from path (for worktrees created outside this service)
              const pathParts = worktreePath.split("/")
              const worktreesIdx = pathParts.indexOf("worktrees")
              const nameParts = pathParts.slice(worktreesIdx + 1).join("-").split("-")
              const teamSlug = nameParts[0]
              const agentSlug = nameParts.slice(0, -1).join("-")

              worktrees.push({
                path: worktreePath,
                branch: branch || "",
                agentId: "",
                teamId: "",
                createdAt: "",
              })
            }
          }
        }
      }

      return worktrees
    } catch (error) {
      this.emit("worktree:error", { path: basePath, error: String(error) })
      return []
    }
  }

  /**
   * Creates a branch in a worktree
   */
  async createBranch(
    worktreePath: string,
    branchName: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await this.runGitCommand(
        ["checkout", "-b", branchName],
        worktreePath
      )

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.emit("worktree:error", { path: worktreePath, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Merges a branch into the worktree's current branch
   */
  async mergeBranch(
    worktreePath: string,
    branchName: string,
    targetBranch: string = "main"
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // First checkout target branch
      await this.runGitCommand(["checkout", targetBranch], worktreePath)

      // Then merge the source branch
      await this.runGitCommand(["merge", branchName], worktreePath)

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.emit("worktree:error", { path: worktreePath, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Gets worktree for a specific agent
   */
  getWorktreeForAgent(agentId: string): GitWorktree | undefined {
    return Array.from(this.worktrees.values()).find((w) => w.agentId === agentId)
  }

  /**
   * Gets all managed worktrees
   */
  getAllWorktrees(): GitWorktree[] {
    return Array.from(this.worktrees.values())
  }

  /**
   * Finds repository root from a given path
   */
  private async findRepoRoot(fromPath: string): Promise<string | null> {
    try {
      const output = await this.runGitCommand(["rev-parse", "--show-toplevel"], fromPath)
      return output.trim() || null
    } catch {
      return null
    }
  }

  /**
   * Helper to run git commands using spawn
   */
  private runGitCommand(args: string[], cwd?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn("git", args, {
        cwd,
        shell: true,
        windowsHide: true,
      })

      let stdout = ""
      let stderr = ""

      proc.stdout?.on("data", (data) => {
        stdout += data.toString()
      })

      proc.stderr?.on("data", (data) => {
        stderr += data.toString()
      })

      proc.on("close", (code) => {
        if (code === 0) {
          resolve(stdout.trim())
        } else {
          reject(new Error(stderr || `Git exited with code ${code}`))
        }
      })

      proc.on("error", (err) => {
        reject(err)
      })
    })
  }
}

export const gitWorktreeService = new GitWorktreeService()