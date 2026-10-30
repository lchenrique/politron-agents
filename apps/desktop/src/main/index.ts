import 'dotenv/config'
import { app, BrowserWindow, shell, Tray, Menu, nativeImage, screen, ipcMain, crashReporter, powerMonitor, dialog } from 'electron'
import { dirname, join, resolve, sep } from 'node:path'
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerTerminalHandlers } from './ipc/terminal'
import { registerWindowControlHandlers } from './ipc/window-controls'
import { PlatformBrowser, registerPlatformBrowserIpc } from './ipc/platform-browser'
import { safeWebUrl } from '../shared/platform-browser'
import { createAppWindow, destroyAppWindow } from './windows/manager'
import { AppService } from './v9/workspace'
import { registerV9Ipc } from './v9/ipc'
import { RealtimeService, registerRealtimeIpc } from './v9/realtime/service'
import { detectProviders, registerProviderDetectionIpc } from './v9/providers/detect'
import { ProviderRegistry } from './v9/providers/registry'
import { readOpenCodeModels } from './v9/opencode-models'
import { AntigravityRuntime } from './v9/antigravity'
import { SkillsService, registerSkillsIpc } from './v9/skills/service'
import { HostManager } from './hosts/manager'
import { HostStore } from './hosts/secure-store'
import { PwaGateway } from './pwa/gateway'
import { initAutoUpdater } from './v9/auto-updater'
import { retryTransient } from './startup'

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
let pwa: PwaGateway | null = null
let platformBrowser: PlatformBrowser | null = null

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

