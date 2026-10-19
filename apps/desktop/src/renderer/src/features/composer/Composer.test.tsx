import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Composer } from './Composer'

vi.mock('../voice/voice-recorder', () => ({
  VoiceRecorder: class {
    async record() { return new Uint8Array(48) }
    stop() {}
    cancel() {}
  },
}))

beforeEach(() => sessionStorage.clear())

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

  it('cresce automaticamente com múltiplas linhas até o limite de 220px', () => {
    const { textarea } = setup()
    let measuredHeight = 126
    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, get: () => measuredHeight })
    fireEvent.change(textarea, { target: { value: 'uma linha\nsegunda linha\nterceira linha' } })
    expect(textarea.style.height).toBe('126px')
    measuredHeight = 400
    fireEvent.change(textarea, { target: { value: 'uma linha\nsegunda linha\nterceira linha\nquarta' } })
    expect(textarea.style.height).toBe('220px')
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

describe('modelos por provedor no composer', () => {
  it('oferece somente esforços suportados e envia o identificador correto', async () => {
    const { textarea, onSubmit } = setup({ models: [{ id: 'codex:gpt', name: 'GPT', provider: 'Codex', efforts: ['low', 'high'], defaultEffort: 'low' }], defaultModelName: 'codex:gpt' })
    fireEvent.keyDown(screen.getByRole('button', { name: 'Nível de esforço' }), { key: 'Enter' })
    expect(await screen.findByRole('menuitemradio', { name: 'Baixo' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitemradio', { name: 'Máximo' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Alto' }))
    fireEvent.change(textarea, { target: { value: 'teste de esforço' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('teste de esforço', 'codex:gpt', expect.objectContaining({ effort: 'high' })))
  })

  it('omite esforço quando o modelo não oferece essa capacidade', () => {
    setup({ models: [{ id: 'claude:plain', name: 'Modelo simples', provider: 'Claude', efforts: [] }], defaultModelName: 'claude:plain' })
    expect(screen.queryByRole('button', { name: 'Nível de esforço' })).not.toBeInTheDocument()
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
    expect(await screen.findByRole('option', { name: /^OpenCode\s+1$/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^Pi\s+1$/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: /^OpenCode\s+1$/ }))
    const localModel = await screen.findByRole('option', { name: /^Modelo local\s+local$/ })
    expect(localModel).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(localModel)
    expect(popup).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar aos provedores' }))
    fireEvent.click(await screen.findByRole('option', { name: /^Pi\s+1$/ }))
    expect(await screen.findByRole('option', { name: /^Pi X\s+pi-x$/ })).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Voltar aos provedores' }))
    fireEvent.click(await screen.findByRole('option', { name: /^Codex\s+1$/ }))
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
  it('envia instruções enquanto o primeiro pedido está pendente sem apagar o próximo rascunho', async () => {
    let finish!: () => void
    const onSubmit = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve })).mockResolvedValue(undefined)
    const props = { conversationId: 'steering-test', models: [{ name: 'Codex' }], defaultModelName: 'Codex', onModelChange: vi.fn(), onSubmit, onStop: vi.fn() }
    const { rerender } = render(<Composer {...props} />)
    const textarea = screen.getByRole('textbox', { name: 'Message' })
    fireEvent.change(textarea, { target: { value: 'Implemente a tela' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(textarea).toHaveValue('')
    rerender(<Composer {...props} working canSteer />)
    fireEvent.change(textarea, { target: { value: 'Use a cor do projeto' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar instrução durante a execução' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2))
    expect(onSubmit.mock.calls[1][0]).toBe('Use a cor do projeto')
    fireEvent.change(textarea, { target: { value: 'Mais um detalhe' } })
    finish()
    await waitFor(() => expect(textarea).toHaveValue('Mais um detalhe'))
  })

  it('permite preparar o texto mas bloqueia envio para um provedor sem suporte', () => {
    const { textarea, onSubmit } = setup({ conversationId: 'unsupported-test', working: true, canSteer: false })
    fireEvent.change(textarea, { target: { value: 'Nova instrução' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Enviar mensagem' })).toBeDisabled()
    expect(textarea).toHaveValue('Nova instrução')
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
