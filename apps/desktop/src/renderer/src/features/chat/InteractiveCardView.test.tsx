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
