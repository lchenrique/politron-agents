import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { InteractiveCardView } from './InteractiveCardView'
import type { InteractiveCard } from '../../../../shared/interactive-card'

afterEach(cleanup)

it('confirmação envia true/false e trava depois de enviar', async () => {
  const onAnswer = vi.fn(async () => undefined)
  render(<InteractiveCardView card={{ id: 'k', kind: 'confirm', title: 'Publicar?', confirmLabel: 'Publicar' }} onAnswer={onAnswer} />)
  fireEvent.click(screen.getByRole('button', { name: 'Publicar' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  await waitFor(() => expect(onAnswer).toHaveBeenCalledTimes(1))
  expect(onAnswer).toHaveBeenCalledWith({ status: 'answered', values: { confirmed: true } })
})

it('respostas rápidas enviam o id da opção', async () => {
  const onAnswer = vi.fn()
  render(<InteractiveCardView card={{ id: 'q', kind: 'quick-replies', title: 'Tom?', options: [{ id: 'f', label: 'Formal' }, { id: 'i', label: 'Informal' }] }} onAnswer={onAnswer} />)
  fireEvent.click(screen.getByRole('button', { name: 'Informal' }))
  await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({ status: 'answered', values: { choice: 'i' } }))
})

it('escolha múltipla respeita o limite e só envia com seleção válida', async () => {
  const onAnswer = vi.fn()
  const card: InteractiveCard = { id: 'm', kind: 'choice', title: 'Quais?', multiple: true, max: 1, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }
  render(<InteractiveCardView card={card} onAnswer={onAnswer} />)
  expect(screen.getByRole('button', { name: 'Enviar resposta' })).toBeDisabled()
  fireEvent.click(screen.getByLabelText('A')); fireEvent.click(screen.getByLabelText('B'))
  fireEvent.click(screen.getByRole('button', { name: 'Enviar resposta' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('de 0 a 1')
  expect(onAnswer).not.toHaveBeenCalled()
})

it('formulário valida obrigatório, usa campo password e esconde o secreto no cartão resolvido', async () => {
  const onAnswer = vi.fn()
  const card: InteractiveCard = { id: 'f', kind: 'form', title: 'Acesso', fields: [{ id: 'user', label: 'Usuário', required: true }, { id: 'pass', label: 'Senha', secret: true }] }
  const view = render(<InteractiveCardView card={card} onAnswer={onAnswer} />)
  expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password')
  fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Usuário')
  fireEvent.change(screen.getByLabelText(/Usuário/), { target: { value: 'ana' } })
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'segredo123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
  await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({ status: 'answered', values: { user: 'ana', pass: 'segredo123' } }))
  view.rerender(<InteractiveCardView card={card} resolved={{ status: 'answered', values: { user: 'ana', pass: 'segredo123' } }} onAnswer={onAnswer} />)
  expect(screen.getByRole('status')).toHaveTextContent('Usuário: ana')
  expect(document.body.textContent).not.toContain('segredo123')
})

it('dispensar e cartão expirado ficam somente leitura', async () => {
  const onAnswer = vi.fn()
  const view = render(<InteractiveCardView card={{ id: 'e', kind: 'confirm', title: 'Ok?' }} onAnswer={onAnswer} />)
  fireEvent.click(screen.getByRole('button', { name: 'Dispensar' }))
  await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({ status: 'dismissed' }))
  view.unmount()
  render(<InteractiveCardView card={{ id: 'e', kind: 'confirm', title: 'Ok?', expiresAt: '2020-01-01T00:00:00Z' }} onAnswer={onAnswer} />)
  expect(screen.getByRole('status')).toHaveTextContent('Expirado')
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

const gateCard: InteractiveCard = {
  id: 'gate-1', kind: 'choice', variant: 'decision-gate',
  title: 'Decisão Supervisionada Solicitada pelo Chief',
  badge: 'migrations/0042_slot_unique_idx.sql',
  text: 'Escolha a estratégia que deve ser aplicada:',
  confirmLabel: 'Aprovar & Executar',
  options: [
    { id: 'a', label: 'Opção A · Redis NX', description: 'Índice parcial CONCURRENTLY.', recommended: true },
    { id: 'b', label: 'Opção B · Advisory Lock', description: 'Zero mudança de schema.' },
  ],
}

it('cartão de decisão já vem na opção recomendada e mostra a ação primária', () => {
  render(<InteractiveCardView card={gateCard} onAnswer={vi.fn()} />)
  expect(screen.getByText('migrations/0042_slot_unique_idx.sql')).toBeTruthy()
  expect(screen.getByText('Recomendado')).toBeTruthy()
  const opcoes = screen.getAllByRole('radio')
  expect(opcoes).toHaveLength(2)
  expect(opcoes[0].getAttribute('aria-checked')).toBe('true')
  expect(opcoes[1].getAttribute('aria-checked')).toBe('false')
  expect(screen.getByRole('button', { name: /Aprovar & Executar Opção A/ })).toBeTruthy()
})

it('cartão de decisão envia a opção escolhida, e não a recomendada, quando o usuário troca', async () => {
  const onAnswer = vi.fn(async () => undefined)
  render(<InteractiveCardView card={gateCard} onAnswer={onAnswer} />)
  fireEvent.click(screen.getAllByRole('radio')[1])
  fireEvent.click(screen.getByRole('button', { name: /Aprovar & Executar Opção B/ }))
  await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({ status: 'answered', values: { choice: 'b' } }))
})

it('cartão de decisão resolvido fica somente leitura e mostra a opção aprovada', () => {
  render(<InteractiveCardView card={gateCard} resolved={{ status: 'answered', values: { choice: 'a' } }} onAnswer={vi.fn()} />)
  expect(screen.getByLabelText('Decisão registrada')).toBeTruthy()
  expect(screen.getByText(/Opção A · Redis NX/)).toBeTruthy()
  expect(screen.queryByRole('radio')).toBeNull()
})

it('cartão de decisão expõe a ação secundária só quando existe handler', () => {
  const { unmount } = render(<InteractiveCardView card={gateCard} onAnswer={vi.fn()} />)
  expect(screen.queryByRole('button', { name: /Inspecionar no Diff/ })).toBeNull()
  unmount()
  render(<InteractiveCardView card={gateCard} onAnswer={vi.fn()} onInspect={vi.fn()} />)
  expect(screen.getByRole('button', { name: /Inspecionar no Diff/ })).toBeTruthy()
})
