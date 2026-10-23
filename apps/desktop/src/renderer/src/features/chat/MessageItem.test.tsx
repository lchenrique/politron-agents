import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { Message } from '../../../../shared/v9'

const voice = vi.hoisted(() => ({ speakVoice: vi.fn(async () => undefined), stopVoice: vi.fn() }))
vi.mock('../voice/voice-player', () => voice)
import { MessageItem } from './MessageItem'

it('o botão Ouvir usa o ID persistido do Boo mesmo sem o perfil carregado', async () => {
  const message = { id: 'reply', agentId: 'boo-brigid', author: 'brigid', role: 'assistant', status: 'completed', text: 'Olá, posso ajudar!' } as Message
  render(<MessageItem message={message} relatedConversation={undefined} onOpenRelatedConversation={vi.fn()} onNotice={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Ouvir resposta do agente' }))
  await waitFor(() => expect(voice.speakVoice).toHaveBeenCalledWith(message.text, expect.any(Function), { agentId: 'boo-brigid' }))
})
