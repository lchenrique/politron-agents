import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Agent, Message, Run } from '../../../../shared/v9'
import { BooWorkPanel } from './BooWorkPanel'

vi.mock('../realtime/RealtimeCall', () => ({ RealtimeCall: () => <span>Controles de áudio</span> }))
beforeEach(() => vi.stubGlobal('realtimeAPI', { onEvent: vi.fn() }))
const agent = { id: 'a1', name: 'Boo', alias: 'boo', color: '#ffffff', avatar: '', description: '' } as Agent
const run = { id: 'r1', agentId: 'a1', conversationId: 'c1', status: 'running' } as Run
const tool = { id: 'm1', agentId: 'a1', conversationId: 'c1', runId: 'r1', role: 'activity', status: 'running', text: 'Edição · src/index.ts', createdAt: '', tool: { name: 'workspace_write', path: 'src/index.ts', status: 'running', startedAt: '' } } as Message
const base = { agents: [agent], selectedAgents: [agent], conversationId: 'c1', runs: [run], messages: [tool] }

describe('Boo ao vivo na mesma conversa', () => {
  it('mostra a edição real e abre seu arquivo; não mantém o gesto após terminar a ferramenta', async () => {
    const open = vi.fn()
    const { container, rerender } = render(<BooWorkPanel {...base} onOpenFile={open} />)
    expect(container.querySelector('svg.boo')).toHaveAttribute('data-mood', 'coding')
    expect(screen.getByText('Atividade em andamento')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir arquivo' }))
    expect(open).toHaveBeenCalledWith('src/index.ts')
    rerender(<BooWorkPanel {...base} messages={[{ ...tool, status: 'completed', tool: { ...tool.tool!, status: 'completed' } }]} />)
    expect(container.querySelector('svg.boo')).toHaveAttribute('data-mood', 'thinking')
    expect(screen.getByText('Última atividade')).toBeInTheDocument()
    await screen.findByText('Controles de áudio')
  })

  it('não mostra ferramentas ou gestos de outra conversa', async () => {
    const { container } = render(<BooWorkPanel {...base} conversationId="c2" />)
    expect(container.querySelector('svg.boo')).toHaveAttribute('data-mood', 'idle')
    expect(screen.queryByText('Atividade em andamento')).not.toBeInTheDocument()
    await screen.findByText('Controles de áudio')
  })

  it('envia texto somente para o agente e a conversa visíveis e bloqueia envio duplicado', async () => {
    let finish!: () => void
    const send = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    render(<BooWorkPanel {...base} onSendMessage={send} />)
    const field = screen.getByRole('textbox', { name: 'Mensagem para o Boo' })
    fireEvent.change(field, { target: { value: '  Ajuste o arquivo  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar ao Boo' }))
    expect(send).toHaveBeenCalledExactlyOnceWith('c1', 'a1', 'Ajuste o arquivo')
    expect(screen.getByRole('button', { name: 'Enviar ao Boo' })).toBeDisabled()
    await act(async () => finish())
    await waitFor(() => expect(field).toHaveValue(''))
  })

  it('não oferece envio sem autorização do shell', async () => {
    render(<BooWorkPanel {...base} />)
    expect(screen.getByRole('textbox', { name: 'Mensagem para o Boo' })).toBeDisabled()
    await screen.findByText('Controles de áudio')
  })
})
