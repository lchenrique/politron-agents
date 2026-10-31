import { BrowserWindow, ipcMain, type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { ASSISTANT_ID, type Agent } from '../../../shared/v9'
import type { PiperVoice, RealtimeEvent, RealtimeMode, RealtimeProvider, RealtimeSettings, RealtimeStatus } from '../../../shared/realtime'
import type { AppService } from '../workspace'
import { RealtimeSettingsStore } from './settings'
import { listGeminiLiveModels, openGeminiLive, type RealtimeSession, type RealtimeTool } from './gemini-live'
import type { ChatMessage } from './groq'
import { loadPiper, openFreeCascade } from './free-cascade'
import { PocketVoiceService } from '../pocket-voices'
import { pocketWavToAudio } from './pocket-audio'

const RECENT_MESSAGES = 12

/** Instruções de ligação: a mesma identidade do Pit, mas com respostas curtas e faladas. */
export function voiceInstructions(agent: Agent, recent: string): string {
  return `Você é ${agent.name}${agent.description ? `, ${agent.description}` : ''}, falando em tempo real com o usuário. ${agent.instructions}
Você está numa conversa por voz em tempo real, em português do Brasil. Responda como numa ligação: frases curtas e naturais, normalmente uma a três frases, sem markdown, listas, código ou emojis. Se não entendeu, peça para repetir.
Para realizar trabalho real (arquivos, código, pesquisa, navegador, criar Boos, alterar equipes ou configurações), use executar_tarefa, que encaminha o pedido ao motor verdadeiro do Boobot e exige as aprovações necessárias. NÃO responda que é incapaz de executar ações do Boobot sem antes tentar a ferramenta correta. Nunca afirme que concluiu sem receber confirmação. Para conversa casual, responda diretamente.
${agent.role === 'chief' ? 'Como Chief, você PODE criar outros agentes/Boos e equipes, direto. Para pedidos de criar um agente, use propor_criacao_boo. Para delegações, mudanças de modelo, projetos, sessões ou gerenciar equipes, use executar_tarefa. Excluir ou arquivar algo e ampliar acesso externo pedem aprovação do usuário.' : 'Como Boo não Chief, você pode colaborar usando executar_tarefa, mas a criação de Boos depende do Chief.'}
${agent.id !== ASSISTANT_ID ? 'Você PODE editar SEU PRÓPRIO perfil cadastrado no Boobot (nome, cor, personalidade, forma, acessórios). Para pedidos de autoedição, use editar_meu_perfil' + (agent.role === 'chief' ? '' : ', com aprovação do usuário') + '. Isso não altera os pesos da IA nem libera permissões.' : 'O perfil do Assistente padrão não pode ser editado.'}
Não repita limitações falsas de respostas anteriores. Se a execução demorar, espere a resposta da ferramenta ou informe que o trabalho continua em andamento. Suas falas da ligação também aparecem neste chat com a sua identidade. Não diga que fez algo que não fez.${recent ? `\nConversa recente no chat, para contexto:\n${recent}` : ''}`
}

/** Liga a voz em tempo real a uma conversa do Politron. Uma sessão por vez. */
export class RealtimeService {
  private readonly settingsStore: RealtimeSettingsStore
  private readonly pocket: PocketVoiceService
  private session: RealtimeSession | null = null
  private starting: Promise<void> | null = null
  private generation = 0
  private eventOwner: WebContents | null = null
  private transcriptMessages = new Map<'user' | 'agent', string>()

  constructor(root: string, private readonly app: AppService, private readonly executeTaskAwaitMs = 20_000) {
    this.settingsStore = new RealtimeSettingsStore(root)
    this.pocket = new PocketVoiceService(join(root, 'voice-models', 'pocket-tts'))
  }

  private emit(event: RealtimeEvent) {
    if (this.eventOwner && !this.eventOwner.isDestroyed()) { this.eventOwner.send('realtime:event', event); return }
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send('realtime:event', event)
  }

  async status(): Promise<RealtimeStatus> {
    const settings = await this.settingsStore.settings()
    const [gemini, groq, piperReady, vadInstalled, parakeetInstalled, installedPiperVoices, pocketInstalled] = await Promise.all([
      this.settingsStore.key('gemini'), this.settingsStore.key('groq'), this.settingsStore.localModelsReady(settings.piperVoice), this.settingsStore.vadInstalled(), this.settingsStore.parakeetInstalled(), this.settingsStore.installedPiperVoices(), this.pocket.installed(),
    ])
    return { geminiKey: !!gemini, groqKey: !!groq, localModels: (settings.ttsEngine === 'pocket' ? pocketInstalled && vadInstalled : piperReady) && (settings.transcriptionModel !== 'parakeet-v3' || parakeetInstalled), vadInstalled, parakeetInstalled, installedPiperVoices, pocketInstalled, settings }
  }

  saveKey(provider: RealtimeProvider, key: string) { return this.settingsStore.saveKey(provider, key) }
  clearKey(provider: RealtimeProvider) { return this.settingsStore.clearKey(provider) }
  saveSettings(patch: Partial<RealtimeSettings>) { return this.settingsStore.saveSettings(patch) }

  async previewPocketVoice(agentId?: string): Promise<Uint8Array> {
    return this.pocket.speak('Olá, eu sou seu Boo. Estou pronto para ajudar!', agentId)
  }

  async geminiModels(): Promise<string[]> {
    const key = await this.settingsStore.key('gemini')
    if (!key) throw new Error('Cadastre a chave do Gemini primeiro.')
    return listGeminiLiveModels(key)
  }

  async installLocalModels(): Promise<RealtimeStatus> {
    const settings = await this.settingsStore.settings()
    await this.settingsStore.installLocalModels(settings.piperVoice)
    // Já deixa a voz carregada para a primeira ligação não esperar.
    void loadPiper(this.settingsStore.piperDir(settings.piperVoice), settings.piperVoice).catch(() => undefined)
    return this.status()
  }

  async installParakeet(): Promise<RealtimeStatus> { await this.settingsStore.installParakeet(); return this.status() }

  async installPiperVoice(voice: PiperVoice): Promise<RealtimeStatus> {
    await this.settingsStore.installPiperVoice(voice)
    return this.status()
  }

  private persona(conversationId: string, preferredAgentId?: string) {
    const conversation = this.app.store.conversation(conversationId)
    const allowedAgentIds = conversation.agentIds.length ? conversation.agentIds : [ASSISTANT_ID]
    if (preferredAgentId && preferredAgentId !== ASSISTANT_ID && !allowedAgentIds.includes(preferredAgentId)) throw new Error('O agente escolhido não participa desta conversa.')
    const agentId = preferredAgentId || (conversation.leaderAgentId && allowedAgentIds.includes(conversation.leaderAgentId) ? conversation.leaderAgentId : allowedAgentIds[0])
    const agent = this.app.store.agent(agentId)
    const messages = this.app.history(conversationId).filter(message => message.role !== 'activity' && message.text.trim()).slice(-RECENT_MESSAGES)
    const recent = messages.map(message => `${message.role === 'user' ? 'Usuário' : message.author}: ${message.text.slice(0, 600)}`).join('\n')
    const history: ChatMessage[] = messages.map(message => message.role === 'user' ? { role: 'user', content: message.text.slice(0, 2000) } : { role: 'assistant', content: `${message.author}: ${message.text.slice(0, 2000)}` })
    return { agent, recent, history }
  }

  /**
   * No protocolo do Gemini Live, a resposta da função é o que o modelo efetivamente narra a seguir;
   * devolver um texto de preenchimento ("vou verificar...") e seguir em segundo plano deixa a voz
   * presa nessa frase para sempre, porque o turno da função já terminou e nada reabre a fala depois.
   * Por isso aqui se espera o resultado de verdade (como o modo gratuito já fazia) até um limite de
   * tempo; só além desse limite devolve um preenchimento e narra o resultado depois, via narrate().
   */
  private executeTool(conversationId: string, agent: Agent): RealtimeTool {
    const AWAIT_MS = this.executeTaskAwaitMs
    return {
      name: 'executar_tarefa',
      description: 'Executa uma tarefa de código, arquivos ou pesquisa por meio do próprio agente selecionado nesta ligação. Não encaminha a outro agente. Esta chamada só retorna depois que o agente já respondeu (ou, em tarefas longas, com um aviso de que vai avisar depois); não repita nem resuma o pedido antes de chamar, apenas chame e depois fale o resultado que a ferramenta devolver.',
      parameters: { type: 'object', properties: { tarefa: { type: 'string', description: 'Pedido completo e autossuficiente, em português.' } }, required: ['tarefa'] },
      run: async args => {
        const task = String(args.tarefa || '').trim().slice(0, 4000)
        if (!task) return 'Nenhuma tarefa foi informada.'
        this.emit({ type: 'delegated', task, agentName: agent.name })
        const session = this.session
        const result = this.app.respondToAgent(conversationId, task, agent.id)
        const timedOut = Symbol('timeout')
        const timer = new Promise<typeof timedOut>(resolve => setTimeout(() => resolve(timedOut), AWAIT_MS))
        const outcome = await Promise.race([result, timer]).catch(error => error instanceof Error ? error.message : 'A tarefa falhou.')
        if (outcome !== timedOut) return outcome
        // Passou do limite de espera: devolve algo pra falar agora e narra o resultado de verdade quando ele chegar, se a ligação ainda estiver nesta mesma sessão.
        result
          .then(text => session === this.session && session?.narrate?.(`O resultado de "${task}" ficou pronto: ${text}`))
          .catch(error => session === this.session && session?.narrate?.(`A tarefa "${task}" falhou: ${error instanceof Error ? error.message : 'erro desconhecido'}`))
        return 'Ainda estou trabalhando nisso; aviso assim que terminar.'
      },
    }
  }

  /** Ferramentas de gestão explícitas para o Gemini Live; ambas passam pelo motor e pelas aprovações do Boobot. */
  private managementTool(conversationId: string, agent: Agent, kind: 'create' | 'profile'): RealtimeTool {
    const create = kind === 'create'
    return {
      name: create ? 'propor_criacao_boo' : 'editar_meu_perfil',
      description: create
        ? 'Para o Chief criar agente, Boo ou equipe no Boobot. Chame quando pedirem para criar outros agentes.'
        : 'Para o agente alterar o próprio perfil, aparência, cor, nome ou personalidade (com aprovação, exceto para o Chief). Chame quando pedirem autoedição.',
      parameters: { type: 'object', properties: { tarefa: { type: 'string', description: 'Pedido original do usuário, sem acrescentar detalhes.' } }, required: ['tarefa'] },
      run: async args => {
        if (create && agent.role !== 'chief') return 'Somente o Chief pode propor a criação de outros Boos.'
        if (!create && agent.id === ASSISTANT_ID) return 'O Assistente padrão não possui perfil editável.'
        const task = String(args.tarefa || '').trim().slice(0, 4000)
        if (!task) return 'Nenhum pedido foi informado.'
        const instruction = create
          ? 'O usuário pediu por voz para criar Boos. Se você é o Chief, use agent_create (ação direta), respeitando as permissões deste workspace. Se não houver autorização, explique qual permissão deve ser habilitada. Pedido: '
          : 'O usuário pediu por voz para modificar SEU perfil cadastrado. Use self_update se você é o Chief (ação direta) ou propose_self_profile (com aprovação) se não é; nunca mude papel nem permissões. Pedido: '
        return this.executeTool(conversationId, agent).run({ tarefa: instruction + task })
      },
    }
  }

  private voiceTools(conversationId: string, agent: Agent): RealtimeTool[] {
    return [
      this.executeTool(conversationId, agent),
      ...(agent.role === 'chief' ? [this.managementTool(conversationId, agent, 'create')] : []),
      ...(agent.id !== ASSISTANT_ID ? [this.managementTool(conversationId, agent, 'profile')] : []),
    ]
  }

  async start(mode: RealtimeMode, conversationId: string, agentId?: string, owner?: WebContents): Promise<void> {
    this.stop()
    this.transcriptMessages.clear()
    this.eventOwner = owner || null
    const generation = this.generation
    const opening = this.open(generation, mode, conversationId, agentId)
    this.starting = opening
    try { await opening } finally { if (this.starting === opening) this.starting = null }
  }

  private async open(generation: number, mode: RealtimeMode, conversationId: string, agentId?: string) {
    const current = () => generation === this.generation
    const emit = (event: RealtimeEvent) => { if (current()) this.emit(event) }
    emit({ type: 'phase', phase: 'connecting' })
    try {
      const settings = await this.settingsStore.settings()
      if (!current()) return
      const { agent, recent, history } = this.persona(conversationId, agentId)
      const tools = mode === 'gemini' ? [] : this.voiceTools(conversationId, agent)
      // In both modes the selected Boo is authoritative; voice transcripts are UI-only.
      // respondVoice persists the user message and the real agent answer in the SAME chat.

      if (mode === 'gemini') {
        const key = await this.settingsStore.key('gemini')
        if (!current()) return
        if (!key) throw new Error('Cadastre a chave do Gemini (Google AI Studio) para usar este modo.')
        const model = settings.geminiModel || (await listGeminiLiveModels(key))[0]
        if (!current()) return
        if (!model) throw new Error('Nenhum modelo Live disponível nesta chave do Gemini.')
        let openedSession: RealtimeSession | null = null
        const candidate = await openGeminiLive({
          key, model, voice: settings.geminiVoice, instructions: voiceInstructions(agent, recent), tools, emit,
          onUtterance: async text => {
            // The selected agent is the only source of answers, even when Gemini provides the voice.
            if (!current()) return
            const answer = await this.app.respondVoice(conversationId, text, agent.id)
            // A delayed answer must NEVER be spoken by a later call or by a different Boo.
            if (current() && openedSession && this.session === openedSession) openedSession.narrate?.(answer)
          },
        })
        openedSession = candidate
        if (!current()) { candidate.close(); return }
        this.session = candidate
      } else {
        const piperVoice = settings.piperAgentVoices?.[agent.id] || settings.piperVoice
        const key = await this.settingsStore.key('groq')
        if (!current()) return
        if (settings.transcriptionModel !== 'parakeet-v3' && !key) throw new Error('Cadastre a chave do Groq para transcrever com Whisper ou selecione o Parakeet local.')
        if (!(await this.settingsStore.vadInstalled())) throw new Error('Instale o detector de fala Silero antes de ligar.')
        if (settings.ttsEngine === 'pocket') {
          if (!(await this.pocket.installed())) throw new Error('PocketTTS não está instalado. Configure o motor em Voz em tempo real ou escolha Piper.')
        } else if (!(await this.settingsStore.localModelsReady(piperVoice))) {
          throw new Error('Baixe a voz local selecionada (Piper pt-BR) antes de ligar.')
        }
        if (!current()) return
        if (settings.transcriptionModel === 'parakeet-v3' && !(await this.settingsStore.parakeetInstalled())) throw new Error('Baixe o Parakeet local nas configurações antes de ligar.')
        if (!current()) return
        const candidate = await openFreeCascade({ groqKey: key || undefined, transcriptionModel: settings.transcriptionModel, parakeetDir: this.settingsStore.parakeetDir, vadPath: this.settingsStore.vadPath, piperDir: this.settingsStore.piperDir(piperVoice), piperVoice,
          pocketSpeech: settings.ttsEngine === 'pocket' ? async (text, signal) => pocketWavToAudio(await this.pocket.speak(text, agent.id, signal)) : undefined,
          generateResponse: async (text, signal) => {
          if (signal.aborted || !current()) throw new Error('Resposta interrompida.')
          const answer = await this.app.respondVoice(conversationId, text, agent.id)
          if (!current()) throw new Error('Resposta interrompida.')
          return answer
        }, emit })
        if (!current()) { candidate.close(); return }
        this.session = candidate
      }
    } catch (error) {
      if (!current()) return
      emit({ type: 'error', message: error instanceof Error ? error.message : 'Não foi possível iniciar a voz.' })
      emit({ type: 'phase', phase: 'idle' })
      throw error
    }
  }

  pushAudio(chunk: ArrayBuffer | ArrayBufferView) {
    if (!this.session) return
    // O IPC pode entregar ArrayBuffer ou Buffer (com offset ímpar); copia para um buffer alinhado de 16 bits.
    const bytes = chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : ArrayBuffer.isView(chunk) ? new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength) : null
    if (!bytes || bytes.byteLength === 0 || bytes.byteLength > 64_000 || bytes.byteLength % 2) return
    try {
      this.session.pushAudio(new Int16Array(bytes.slice().buffer))
    } catch (error) {
      const failed = this.session
      this.session = null
      try { failed.close() } catch { /* a sessão pode já ter falhado */ }
      this.emit({ type: 'error', message: `Falha ao processar o áudio do microfone: ${error instanceof Error ? error.message : 'erro desconhecido'}` })
      this.emit({ type: 'phase', phase: 'error' })
    }
  }

  interrupt() { this.session?.interrupt() }

  stop() {
    const wasActive = !!this.session || !!this.starting
    this.generation++
    this.starting = null
    const session = this.session
    this.session = null
    this.transcriptMessages.clear()
    try { session?.close() } catch { /* a sessão pode já ter encerrado */ }
    if (wasActive) { this.emit({ type: 'phase', phase: 'idle' }); this.emit({ type: 'ended' }) }
  }
}

