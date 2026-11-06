/** Canal Telegram do Boobot: só o processo principal conhece o token; o renderer recebe este estado. */
export interface TelegramChat { id: number; name: string; pairedAt: string }
export interface TelegramStatus {
  hasToken: boolean
  enabled: boolean
  state: 'off' | 'connecting' | 'connected' | 'error'
  botUsername: string | null
  error: string | null
  chats: TelegramChat[]
  /** Código de uso único em vigor; o link de pareamento só existe com o @username do bot conhecido. */
  pairing: { code: string; expiresAt: string; link: string | null } | null
}
export const BOTFATHER_URL = 'https://t.me/BotFather'
/** Deep link oficial do Telegram: o app abre o bot e envia `/start <código>` com um toque. */
export const telegramStartLink = (username: string, code: string) => `https://t.me/${username}?start=${code}`

export interface TelegramAPI {
  status(): Promise<TelegramStatus>
  /** Valida o token com getMe antes de guardar criptografado. */
  saveToken(token: string): Promise<TelegramStatus>
  clearToken(): Promise<TelegramStatus>
  setEnabled(enabled: boolean): Promise<TelegramStatus>
  createPairingCode(): Promise<TelegramStatus>
  revokeChat(chatId: number): Promise<TelegramStatus>
}
