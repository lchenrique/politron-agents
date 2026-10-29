import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AgentInteractionCard } from './AgentInteractionCard'
import type { Approval } from '../../../../shared/v9'

const base: Approval = {
  id: 'q-1', runId: 'run', conversationId: 'chat', agentId: 'agent',
  kind: 'question', details: { question: 'Qual biblioteca?', options: ['React', 'Vue'] },
  status: 'pending', createdAt: '2026-10-22', resolvedAt: null,
}
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('apresenta opções, envia escolha única ao backend e mostra resposta persistida', async () => {
  const answerQuestion = vi.fn(async () => undefined)
  vi.stubGlobal('appAPI', { answerQuestion })
  const notice = vi.fn()
  const view = render(<AgentInteractionCard approval={base} onNotice={notice} />)
  expect(screen.getByText('Qual biblioteca?')).toBeInTheDocument()
  fireEvent.click(screen.getByText('Vue'))
  fireEvent.click(screen.getByRole('button', { name: /Enviar resposta/ }))
  await waitFor(() => expect(answerQuestion).toHaveBeenCalledWith('q-1', 'Vue'))
  view.rerender(<AgentInteractionCard approval={{ ...base, status: 'approved', details: { ...base.details, answer: 'Vue' } }} onNotice={notice} />)
  expect(screen.getByText('Resposta: Vue')).toBeInTheDocument()
})

it('marca a opção recomendada sem remover as outras escolhas', () => {
  render(<AgentInteractionCard approval={{ ...base, details: { ...base.details, recommendedOption: 'Vue' } }} onNotice={vi.fn()} />)
  expect(screen.getByText('Recomendado')).toBeInTheDocument()
  expect(screen.getByText('Vue')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /React/ })).toBeInTheDocument()
})

it('apresenta plano visual sem botões falsos de executar ou editar', () => {
  render(<AgentInteractionCard approval={{ ...base, kind: 'plan', status: 'approved',
    details: { planTitle: 'Migrar app', planSteps: ['Analisar arquivos', 'Executar testes'] } }} onNotice={vi.fn()} />)
  expect(screen.getByText('Migrar app')).toBeInTheDocument()
  expect(screen.getByText('Analisar arquivos')).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Plano registrado')
  expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
})

it('registra resultado de aprovação e feedback de mudanças na transcrição', () => {
  render(<AgentInteractionCard approval={{ ...base, kind: 'plan', status: 'denied',
    details: { planTitle: 'Migrar app', planSteps: ['Analisar arquivos'], planReviewDecision: 'request_changes', planReviewFeedback: 'Inclua testes.' } }} onNotice={vi.fn()} />)
  expect(screen.getByRole('status')).toHaveTextContent('Alterações solicitadas')
  expect(screen.getByText('Pedido de mudanças: Inclua testes.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument()
})
