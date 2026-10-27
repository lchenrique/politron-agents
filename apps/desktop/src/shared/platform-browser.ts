/** Navegador da plataforma para o usuário. Separado do navegador automatizado dos agentes. */
export interface PlatformBrowserOwner { workspaceId: string; conversationId: string; agentId: string }
export interface PlatformBrowserState { url: string; title: string; loading: boolean; canGoBack: boolean; canGoForward: boolean; error: string | null; sharing?: PlatformBrowserOwner | null }
/** Navegador externo do usuário pela extensão oficial do provider: consentimento por conversa e agente e peças ausentes da ponte. */
export interface ExternalBrowserStatus { granted: boolean; problems: string[] }
export interface PlatformBrowserBounds { x: number; y: number; width: number; height: number }
export interface PlatformBrowserAPI {
  navigate(url: string): Promise<PlatformBrowserState>
  state(): Promise<PlatformBrowserState | null>
  setBounds(bounds: PlatformBrowserBounds, visible: boolean): Promise<void>
  back(): Promise<void>
  forward(): Promise<void>
  reload(): Promise<void>
  /** Navegador padrão do sistema; somente por gesto explícito (Ctrl/Cmd+clique ou botão). */
  openExternal(url: string): Promise<void>
  close(): Promise<void>
  setSharingContext(owner: PlatformBrowserOwner | null): Promise<void>
  grantSharing(owner: PlatformBrowserOwner): Promise<void>
  revokeSharing(): Promise<void>
  externalStatus(owner: PlatformBrowserOwner): Promise<ExternalBrowserStatus>
  setExternalGrant(owner: PlatformBrowserOwner, enabled: boolean): Promise<ExternalBrowserStatus>
  onState(callback: (state: PlatformBrowserState | null) => void): () => void
}

/** Aceita apenas HTTP/HTTPS sem credenciais embutidas. Usado no renderer e revalidado no main. */
export function safeWebUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim() || value.length > 8192) return null
  try {
    const url = new URL(value.trim())
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password ? url.href : null
  } catch { return null }
}
