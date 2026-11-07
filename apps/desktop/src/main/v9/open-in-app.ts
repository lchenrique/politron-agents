import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'
import { shell } from 'electron'
import { resolveProjectPath } from './project-files'

export type OpenTarget = 'explorer' | 'vscode'
export const VSCODE_MISSING = 'VS Code não encontrado. Instale-o e ative o comando "code" no PATH (Paleta de comandos → "Shell Command: Install \'code\' command in PATH").'

/** No Windows `code` é um .cmd; abrimos o Code.exe ao lado dele para não passar o caminho pelo cmd.exe. */
async function vscodeExecutable(): Promise<string> {
  if (process.platform !== 'win32') return 'code'
  const found = await promisify(execFile)('where.exe', ['code'], { windowsHide: true }).then(result => result.stdout, () => '')
  for (const line of found.split(/\r?\n/).map(item => item.trim()).filter(Boolean)) {
    if (/\.exe$/i.test(line)) return line
    const exe = resolve(dirname(line), '..', 'Code.exe')
    if (existsSync(exe)) return exe
  }
  throw new Error(VSCODE_MISSING)
}

/** Ação explícita do usuário, só neste computador: o caminho é validado dentro do projeto antes de sair do app. */
export async function openProjectPath(root: string, requestedPath: string, target: OpenTarget): Promise<void> {
  if (!root) throw new Error('Este projeto não tem pasta.')
  if (target !== 'explorer' && target !== 'vscode') throw new Error('Destino inválido.')
  const { path, directory } = await resolveProjectPath(root, requestedPath)
  if (target === 'explorer') {
    if (!directory) { shell.showItemInFolder(path); return }
    const error = await shell.openPath(path)
    if (error) throw new Error(error)
    return
  }
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(await vscodeExecutable(), [path], { detached: true, stdio: 'ignore', shell: false, windowsHide: false, env })
  await new Promise<void>((done, fail) => {
    child.once('spawn', done)
    child.once('error', error => fail((error as NodeJS.ErrnoException).code === 'ENOENT' ? new Error(VSCODE_MISSING) : error))
  })
  child.unref()
}
