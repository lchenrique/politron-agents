/** Navegador da plataforma para o usuário. Separado do navegador automatizado dos agentes. */
export interface PlatformBrowserState { url: string; title: string; loading: boolean; canGoBack: boolean; canGoForward: boolean; error: string | null }
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
