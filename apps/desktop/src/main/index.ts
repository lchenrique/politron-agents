import 'dotenv/config'
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerTerminalHandlers } from './ipc/terminal'
import { registerWindowControlHandlers } from './ipc/window-controls'
import { createAppWindow, destroyAppWindow } from './windows/manager'
import { WorkspaceService } from './v9/workspace'
import { registerV9Ipc } from './v9/ipc'

process.on('uncaughtException', (error) => {
  console.error('[Main] uncaughtException', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('[Main] unhandledRejection', reason)
})

if (process.platform === 'win32') {
  const existingPathext = process.env.PATHEXT || ''
  if (!existingPathext.includes('.CMD')) {
    process.env.PATHEXT = `.COM;.EXE;.BAT;.CMD;${existingPathext}`
  }
}

// Global reference to main window
let mainWindow: BrowserWindow | null = null
let v9Workspace: WorkspaceService | null = null

// Disable GPU acceleration for Windows sandbox compatibility
app.disableHardwareAcceleration()

console.log('[Main] Module bootstrap complete', {
  isReady: app.isReady(),
  platform: process.platform,
  pid: process.pid
})

app.on('will-finish-launching', () => {
  console.log('[Main] App will-finish-launching')
})

app.on('ready', () => {
  console.log('[Main] App ready event fired')
})

app.on('quit', (_, exitCode) => {
  console.log('[Main] App quit', { exitCode })
})

app.on('before-quit', () => {
  console.log('[Main] App before-quit')
})

// Single instance lock
const shouldUseSingleInstanceLock = !is.dev
const gotTheLock = shouldUseSingleInstanceLock ? app.requestSingleInstanceLock() : true

if (shouldUseSingleInstanceLock && !gotTheLock) {
  console.log('[Main] Another instance is already running; quitting this one')
  app.quit()
} else {
  if (!shouldUseSingleInstanceLock) {
    console.log('[Main] Single instance lock disabled in development mode')
  }

  app.on('second-instance', () => {
    console.log('[Main] Received second-instance event')
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    backgroundColor: '#00000000',
    transparent: process.platform !== 'win32',
    ...(process.platform === 'win32' ? { backgroundMaterial: 'acrylic' } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  console.log('[Main] BrowserWindow created')

  window.on('ready-to-show', () => {
    console.log('[Main] Window ready-to-show')
    window.show()
  })

  window.webContents.on('did-finish-load', () => {
    console.log('[Main] Renderer did-finish-load')
    if (!window.isVisible()) {
      console.log('[Main] Showing window after did-finish-load fallback')
      window.show()
    }
  })

  window.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
    console.error('[Main] Renderer did-fail-load', {
      errorCode,
      errorDescription,
      validatedURL
    })
  })

  window.on('show', () => {
    console.log('[Main] Window shown')
  })

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Load the app
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    console.log('[Main] Loading renderer URL', process.env['ELECTRON_RENDERER_URL'])
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    const rendererPath = join(__dirname, '../renderer/index.html')
    console.log('[Main] Loading renderer file', rendererPath)
    window.loadFile(rendererPath)
  }

  setTimeout(() => {
    if (!window.isDestroyed() && !window.isVisible()) {
      console.log('[Main] Showing window after timeout fallback')
      window.show()
    }
  }, 1500)

  return window
}

app.whenReady().then(async () => {
  console.log('[Main] app.whenReady() resolved')
  electronApp.setAppUserModelId('com.politron.desktop')

  v9Workspace = new WorkspaceService(app.getPath('userData'))
  registerV9Ipc(v9Workspace)

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerTerminalHandlers()
  registerWindowControlHandlers()
  console.log('[Main] IPC handlers registered')

  mainWindow = createAppWindow(createWindow)
  console.log('[Main] Main window reference stored')

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createAppWindow(createWindow)
    }
  })
})

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  destroyAppWindow()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  destroyAppWindow()
  v9Workspace?.dispose()
  v9Workspace = null
})
