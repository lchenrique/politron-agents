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
  it('encaminha a aprovação ao backend uma vez e aguarda evento antes de confirmar', async () => {
    const respondApproval = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('appAPI', { respondApproval })
    const notice = vi.fn()
    const { rerender } = render(<PolitronToolApproval approval={browserApproval} onNotice={notice} />)

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }))
    await waitFor(() => expect(respondApproval).toHaveBeenCalledExactlyOnceWith('approval-browser', true))
    expect(screen.getByRole('status')).toHaveTextContent('Enviando sua decisão')
    const outgoing = screen.queryByRole('button', { name: 'Aprovar' })
    if (outgoing) fireEvent.click(outgoing) // A animação de saída não pode reenviar a decisão.
    expect(respondApproval).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Aprovada')).not.toBeInTheDocument()

    rerender(<PolitronToolApproval approval={{ ...browserApproval, status: 'approved', resolvedAt: '2026-10-17T01:00:00Z' }} onNotice={notice} />)
    expect(screen.getByRole('status')).toHaveTextContent('Aprovada')
    expect(screen.getByText('Autorizada')).toBeInTheDocument()
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

  it('exige pressionamento prolongado para sobrescrever arquivo e não permite autorização permanente', () => {
    const respondApproval = vi.fn()
    vi.stubGlobal('appAPI', { respondApproval })
    render(<PolitronToolApproval approval={{
      ...browserApproval, kind: 'write',
      details: { path: 'notes.md', before: 'antigo', after: 'novo' },
    }} onNotice={vi.fn()} />)

    const confirm = screen.getByRole('button', { name: 'Mantenha pressionado para aprovar' })
    fireEvent.click(confirm)
    expect(respondApproval).not.toHaveBeenCalled()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByText('Confirmação adicional obrigatória')).toBeInTheDocument()
  })
})
