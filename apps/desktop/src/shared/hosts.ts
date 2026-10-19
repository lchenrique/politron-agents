export type HostStatus = 'connected' | 'connecting' | 'disconnected' | 'error'
export interface HostEntry { id: string; name: string; endpoint: string; transport: 'local' | 'direct' | 'ssh' | 'relay'; status: HostStatus; error?: string }
export interface HostSettings { enabled: boolean; address: '127.0.0.1' | '0.0.0.0'; port: number; advertisedUrl: string; relayUrl: string }
export interface HostsSnapshot { selectedId: string; hosts: HostEntry[]; local: HostSettings & { running: boolean; error?: string } }
export interface RemoteDirectory { path: string; parent: string; directories: { name: string; path: string }[] }
export interface HostsAPI {
  snapshot(): Promise<HostsSnapshot>
  configure(input: HostSettings): Promise<HostsSnapshot>
  add(input: { name: string; pairing: string; endpoint?: string; ssh?: string }): Promise<HostEntry>
  select(id: string): Promise<void>
  remove(id: string): Promise<void>
  copyPairing(): Promise<void>
  revoke(): Promise<HostsSnapshot>
  browse(path?: string): Promise<RemoteDirectory>
  resolveFolder(id: string, path: string | null): Promise<void>
  onChanged(callback: (snapshot: HostsSnapshot) => void): () => void
  onFolderRequest(callback: (id: string) => void): () => void
}