export function registerRealtimeIpc(service: RealtimeService, isRemote = () => false): () => void {
  const requireLocal = () => { if (isRemote()) throw new Error('Ligações de voz ainda não estão disponíveis no host remoto. Use o chat ou selecione este computador.') }
  const handle = <K extends keyof RealtimeService>(channel: K, handler: (...args: RealtimeService[K] extends (...args: infer A) => unknown ? A : never) => unknown) => ipcMain.handle(`realtime:${channel}`, (event, ...args) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (!owner || owner.isDestroyed()) throw new Error('Janela do Boobot indisponível.')
    requireLocal()
    return handler(...args as RealtimeService[K] extends (...args: infer A) => unknown ? A : never)
  })
  handle('status', () => service.status())
  handle('saveKey', (provider, key) => service.saveKey(provider, key))
  handle('clearKey', provider => service.clearKey(provider))
  handle('saveSettings', patch => service.saveSettings(patch))
  handle('geminiModels', () => service.geminiModels())
  handle('installLocalModels', () => service.installLocalModels())
  handle('installParakeet', () => service.installParakeet())
  handle('installPiperVoice', voice => service.installPiperVoice(voice))
  handle('previewPocketVoice', agentId => service.previewPocketVoice(agentId))
  ipcMain.handle('realtime:start', (event, mode, conversationId, agentId) => { requireLocal(); return service.start(mode, conversationId, agentId, event.sender) })
  handle('interrupt', () => service.interrupt())
  handle('stop', () => service.stop())
  // Áudio do microfone chega a cada ~60 ms: canal sem resposta para não acumular promessas.
  const onAudio = (event: Electron.IpcMainEvent, chunk: ArrayBuffer | ArrayBufferView) => {
    if (!isRemote() && BrowserWindow.fromWebContents(event.sender)) service.pushAudio(chunk)
  }
  ipcMain.on('realtime:audio', onAudio)
  return () => {
    service.stop()
    ipcMain.off('realtime:audio', onAudio)
    for (const channel of ['status', 'saveKey', 'clearKey', 'saveSettings', 'geminiModels', 'installLocalModels', 'installParakeet', 'installPiperVoice', 'previewPocketVoice', 'start', 'interrupt', 'stop']) ipcMain.removeHandler(`realtime:${channel}`)
  }
}
