import { existsSync } from 'fs'
import { execFile } from 'child_process'
import { dirname, join } from 'path'

function resolveWorkspaceRoot(startDirectory: string): string {
  const markers = ['.git', 'AGENTS.md', 'AGENTS.MD', 'AGENT.md', 'AGENT.MD']
  let current = startDirectory

  while (true) {
    if (markers.some((marker) => existsSync(join(current, marker)))) {
      return current
    }

    const parent = dirname(current)
    if (parent === current) {
      return startDirectory
    }

    current = parent
  }
}

export function syncAgencyAgentsToProject(workspaceRoot: string): Promise<void> {
  const resolvedWorkspaceRoot = resolveWorkspaceRoot(workspaceRoot)
  const scriptPath = join(resolvedWorkspaceRoot, 'scripts', 'convert-agency-opencode.mjs')

  if (!existsSync(scriptPath)) {
    console.warn(`[AgencyAgentSync] Script not found: ${scriptPath}`)
    return Promise.resolve()
  }

  return new Promise((resolvePromise) => {
    execFile(
      process.execPath,
      [scriptPath, '--workspace-root', resolvedWorkspaceRoot],
      {
        cwd: resolvedWorkspaceRoot,
        encoding: 'utf8',
        stdio: 'pipe'
      },
      (error, stdout, stderr) => {
        if (error) {
          console.error('[AgencyAgentSync] Failed to sync agency agents:', error)
          if (stderr?.trim()) {
            console.error(stderr.trim())
          }
          resolvePromise()
          return
        }

        if (stdout?.trim()) {
          console.log(stdout.trim())
        }

        if (stderr?.trim()) {
          console.warn(stderr.trim())
        }

        resolvePromise()
      }
    )
  })
}