// Diagnóstico de fechamentos inesperados: no app instalado não há console, então eventos de saída e falha
// vão para userData/logs/main.log (JSON por linha, limitado) e falhas nativas viram dumps locais (sem envio).
const diagnosticLog = join(app.getPath('userData'), 'logs', 'main.log')
function diagnostic(event: string, data: Record<string, unknown> = {}): void {
  try {
    mkdirSync(dirname(diagnosticLog), { recursive: true })
    if (existsSync(diagnosticLog) && statSync(diagnosticLog).size > 5 * 1024 * 1024) renameSync(diagnosticLog, diagnosticLog + '.1')
    appendFileSync(diagnosticLog, JSON.stringify({ at: new Date().toISOString(), pid: process.pid, event, ...data }) + '\n')
  } catch { /* diagnóstico nunca derruba o app */ }
}
crashReporter.start({ uploadToServer: false })
diagnostic('start', { version: app.getVersion(), argv: process.argv.slice(1) })
process.on('uncaughtException', error => diagnostic('uncaughtException', { error: String(error?.stack || error) }))
process.on('unhandledRejection', reason => diagnostic('unhandledRejection', { reason: String((reason as Error)?.stack || reason) }))
app.on('render-process-gone', (_event, contents, details) => diagnostic('render-process-gone', { url: contents.getURL().slice(0, 200), ...details }))
app.on('child-process-gone', (_event, details) => diagnostic('child-process-gone', { ...details }))
app.on('before-quit', () => diagnostic('before-quit'))
app.on('quit', (_event, exitCode) => diagnostic('quit', { exitCode }))
process.on('exit', code => diagnostic('process-exit', { code, memoryMb: Math.round(process.memoryUsage().rss / 1048576) }))
// powerMonitor só pode ser usado depois do ready.
void app.whenReady().then(() => powerMonitor.on('shutdown', () => diagnostic('os-shutdown')))
// Uso de memória a cada 5 min: o Windows já registrou o Boobot como possível vazamento (RADAR_PRE_LEAK).
setInterval(() => diagnostic('memory', { rssMb: Math.round(process.memoryUsage().rss / 1048576), heapMb: Math.round(process.memoryUsage().heapUsed / 1048576) }), 5 * 60_000).unref()

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
    // A janela pode estar escondida na bandeja; abrir o app de novo precisa mostrá-la, não só focar.
    if (mainWindow) showMainWindow()
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
    // Avoid Windows native acrylic: it can render the window as an opaque blur
    // even when Chromium has rendered the full React interface.
    backgroundColor: process.platform === 'win32' ? '#101016' : '#00000000',
    transparent: process.platform !== 'win32',
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

  // Somente HTTP/HTTPS chega ao navegador do sistema; outros protocolos são descartados.
  window.webContents.setWindowOpenHandler((details) => {
    const url = safeWebUrl(details.url)
    if (url) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.on('closed', () => platformBrowser?.close())

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
  mascotWindow.webContents.setWindowOpenHandler(details => { const url = safeWebUrl(details.url); if (url) void shell.openExternal(url); return { action: 'deny' } })
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

  // Outro processo do Boobot fechando o mesmo banco pode causar "malformed" passageiro; tenta de novo antes de desistir.
  appService = await retryTransient(() => new AppService(app.getPath('userData')), { onRetry: (error, attempt) => diagnostic('startup-db-retry', { attempt, error: String(error) }) })
  appService.store.applyAutonomyDefaults()
  hosts = new HostManager(new HostStore(app.getPath('userData')), () => realtimeService?.stop())
  registerV9Ipc(appService, hosts)
  realtimeService = new RealtimeService(app.getPath('userData'), appService)
  registerRealtimeIpc(realtimeService, () => !!hosts?.remote)
  const antigravityRuntime = new AntigravityRuntime()
  const providerOptions = { modelTimeoutMs: 30_000, runtimeModels: {
    opencode: async (binaryPath?: string) => {
      try { return { models: await appService!.openCodeRuntime.models(binaryPath), source: 'runtime' as const } }
      catch { return readOpenCodeModels(binaryPath) }
    },
    antigravity: async (binaryPath?: string) => ({ models: await antigravityRuntime.models(binaryPath), source: 'runtime' as const }),
    pi: async (binaryPath?: string) => ({ models: await appService!.piRuntime.models(binaryPath), source: 'runtime' as const }),
    codex: async (binaryPath?: string) => ({ models: await appService!.runtime.models(binaryPath), source: 'runtime' as const }),
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
    // Missões e rotinas dependem do catálogo de modelos; retoma depois dele, com o chat aberto ou não.
    .finally(() => setTimeout(() => appService?.resumeAutonomy(), 3_000))
  registerSkillsIpc(new SkillsService(app.getPath('userData')), hosts)
  await hosts.initialize()
  hosts.registerIpc()

  // Browser gateway is loopback-only. Tailnet HTTPS must be enabled explicitly by the owner.
  pwa = new PwaGateway({
    assets: app.isPackaged ? join(process.resourcesPath, 'pwa') : join(process.cwd(), 'src', 'main', 'pwa', 'assets'),
    host: () => {
      const data = hosts!.snapshot()
      return { id: data.selectedId, name: data.hosts.find(item => item.id === data.selectedId)?.name || 'Boobot' }
    },
    dispatch: (method, args, grants) => hosts!.dispatchFromPwa(method, args, grants),
    attachments: appService.attachments,
    attachmentsEnabled: () => !hosts?.remote,
  })
  // Isolated Electron E2E profiles may choose an ephemeral port; production is fixed at loopback 6780.
  const pwaPort = process.env.BOOBOT_E2E_USER_DATA_DIR && process.env.BOOBOT_E2E_PWA_PORT === '0' ? 0 : 6780
  void pwa.listen(pwaPort).then(port => {
    console.log('[PWA] Gateway privado ativo em loopback na porta', port)
  }).catch(error => console.warn('[PWA] Gateway não pôde iniciar:', error instanceof Error ? error.message : 'erro'))

  const pwaWindow = (event: Electron.IpcMainInvokeEvent) => {
    if (BrowserWindow.fromWebContents(event.sender) !== mainWindow) throw new Error('Janela não autorizada.')
    if (!pwa) throw new Error('PWA indisponível.')
    return pwa
  }
  ipcMain.handle('pwa:status', event => pwaWindow(event).status())
  ipcMain.handle('pwa:issueCode', event => pwaWindow(event).issueCode())
  ipcMain.handle('pwa:revokeAll', event => { pwaWindow(event).revokeAll(); return pwaWindow(event).status() })
  ipcMain.handle('pwa:setDevicePermissions', (event, id: unknown, grants: unknown) => {
    if (typeof id !== 'string' || !grants || typeof grants !== 'object' ||
      typeof (grants as {chat?: unknown}).chat !== 'boolean' ||
      typeof (grants as {approvals?: unknown}).approvals !== 'boolean' ||
      typeof (grants as {filesRead?: unknown}).filesRead !== 'boolean' ||
      typeof (grants as {filesWrite?: unknown}).filesWrite !== 'boolean') throw new Error('Permissões inválidas.')
    return pwaWindow(event).setDevicePermissions(id, grants as { chat: boolean; approvals: boolean; filesRead: boolean; filesWrite: boolean })
  })
  ipcMain.handle('pwa:revokeDevice', (event, id: unknown) => {
    if (typeof id !== 'string') throw new Error('Dispositivo inválido.')
    return pwaWindow(event).revokeDevice(id)
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerTerminalHandlers(workspaceId => appService!.workspacePath(workspaceId), () => !!hosts?.remote)
  platformBrowser = new PlatformBrowser(() => mainWindow && !mainWindow.isDestroyed() ? mainWindow : null, undefined, undefined, owner => !hosts?.remote && !!appService?.canShareBrowser(owner))
  appService.setPlatformBrowser(platformBrowser)
  registerPlatformBrowserIpc(platformBrowser, event => !!mainWindow && event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame)
  registerWindowControlHandlers({ showMain: showMainWindow, showMascot: showMascotWindow, closeMascot: () => mascotWindow?.close() })
  initAutoUpdater()
  console.log('[Main] IPC handlers registered')

  mainWindow = createAppWindow(createWindow)
  createTray()
  console.log('[Main] Main window reference stored')

  app.on('activate', () => {
    showMainWindow()
  })
}).catch(error => {
  // Sem janela, o processo ficaria vivo segurando a instância única: avisa e encerra.
  diagnostic('startup-failed', { error: String((error as Error)?.stack || error) })
  dialog.showErrorBox('Boobot não conseguiu iniciar', `${error instanceof Error ? error.message : String(error)}\n\nDetalhes em: ${diagnosticLog}\n\nFeche outras janelas do Boobot e abra de novo.`)
  isQuitting = true
  app.quit()
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
  void pwa?.close()
  pwa = null
  platformBrowser?.close()
  appService?.dispose()
  appService = null
})
