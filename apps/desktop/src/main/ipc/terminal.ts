import { ipcMain, BrowserWindow } from 'electron'
import * as pty from 'node-pty'
import os from 'os'

let ptyProcess: pty.IPty | null = null
let terminalWorkspaceId: string | null = null

export function registerTerminalHandlers(resolveWorkspacePath: (workspaceId: string) => string, isRemote = () => false): void {
  ipcMain.handle('vibe:terminal:create', (event, { rows, cols, workspaceId }) => {
    if (isRemote()) throw new Error('O terminal interativo remoto ainda não está disponível. Peça ao agente para executar os comandos no chat do host.')
    if (typeof workspaceId !== 'string' || !workspaceId) throw new Error('Selecione um workspace para abrir o terminal.')
    const cwd = resolveWorkspacePath(workspaceId)
    if (ptyProcess && terminalWorkspaceId === workspaceId) {
      ptyProcess.resize(cols || 80, rows || 24)
      return true
    }
    if (ptyProcess) ptyProcess.kill()

    const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash'
    
    ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: cols || 80,
      rows: rows || 24,
      cwd,
      env: process.env as { [key: string]: string }
    })

    terminalWorkspaceId = workspaceId
    const processForSession = ptyProcess
    const window = BrowserWindow.fromWebContents(event.sender)

    ptyProcess.onData((data) => {
      window?.webContents.send('vibe:terminal:data', data)
    })

    ptyProcess.onExit(({ exitCode, signal }) => {
      window?.webContents.send('vibe:terminal:exit', { exitCode, signal })
      if (ptyProcess === processForSession) { ptyProcess = null; terminalWorkspaceId = null }
    })

    return true
  })

  ipcMain.handle('vibe:terminal:close', () => {
    if (isRemote()) return false
    const running = ptyProcess
    ptyProcess = null
    terminalWorkspaceId = null
    running?.kill()
    return true
  })

  ipcMain.on('vibe:terminal:write', (_, data) => {
    if (isRemote()) return
    ptyProcess?.write(data)
  })

  ipcMain.on('vibe:terminal:resize', (_, { cols, rows }) => {
    if (isRemote()) return
    if (ptyProcess) {
      ptyProcess.resize(cols, rows)
    }
  })
}
