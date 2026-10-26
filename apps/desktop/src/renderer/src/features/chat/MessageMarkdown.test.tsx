import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageLinkContext, MessageMarkdown, type MessageLinkHandlers } from './MessageMarkdown'

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

  it('no Desktop roteia URL para o navegador interno, Ctrl/Cmd+clique para o sistema e arquivos para o editor', () => {
    const handlers: MessageLinkHandlers = { openUrl: vi.fn(), openFile: vi.fn(), blocked: vi.fn() }
    render(<MessageLinkContext.Provider value={handlers}><MessageMarkdown>{'[Site](https://example.com/a) [Arquivo](src/My%20File.ts) [Fora](../segredo.txt) [Seção](#topo) [Mail](mailto:a@b.c)\n\n`src/codigo.ts`'}</MessageMarkdown></MessageLinkContext.Provider>)
    const site = screen.getByRole('link', { name: 'Site' })
    expect(site).not.toHaveAttribute('target')
    expect(fireEvent.click(site)).toBe(false)
    expect(handlers.openUrl).toHaveBeenLastCalledWith('https://example.com/a', 'internal')
    fireEvent.click(site, { ctrlKey: true })
    expect(handlers.openUrl).toHaveBeenLastCalledWith('https://example.com/a', 'external')
    fireEvent.click(site, { metaKey: true })
    expect(handlers.openUrl).toHaveBeenLastCalledWith('https://example.com/a', 'external')
    fireEvent.click(screen.getByRole('link', { name: 'Arquivo' }))
    expect(handlers.openFile).toHaveBeenCalledWith('src/My File.ts')
    fireEvent.click(screen.getByRole('link', { name: 'Fora' }))
    fireEvent.click(screen.getByRole('link', { name: 'Mail' }))
    expect(handlers.blocked).toHaveBeenCalledTimes(2)
    expect(handlers.openFile).toHaveBeenCalledTimes(1)
    const anchor = screen.getByRole('link', { name: 'Seção' })
    expect(fireEvent.click(anchor)).toBe(true)
    expect(anchor).toHaveAttribute('href', '#topo')
    // Código inline não vira link.
    expect(screen.getByText('src/codigo.ts').closest('a')).toBeNull()
  })

  it('sem roteamento do Desktop (PWA) mantém o link web em nova aba', () => {
    render(<MessageMarkdown>{'[Site](https://example.com)'}</MessageMarkdown>)
    expect(screen.getByRole('link', { name: 'Site' })).toHaveAttribute('target', '_blank')
  })
})
