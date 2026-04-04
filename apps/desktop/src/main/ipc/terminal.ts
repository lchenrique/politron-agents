import { ipcMain, BrowserWindow } from 'electron'
import * as pty from 'node-pty'
import os from 'os'

let ptyProcess: pty.IPty | null = null

export function registerTerminalHandlers(): void {
  ipcMain.handle('vibe:terminal:create', (event, { rows, cols, cwd }) => {
    if (ptyProcess) {
      ptyProcess.kill()
    }

    const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash'
    
    ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: cwd || os.homedir(),
      env: process.env as { [key: string]: string }
    })

    const window = BrowserWindow.fromWebContents(event.sender)

    ptyProcess.onData((data) => {
      window?.webContents.send('vibe:terminal:data', data)
    })

    ptyProcess.onExit(({ exitCode, signal }) => {
      window?.webContents.send('vibe:terminal:exit', { exitCode, signal })
      ptyProcess = null
    })

    return true
  })

  ipcMain.on('vibe:terminal:write', (_, data) => {
    ptyProcess?.write(data)
  })

  ipcMain.on('vibe:terminal:resize', (_, { cols, rows }) => {
    if (ptyProcess) {
      ptyProcess.resize(cols, rows)
    }
  })
}
