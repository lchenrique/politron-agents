import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Message } from '../../../../shared/v9'

const voice = vi.hoisted(() => ({ speakVoice: vi.fn(async () => undefined), stopVoice: vi.fn() }))
vi.mock('../voice/voice-player', () => voice)
import { MessageItem } from './MessageItem'

const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
afterEach(() => {
  if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard)
  else Reflect.deleteProperty(navigator, 'clipboard')
})

it('o botão Ouvir usa o ID persistido do Boo mesmo sem o perfil carregado', async () => {
  const message = { id: 'reply', agentId: 'boo-brigid', author: 'brigid', role: 'assistant', status: 'completed', text: 'Olá, posso ajudar!' } as Message
  render(<MessageItem message={message} relatedConversation={undefined} onOpenRelatedConversation={vi.fn()} onNotice={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Ouvir resposta do agente' }))
  await waitFor(() => expect(voice.speakVoice).toHaveBeenCalledWith(message.text, expect.any(Function), { agentId: 'boo-brigid' }))
})

it('carrega imagem anexada pelo API autenticada e usa a URL temporária no preview', async () => {
  const attachment = { id: 'a'.repeat(32), name: 'captura.png', mimeType: 'image/png' as const, size: 3 }
  const create = vi.fn(() => 'blob:captura'), revoke = vi.fn()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke })
  const readAttachment = vi.fn().mockResolvedValue({ mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3]) })
  vi.stubGlobal('appAPI', { readAttachment })
  const message = { id: 'image-message', conversationId: 'c1', agentId: null, author: 'Você', role: 'user', status: 'completed', text: 'O que aparece aqui?', runId: null, attachments: [attachment], createdAt: '' } as Message
  const { unmount } = render(<MessageItem message={message} relatedConversation={undefined} onOpenRelatedConversation={vi.fn()} onNotice={vi.fn()} />)
  expect(await screen.findByRole('img', { name: 'captura.png' })).toHaveAttribute('src', 'blob:captura')
  expect(readAttachment).toHaveBeenCalledWith('c1', attachment.id)
  unmount()
  expect(revoke).toHaveBeenCalledWith('blob:captura')
})

it('permite cancelar uma mensagem que ainda está na fila', async () => {
  const cancelQueuedMessage = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('appAPI', { cancelQueuedMessage })
  const message = { id: 'queued-id', conversationId: 'c1', agentId: null, author: 'Você', role: 'user', status: 'queued', text: 'Depois desta', runId: null, createdAt: '' } as Message
  render(<MessageItem message={message} relatedConversation={undefined} onOpenRelatedConversation={vi.fn()} onNotice={vi.fn()} canCancelQueued />)
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar mensagem na fila' }))
  await waitFor(() => expect(cancelQueuedMessage).toHaveBeenCalledWith('queued-id'))
})

describe('copiar mensagem', () => {
  const reply: Message = { id: 'reply-2', conversationId: 'c1', agentId: 'boo', author: 'Atlas', role: 'assistant', status: 'completed', text: '## Pronto\n\nSegredo de teste 123', runId: 'run-1', createdAt: '2026-10-25T13:05:00.000Z' }

  it('copia o texto bruto da resposta e confirma sem repetir o conteúdo no aviso', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const log = vi.spyOn(console, 'log'), info = vi.spyOn(console, 'info'), error = vi.spyOn(console, 'error')
    const onNotice = vi.fn()
    render(<MessageItem message={reply} relatedConversation={undefined} onOpenRelatedConversation={vi.fn()} onNotice={onNotice} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copiar mensagem' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(reply.text))
    expect(await screen.findByRole('button', { name: 'Mensagem copiada' })).toBeInTheDocument()
    expect(onNotice).toHaveBeenCalledWith('Mensagem copiada.')
    expect(onNotice.mock.calls.flat().join(' ')).not.toContain('Segredo de teste')
    for (const spy of [log, info, error]) { expect(spy.mock.calls.flat().join(' ')).not.toContain('Segredo de teste'); spy.mockRestore() }
  })

  it('comunica a falha da área de transferência e mantém a ação disponível', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError: Segredo de teste 123')) } })
    const onNotice = vi.fn()
    render(<MessageItem message={reply} relatedConversation={undefined} onOpenRelatedConversation={vi.fn()} onNotice={onNotice} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copiar mensagem' }))
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith('Não foi possível copiar a mensagem. Verifique o acesso à área de transferência.'))
    expect(onNotice.mock.calls.flat().join(' ')).not.toContain('Segredo de teste')
    expect(screen.getByRole('button', { name: 'Copiar mensagem' })).toBeInTheDocument()
  })

  it('trata a ausência da API de clipboard como falha', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    const onNotice = vi.fn()
    render(<MessageItem message={reply} relatedConversation={undefined} onOpenRelatedConversation={vi.fn()} onNotice={onNotice} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copiar mensagem' }))
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith(expect.stringMatching(/^Não foi possível copiar a mensagem/)))
  })

  it('não oferece cópia enquanto a resposta ainda está em streaming', () => {
    render(<MessageItem message={{ ...reply, status: 'running' }} relatedConversation={undefined} onOpenRelatedConversation={vi.fn()} onNotice={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Copiar mensagem' })).not.toBeInTheDocument()
  })

  it('oferece cópia acessível na mensagem do usuário, junto do horário', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const mine: Message = { ...reply, id: 'mine', agentId: null, author: 'Você', role: 'user', text: 'Revise o README', runId: null }
    render(<MessageItem message={mine} relatedConversation={undefined} onOpenRelatedConversation={vi.fn()} onNotice={vi.fn()} />)
    const actions = screen.getByRole('group', { name: 'Ações da mensagem' })
    expect(actions.querySelector('time')).toHaveAttribute('datetime', mine.createdAt)
    fireEvent.click(screen.getByRole('button', { name: 'Copiar mensagem' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Revise o README'))
  })
})
