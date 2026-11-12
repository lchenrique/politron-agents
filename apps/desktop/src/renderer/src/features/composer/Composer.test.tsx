import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Composer } from './Composer'
import { ModelSlot, ModelSlotProvider } from './ComposerModelSlot'
import type { Agent } from '../../../../shared/v9'

const recorderTest = vi.hoisted(() => ({ record: vi.fn<() => Promise<Uint8Array>>() }))

vi.mock('../voice/voice-recorder', () => ({
  VoiceRecorder: class {
    async record() { return recorderTest.record() }
    stop() {}
    cancel() {}
  },
}))

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  recorderTest.record.mockReset().mockResolvedValue(new Uint8Array(48))
})

function setup(overrides: Partial<React.ComponentProps<typeof Composer>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  const props: React.ComponentProps<typeof Composer> = {
    conversationId: 'compact-test',
    models: [{ name: 'Modelo real', efforts: ['medium'], defaultEffort: 'medium' }],
    defaultModelName: 'Modelo real', onModelChange: vi.fn(), onSubmit, onStop: vi.fn(), ...overrides,
  }
  render(<Composer {...props} />)
  const textarea = screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement
  return { textarea, onSubmit }
}

describe('Composer compacto e elástico', () => {
  it('diz para quem vai a mensagem', () => {
    const { textarea } = setup({ recipientName: 'Atlas' })
    expect(textarea).toHaveAttribute('placeholder', 'Envie uma mensagem para Atlas…')
  })

  it('mantém o seletor de modelo no composer mesmo com a barra superior do chat presente', () => {
    const onModelChange = vi.fn()
    render(<ModelSlotProvider><ModelSlot /><Composer conversationId="slot-test" models={[{ name: 'Modelo real', efforts: ['medium'], defaultEffort: 'medium' }]} defaultModelName="Modelo real" onModelChange={onModelChange} onSubmit={vi.fn()} onStop={vi.fn()} /></ModelSlotProvider>)
    const picker = screen.getByRole('button', { name: 'Selecionar modelo' })
    const row = (screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement).parentElement!
    expect(row).toContainElement(picker)
    expect(picker).toHaveTextContent('Modelo real')
    // A prancheta saiu da linha: planejamento agora mora no menu do "+".
    expect(screen.queryByRole('button', { name: 'Modo planejamento' })).not.toBeInTheDocument()
  })

  it('empilha: campo em cima e, embaixo, anexar (com menu), destinatário, permissão, modelo, microfone e enviar', () => {
    const { textarea } = setup({ recipientName: 'Atlas', mentionAgents: [{ id: 'atlas', name: 'Atlas', alias: 'atlas', color: '#786bea', avatar: '', approvalMode: 'ask' } as Agent], recipientApprovalMode: 'ask', onApprovalModeChange: vi.fn() })
    const stack = textarea.parentElement!
    const [campo, linha] = [...stack.children]
    expect(campo).toBe(textarea)
    for (const name of ['Anexar arquivo, comando ou permissão', 'Selecionar modelo', 'Gravar áudio', 'Enviar mensagem']) expect(linha).toContainElement(screen.getByRole('button', { name }))
    // Destinatário e permissão ficam na mesma linha, à esquerda; modelo, microfone e enviar à direita.
    expect(linha).toContainElement(screen.getByRole('button', { name: /@Atlas/ }))
    expect(linha).toContainElement(screen.getByRole('button', { name: 'Permissão do Boo: Perguntar' }))
    const model = screen.getByRole('button', { name: 'Selecionar modelo' })
    expect(model).toHaveTextContent('Modelo real')
  })

  it('seletor de modelo segue o mock: header, lista com marca no ativo e atalho de provedores', () => {
    const onModelChange = vi.fn()
    setup({ models: [{ id: 'codex:gpt-5', name: 'Modelo real' }, { id: 'claude:sonnet', name: 'Outro modelo' }], defaultModelName: 'codex:gpt-5', onModelChange })
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar modelo' }))
    const menu = screen.getByRole('menu', { name: 'Modelo Ativo' })
    expect(menu).toHaveTextContent('Modelo Ativo')
    expect(within(menu).getByRole('button', { name: /Modelo real/ })).toBeInTheDocument()
    fireEvent.click(within(menu).getByRole('button', { name: /Outro modelo/ }))
    expect(onModelChange).toHaveBeenCalledWith('claude:sonnet')
    expect(screen.queryByRole('menu', { name: 'Modelo Ativo' })).not.toBeInTheDocument()
  })

  it('chip de permissão mostra o modo do Boo e troca pelo menu', () => {
    const onApprovalModeChange = vi.fn()
    setup({ recipientName: 'Atlas', recipientApprovalMode: 'automatic', onApprovalModeChange })
    const trigger = screen.getByRole('button', { name: 'Permissão do Boo: Automático' })
    expect(trigger).toHaveAttribute('data-approval-mode', 'automatic')
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: /Acesso total/ }))
    expect(onApprovalModeChange).toHaveBeenCalledWith('bypass')
  })

  it('não mostra o chip de permissão sem um destinatário conhecido', () => {
    setup()
    expect(screen.queryByRole('button', { name: /Permissão do Boo/ })).not.toBeInTheDocument()
  })

  it('o "+" abre o menu do mock: anexar arquivos e modo planejamento', () => {
    setup()
    const trigger = screen.getByRole('button', { name: 'Anexar arquivo, comando ou permissão' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual(['Anexar arquivos', 'Modo planejamento'])
    const picker = screen.getByLabelText('Upload files') as HTMLInputElement
    const click = vi.spyOn(picker, 'click').mockImplementation(() => undefined)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Anexar arquivos' }))
    expect(click).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
  })

  it('continua pronto para a primeira mensagem quando a conversa está vazia', async () => {
    const { textarea, onSubmit } = setup()
    expect(textarea).toBeVisible()
    fireEvent.change(textarea, { target: { value: 'Olá, equipe' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Olá, equipe', 'Modelo real', expect.any(Object)))
  })

  it('aplica planejamento a um envio e permite executar no próximo pedido', async () => {
    const { textarea, onSubmit } = setup()
    const trigger = screen.getByRole('button', { name: 'Anexar arquivo, comando ou permissão' })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Modo planejamento' }))
    expect(trigger).toHaveAttribute('data-plan-mode', 'true')
    fireEvent.change(textarea, { target: { value: 'Planeje a LP' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Planeje a LP', 'Modelo real', expect.objectContaining({ planMode: true })))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Anexar arquivo, comando ou permissão' })).not.toHaveAttribute('data-plan-mode'))
    fireEvent.change(textarea, { target: { value: 'Pode fazer' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await waitFor(() => expect(onSubmit).toHaveBeenLastCalledWith('Pode fazer', 'Modelo real', expect.objectContaining({ planMode: false })))
  })

  it('preserva o rascunho se o envio falhar e não envia durante composição IME', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Falha de envio'))
    const { textarea } = setup({ onSubmit })
    fireEvent.change(textarea, { target: { value: 'Minha mensagem' } })
    fireEvent.keyDown(textarea, { key: 'Enter', isComposing: true, keyCode: 229 })
    expect(onSubmit).not.toHaveBeenCalled()
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Falha de envio'))
    expect(textarea).toHaveValue('Minha mensagem')
  })

  it('mantém o planejamento ao restaurar um envio que falhou', async () => {
    const { textarea } = setup({ onSubmit: vi.fn().mockRejectedValue(new Error('Sem conexão')) })
    fireEvent.click(screen.getByRole('button', { name: 'Anexar arquivo, comando ou permissão' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Modo planejamento' }))
    fireEvent.change(textarea, { target: { value: 'Planeje a página' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await screen.findByRole('alert')
    expect(textarea).toHaveValue('Planeje a página')
    expect(screen.getByRole('button', { name: 'Anexar arquivo, comando ou permissão' })).toHaveAttribute('data-plan-mode', 'true')
  })

  it('cancela a checagem de voz e não inicia o microfone depois do cancelamento', async () => {
    let resolveVoiceStatus!: (status: { transcription: boolean; speech: boolean }) => void
    const voiceStatus = vi.fn(() => new Promise<{ transcription: boolean; speech: boolean }>(resolve => { resolveVoiceStatus = resolve }))
    vi.stubGlobal('appAPI', { voiceStatus, voiceTranscribe: vi.fn() })
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Gravar áudio' }))
    await waitFor(() => expect(voiceStatus).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Gravar áudio' }))
    resolveVoiceStatus({ transcription: true, speech: true })
    await waitFor(() => expect(recorderTest.record).not.toHaveBeenCalled())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('limpa o estado de gravação quando troca de conversa', async () => {
    recorderTest.record.mockImplementation(() => new Promise(() => undefined))
    const props = { conversationId: 'voice-one', models: [], onModelChange: vi.fn(), onSubmit: vi.fn(), onStop: vi.fn() }
    const { rerender } = render(<Composer {...props} />)
    vi.stubGlobal('appAPI', { voiceStatus: vi.fn().mockResolvedValue({ transcription: true, speech: true }), voiceTranscribe: vi.fn() })
    fireEvent.click(screen.getByRole('button', { name: 'Gravar áudio' }))
    await screen.findByRole('status')
    rerender(<Composer {...props} conversationId="voice-two" />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gravar áudio' })).toBeEnabled()
    vi.unstubAllGlobals()
  })

  it('grava, transcreve localmente e insere a fala como rascunho editável sem enviar automaticamente', async () => {
    const voiceTranscribe = vi.fn().mockResolvedValue('Abra meu projeto')
    vi.stubGlobal('appAPI', { voiceStatus: vi.fn().mockResolvedValue({ transcription: true, speech: true }), voiceTranscribe })
    const { textarea, onSubmit } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Gravar áudio' }))
    await waitFor(() => expect(voiceTranscribe).toHaveBeenCalledOnce())
    await waitFor(() => expect(textarea).toHaveValue('Abra meu projeto'))
    expect(onSubmit).not.toHaveBeenCalled()
    fireEvent.change(textarea, { target: { value: 'Abra meu projeto no editor' } })
    expect(textarea).toHaveValue('Abra meu projeto no editor')
  })

  it('começa numa linha de 34px, sem espaço vazio e sem texto auxiliar redundante', () => {
    const { textarea } = setup()
    expect(textarea.style.height).toBe('34px')
    expect(screen.queryByText(/Agentes podem errar/)).not.toBeInTheDocument()
  })

  it('cresce até seis linhas (132px) e para', () => {
    const { textarea } = setup()
    let measuredHeight = 44
    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, get: () => measuredHeight })
    fireEvent.change(textarea, { target: { value: 'uma linha\nsegunda linha' } })
    expect(textarea.style.height).toBe('44px')
    measuredHeight = 400
    fireEvent.change(textarea, { target: { value: 'uma linha\nsegunda linha\nterceira linha\nquarta' } })
    expect(textarea.style.height).toBe('132px')
    measuredHeight = 10
    fireEvent.change(textarea, { target: { value: '' } })
    expect(textarea.style.height).toBe('34px')
  })

  it('Enter envia e Shift+Enter permite nova linha', async () => {
    const { textarea, onSubmit } = setup()
    fireEvent.change(textarea, { target: { value: 'primeira' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
    expect(onSubmit).not.toHaveBeenCalled()
    fireEvent.change(textarea, { target: { value: 'primeira\nsegunda' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce())
    expect(onSubmit).toHaveBeenCalledWith('primeira\nsegunda', 'Modelo real', expect.objectContaining({ files: [] }))
  })
})

describe('autocomplete de menções', () => {
  const atlas = { id: 'atlas', name: 'Atlas', alias: 'atlas', color: '#786bea', avatar: '' } as Agent
  const nina = { id: 'nina', name: 'Nina', alias: 'nina', color: '#4098eb', avatar: '' } as Agent

  it('seleciona @atlas com Enter sem enviar e permite uma segunda menção', async () => {
    const { textarea, onSubmit } = setup({ mentionAgents: [atlas, nina] })
    fireEvent.change(textarea, { target: { value: 'Olá @at' } })
    expect(screen.getByRole('listbox', { name: 'Mencionar agente' })).toBeInTheDocument()
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(onSubmit).not.toHaveBeenCalled()
    expect(textarea).toHaveValue('Olá @atlas ')
    fireEvent.change(textarea, { target: { value: 'Olá @atlas e @ni' } })
    fireEvent.keyDown(textarea, { key: 'Tab' })
    expect(textarea).toHaveValue('Olá @atlas e @nina ')
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Olá @atlas e @nina', 'Modelo real', expect.any(Object)))
  })

  it('não sugere participantes dentro de e-mail e Escape fecha o menu', () => {
    const { textarea } = setup({ mentionAgents: [atlas] })
    fireEvent.change(textarea, { target: { value: 'a@atlas.com' } })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    fireEvent.change(textarea, { target: { value: 'Oi @at' } })
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.keyDown(textarea, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(textarea).toHaveValue('Oi @at')
  })

  it('fecha as sugestões ao trocar de conversa', () => {
    const props = { conversationId: 'one', mentionAgents: [atlas], models: [], onModelChange: vi.fn(), onSubmit: vi.fn().mockResolvedValue(undefined), onStop: vi.fn() }
    const { rerender } = render(<Composer {...props} />)
    const textarea = screen.getByRole('textbox', { name: 'Message' })
    fireEvent.change(textarea, { target: { value: '@a' } })
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    rerender(<Composer {...props} conversationId="two" />)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})

describe('modelos por provedor no composer', () => {
  it('agrupa por provedor e filtra pela busca', () => {
    setup({ models: [
      { id: 'codex:gpt-5', name: 'GPT-5', provider: 'Codex' },
      { id: 'codex:gpt-5-mini', name: 'GPT-5 Mini', provider: 'Codex' },
      { id: 'claude:sonnet', name: 'Sonnet 4.5', provider: 'Claude' },
    ], defaultModelName: 'codex:gpt-5' })
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar modelo' }))
    const menu = screen.getByRole('menu', { name: 'Modelo Ativo' })
    // Cabeçalhos de provedor em mono maiúsculo, como as seções do mock.
    expect(menu).toHaveTextContent('Codex')
    expect(menu).toHaveTextContent('Claude')
    const search = within(menu).getByRole('textbox', { name: 'Buscar modelo' })
    fireEvent.change(search, { target: { value: 'sonnet' } })
    expect(within(menu).queryByRole('button', { name: /GPT-5$/ })).not.toBeInTheDocument()
    expect(within(menu).getByRole('button', { name: /Sonnet 4\.5/ })).toBeInTheDocument()
    fireEvent.change(search, { target: { value: 'zzz' } })
    expect(within(menu).getByText('Nenhum modelo encontrado.')).toBeInTheDocument()
  })

  it('sem herdar, oferece voltar ao modelo do Boo', () => {
    const onModelChange = vi.fn()
    setup({ models: [{ id: 'codex:gpt-5', name: 'GPT-5', provider: 'Codex' }], defaultModelName: 'codex:gpt-5', inheritModelName: 'GPT-5', onModelChange })
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar modelo' }))
    const menu = screen.getByRole('menu', { name: 'Modelo Ativo' })
    fireEvent.click(within(menu).getByRole('button', { name: /Voltar a herdar do Boo/ }))
    expect(onModelChange).toHaveBeenCalledWith('Usar o modelo do agente')
  })

  it('escolher um modelo no menu envia o identificador dele', async () => {
    const { textarea, onSubmit } = setup({ models: [{ id: 'codex:gpt', name: 'GPT', provider: 'Codex', efforts: ['low', 'high'], defaultEffort: 'low' }, { id: 'claude:sonnet', name: 'Sonnet', provider: 'Claude' }], defaultModelName: 'codex:gpt' })
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar modelo' }))
    fireEvent.click(within(screen.getByRole('menu', { name: 'Modelo Ativo' })).getByRole('button', { name: /Sonnet/ }))
    fireEvent.change(textarea, { target: { value: 'teste de modelo' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('teste de modelo', 'claude:sonnet', expect.any(Object)))
  })

  it('omite esforço quando o modelo não oferece essa capacidade', () => {
    setup({ models: [{ id: 'claude:plain', name: 'Modelo simples', provider: 'Claude', efforts: [] }], defaultModelName: 'claude:plain' })
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar modelo' }))
    expect(screen.queryByRole('slider', { name: 'Esforço de raciocínio' })).not.toBeInTheDocument()
  })

  it('lista no menu só os modelos habilitados, sem seção por provedor', () => {
    setup({ models: [
      { id: 'codex:gpt-x', name: 'GPT X', provider: 'Codex', enabled: true },
      { id: 'opencode:local', name: 'Modelo local', provider: 'OpenCode', enabled: false },
      { id: 'pi:pi-x', name: 'Pi X', provider: 'Pi', enabled: false },
    ], defaultModelName: 'Usar o modelo do agente' })
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar modelo' }))
    const menu = screen.getByRole('menu', { name: 'Modelo Ativo' })
    expect(within(menu).getByRole('button', { name: /GPT X/ })).toBeInTheDocument()
    expect(within(menu).queryByRole('button', { name: /Modelo local/ })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('button', { name: /Pi X/ })).not.toBeInTheDocument()
  })
})

describe('modelo do agente não é sobrescrito por padrão', () => {
  it('oferece "Usar o modelo do agente" como primeira opção, sem forçar esforço', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<Composer conversationId="inherit-test" models={[{ name: 'Codex Fast' }]} defaultModelName="Usar o modelo do agente" onModelChange={vi.fn()} onSubmit={onSubmit} onStop={vi.fn()} />)
    const textarea = screen.getByRole('textbox', { name: 'Message' })
    fireEvent.change(textarea, { target: { value: 'oi' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce())
    expect(onSubmit).toHaveBeenCalledWith('oi', 'Usar o modelo do agente', expect.objectContaining({ effort: undefined }))
  })

  it('mostra o modelo real do Boo no lugar do rótulo de herança e continua herdando', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<Composer conversationId="inherit-label" models={[{ id: 'claude:claude-sonnet-4-5', name: 'Claude 4.5 Sonnet', provider: 'Claude' }]}
      defaultModelName="Usar o modelo do agente" inheritModelName="Claude 4.5 Sonnet" onModelChange={vi.fn()} onSubmit={onSubmit} onStop={vi.fn()} />)
    const selector = screen.getByRole('button', { name: 'Selecionar modelo' })
    expect(selector).toHaveTextContent('Claude 4.5 Sonnet')
    expect(selector).not.toHaveTextContent('Usar o modelo do agente')
    const textarea = screen.getByRole('textbox', { name: 'Message' })
    fireEvent.change(textarea, { target: { value: 'oi' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('oi', 'Usar o modelo do agente', expect.any(Object)))
  })

  it('ao escolher o destinatário, o rótulo passa a ser o modelo do Boo escolhido', () => {
    const names = ['Claude 4.5 Sonnet', 'GPT-5']
    const atlas = { id: 'atlas', name: 'Atlas', alias: 'atlas', color: '#786bea', avatar: '', runtime: 'claude', model: 'claude-sonnet-4-5' } as Agent
    render(<Composer conversationId="inherit-target" mentionAgents={[atlas]} models={[
      { id: 'claude:claude-sonnet-4-5', name: names[0], provider: 'Claude' },
      { id: 'codex:gpt-5', name: names[1], provider: 'Codex' },
    ]} defaultModelName="Usar o modelo do agente" inheritModelName="GPT-5" onModelChange={vi.fn()} onSubmit={vi.fn()} onStop={vi.fn()} />)
    const selector = screen.getByRole('button', { name: 'Selecionar modelo' })
    expect(selector).toHaveTextContent('GPT-5')
    fireEvent.click(screen.getByRole('button', { name: /@Atlas/ }))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('button', { name: /Atlas/ }))
    expect(selector).toHaveTextContent('Claude 4.5 Sonnet')
  })
})

describe('instruções durante uma tarefa', () => {
  it('durante a execução envia para a fila e mostra Parar ao lado de Enviar', async () => {
    const { textarea, onSubmit } = setup({ conversationId: 'queue-test', working: true })
    fireEvent.change(textarea, { target: { value: 'Nova instrução' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][2]).toMatchObject({ delivery: 'queue' })
    expect(screen.queryByRole('button', { name: 'Enviar agora' })).not.toBeInTheDocument()
    const stop = screen.getByRole('button', { name: 'Parar geração' })
    expect(stop.nextElementSibling).toBe(screen.getByRole('button', { name: 'Adicionar à fila' }))
  })

  it('Ctrl/Cmd+Enter envia a instrução diretamente ao turno em andamento', async () => {
    const { textarea, onSubmit } = setup({ conversationId: 'steer-test', working: true })
    fireEvent.change(textarea, { target: { value: 'Priorize este ajuste' } })
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][2]).toMatchObject({ delivery: 'now' })
  })

  it('mantém imagens na fila ao tentar envio direto durante a execução', async () => {
    const { textarea, onSubmit } = setup({ conversationId: 'steer-image-test', working: true })
    const image = new File(['image'], 'captura.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Upload files'), { target: { files: [image] } })
    fireEvent.change(textarea, { target: { value: 'Veja esta imagem' } })
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })
    expect(await screen.findByText(/Imagens não podem ser enviadas diretamente/)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(textarea).toHaveValue('Veja esta imagem')
  })

  it('cartões da fila: Editar devolve o texto, Enviar agora e Remover agem na fila do host', async () => {
    const api = { cancelQueuedMessage: vi.fn().mockResolvedValue(undefined), sendQueuedNow: vi.fn().mockResolvedValue(undefined) }
    vi.stubGlobal('appAPI', api)
    const queued = [
      { id: 'q1', conversationId: 'c', agentId: null, author: 'Você', role: 'user', text: 'Primeira da fila', status: 'queued', runId: null, createdAt: '' },
      { id: 'q2', conversationId: 'c', agentId: null, author: 'Você', role: 'user', text: 'Segunda da fila', status: 'queued', runId: null, createdAt: '', attachments: [{ id: 'a', name: 'a.png', mimeType: 'image/png', size: 1 }] },
    ] as React.ComponentProps<typeof Composer>['queued']
    const { textarea } = setup({ conversationId: 'queue-cards', working: true, queued })
    const list = screen.getByRole('region', { name: 'Mensagens na fila' })
    expect(list).toHaveTextContent('Primeira da fila')
    expect(list).toHaveTextContent('1 anexo')
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0])
    await waitFor(() => expect(textarea).toHaveValue('Primeira da fila'))
    expect(api.cancelQueuedMessage).toHaveBeenCalledWith('q1')
    fireEvent.click(screen.getAllByRole('button', { name: 'Enviar agora' })[1])
    await waitFor(() => expect(api.sendQueuedNow).toHaveBeenCalledWith('q2'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Remover' })[1])
    await waitFor(() => expect(api.cancelQueuedMessage).toHaveBeenLastCalledWith('q2'))
    vi.unstubAllGlobals()
  })

  it('recolhe ajustes sem apagar o rascunho ao atualizar o modelo', () => {
    const props = { conversationId: 'settings-test', models: [{ id: 'a', name: 'Modelo A' }, { id: 'b', name: 'Modelo B' }], defaultModelName: 'Modelo A', onModelChange: vi.fn(), onSubmit: vi.fn(), onStop: vi.fn() }
    const { rerender } = render(<Composer {...props} />)
    const textarea = screen.getByRole('textbox', { name: 'Message' })
    fireEvent.change(textarea, { target: { value: 'Meu rascunho' } })
    const selector = screen.getByRole('button', { name: 'Selecionar modelo' })
    expect(screen.queryByRole('menu', { name: 'Modelo Ativo' })).not.toBeInTheDocument()
    fireEvent.click(selector)
    const menu = screen.getByRole('menu', { name: 'Modelo Ativo' })
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: 'Modelo Ativo' })).not.toBeInTheDocument()
    rerender(<Composer {...props} defaultModelName="Modelo B" />)
    expect(textarea).toHaveValue('Meu rascunho')
  })
})
