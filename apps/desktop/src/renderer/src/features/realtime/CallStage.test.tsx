import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RealtimeCall } from './RealtimeCall'

// Áudio simulado: o teste entrega quadros do microfone e confere o que chega ao processo principal.
let onChunk: ((pcm: ArrayBuffer, level: number) => void) | null = null
vi.mock('./audio-io', () => ({
  MicCapture: class { async start(callback: (pcm: ArrayBuffer, level: number) => void) { onChunk = callback } stop() { onChunk = null } },
  PcmPlayer: class { async resume() {} close() {} enqueue() {} flush() {} isPlaying() { return false } },
}))

const status = { geminiKey: true, groqKey: false, localModels: false, vadInstalled: false, parakeetInstalled: false, installedPiperVoices: [], settings: { geminiModel: '', geminiVoice: 'Puck', transcriptionModel: 'whisper-large-v3-turbo', piperVoice: 'faber' } }
let api: { status: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; pushAudio: ReturnType<typeof vi.fn>; onEvent: ReturnType<typeof vi.fn> }
beforeEach(() => {
  api = { status: vi.fn(async () => status), start: vi.fn(async () => undefined), stop: vi.fn(async () => undefined), pushAudio: vi.fn(), onEvent: vi.fn(() => () => undefined) }
  vi.stubGlobal('realtimeAPI', api)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); onChunk = null })

const panel = (headphones = false) => <RealtimeCall variant="panel" conversationId="c1" agentId="a1" agentName="Atlas" mode="gemini" headphones={headphones} />

describe('tela de ligação do painel do Boo', () => {
  it('liga, silencia o microfone sem derrubar a sessão e encerra', async () => {
    render(panel())
    expect(screen.getByText('Ligar para Atlas')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Desligar ligação' })).toBeDisabled()
    const call = screen.getByRole('button', { name: 'Ligar para Atlas' })
    await waitFor(() => expect(call).toBeEnabled())
    fireEvent.click(call)
    await waitFor(() => expect(api.start).toHaveBeenCalledWith('gemini', 'c1', 'a1'))
    expect(await screen.findByText('Falar')).toBeInTheDocument()

    act(() => onChunk?.(new ArrayBuffer(4), .2))
    expect(api.pushAudio).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Silenciar microfone' }))
    expect(screen.getByText('Microfone mudo')).toBeInTheDocument()
    act(() => onChunk?.(new ArrayBuffer(4), .2))
    expect(api.pushAudio).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Ativar microfone' }))
    act(() => onChunk?.(new ArrayBuffer(4), .2))
    expect(api.pushAudio).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('button', { name: 'Desligar ligação' }))
    await waitFor(() => expect(api.stop).toHaveBeenCalled())
    expect(await screen.findByText('Ligar para Atlas')).toBeInTheDocument()
    expect(screen.getByLabelText('Duração da ligação')).toHaveTextContent('00:00')
  })

  it('alterna entre alto-falante e fone pela preferência de voz', () => {
    const { rerender } = render(panel(false))
    fireEvent.click(screen.getByRole('button', { name: 'Usar fone de ouvido' }))
    expect(localStorage.getItem('politron.realtime.headphones')).toBe('true')
    rerender(panel(true))
    expect(screen.getByText('Fone')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Usar alto-falante' }))
    expect(localStorage.getItem('politron.realtime.headphones')).toBe('false')
  })

  it('mostra o modo de voz e abre as configurações pelo cabeçalho do card', () => {
    const listener = vi.fn()
    window.addEventListener('boobot:open-settings', listener)
    render(panel())
    expect(screen.getByText('Gemini Live')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir configurações de voz' }))
    expect(listener).toHaveBeenCalled()
    window.removeEventListener('boobot:open-settings', listener)
  })
})
