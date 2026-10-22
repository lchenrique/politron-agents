import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { VoiceCall } from './VoiceCall'
import type { Agent, Message } from '../../../../shared/v9'

const { speakVoice, stopVoice, recordMock, cancelMock } = vi.hoisted(() => ({
  speakVoice: vi.fn(() => new Promise<void>(() => {})),
  stopVoice: vi.fn(),
  recordMock: vi.fn().mockResolvedValue(new Uint8Array(48)),
  cancelMock: vi.fn(),
}))
vi.mock('./voice-player', () => ({ speakVoice, stopVoice }))
vi.mock('./voice-recorder', () => ({
  VoiceRecorder: class {
    record = recordMock
    stop = vi.fn()
    cancel = cancelMock
  },
}))
const agent = { id: 'agent-a', name: 'Atlas', alias: 'atlas', color: '#ff80ff' } as Agent
const input = { role: 'assistant', id: 'reply-new', status: 'completed', text: 'Olá, estou aqui.' } as Message

beforeEach(() => {
  speakVoice.mockClear()
  stopVoice.mockClear()
  recordMock.mockReset().mockResolvedValue(new Uint8Array(48))
  cancelMock.mockClear()
  vi.stubGlobal('appAPI', {
    voiceStatus: vi.fn().mockResolvedValue({ speech: true, transcription: true, engine: 'sherpa-onnx', language: 'pt-BR' }),
    voiceTranscribe: vi.fn().mockResolvedValue('Abra o terminal'),
    voiceInstall: vi.fn(),
  })
})

describe('ligação local com os Pits', () => {
  it('configura o Fish Audio gratuito sem expor a chave fora da ação de salvar', async () => {
    const save = vi.fn().mockResolvedValue({ transcription: true, speech: true, engine: 'openrouter', language: 'pt-BR', voiceKeyConfigured: true, localSpeechInstalled: false })
    vi.stubGlobal('appAPI', {
      voiceStatus: vi.fn().mockResolvedValue({ transcription: true, speech: false, engine: 'openrouter', language: 'pt-BR', voiceKeyConfigured: false, localSpeechInstalled: false }),
      voiceSaveOpenRouterKey: save,
      voiceTranscribe: vi.fn(),
    })
    render(<VoiceCall open agents={[agent]} messages={[]} onSend={vi.fn()} onClose={vi.fn()} />)
    const field = await screen.findByLabelText('Chave OpenRouter para voz')
    fireEvent.change(field, { target: { value: 'sk-or-v1-test-12345678901234567890' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(save).toHaveBeenCalledExactlyOnceWith('sk-or-v1-test-12345678901234567890'))
    expect(await screen.findByText(/Somente Fish Audio S2.1 Pro Free será utilizado/)).toBeInTheDocument()
  })

  it('transcreve localmente e envia ao agente selecionado', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    render(<VoiceCall open agents={[agent]} messages={[]} onSend={send} onClose={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ligar' }))
    await waitFor(() => expect(send).toHaveBeenCalledExactlyOnceWith('Abra o terminal'))
    expect(screen.getByText('Abra o terminal')).toBeInTheDocument()
    expect(window.appAPI.voiceTranscribe).toHaveBeenCalledOnce()
  })

  it('reproduz uma resposta nova, ignorando respostas antigas', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(<VoiceCall open agents={[agent]} messages={[{ ...input, id: 'reply-old' }]} onSend={send} onClose={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ligar' }))
    await waitFor(() => expect(send).toHaveBeenCalledOnce())
    expect(speakVoice).not.toHaveBeenCalled()
    rerender(<VoiceCall open agents={[agent]} messages={[{ ...input, id: 'reply-old' }, input]} onSend={send} onClose={vi.fn()} />)
    await waitFor(() => expect(speakVoice).toHaveBeenCalledExactlyOnceWith('Olá, estou aqui.', undefined, { agentId: 'agent-a', concise: true }))
  })

  it('encerra microfone e reprodução ao desligar', async () => {
    const close = vi.fn()
    render(<VoiceCall open agents={[agent]} messages={[]} onSend={vi.fn()} onClose={close} />)
    await act(async () => { await Promise.resolve() })
    fireEvent.click(screen.getByRole('button', { name: 'Desligar' }))
    expect(close).toHaveBeenCalledOnce()
    expect(stopVoice).toHaveBeenCalled()
  })

  it('cancela gravação pendente ao desmontar sem transcrever nem enviar o resultado tardio', async () => {
    let resolveRecording!: (audio: Uint8Array) => void
    recordMock.mockReturnValueOnce(new Promise(resolve => { resolveRecording = resolve }))
    const send = vi.fn()
    const transcribe = vi.fn().mockResolvedValue('texto atrasado')
    vi.stubGlobal('appAPI', { ...window.appAPI, voiceTranscribe: transcribe })
    const { unmount } = render(<VoiceCall open agents={[agent]} messages={[]} onSend={send} onClose={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ligar' }))
    await waitFor(() => expect(recordMock).toHaveBeenCalledOnce())
    unmount()
    expect(cancelMock).toHaveBeenCalledOnce()
    await act(async () => { resolveRecording(new Uint8Array(48)); await Promise.resolve() })
    expect(transcribe).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })
})
