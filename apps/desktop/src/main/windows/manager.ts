import { BrowserWindow } from 'electron'

let window: BrowserWindow | null = null

export function createAppWindow(createFn: () => BrowserWindow): BrowserWindow {
  window = createFn()
  return window
}

export function destroyAppWindow(): void {
  window = null
}

export function getAppWindow(): BrowserWindow | null {
  return window
}
