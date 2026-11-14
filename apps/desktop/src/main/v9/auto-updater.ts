import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { ReleaseChannel, UpdateSnapshot } from '../../shared/updates'
import { defaultUpdateChannel, describeUpdateError, parseGithubReleases, parseUpdateFeeds, updateFeedOptions, type GithubReleases, type UpdateFeeds } from './update-config'

const INTERVAL_MS = 30 * 60 * 1000
const SETTINGS_NAME = 'update-preferences.json'
const FEED_NAME = 'update-feed.json'
let initialized = false
let feeds: UpdateFeeds = {}
let github: GithubReleases | null = null
let downloadedVersion: string | null = null
let checkInFlight: Promise<UpdateSnapshot> | null = null
let releaseChannel: ReleaseChannel = 'stable'

const snapshot: UpdateSnapshot = {
  currentVersion: '', channel: 'stable', phase: 'development', latestVersion: null,
  releaseNotes: null, progressPercent: null, lastCheckedAt: null, error: null
}

function update(patch: Partial<UpdateSnapshot>): UpdateSnapshot {
  Object.assign(snapshot, patch)
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('updates:changed', { ...snapshot })
  }
  return { ...snapshot }
}
function readPreferences(): ReleaseChannel {
  try {
    const parsed = JSON.parse(readFileSync(join(app.getPath('userData'), SETTINGS_NAME), 'utf8')) as { channel?: unknown }
    return parsed.channel === 'beta' || parsed.channel === 'stable'
      ? parsed.channel : defaultUpdateChannel(app.getVersion())
  } catch { return defaultUpdateChannel(app.getVersion()) }
}
function savePreferences(channel: ReleaseChannel): void {
  writeFileSync(join(app.getPath('userData'), SETTINGS_NAME), JSON.stringify({ channel }), 'utf8')
}
function readFeedFile(): unknown {
  try { return JSON.parse(readFileSync(join(process.resourcesPath, FEED_NAME), 'utf8')) } catch { return null }
}
const currentOptions = () => updateFeedOptions(feeds, github, releaseChannel)
function configureFeed(): boolean {
  if (!app.isPackaged) { update({ phase: 'development' }); return false }
  const options = currentOptions()
  if (!options) {
    update({ phase: 'not-configured', latestVersion: null, progressPercent: null,
      error: null, releaseNotes: null })
    return false
  }
  autoUpdater.setFeedURL(options)
  autoUpdater.channel = releaseChannel === 'beta' ? 'beta' : 'latest'
  autoUpdater.allowPrerelease = releaseChannel === 'beta'
  autoUpdater.allowDowngrade = false
  return true
}
const notes = (value: unknown): string | null =>
  typeof value === 'string' ? value.slice(0, 10000) : null

async function check(): Promise<UpdateSnapshot> {
  if (checkInFlight) return checkInFlight
  if (!configureFeed()) return { ...snapshot }
  update({ phase: 'checking', error: null })
  checkInFlight = (async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      const version = result?.updateInfo?.version
      if (!result?.isUpdateAvailable && version !== downloadedVersion) {
        downloadedVersion = null
        update({ phase: 'up-to-date', latestVersion: null, progressPercent: null, releaseNotes: null })
      } else if (version) {
        update({ phase: version === downloadedVersion ? 'downloaded' : 'available',
          latestVersion: version, releaseNotes: notes(result.updateInfo.releaseNotes) })
      }
    } catch (error) {
      update({ phase: 'error', error: error instanceof Error ? describeUpdateError(error.message, currentOptions()) : 'Falha ao consultar atualizações.' })
    } finally {
      update({ lastCheckedAt: new Date().toISOString() })
      checkInFlight = null
    }
    return { ...snapshot }
  })()
  return checkInFlight
}
async function changeChannel(value: ReleaseChannel): Promise<UpdateSnapshot> {
  if (value !== 'stable' && value !== 'beta') throw new Error('Canal inválido.')
  if (value === releaseChannel) return { ...snapshot }
  if (checkInFlight) throw new Error('Aguarde a verificação atual terminar.')
  savePreferences(value)
  releaseChannel = value
  downloadedVersion = null
  update({ channel: value, phase: 'idle', latestVersion: null, progressPercent: null,
    releaseNotes: null, error: null, lastCheckedAt: null })
  configureFeed()
  return { ...snapshot }
}

async function install(): Promise<{ installing: boolean; message: string }> {
  if (!app.isPackaged || !currentOptions())
    throw new Error('Atualizações só são instaladas por versões empacotadas com feed público configurado.')
  const version = downloadedVersion
  if (!version || snapshot.phase !== 'downloaded')
    throw new Error('Ainda não há atualização baixada e pronta para instalar.')
  if (checkInFlight) throw new Error('Aguarde a verificação atual terminar.')
  // Revalidate the manifest before installing to avoid applying a superseded
  // cached download. A replacement release will be downloaded separately.
  const result = await check()
  if (result.phase !== 'downloaded' || downloadedVersion !== version || result.latestVersion !== version)
    throw new Error('A versão disponível mudou. Confira a nova atualização antes de instalar.')
  update({ phase: 'downloaded' })
  autoUpdater.quitAndInstall(false, true)
  return { installing: true, message: 'Instalando a atualização e reiniciando o Boobot.' }
}

/** Runs only for the packaged desktop app; the renderer cannot choose a URL or access tokens. */
export function initAutoUpdater(): void {
  if (initialized) return
  initialized = true
  snapshot.currentVersion = app.getVersion()
  releaseChannel = readPreferences()
  snapshot.channel = releaseChannel
  const feedFile = readFeedFile()
  feeds = parseUpdateFeeds(feedFile)
  github = parseGithubReleases(feedFile)

  ipcMain.handle('updates:status', () => ({ ...snapshot }))
  ipcMain.handle('updates:check', () => check())
  ipcMain.handle('updates:setChannel', (_event, channel: ReleaseChannel) => changeChannel(channel))
  ipcMain.handle('updates:install', () => install())

  if (!app.isPackaged) { update({ phase: 'development' }); return }
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.autoRunAppAfterInstall = true
  autoUpdater.on('update-available', info => {
    const sameDownload = downloadedVersion === info.version
    if (!sameDownload) downloadedVersion = null
    update({ phase: sameDownload ? 'downloaded' : 'available', latestVersion: info.version,
      releaseNotes: notes(info.releaseNotes), error: null,
      progressPercent: sameDownload ? 100 : 0 })
  })
  autoUpdater.on('download-progress', progress => {
    update({ phase: 'downloading', progressPercent: Math.min(100, Math.max(0, Math.round(progress.percent))) })
  })
  autoUpdater.on('update-downloaded', info => {
    // An old download must not override a newer manifest's target version.
    if (snapshot.latestVersion && info.version !== snapshot.latestVersion) return
    downloadedVersion = info.version
    update({ phase: 'downloaded', latestVersion: info.version, progressPercent: 100, error: null })
  })
  autoUpdater.on('error', error => {
    console.error('[Boobot updater]', error)
    update({ phase: 'error', error: describeUpdateError(error.message, currentOptions()) })
  })
  configureFeed()

  const first = setTimeout(() => { void check() }, 15_000)
  first.unref?.()
  const interval = setInterval(() => { void check() }, INTERVAL_MS)
  interval.unref?.()
  app.once('before-quit', () => { clearTimeout(first); clearInterval(interval) })
}
