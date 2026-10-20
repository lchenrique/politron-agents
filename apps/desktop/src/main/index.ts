import 'dotenv/config'
import { app, BrowserWindow, shell, Tray, Menu, nativeImage, screen } from 'electron'
import { join, resolve, sep } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerTerminalHandlers } from './ipc/terminal'
import { registerWindowControlHandlers } from './ipc/window-controls'
import { createAppWindow, destroyAppWindow } from './windows/manager'
import { AppService } from './v9/workspace'
import { registerV9Ipc } from './v9/ipc'
import { RealtimeService, registerRealtimeIpc } from './v9/realtime/service'
import { detectProviders, registerProviderDetectionIpc } from './v9/providers/detect'
import { ProviderRegistry } from './v9/providers/registry'
import { AntigravityRuntime } from './v9/antigravity'
import { SkillsService, registerSkillsIpc } from './v9/skills/service'
import { HostManager } from './hosts/manager'
import { HostStore } from './hosts/secure-store'

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
let mascotWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let appService: AppService | null = null
let realtimeService: RealtimeService | null = null
let hosts: HostManager | null = null

// Marca nova, mantendo os dados do Politron já instalado. Em uma instalação nova,
// o diretório de dados é boobot-desktop. Não renomear o banco nem copiar cegamente.
const previousUserData = join(app.getPath('appData'), 'politron-desktop')
const currentUserData = join(app.getPath('appData'), 'boobot-desktop')
app.setName('Boobot')
// Somente a suíte Electron pode usar um perfil isolado dentro do TEMP.
// O uso normal preserva os dados existentes de Politron/Boobot.
const isolatedTestData = process.env.BOOBOT_E2E_USER_DATA_DIR?.trim()
if (isolatedTestData) {
  const testPath = resolve(isolatedTestData)
  if (!testPath.toLowerCase().startsWith((resolve(tmpdir()) + sep).toLowerCase())) throw new Error('Perfil E2E fora da pasta temporária.')
  mkdirSync(testPath, { recursive: true })
  app.setPath('userData', testPath)
} else {
  app.setPath('userData', existsSync(previousUserData) ? previousUserData : currentUserData)
}

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

  window.on('close', event => {
    if (isQuitting) return
    event.preventDefault()
    window.hide()
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

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createAppWindow(createWindow)
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function showMascotWindow() {
  if (mascotWindow && !mascotWindow.isDestroyed()) { mascotWindow.show(); mascotWindow.focus(); return }
  const area = screen.getPrimaryDisplay().workArea
  mascotWindow = new BrowserWindow({
    x: area.x + area.width - 252,
    y: area.y + area.height - 278,
    width: 240,
    height: 260,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, contextIsolation: true, nodeIntegration: false },
  })
  mascotWindow.on('closed', () => { mascotWindow = null })
  mascotWindow.webContents.setWindowOpenHandler(details => { shell.openExternal(details.url); return { action: 'deny' } })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) void mascotWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/mascot`)
  else void mascotWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/mascot' })
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(join(__dirname, '../renderer/favicon.ico')))
  tray.setToolTip('Boobot')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir Boobot', click: showMainWindow },
    { label: 'Mostrar mascote flutuante', click: showMascotWindow },
    { type: 'separator' },
    { label: 'Sair do Boobot', click: () => app.quit() },
  ]))
  tray.on('click', showMainWindow)
}

app.whenReady().then(async () => {
  console.log('[Main] app.whenReady() resolved')
  electronApp.setAppUserModelId('com.boobot.desktop')

  appService = new AppService(app.getPath('userData'))
  hosts = new HostManager(new HostStore(app.getPath('userData')), () => realtimeService?.stop())
  registerV9Ipc(appService, hosts)
  realtimeService = new RealtimeService(app.getPath('userData'), appService)
  registerRealtimeIpc(realtimeService, () => !!hosts?.remote)
  const antigravityRuntime = new AntigravityRuntime()
  const providerOptions = { runtimeModels: {
    antigravity: async (binaryPath?: string) => ({ models: await antigravityRuntime.models(binaryPath), source: 'runtime' as const }),
    pi: async (binaryPath?: string) => ({ models: await appService!.piRuntime.models(binaryPath), source: 'runtime' as const }),
    codex: async () => ({ models: await appService!.runtime.models(), source: 'runtime' as const }),
    claude: async (binaryPath?: string) => {
      return { models: await appService!.claudeRuntime.models(binaryPath), source: 'runtime' as const }
    },
  } }
  const providerRegistry = new ProviderRegistry(app.getPath('userData'), () => detectProviders(undefined, providerOptions))
  registerProviderDetectionIpc(providerOptions, providerRegistry, hosts)
  appService.on('provider-auth-changed', () => { void providerRegistry.refresh().catch(error => console.error('[Providers] Falha após credencial', error)) })
  appService.setCachedModelResolver(async runtime => {
    const inventory = await providerRegistry.list()
    const provider = inventory.providers.find(item => item.id === runtime)
    if (!provider?.executable) throw new Error('Este provedor ainda não está pronto para executar no Boobot. Atualize a detecção em Configurações.')
    return (provider.models || []).map(model => ({ ...model, runtime, isDefault: model.isDefault === true }))
  })
  // Primeira instalação: descobre uma vez; demais acessos utilizam cache em disco.
  void providerRegistry.list().catch(error => console.error('[Providers] Falha ao carregar catálogo', error))
  registerSkillsIpc(new SkillsService(app.getPath('userData')), hosts)
  await hosts.initialize()
  hosts.registerIpc()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerTerminalHandlers(workspaceId => appService!.workspacePath(workspaceId), () => !!hosts?.remote)
  registerWindowControlHandlers({ showMain: showMainWindow, showMascot: showMascotWindow, closeMascot: () => mascotWindow?.close() })
  console.log('[Main] IPC handlers registered')

  mainWindow = createAppWindow(createWindow)
  createTray()
  console.log('[Main] Main window reference stored')

  app.on('activate', () => {
    showMainWindow()
  })
})

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  destroyAppWindow()
})

app.on('before-quit', () => {
  isQuitting = true
  tray?.destroy(); tray = null
  if (mascotWindow && !mascotWindow.isDestroyed()) mascotWindow.close()
  mascotWindow = null
  destroyAppWindow()
  realtimeService?.stop()
  void hosts?.close()
  appService?.dispose()
  appService = null
})
