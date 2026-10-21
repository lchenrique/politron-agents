import { autoUpdater } from 'electron-updater'
import { app } from 'electron'

/** Checa e baixa atualizações via GitHub Releases. Builds de dev (não empacotados) nunca checam. */
export function initAutoUpdater(): void {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = app.getVersion().includes('-')
  autoUpdater.on('error', error => console.error('[AutoUpdater] erro', error))
  autoUpdater.on('update-available', info => console.log('[AutoUpdater] atualização disponível', info.version))
  autoUpdater.on('update-not-available', () => console.log('[AutoUpdater] já está na versão mais recente'))
  autoUpdater.on('update-downloaded', info => console.log('[AutoUpdater] baixada, instala ao fechar o app', info.version))
  autoUpdater.checkForUpdates().catch(error => console.error('[AutoUpdater] falha ao checar atualização', error))
}
