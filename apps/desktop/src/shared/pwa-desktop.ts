/** Desktop-only controls: never included in the browser bundle. */
export type PwaDesktopStatus = {
  running: boolean
  port: number
  sessions: number
  codeExpires: number | null
  devices: { id: string; label: string; chat: boolean; approvals: boolean; filesRead: boolean; filesWrite: boolean; expires: number }[]
}
export interface PwaDesktopAPI {
  status(): Promise<PwaDesktopStatus>
  issueCode(): Promise<{ code: string; expires: number; url: string }>
  revokeAll(): Promise<PwaDesktopStatus>
  setDevicePermissions(id: string, grants: { chat: boolean; approvals: boolean; filesRead: boolean; filesWrite: boolean }): Promise<PwaDesktopStatus>
  revokeDevice(id: string): Promise<PwaDesktopStatus>
}
