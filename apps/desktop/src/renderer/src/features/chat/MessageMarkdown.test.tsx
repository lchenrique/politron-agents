import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageMarkdown } from './MessageMarkdown'

const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
afterEach(() => {
  if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard)
  else Reflect.deleteProperty(navigator, 'clipboard')
})

describe('Markdown compartilhado do chat', () => {
  it('renderiza listas, tabela acessível, links e copia o código pelo componente Pasta', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<MessageMarkdown>{'## Entrega\n\n**Pronto** com `TypeScript`.\n\n- Layout\n- Boos\n\n| Recurso | Estado |\n| --- | --- |\n| Chat | Pronto |\n\n```typescript\nconst marca = "Boobot";\n```\n\n[Documentação](https://example.com)'}</MessageMarkdown>)
    expect(screen.getByRole('heading', { name: 'Entrega', level: 2 })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('region', { name: 'Tabela da resposta' })).toContainElement(screen.getByRole('table'))
    expect(screen.getByRole('link', { name: 'Documentação' })).toHaveAttribute('rel', 'noopener noreferrer')
    fireEvent.click(screen.getByRole('button', { name: 'Copiar código' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('const marca = "Boobot";'))
    expect(await screen.findByRole('button', { name: 'Código copiado' })).toBeInTheDocument()
  })

  it('mantém HTML e URLs executáveis inertes', () => {
    const { container } = render(<MessageMarkdown>{'<script>alert(1)</script>\n\n[Perigoso](javascript:alert%281%29)'}</MessageMarkdown>)
    expect(container.querySelector('script')).toBeNull()
    expect(screen.getByText('Perigoso').closest('a')?.getAttribute('href') || '').not.toMatch(/^javascript:/i)
  })
})
