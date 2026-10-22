export type ReleaseChannel = 'stable' | 'beta'
export type UpdatePhase = 'development' | 'not-configured' | 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error'
export interface UpdateSnapshot {
  currentVersion: string
  channel: ReleaseChannel
  phase: UpdatePhase
  latestVersion: string | null
  releaseNotes: string | null
  progressPercent: number | null
  lastCheckedAt: string | null
  error: string | null
}
export interface UpdatesAPI {
  status(): Promise<UpdateSnapshot>
  check(): Promise<UpdateSnapshot>
  setChannel(channel: ReleaseChannel): Promise<UpdateSnapshot>
  install(): Promise<{ installing: boolean; message: string }>
  onChanged(callback: (snapshot: UpdateSnapshot) => void): () => void
}
