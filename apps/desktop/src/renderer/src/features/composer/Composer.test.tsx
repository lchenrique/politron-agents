import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Composer } from './Composer'
import type { Agent } from '../../../../shared/v9'

vi.mock('../voice/voice-recorder', () => ({
  VoiceRecorder: class {
    async record() { return new Uint8Array(48) }
    stop() {}
    cancel() {}
  },
}))

beforeEach(() => { sessionStorage.clear(); localStorage.clear() })

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
  it('aplica planejamento a um envio e permite executar no próximo pedido', async () => {
    const { textarea, onSubmit } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Modo planejamento' }))
    fireEvent.change(textarea, { target: { value: 'Planeje a LP' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Planeje a LP', 'Modelo real', expect.objectContaining({ planMode: true })))
    expect(screen.getByRole('button', { name: 'Modo planejamento' })).toHaveAttribute('aria-pressed', 'false')
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
    fireEvent.click(screen.getByRole('button', { name: 'Modo planejamento' }))
    fireEvent.change(textarea, { target: { value: 'Planeje a página' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await screen.findByRole('alert')
    expect(textarea).toHaveValue('Planeje a página')
    expect(screen.getByRole('button', { name: 'Modo planejamento' })).toHaveAttribute('aria-pressed', 'true')
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

  it('começa em uma única linha, sem abrir espaço vazio e sem texto auxiliar redundante', () => {
    const { textarea } = setup()
    expect(textarea).toHaveClass('min-h-[36px]')
    expect(textarea.style.height).toBe('36px')
    expect(screen.queryByText(/Agentes podem errar/)).not.toBeInTheDocument()
  })

  it('cresce automaticamente com múltiplas linhas até o limite de 336px', () => {
    const { textarea } = setup()
    let measuredHeight = 126
    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, get: () => measuredHeight })
    fireEvent.change(textarea, { target: { value: 'uma linha\nsegunda linha\nterceira linha' } })
    expect(textarea.style.height).toBe('126px')
    measuredHeight = 400
    fireEvent.change(textarea, { target: { value: 'uma linha\nsegunda linha\nterceira linha\nquarta' } })
    expect(textarea.style.height).toBe('336px')
    measuredHeight = 30
    fireEvent.change(textarea, { target: { value: '' } })
    expect(textarea.style.height).toBe('36px')
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
  it('oferece somente esforços suportados e envia o identificador correto', async () => {
    const { textarea, onSubmit } = setup({ models: [{ id: 'codex:gpt', name: 'GPT', provider: 'Codex', efforts: ['low', 'high'], defaultEffort: 'low' }], defaultModelName: 'codex:gpt' })
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar modelo' }))
    const effortSlider = await screen.findByRole('slider', { name: 'Esforço de raciocínio' })
    expect(effortSlider).toHaveAttribute('aria-valuetext', 'Baixo')
    expect(screen.queryByText('Máximo')).not.toBeInTheDocument()
    fireEvent.keyDown(effortSlider, { key: 'ArrowRight' })
    expect(effortSlider).toHaveAttribute('aria-valuetext', 'Alto')
    fireEvent.change(textarea, { target: { value: 'teste de esforço' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('teste de esforço', 'codex:gpt', expect.objectContaining({ effort: 'high' })))
  })

  it('omite esforço quando o modelo não oferece essa capacidade', () => {
    setup({ models: [{ id: 'claude:plain', name: 'Modelo simples', provider: 'Claude', efforts: [] }], defaultModelName: 'claude:plain' })
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar modelo' }))
    expect(screen.queryByRole('slider', { name: 'Esforço de raciocínio' })).not.toBeInTheDocument()
  })

  it('agrupa as CLIs, desabilita catálogos sem executor e envia IDs com prefixo', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<Composer conversationId="catalog-test" models={[
      { id: 'codex:gpt-x', name: 'GPT X', provider: 'Codex', enabled: true },
      { id: 'opencode:local', name: 'Modelo local', provider: 'OpenCode', enabled: false },
      { id: 'pi:pi-x', name: 'Pi X', provider: 'Pi', enabled: false },
    ]} defaultModelName="Usar o modelo do agente" onModelChange={vi.fn()} onSubmit={onSubmit} onStop={vi.fn()} />)
    const selector = screen.getByRole('button', { name: 'Selecionar modelo' })
    expect(selector).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('Modelos disponíveis')).not.toBeInTheDocument()
    fireEvent.click(selector)
    expect(selector).toHaveAttribute('aria-expanded', 'true')
    const popup = await screen.findByRole('dialog', { name: 'Modelos disponíveis' })
    expect(popup).toHaveAttribute('data-dsh-menu-surface', 'true')
    expect(await screen.findByRole('option', { name: /^OpenCode\s+1 modelos$/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^Pi\s+1 modelos$/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: /^OpenCode\s+1 modelos$/ }))
    const localModel = await screen.findByRole('option', { name: /^Modelo local\s+local$/ })
    expect(localModel).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(localModel)
    expect(popup).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar aos provedores' }))
    fireEvent.click(await screen.findByRole('option', { name: /^Pi\s+1 modelos$/ }))
    expect(await screen.findByRole('option', { name: /^Pi X\s+pi-x$/ })).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Voltar aos provedores' }))
    fireEvent.click(await screen.findByRole('option', { name: /^Codex\s+1 modelos$/ }))
    expect(screen.getByRole('dialog', { name: 'Modelos disponíveis' })).toBe(popup)
    expect(document.querySelectorAll('button[aria-label="Selecionar modelo"]')).toHaveLength(1)
    fireEvent.click(await screen.findByRole('option', { name: /^GPT X\s+gpt-x$/ }))
    expect(selector).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('Modelos disponíveis')).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'teste' } })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Message' }), { key: 'Enter' })
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('teste', 'codex:gpt-x', expect.any(Object)))
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
    const props = { conversationId: 'settings-test', models: [{ name: 'Modelo A' }, { name: 'Modelo B' }], defaultModelName: 'Modelo A', onModelChange: vi.fn(), onSubmit: vi.fn(), onStop: vi.fn() }
    const { rerender } = render(<Composer {...props} />)
    const textarea = screen.getByRole('textbox', { name: 'Message' })
    fireEvent.change(textarea, { target: { value: 'Meu rascunho' } })
    const selector = screen.getByRole('button', { name: 'Selecionar modelo' })
    expect(screen.queryByLabelText('Modelos disponíveis')).not.toBeInTheDocument()
    fireEvent.click(selector)
    const inlineList = screen.getByRole('dialog', { name: 'Modelos disponíveis' })
    expect(inlineList).toBeInTheDocument()
    expect(inlineList.closest('[role="dialog"]')).toBe(inlineList)
    fireEvent.keyDown(inlineList, { key: 'Escape' })
    expect(screen.queryByLabelText('Modelos disponíveis')).not.toBeInTheDocument()
    rerender(<Composer {...props} defaultModelName="Modelo B" />)
    expect(textarea).toHaveValue('Meu rascunho')
  })
})
