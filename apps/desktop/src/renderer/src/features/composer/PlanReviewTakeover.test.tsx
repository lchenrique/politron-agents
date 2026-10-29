import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { Approval } from '../../../../shared/v9'
import { ComposerTakeover } from './ComposerTakeover'

const plan: Approval = {
  id: 'plan-1', runId: 'run-1', conversationId: 'chat-1', agentId: 'boo-1', kind: 'plan',
  details: { planTitle: 'Lançar recurso', planSteps: ['Mapear arquivos', 'Implementar interface', 'Validar fluxos'] },
  status: 'pending', createdAt: '2026-10-29T12:00:00.000Z', resolvedAt: null,
}
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('mostra o plano completo sob demanda e envia feedback de mudança sem aceitar comentário vazio', async () => {
  const reviewPlan = vi.fn(async () => undefined)
  vi.stubGlobal('appAPI', { reviewPlan })
  render(<ComposerTakeover approval={plan} onNotice={vi.fn()} canApprove />)

  expect(screen.getByRole('region', { name: 'Revisão do plano' })).toBeInTheDocument()
  expect(screen.getByText('Lançar recurso')).toBeInTheDocument()
  expect(screen.queryByText('Implementar interface')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Ver plano completo' }))
  expect(screen.getByText('Implementar interface')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Pedir mudanças' }))
  fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido de mudanças' }))
  expect(screen.getByText('Descreva o que deve mudar no plano.')).toBeInTheDocument()
  fireEvent.change(screen.getByRole('textbox', { name: 'O que precisa mudar?' }), { target: { value: 'Inclua testes.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido de mudanças' }))
  await waitFor(() => expect(reviewPlan).toHaveBeenCalledWith('plan-1', 'request_changes', 'Inclua testes.'))
})

it('permite aprovar e recusar com decisões distintas', async () => {
  const reviewPlan = vi.fn(async () => undefined)
  vi.stubGlobal('appAPI', { reviewPlan })
  const view = render(<ComposerTakeover approval={plan} onNotice={vi.fn()} canApprove />)
  fireEvent.click(screen.getByRole('button', { name: 'Recusar' }))
  await waitFor(() => expect(reviewPlan).toHaveBeenCalledWith('plan-1', 'reject', undefined))

  view.unmount()
  render(<ComposerTakeover approval={{ ...plan, id: 'plan-2' }} onNotice={vi.fn()} canApprove />)
  fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }))
  await waitFor(() => expect(reviewPlan).toHaveBeenCalledWith('plan-2', 'approve', undefined))
})

it('mantém o formulário utilizável após falha e informa o motivo', async () => {
  const reviewPlan = vi.fn(async () => { throw new Error('Falha ao salvar revisão.') })
  const onNotice = vi.fn()
  vi.stubGlobal('appAPI', { reviewPlan })
  render(<ComposerTakeover approval={plan} onNotice={onNotice} canApprove />)
  fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }))
  await waitFor(() => expect(onNotice).toHaveBeenCalledWith('Falha ao salvar revisão.'))
  expect(screen.getByRole('button', { name: 'Aprovar' })).toBeEnabled()
})
