import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Approval } from '../../../../shared/v9'
import { PolitronToolApproval } from './PolitronToolApproval'

const browserApproval: Approval = {
  id: 'approval-browser', runId: 'run-1', conversationId: 'conversation-1',
  agentId: 'atlas', kind: 'browser', details: { action: 'Abrir uma página de teste' },
  status: 'pending', createdAt: '', resolvedAt: null,
}

afterEach(() => vi.unstubAllGlobals())

describe('aprovações reais do Politron', () => {
  it('mostra a proposta de escrita antes da decisão e distingue interrupção de negação', async () => {
    const approval: Approval = { ...browserApproval, kind: 'write', details: { path: 'notes.md', before: 'antigo', after: 'novo' } }
    const { rerender } = render(<PolitronToolApproval approval={approval} onNotice={vi.fn()} />)
    expect(screen.getByText('Aguardando sua decisão')).toBeInTheDocument()
    expect(screen.getAllByText('notes.md').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Expand notes.md' }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Aprovação de ferramenta' })).toHaveTextContent('novo'))
    rerender(<PolitronToolApproval approval={{ ...approval, status: 'interrupted' }} onNotice={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('Interrompida')
    expect(screen.queryByText('Negada')).not.toBeInTheDocument()
  })

  it('desabilita as decisões enquanto envia e evita uma segunda solicitação', async () => {
    let resolve!: () => void
    const respondApproval = vi.fn(() => new Promise<void>(done => { resolve = done }))
    vi.stubGlobal('appAPI', { respondApproval })
    render(<PolitronToolApproval approval={browserApproval} onNotice={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }))
    expect(screen.getByRole('button', { name: 'Negar' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Negar' }))
    expect(respondApproval).toHaveBeenCalledTimes(1)
    resolve()
  })

  it('encaminha a aprovação ao backend uma vez e aguarda evento antes de confirmar', async () => {
    const respondApproval = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('appAPI', { respondApproval })
    const notice = vi.fn()
    const { rerender } = render(<PolitronToolApproval approval={browserApproval} onNotice={notice} />)

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }))
    await waitFor(() => expect(respondApproval).toHaveBeenCalledExactlyOnceWith('approval-browser', true))
    expect(screen.getByRole('status')).toHaveTextContent('Enviando sua decisão')

    rerender(<PolitronToolApproval approval={{ ...browserApproval, status: 'approved', resolvedAt: '2026-10-17T01:00:00Z' }} onNotice={notice} />)
    expect(screen.getByRole('status')).toHaveTextContent('Aprovada')
    expect(screen.queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument()
    expect(notice).not.toHaveBeenCalled()
  })

  it('nega apenas ao clicar em Negar; pressionar Esc não decide', async () => {
    const respondApproval = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('appAPI', { respondApproval })
    render(<PolitronToolApproval approval={browserApproval} onNotice={vi.fn()} />)
    fireEvent.keyDown(screen.getByRole('region', { name: 'Aprovação de ferramenta' }), { key: 'Escape' })
    expect(respondApproval).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Negar' }))
    await waitFor(() => expect(respondApproval).toHaveBeenCalledExactlyOnceWith('approval-browser', false))
  })

  it('libera a decisão para nova tentativa quando o backend recusa a solicitação', async () => {
    const respondApproval = vi.fn().mockRejectedValueOnce(new Error('Falha de comunicação')).mockResolvedValueOnce(undefined)
    vi.stubGlobal('appAPI', { respondApproval })
    const notice = vi.fn()
    render(<PolitronToolApproval approval={browserApproval} onNotice={notice} />)
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }))
    await waitFor(() => expect(notice).toHaveBeenCalledWith(expect.stringContaining('Falha de comunicação')))
    expect(screen.getByRole('status')).toHaveTextContent('Aguardando sua decisão')
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }))
    await waitFor(() => expect(respondApproval).toHaveBeenCalledTimes(2))
  })

  it('exige dois cliques para aprovar uma escrita que sobrescreve conteúdo existente', async () => {
    const respondApproval = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('appAPI', { respondApproval })
    render(<PolitronToolApproval approval={{
      ...browserApproval, kind: 'write',
      details: { path: 'notes.md', before: 'antigo', after: 'novo' },
    }} onNotice={vi.fn()} />)

    const first = screen.getByRole('button', { name: 'Confirmar e aprovar' })
    fireEvent.click(first)
    expect(respondApproval).not.toHaveBeenCalled()
    expect(screen.getByText('Confirmação adicional obrigatória')).toBeInTheDocument()
    const second = screen.getByRole('button', { name: /Aprovar mesmo assim/ })
    fireEvent.click(second)
    await waitFor(() => expect(respondApproval).toHaveBeenCalledExactlyOnceWith('approval-browser', true))
  })

  it('negar continua em um clique mesmo numa ação sensível', async () => {
    const respondApproval = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('appAPI', { respondApproval })
    render(<PolitronToolApproval approval={{ ...browserApproval, kind: 'command', details: { command: 'rm -rf dist', cwd: 'D:/projeto' } }} onNotice={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Negar' }))
    await waitFor(() => expect(respondApproval).toHaveBeenCalledExactlyOnceWith('approval-browser', false))
  })
})
