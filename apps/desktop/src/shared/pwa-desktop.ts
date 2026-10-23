/** Desktop-only controls: never included in the browser bundle. */
export type PwaDesktopStatus = {
  running: boolean
  port: number
  sessions: number
  codeExpires: number | null
}
export interface PwaDesktopAPI {
  status(): Promise<PwaDesktopStatus>
  issueCode(): Promise<{ code: string; expires: number; url: string }>
  revokeAll(): Promise<PwaDesktopStatus>
}
