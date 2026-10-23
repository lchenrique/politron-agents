import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { PromptInput } from './prompt-input'

it('envia texto na PWA sem oferecer nem receber anexos indisponíveis e respeita IME', () => {
  const onSubmit = vi.fn()
  render(<PromptInput showAttachments={false} showModelPicker={false} textareaLabel="Mensagem para o Boo" defaultValue="Continua o trabalho" onSubmit={onSubmit} />)
  const textarea = screen.getByRole('textbox', { name: 'Mensagem para o Boo' })
  expect(screen.queryByRole('button', { name: 'Anexar arquivos' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Upload files')).not.toBeInTheDocument()
  fireEvent.paste(textarea, { clipboardData: { files: [new File(['imagem'], 'foto.png', { type: 'image/png' })] } })
  expect(screen.queryByText('foto.png')).not.toBeInTheDocument()
  fireEvent.keyDown(textarea, { key: 'Enter', isComposing: true, keyCode: 229 })
  expect(onSubmit).not.toHaveBeenCalled()
  fireEvent.keyDown(textarea, { key: 'Enter' })
  expect(onSubmit).toHaveBeenCalledWith('Continua o trabalho', expect.objectContaining({ files: [] }))
})
