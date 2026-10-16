import { ipcMain } from 'electron'
import { getAppWindow } from '../windows/manager'

export function registerWindowControlHandlers(): void {
  ipcMain.handle('vibe:window:minimize', () => {
    getAppWindow()?.minimize()
  })

  ipcMain.handle('vibe:window:maximize', () => {
    const win = getAppWindow()
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })

  ipcMain.handle('vibe:window:close', () => {
    getAppWindow()?.close()
  })

  ipcMain.handle('vibe:window:setZoom', (_, level: number) => {
    getAppWindow()?.webContents.setZoomLevel(level)
  })

  ipcMain.handle('vibe:window:getZoom', () => {
    return getAppWindow()?.webContents.getZoomLevel() ?? 0
  })
}
