import { BrowserWindow, ipcMain } from 'electron'
import { cardFallbackText, parseTextAnswer } from '../../shared/interactive-card'
import { randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { ASSISTANT_ID, type Approval, type Message, type WorkspaceEvent } from '../../shared/v9'
import { MEMORY_SCOPE_LABEL } from '../../shared/memory'
import { telegramStartLink, type TelegramChat, type TelegramStatus } from '../../shared/telegram'
import { EncryptedKey, type SecretStore } from '../v9/image-generation'
import type { AppService } from '../v9/workspace'
import { escapeHtml, telegramChunks, TELEGRAM_LIMIT } from './format'

/** O que o canal usa do núcleo V9: o mesmo envio e as mesmas decisões de aprovação da janela do desktop. */
export type TelegramHost = Pick<AppService, 'snapshot' | 'send' | 'saveConversation' | 'respondApproval' | 'reviewPlan' | 'answerQuestion' | 'answerCard' | 'stop' | 'on' | 'off'> & {
  store: Pick<AppService['store'], 'approval' | 'agent' | 'conversation' | 'memories'>
}
type Chat = { id: number; type: string; first_name?: string; username?: string }
type TgAudio = { file_id: string; file_size?: number; duration?: number }
type TgMessage = { message_id: number; chat: Chat; from?: { id: number; is_bot?: boolean }; text?: string; voice?: TgAudio; audio?: TgAudio; reply_to_message?: { message_id: number } }
/** O que o canal usa do serviço de voz: `issue` é o motivo de não poder transcrever (ou null). Injetável nos testes. */
export type AudioTranscriber = { audioTranscriptionIssue(): Promise<string | null>; transcribeAudio(audio: Uint8Array): Promise<string> }
type Update = { update_id: number; message?: TgMessage; callback_query?: { id: string; from: { id: number }; data?: string; message?: TgMessage } }
type Button = { text: string; callback_data: string }
/** `workspaces`: projeto escolhido por chat, que filtra /conversas e recebe as conversas criadas por /nova. */
type Persisted = { enabled: boolean; offset: number; chats: TelegramChat[]; conversations: Record<string, string>; workspaces?: Record<string, string> }

export class TelegramApiError extends Error {
  constructor(readonly status: number, message: string, readonly retryAfter?: number) { super(message) }
}

const TOKEN = /^\d{5,15}:[A-Za-z0-9_-]{30,64}$/
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const PAIRING_TTL = 10 * 60_000
const CHAT_FAILURES = 5
const CODE_FAILURES = 10
const UNAUTHORIZED_NOTICE_EVERY = 60 * 60_000
const POLL_TIMEOUT_S = 25
const TYPING_EVERY = 4_500
const TYPING_MAX = 30 * 60_000
const AUDIO_MAX_BYTES = 20 * 1024 * 1024
const AUDIO_MAX_SECONDS = 5 * 60
const NO_TRANSCRIBER = 'este build não inclui o serviço de voz'
const HELP = [
  '<b>Boobot no Telegram</b>',
  'Escreva normalmente para falar com o Chief (ou com a conversa escolhida).',
  '',
  '/status: execuções ativas e aprovações pendentes',
  '/conversas: escolher uma das últimas 10 conversas (do projeto escolhido)',
  '/projetos: escolher ou trocar o projeto (workspace)',
  '/nova: nova conversa com o Chief no projeto escolhido',
  '/cancelar: parar uma execução ativa',
  '/chief: voltar para a conversa do Chief',
  '/memoria: as 10 memórias mais recentes desta conversa',
  '/lembrar &lt;texto&gt;: guardar uma memória global essencial',
  '/parear &lt;código&gt;: parear este chat',
  '',
  'Aprovações chegam com botões Aprovar e Recusar; nada é executado sem o seu toque.',
].join('\n')
const UNAUTHORIZED = 'Este chat não está autorizado. No Boobot, abra Configurações → Telegram, gere um código e envie /parear <código>.'
const ACTIVE: string[] = ['queued', 'running', 'waiting']
/** Texto da mensagem "Trabalhando…" quando a execução termina: quem respondeu, por quê, quanto levou e o começo da resposta. */
export function finishSummary(message: Message, done: boolean, elapsedMs: number): string {
  const seconds = Math.max(0, Math.round(elapsedMs / 1000))
  const took = seconds >= 60 ? `${Math.floor(seconds / 60)} min ${seconds % 60} s` : `${seconds} s`
  const who = `${message.author}${message.routing ? ` (${message.routing})` : ''}`
  const gist = message.text.replace(/\s+/g, ' ').trim()
  const summary = gist ? `\nResumo: ${gist.length > 280 ? `${gist.slice(0, 279)}…` : gist}` : ''
  return `${done ? '✅ Concluído' : message.status === 'failed' ? '❌ Falhou' : '⏹ Interrompido'} por ${who} em ${took}.${summary}`
}
const STATE_LABEL: Record<Approval['status'], string> = { pending: 'pendente', approved: 'aprovada', denied: 'recusada', interrupted: 'interrompida' }

export class TelegramService {
  private readonly file: string
  private readonly token: SecretStore
  private readonly fetcher: typeof fetch
  private readonly now: () => number
  private readonly transcriber: AudioTranscriber | null
  private audioIssue: string | null = NO_TRANSCRIBER
  private data: Persisted = { enabled: false, offset: 0, chats: [], conversations: {} }
  private hasToken = false
  private state: TelegramStatus['state'] = 'off'
  private error: string | null = null
  private botUsername: string | null = null
  private pairing: { code: string; expiresAt: number; failures: number } | null = null
  private readonly chatFailures = new Map<number, { count: number; until: number }>()
  private readonly noticeSent = new Map<number, number>()
  /** Mensagens de aprovação já enviadas, para editar quando a decisão acontecer (aqui ou no desktop). */
  private readonly approvalMessages = new Map<string, { chatId: number; messageId: number }[]>()
  /** `${chatId}:${messageId}` da pergunta → aprovação, para aceitar resposta em texto por "Responder". */
  private readonly questionMessages = new Map<string, string>()
  private readonly forwarded = new Set<string>()
  /** Mensagem "Trabalhando…" por chat: é editada com o resultado e traz o botão Parar. */
  private readonly working = new Map<number, { statusId: number; userMessageId: number; conversationId: string; startedAt: number }>()
  private readonly typing = new Map<number, { timer: ReturnType<typeof setInterval>; since: number }>()
  private generation = 0
  private pollFailures = 0
  private abort: AbortController | null = null
  private saving: Promise<void> = Promise.resolve()
  private readonly listener = (event: WorkspaceEvent) => { void this.onWorkspaceEvent(event).catch(() => undefined) }

  constructor(directory: string, private readonly host: TelegramHost, options: { token?: SecretStore; fetcher?: typeof fetch; now?: () => number; transcriber?: AudioTranscriber } = {}) {
    this.file = join(directory, 'telegram.json')
    this.token = options.token || new EncryptedKey(join(directory, 'telegram-bot-token.enc'))
    this.fetcher = options.fetcher || fetch
    this.now = options.now || Date.now
    this.transcriber = options.transcriber || null
  }

  /** Lê o estado salvo e liga o polling se houver token e o canal estiver ligado. */
  async start(loop = true): Promise<void> {
    try {
      const raw = JSON.parse(await fs.readFile(this.file, 'utf8'))
      this.data = {
        enabled: raw?.enabled === true,
        offset: Number.isSafeInteger(raw?.offset) ? raw.offset : 0,
        chats: Array.isArray(raw?.chats) ? raw.chats.filter((chat: TelegramChat) => Number.isSafeInteger(chat?.id) && typeof chat.name === 'string') : [],
        conversations: raw?.conversations && typeof raw.conversations === 'object' ? raw.conversations : {},
        workspaces: raw?.workspaces && typeof raw.workspaces === 'object' ? raw.workspaces : {},
      }
    } catch { /* primeira execução */ }
    this.hasToken = await this.token.has()
    await this.refreshAudio()
    this.host.on('workspace-event', this.listener)
    if (loop) this.restart()
  }

  stop(): void {
    this.generation++
    this.abort?.abort(); this.abort = null
    for (const chatId of [...this.typing.keys()]) this.stopTyping(chatId)
    this.state = 'off'
  }

  dispose(): void { this.stop(); this.host.off('workspace-event', this.listener) }

  status(): TelegramStatus {
    const pairing = this.pairing && this.pairing.expiresAt > this.now() ? this.pairing : null
    return {
      audio: { available: !this.audioIssue, reason: this.audioIssue },
      hasToken: this.hasToken, enabled: this.data.enabled, state: this.state, botUsername: this.botUsername, error: this.error,
      chats: this.data.chats.map(chat => ({ ...chat })),
      pairing: pairing ? { code: pairing.code, expiresAt: new Date(pairing.expiresAt).toISOString(), link: this.botUsername ? telegramStartLink(this.botUsername, pairing.code) : null } : null,
    }
  }

  async saveToken(value: string): Promise<TelegramStatus> {
    const token = typeof value === 'string' ? value.trim() : ''
    if (!TOKEN.test(token)) throw new Error('Cole o token completo que o @BotFather enviou (números, dois-pontos e letras).')
    let me: { username?: string }
    try { me = await this.call<{ username?: string }>('getMe', {}, token) } catch (error) {
      if (error instanceof TelegramApiError && error.status === 401) throw new Error('O Telegram recusou este token. Confira se copiou o token inteiro do @BotFather.')
      throw new Error('Não foi possível falar com o Telegram para validar o token. Confira a conexão e tente de novo.')
    }
    await this.token.save(token)
    this.hasToken = true; this.botUsername = me.username || null
    // Outro bot: o offset e os chats pareados eram do bot anterior.
    this.data = { ...this.data, enabled: true, offset: 0, chats: [], conversations: {}, workspaces: {} }
    this.pairing = null
    await this.persist()
    this.restart()
    return this.status()
  }

  async clearToken(): Promise<TelegramStatus> {
    this.stop()
    await this.token.clear()
    this.hasToken = false; this.botUsername = null; this.error = null; this.pairing = null
    this.data = { ...this.data, enabled: false, offset: 0, chats: [], conversations: {}, workspaces: {} }
    await this.persist()
    return this.status()
  }

  async setEnabled(enabled: boolean): Promise<TelegramStatus> {
    if (typeof enabled !== 'boolean') throw new Error('Valor inválido.')
    if (enabled && !this.hasToken) throw new Error('Salve o token do bot antes de ligar o canal.')
    this.data.enabled = enabled
    await this.persist()
    this.restart()
    return this.status()
  }

  createPairingCode(): TelegramStatus {
    if (!this.hasToken) throw new Error('Salve o token do bot antes de gerar um código.')
    const code = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')
    this.pairing = { code, expiresAt: this.now() + PAIRING_TTL, failures: 0 }
    // Código novo libera quem errou o anterior.
    this.chatFailures.clear()
    return this.status()
  }

  async revokeChat(chatId: number): Promise<TelegramStatus> {
    if (!Number.isSafeInteger(chatId)) throw new Error('Chat inválido.')
    this.data.chats = this.data.chats.filter(chat => chat.id !== chatId)
    delete this.data.conversations[String(chatId)]
    delete this.data.workspaces?.[String(chatId)]
    this.stopTyping(chatId)
    await this.persist()
    return this.status()
  }

  private restart(): void {
    this.stop()
    if (!this.data.enabled || !this.hasToken) return
    this.state = 'connecting'; this.error = null
    const generation = this.generation
    this.abort = new AbortController()
    void (async () => {
      while (generation === this.generation) {
        const delay = await this.pollOnce()
        if (delay === null || generation !== this.generation) return
        if (delay) await new Promise(resolve => { const timer = setTimeout(resolve, delay); this.abort?.signal.addEventListener('abort', () => { clearTimeout(timer); resolve(undefined) }, { once: true }) })
      }
    })()
  }

  /** Uma rodada de long polling. Devolve a espera antes da próxima (0 = já), ou null para parar. */
  async pollOnce(): Promise<number | null> {
    try {
      if (!this.botUsername) this.botUsername = (await this.call<{ username?: string }>('getMe', {})).username || null
      const updates = await this.call<Update[]>('getUpdates', { offset: this.data.offset, timeout: POLL_TIMEOUT_S, allowed_updates: ['message', 'callback_query'] }, undefined, (POLL_TIMEOUT_S + 10) * 1000)
      this.state = 'connected'; this.error = null; this.pollFailures = 0
      await this.refreshAudio()
      if (updates.length) {
        // Offset salvo antes de tratar: uma falha no meio nunca reenvia um pedido ou aprovação ao reiniciar.
        this.data.offset = Math.max(this.data.offset, ...updates.map(update => update.update_id + 1))
        await this.persist()
        for (const update of updates) await this.handle(update).catch(error => console.error('[Telegram] Falha ao tratar atualização', error instanceof Error ? error.message : 'erro'))
      }
      return 0
    } catch (error) {
      if (this.abort?.signal.aborted) return null
      const status = error instanceof TelegramApiError ? error.status : 0
      this.state = 'error'
      if (status === 401 || status === 404) {
        this.error = 'O Telegram recusou o token do bot. Cole um token válido do @BotFather.'
        this.generation++
        return null
      }
      if (status === 409) { this.error = 'Outro programa está lendo este bot (outra cópia do Boobot ou um webhook). Tentando de novo em 30 s.'; return 30_000 }
      if (status === 429) { this.error = 'O Telegram pediu uma pausa. Tentando de novo em instantes.'; return ((error as TelegramApiError).retryAfter || 5) * 1000 }
      this.pollFailures = Math.min(this.pollFailures + 1, 6)
      const delay = Math.min(60_000, 1000 * 2 ** this.pollFailures)
      this.error = `Sem conexão com o Telegram. Tentando de novo em ${Math.round(delay / 1000)} s.`
      return delay
    }
  }

  private async refreshAudio(): Promise<void> {
    this.audioIssue = this.transcriber ? await this.transcriber.audioTranscriptionIssue().catch(() => 'não foi possível verificar o transcritor') : NO_TRANSCRIBER
  }

  private async call<T>(method: string, body: Record<string, unknown>, token?: string, timeout = 15_000): Promise<T> {
    const secret = token || await this.token.load()
    if (!secret) throw new TelegramApiError(401, 'Sem token.')
    const signal = this.abort ? AbortSignal.any([this.abort.signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout)
    const response = await this.fetcher(`https://api.telegram.org/bot${secret}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal, redirect: 'error' })
    const json = await response.json().catch(() => null) as { ok?: boolean; result?: T; description?: string; error_code?: number; parameters?: { retry_after?: number } } | null
    // A mensagem do erro nunca contém a URL (que leva o token).
    if (!response.ok || !json?.ok) throw new TelegramApiError(json?.error_code || response.status, String(json?.description || `HTTP ${response.status}`).slice(0, 200), json?.parameters?.retry_after)
    return json.result as T
  }

  /** Envia HTML; se o Telegram recusar a marcação, reenvia como texto puro. Falhas de envio não derrubam o canal. */
  private async sendHtml(chatId: number, html: string, buttons?: Button[][], plain?: string): Promise<number | null> {
    const markup = buttons?.length ? { reply_markup: { inline_keyboard: buttons } } : {}
    try { return (await this.call<{ message_id: number }>('sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...markup })).message_id } catch (error) {
      if (!(error instanceof TelegramApiError) || error.status !== 400) return null
      try { return (await this.call<{ message_id: number }>('sendMessage', { chat_id: chatId, text: (plain ?? html.replace(/<[^>]+>/g, '')).slice(0, TELEGRAM_LIMIT), ...markup })).message_id } catch { return null }
    }
  }

  private async handle(update: Update): Promise<void> {
    if (update.callback_query) return this.handleCallback(update.callback_query)
    const message = update.message
    if (!message || message.chat.type !== 'private' || !message.from || message.from.is_bot || message.from.id !== message.chat.id) return
    const chatId = message.chat.id
    const text = (message.text || '').trim()
    const command = /^\/([a-z]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec(text)
    const name = command?.[1].toLowerCase()
    const argument = command?.[2]?.trim() || ''
    if (!this.isAuthorized(chatId)) {
      if ((name === 'parear' || name === 'start') && argument) return this.pair(message.chat, argument)
      return this.unauthorized(chatId)
    }
    const media = message.voice || message.audio
    if (!text && media) return this.handleAudio(chatId, message, media)
    if (!text) { await this.sendHtml(chatId, 'O Boobot entende texto e áudio (mensagem de voz ou arquivo de áudio) pelo Telegram.'); return }
    if (!command) return this.plain(chatId, text, message)
    if (name === 'start' && !argument || name === 'ajuda' || name === 'help') { await this.sendHtml(chatId, HELP); return }
    if (name === 'start' || name === 'parear') { await this.sendHtml(chatId, 'Este chat já está pareado com o Boobot.'); return }
    if (name === 'status') return this.sendStatus(chatId)
    if (name === 'conversas' || name === 'conversa') return this.listConversations(chatId)
    if (name === 'projetos' || name === 'projeto' || name === 'workspace' || name === 'workspaces') return this.listWorkspaces(chatId)
    if (name === 'cancelar' || name === 'parar') return this.listActive(chatId)
    if (name === 'chief') { this.setConversation(chatId, this.chiefConversation(false)); await this.sendHtml(chatId, `Agora você fala com ${escapeHtml(this.conversationName(this.conversationFor(chatId)))}.`); return }
    if (name === 'memoria' || name === 'memorias') return this.listMemories(chatId)
    if (name === 'lembrar') return this.remember(chatId, argument)
    if (name === 'nova') { this.setConversation(chatId, this.chiefConversation(true, this.workspaceFor(chatId))); await this.sendHtml(chatId, `Nova conversa criada: ${escapeHtml(this.conversationName(this.conversationFor(chatId)))}. Pode escrever.`); return }
    await this.sendHtml(chatId, HELP)
  }

  /** Texto sem comando: resposta a uma pergunta pendente ou mensagem normal para a conversa ativa. */
  private async plain(chatId: number, text: string, message: TgMessage): Promise<void> {
    const questionId = message.reply_to_message && this.questionMessages.get(`${chatId}:${message.reply_to_message.message_id}`)
    if (questionId) return this.answerQuestion(chatId, questionId, text)
    return this.forward(chatId, text, message.message_id)
  }

  /** Voice note ou arquivo de áudio: baixa em memória (nada vai para o disco nem para o histórico), transcreve e segue como texto digitado. */
  private async handleAudio(chatId: number, message: TgMessage, media: TgAudio): Promise<void> {
    await this.refreshAudio()
    if (!this.transcriber || this.audioIssue) { await this.sendHtml(chatId, escapeHtml(`A transcrição de áudio não está disponível: ${this.audioIssue}. Enquanto isso, escreva a mensagem em texto.`)); return }
    if ((media.file_size ?? 0) > AUDIO_MAX_BYTES) { await this.sendHtml(chatId, 'Este áudio passa de 20 MB, o limite do Telegram para bots. Mande um mais curto ou escreva.'); return }
    if ((media.duration ?? 0) > AUDIO_MAX_SECONDS) { await this.sendHtml(chatId, 'Este áudio passa de 5 minutos. Mande um mais curto ou escreva.'); return }
    await this.sendHtml(chatId, '🎧 <i>Transcrevendo o áudio…</i>')
    let text: string
    try { text = (await this.transcriber.transcribeAudio(await this.download(media.file_id))).trim() } catch (error) {
      // Sem a mensagem original: ela pode conter caminho de arquivo; o token nunca entra em erro algum.
      console.error('[Telegram] Falha ao transcrever áudio', error instanceof TelegramApiError ? error.message : 'erro')
      await this.sendHtml(chatId, 'Não consegui baixar ou transcrever este áudio. Tente de novo ou escreva a mensagem.')
      return
    }
    if (!text) { await this.sendHtml(chatId, 'Não entendi nada neste áudio. Pode repetir?'); return }
    await this.sendHtml(chatId, `<b>Entendi:</b> ${escapeHtml(text.slice(0, 3500))}`, undefined, `Entendi: ${text.slice(0, 3500)}`)
    return this.plain(chatId, text, message)
  }

  private async download(fileId: string): Promise<Uint8Array> {
    const file = await this.call<{ file_path?: string; file_size?: number }>('getFile', { file_id: fileId })
    if (!file.file_path || !/^[\w./-]+$/.test(file.file_path) || file.file_path.includes('..') || (file.file_size ?? 0) > AUDIO_MAX_BYTES) throw new Error('arquivo inválido')
    const secret = await this.token.load()
    if (!secret) throw new TelegramApiError(401, 'Sem token.')
    // A URL leva o token: só o status HTTP sai daqui.
    const response = await this.fetcher(`https://api.telegram.org/file/bot${secret}/${file.file_path}`, { signal: AbortSignal.timeout(60_000), redirect: 'error' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    if (Number(response.headers.get('content-length')) > AUDIO_MAX_BYTES) throw new Error('arquivo grande')
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.length > AUDIO_MAX_BYTES) throw new Error('arquivo grande')
    return bytes
  }

  /** Mesmas funções da tela Configurações → Memória, no escopo da conversa atual (global, Boos dela e o projeto). */
  private async listMemories(chatId: number): Promise<void> {
    const conversation = this.host.store.conversation(this.conversationFor(chatId))
    const memories = this.host.store.memories.list({ limit: 10 }, { agentIds: conversation.agentIds || [], workspaceId: conversation.workspaceId || '' })
    await this.sendHtml(chatId, memories.length
      ? ['<b>Memórias desta conversa</b>', ...memories.map(memory => `• ${escapeHtml(memory.text)} <i>(${MEMORY_SCOPE_LABEL[memory.scope]}${memory.inclusion === 'essencial' ? ', essencial' : ''})</i>`)].join('\n')
      : 'Nenhuma memória nesta conversa ainda. Use /lembrar &lt;texto&gt; para guardar uma.')
  }

  private async remember(chatId: number, text: string): Promise<void> {
    if (!text) { await this.sendHtml(chatId, 'Escreva o que guardar: /lembrar &lt;texto&gt;'); return }
    try {
      this.host.store.memories.save({ text, scope: 'global', inclusion: 'essencial' }, { kind: 'usuario' })
      await this.sendHtml(chatId, 'Guardado como memória global essencial. Todos os Boos passam a ver isso.')
    } catch (error) { await this.sendHtml(chatId, escapeHtml(error instanceof Error ? error.message : 'Não foi possível guardar.')) }
  }

  private isAuthorized(chatId: number) { return this.data.chats.some(chat => chat.id === chatId) }

  private async unauthorized(chatId: number): Promise<void> {
    const last = this.noticeSent.get(chatId)
    if (last && this.now() - last < UNAUTHORIZED_NOTICE_EVERY) return
    if (this.noticeSent.size > 1000) this.noticeSent.clear()
    this.noticeSent.set(chatId, this.now())
    await this.sendHtml(chatId, escapeHtml(UNAUTHORIZED))
  }

  private async pair(chat: Chat, code: string): Promise<void> {
    const now = this.now()
    const failures = this.chatFailures.get(chat.id)
    // Limite de tentativas por chat: depois disso o bot fica em silêncio até outro código ou 10 minutos.
    if (failures && failures.count >= CHAT_FAILURES && failures.until > now) return
    const pairing = this.pairing && this.pairing.expiresAt > now ? this.pairing : null
    const given = Buffer.from(code.toUpperCase().slice(0, 32))
    const valid = !!pairing && given.length === pairing.code.length && timingSafeEqual(given, Buffer.from(pairing.code))
    if (!valid) {
      this.chatFailures.set(chat.id, { count: (failures && failures.until > now ? failures.count : 0) + 1, until: now + PAIRING_TTL })
      if (pairing && ++pairing.failures >= CODE_FAILURES) this.pairing = null
      await this.sendHtml(chat.id, pairing ? 'Código inválido. Confira o código nas Configurações do Boobot.' : 'Este código expirou ou já foi usado. Gere outro em Configurações → Telegram.')
      return
    }
    this.pairing = null
    this.chatFailures.delete(chat.id)
    this.data.chats.push({ id: chat.id, name: (chat.first_name || chat.username || `Chat ${chat.id}`).slice(0, 80), pairedAt: new Date(now).toISOString() })
    await this.persist()
    await this.sendHtml(chat.id, `Pareado. Este chat agora fala com o Boobot.\n\n${HELP}`)
  }

  private conversationFor(chatId: number): string {
    const saved = this.data.conversations[String(chatId)]
    if (saved) { try { if (!this.host.store.conversation(saved).archived) return saved } catch { /* conversa apagada */ } }
    const id = this.chiefConversation(false)
    this.setConversation(chatId, id)
    return id
  }

  private setConversation(chatId: number, conversationId: string) {
    this.data.conversations[String(chatId)] = conversationId
    void this.persist()
  }

  /** Conversa direta mais recente com o Chief (ou com o Assistente, sem Chief); cria uma quando não existe ou quando pedida. */
  private chiefConversation(create: boolean, workspaceId?: string): string {
    const snapshot = this.host.snapshot()
    const chief = snapshot.agents.find(agent => agent.role === 'chief' && agent.temporaryStatus !== 'retired')
    const agentIds = chief ? [chief.id] : []
    if (!create) {
      const existing = snapshot.conversations
        .filter(item => !item.archived && item.kind === 'direct' && (chief ? item.agentIds.length === 1 && item.agentIds[0] === chief.id : !item.agentIds.length || item.agentIds.every(id => id === ASSISTANT_ID)))
        .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt))[0]
      if (existing) return existing.id
    }
    return this.host.saveConversation({ name: `${chief?.name || 'Assistente'} pelo Telegram`, kind: 'direct', agentIds, ...(workspaceId ? { workspaceId } : {}) }).id
  }

  private conversationName(conversationId: string): string {
    try { return this.host.store.conversation(conversationId).name || 'Conversa' } catch { return 'Conversa' }
  }

  /** Mesmo caminho do Composer do desktop: AppService.send com requestId, fila e retorno após aceitar. */
  private react(chatId: number, messageId: number, emoji: string) {
    void this.call('setMessageReaction', { chat_id: chatId, message_id: messageId, reaction: [{ type: 'emoji', emoji }] }).catch(() => undefined)
  }

  private async forward(chatId: number, text: string, userMessageId?: number): Promise<void> {
    const conversationId = this.conversationFor(chatId)
    try {
      await this.host.send(conversationId, text, undefined, undefined, undefined, false, true, false, { requestId: randomUUID(), delivery: 'queue', returnAfterAcceptance: true })
      this.startTyping(chatId)
      if (userMessageId !== undefined && !this.working.has(chatId)) {
        this.react(chatId, userMessageId, '👀')
        const statusId = await this.sendHtml(chatId, '⏳ <i>Trabalhando…</i>', [[{ text: 'Parar', callback_data: `s:${conversationId}` }]])
        if (statusId !== null) this.working.set(chatId, { statusId, userMessageId, conversationId, startedAt: this.now() })
      }
    } catch (error) {
      await this.sendHtml(chatId, escapeHtml(`Não foi possível enviar: ${error instanceof Error ? error.message : 'erro desconhecido'}`))
    }
  }

  private startTyping(chatId: number) {
    if (this.typing.has(chatId)) return
    const tick = () => {
      const current = this.typing.get(chatId)
      if (current && this.now() - current.since > TYPING_MAX) { this.stopTyping(chatId); return }
      void this.call('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => undefined)
    }
    const timer = setInterval(tick, TYPING_EVERY); timer.unref?.()
    this.typing.set(chatId, { timer, since: this.now() })
    tick()
  }

  private stopTyping(chatId: number) {
    const current = this.typing.get(chatId)
    if (current) clearInterval(current.timer)
    this.typing.delete(chatId)
  }

  private async onWorkspaceEvent(event: WorkspaceEvent): Promise<void> {
    if (!this.data.enabled || !this.hasToken || !this.data.chats.length) return
    if (event.type === 'message') return this.onMessage(event.message)
    if (event.type === 'approval') return this.onApproval(event.approval)
  }

  /** Resposta final de um run na conversa ativa de um chat volta ao Telegram. */
  private async onMessage(message: Message): Promise<void> {
    if (message.role !== 'assistant') return
    const chats = this.data.chats.filter(chat => this.data.conversations[String(chat.id)] === message.conversationId)
    if (!chats.length) return
    if (message.status === 'running' || message.status === 'queued') { for (const chat of chats) this.startTyping(chat.id); return }
    for (const chat of chats) this.stopTyping(chat.id)
    if (!message.finishedAt || this.forwarded.has(message.id)) return
    for (const chat of chats) {
      const work = this.working.get(chat.id)
      if (!work || work.conversationId !== message.conversationId) continue
      this.working.delete(chat.id)
      const done = message.status === 'completed'
      void this.call('editMessageText', { chat_id: chat.id, message_id: work.statusId, text: finishSummary(message, done, this.now() - work.startedAt) }).catch(() => undefined)
      this.react(chat.id, work.userMessageId, done ? '👍' : '👎')
    }
    if (this.forwarded.size > 500) this.forwarded.clear()
    this.forwarded.add(message.id)
    const body = message.text.trim() || (message.status === 'completed' ? '(Sem resposta em texto.)' : 'A execução não terminou.')
    // Em grupo, a etiqueta diz por que este Boo respondeu (líder ou roteador com confiança).
    const chunks = telegramChunks(`**${message.author}**${message.routing ? ` (${message.routing})` : ''}\n${body}`)
    for (const chat of chats) {
      for (const chunk of chunks) await this.sendHtml(chat.id, chunk)
    }
  }

  private async onApproval(approval: Approval): Promise<void> {
    if (approval.status !== 'pending') return this.refreshApprovalMessages(approval)
    if (this.approvalMessages.has(approval.id)) return
    this.approvalMessages.set(approval.id, [])
    const html = this.approvalHtml(approval)
    const card = approval.details.card
    const buttons = approval.details.desktopOnly ? undefined : card
      ? card.kind === 'confirm' ? [[{ text: (card.confirmLabel || 'Confirmar').slice(0, 30), callback_data: `k:${approval.id}:1` }, { text: (card.cancelLabel || 'Cancelar').slice(0, 30), callback_data: `k:${approval.id}:0` }]]
        : card.kind === 'quick-replies' ? card.options.slice(0, 8).map((option, index) => [{ text: option.label.slice(0, 60), callback_data: `k:${approval.id}:${index}` }])
          : undefined
      : approval.kind === 'question'
      ? (approval.details.options || []).slice(0, 8).map((option, index) => [{ text: option.slice(0, 60), callback_data: `q:${approval.id}:${index}` }])
      : [[{ text: 'Aprovar', callback_data: `a:${approval.id}:1` }, { text: 'Recusar', callback_data: `a:${approval.id}:0` }]]
    for (const chat of this.data.chats) {
      this.stopTyping(chat.id)
      const messageId = await this.sendHtml(chat.id, html, buttons)
      if (messageId === null) continue
      this.approvalMessages.get(approval.id)?.push({ chatId: chat.id, messageId })
      if (approval.kind === 'question') this.questionMessages.set(`${chat.id}:${messageId}`, approval.id)
    }
  }

  private approvalHtml(approval: Approval): string {
    const d = approval.details
    const clip = (value: string | undefined, size: number) => escapeHtml((value || '').slice(0, size))
    let agent = 'Um Boo'
    try { agent = this.host.store.agent(approval.agentId).name } catch { /* agente removido */ }
    const where = escapeHtml(this.conversationName(approval.conversationId))
    const body = approval.kind === 'command' ? `Executar comando:\n<pre>${clip(d.command, 1500)}</pre>${d.cwd ? `\nem <code>${clip(d.cwd, 300)}</code>` : ''}`
      : approval.kind === 'write' ? `Alterar arquivo <code>${clip(d.path, 300)}</code>${d.action ? `\n${clip(d.action, 300)}` : ''}`
        : approval.kind === 'browser' ? `Usar o navegador: ${clip(d.action || d.task, 800)}`
          : approval.kind === 'delegation' ? `Delegar para ${clip(d.recipientName, 80)}:\n${clip(d.task, 1500)}`
            : approval.kind === 'question' && d.card ? `${escapeHtml(cardFallbackText(d.card).slice(0, 1800))}${d.card.kind === 'form' || d.card.kind === 'choice' ? '\n\nResponda a esta mensagem (use "cancelar" para dispensar).' : ''}`
            : approval.kind === 'question' ? `${clip(d.question, 1500)}\n\n${d.options?.length ? 'Toque numa opção ou responda a esta mensagem com outra resposta.' : 'Responda a esta mensagem com o texto da resposta.'}`
              : approval.kind === 'plan' ? `Plano: <b>${clip(d.planTitle, 200)}</b>\n${(d.planSteps || []).slice(0, 20).map((step, index) => `${index + 1}. ${clip(step, 200)}`).join('\n')}`
                : `Alterar o Boobot: ${clip(d.action, 300)}${d.task ? `\n${clip(d.task, 1200)}` : ''}`
    const title = approval.kind === 'question' ? 'pergunta' : 'pede aprovação'
    const footer = d.desktopOnly ? '\n\n<i>Esta autorização só pode ser respondida na janela do Boobot no computador.</i>' : ''
    return `<b>${escapeHtml(agent)}</b> ${title} em ${where}\n\n${body}${footer}`.slice(0, TELEGRAM_LIMIT)
  }

  private async refreshApprovalMessages(approval: Approval): Promise<void> {
    const messages = this.approvalMessages.get(approval.id)
    if (!messages) return
    this.approvalMessages.delete(approval.id)
    for (const { chatId, messageId } of messages) {
      this.questionMessages.delete(`${chatId}:${messageId}`)
      await this.editState(chatId, messageId, approval)
    }
  }

  private async editState(chatId: number, messageId: number, approval: Approval): Promise<void> {
    const outcome = approval.kind === 'question' && approval.details.card && approval.status !== 'pending' ? `Resposta: ${escapeHtml(approval.details.answer || STATE_LABEL[approval.status])}`
      : approval.kind === 'question' && approval.status === 'approved' ? `Respondida: ${escapeHtml(approval.details.answer || '')}` : `Estado: ${STATE_LABEL[approval.status]}.`
    await this.call('editMessageText', { chat_id: chatId, message_id: messageId, text: `${this.approvalHtml(approval)}\n\n<b>${outcome}</b>`.slice(0, TELEGRAM_LIMIT), parse_mode: 'HTML' }).catch(() => undefined)
  }

  private async answerQuestion(chatId: number, approvalId: string, answer: string): Promise<void> {
    const approval = this.host.store.approval(approvalId)
    if (!approval || approval.status !== 'pending') { await this.sendHtml(chatId, 'Esta pergunta já foi respondida.'); return }
    try {
      const card = approval.details.card
      if (card) {
        const parsed = parseTextAnswer(card, answer)
        if ('error' in parsed) { await this.sendHtml(chatId, escapeHtml(parsed.error)); return }
        await this.host.answerCard(approvalId, parsed.answer)
      } else await this.host.answerQuestion(approvalId, answer)
    } catch (error) { await this.sendHtml(chatId, escapeHtml(error instanceof Error ? error.message : 'Não foi possível responder.')) }
  }

  private async handleCallback(query: NonNullable<Update['callback_query']>): Promise<void> {
    const chatId = query.message?.chat.id
    const answer = (text: string) => this.call('answerCallbackQuery', { callback_query_id: query.id, text: text.slice(0, 190) }).catch(() => undefined)
    // Só o próprio dono de um chat pareado decide; botões encaminhados ou de grupos não valem.
    if (!chatId || query.message?.chat.type !== 'private' || query.from.id !== chatId || !this.isAuthorized(chatId)) { await answer('Não autorizado.'); return }
    const data = query.data || ''
    const conversation = /^c:([0-9a-f-]{36})$/.exec(data)
    if (conversation) {
      try { if (this.host.store.conversation(conversation[1]).archived) throw new Error('arquivada') } catch { await answer('Conversa indisponível.'); return }
      this.setConversation(chatId, conversation[1])
      this.setWorkspace(chatId, this.host.store.conversation(conversation[1]).workspaceId)
      await answer('Conversa escolhida.')
      await this.sendHtml(chatId, `Agora você fala em ${escapeHtml(this.conversationName(conversation[1]))}.`)
      return
    }
    const workspace = /^w:([\w-]{1,64})$/.exec(data)
    if (workspace) {
      if (workspace[1] === 'all') { this.setWorkspace(chatId, null); await answer('Todos os projetos.'); return this.listConversations(chatId) }
      const chosen = this.host.snapshot().workspaces.find(item => item.id === workspace[1] && !item.archived)
      if (!chosen) { await answer('Projeto indisponível.'); return }
      this.setWorkspace(chatId, chosen.id)
      await answer('Projeto escolhido.')
      await this.sendHtml(chatId, `Projeto: <b>${escapeHtml(chosen.name)}</b>. Escolha uma conversa dele abaixo ou use /nova para começar outra.`)
      return this.listConversations(chatId)
    }
    const stop = /^s:([0-9a-f-]{36})$/.exec(data)
    if (stop) {
      // A conversa atual do chat ou qualquer outra com execução ativa (/cancelar lista todas).
      if (this.conversationFor(chatId) !== stop[1] && !this.host.snapshot().runs.some(run => run.conversationId === stop[1] && ACTIVE.includes(run.status))) { await answer('Nada em execução nesta conversa.'); return }
      try { await this.host.stop(stop[1]); await answer('Parando…'); await this.sendHtml(chatId, `⏹ Parando a execução em ${escapeHtml(this.conversationName(stop[1]))}.`) } catch { await answer('Não foi possível parar.') }
      return
    }
    const decision = /^([aqk]):([0-9a-f-]{36}):(\d{1,2})$/.exec(data)
    if (!decision) { await answer('Ação desconhecida.'); return }
    const [, kind, approvalId, value] = decision
    const approval = this.host.store.approval(approvalId)
    if (!approval) { await answer('Aprovação não encontrada.'); return }
    if (approval.status !== 'pending') {
      await answer(`Esta aprovação já está ${STATE_LABEL[approval.status]}.`)
      if (query.message) await this.editState(chatId, query.message.message_id, approval)
      return
    }
    try {
      if (kind === 'k') {
        const card = approval.kind === 'question' ? approval.details.card : undefined
        const choice = card?.kind === 'quick-replies' ? card.options[Number(value)] : undefined
        if (!card || (card.kind === 'confirm' ? value !== '0' && value !== '1' : !choice)) { await answer('Opção inválida.'); return }
        await this.host.answerCard(approvalId, { status: 'answered', values: card.kind === 'confirm' ? { confirmed: value === '1' } : { choice: choice!.id } })
      } else if (kind === 'q') {
        const option = approval.kind === 'question' ? approval.details.options?.[Number(value)] : undefined
        if (!option) { await answer('Opção inválida.'); return }
        await this.host.answerQuestion(approvalId, option)
      } else {
        if (approval.kind === 'question') { await answer('Escolha uma opção.'); return }
        const approved = value === '1'
        // remote=true: autorizações só do desktop (navegador real) são recusadas pelo próprio AppService.
        if (approval.kind === 'plan') await this.host.reviewPlan(approvalId, approved ? 'approve' : 'reject', undefined, true)
        else await this.host.respondApproval(approvalId, approved, true)
      }
      await answer(kind === 'q' || kind === 'k' ? 'Resposta enviada.' : value === '1' ? 'Aprovado.' : 'Recusado.')
    } catch (error) {
      await answer(error instanceof Error ? error.message : 'Não foi possível decidir.')
      const current = this.host.store.approval(approvalId)
      if (current && current.status !== 'pending' && query.message) await this.editState(chatId, query.message.message_id, current)
    }
  }

  private async sendStatus(chatId: number): Promise<void> {
    const snapshot = this.host.snapshot()
    const active = snapshot.runs.filter(run => ACTIVE.includes(run.status))
    const pending = snapshot.approvals.filter(approval => approval.status === 'pending')
    const workspaceId = this.workspaceFor(chatId)
    const workspaceName = workspaceId ? snapshot.workspaces.find(item => item.id === workspaceId)?.name : undefined
    const lines = [`<b>Conversa atual:</b> ${escapeHtml(this.conversationName(this.conversationFor(chatId)))}`, `<b>Projeto:</b> ${escapeHtml(workspaceName || 'todos')}`, '', `<b>Execuções ativas:</b> ${active.length}`]
    for (const run of active.slice(0, 10)) lines.push(`• ${escapeHtml(run.agent.name)} em ${escapeHtml(this.conversationName(run.conversationId))} (${run.status === 'waiting' ? 'aguardando você' : run.status === 'queued' ? 'na fila' : 'trabalhando'})`)
    lines.push('', `<b>Aprovações pendentes:</b> ${pending.length}`)
    for (const approval of pending.slice(0, 10)) lines.push(`• ${escapeHtml(this.conversationName(approval.conversationId))}: ${approval.kind}`)
    await this.sendHtml(chatId, lines.join('\n'))
    // Reenvia com botões as pendentes que este chat ainda não recebeu (por exemplo, criadas antes do pareamento).
    for (const approval of pending) if (!this.approvalMessages.has(approval.id)) await this.onApproval(approval)
  }

  private workspaceFor(chatId: number): string | undefined {
    const id = this.data.workspaces?.[String(chatId)]
    return id && this.host.snapshot().workspaces.some(item => item.id === id && !item.archived) ? id : undefined
  }

  private setWorkspace(chatId: number, workspaceId: string | null) {
    const workspaces = this.data.workspaces ||= {}
    if (workspaceId) workspaces[String(chatId)] = workspaceId
    else delete workspaces[String(chatId)]
    void this.persist()
  }

  private async listWorkspaces(chatId: number): Promise<void> {
    const workspaces = this.host.snapshot().workspaces.filter(item => !item.archived && item.name && item.kind !== 'worktree').slice(0, 20)
    if (!workspaces.length) { await this.sendHtml(chatId, 'Ainda não há projetos.'); return }
    const current = this.workspaceFor(chatId)
    await this.sendHtml(chatId, 'Escolha o projeto:', [...workspaces.map(item => [{ text: `${item.id === current ? '• ' : ''}${item.name}`.slice(0, 60), callback_data: `w:${item.id}` }]), [{ text: 'Todos os projetos', callback_data: 'w:all' }]])
  }

  /** Conversas com execução ativa, cada uma com botão Parar. */
  private async listActive(chatId: number): Promise<void> {
    const snapshot = this.host.snapshot()
    const byConversation = new Map<string, string[]>()
    for (const run of snapshot.runs.filter(item => ACTIVE.includes(item.status))) byConversation.set(run.conversationId, [...(byConversation.get(run.conversationId) || []), run.agent.name])
    if (!byConversation.size) { await this.sendHtml(chatId, 'Nenhuma execução ativa agora.'); return }
    await this.sendHtml(chatId, 'Qual execução parar?', [...byConversation].slice(0, 10).map(([id, agents]) => [{ text: `Parar ${this.conversationName(id)} (${[...new Set(agents)].join(', ')})`.slice(0, 60), callback_data: `s:${id}` }]))
  }

  private async listConversations(chatId: number): Promise<void> {
    const workspaceId = this.workspaceFor(chatId)
    const conversations = this.host.snapshot().conversations
      .filter(item => !item.archived && (!workspaceId || item.workspaceId === workspaceId))
      .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt))
      .slice(0, 10)
    if (!conversations.length) { await this.sendHtml(chatId, workspaceId ? 'Este projeto ainda não tem conversas. Use /nova para começar.' : 'Ainda não há conversas.'); return }
    await this.sendHtml(chatId, 'Escolha a conversa:', conversations.map(item => [{ text: `${item.kind === 'group' ? '👥 ' : ''}${item.name || 'Conversa'}`.slice(0, 60), callback_data: `c:${item.id}` }]))
  }

  private persist(): Promise<void> {
    this.saving = this.saving.then(() => fs.writeFile(this.file, JSON.stringify(this.data), { mode: 0o600 })).catch(error => console.error('[Telegram] Falha ao salvar estado', error instanceof Error ? error.message : 'erro'))
    return this.saving
  }
}

/** IPC só local: fica fora da RPC de hosts e nunca devolve o token. */
export function registerTelegramIpc(service: TelegramService): () => void {
  const handlers: Record<string, (...args: never[]) => unknown> = {
    status: () => service.status(),
    saveToken: (token: string) => service.saveToken(token),
    clearToken: () => service.clearToken(),
    setEnabled: (enabled: boolean) => service.setEnabled(enabled),
    createPairingCode: () => service.createPairingCode(),
    revokeChat: (chatId: number) => service.revokeChat(chatId),
  }
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(`telegram:${channel}`, (event, ...args) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (!owner || owner.isDestroyed()) throw new Error('Janela do Boobot indisponível.')
    return handler(...args as never[])
  })
  return () => { for (const channel of Object.keys(handlers)) ipcMain.removeHandler(`telegram:${channel}`) }
}
