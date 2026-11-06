import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PageShell } from './PageShell'
import { CONTENT_WIDTH_KEY, readContentWidth, setContentWidth } from './content-width'

const cssWidth = () => document.documentElement.style.getPropertyValue('--content-width')

describe('PageShell', () => {
  beforeEach(() => { localStorage.clear(); document.documentElement.style.removeProperty('--content-width') })
  afterEach(cleanup)

  it('mostra título, contexto e ações no cabeçalho, sem eyebrow', () => {
    const { container } = render(<PageShell title="Rotinas" subtitle="2 ativas" actions={<button type="button">Nova rotina</button>}><p>Corpo</p></PageShell>)
    expect(screen.getByRole('heading', { level: 1, name: 'Rotinas' })).toBeInTheDocument()
    expect(screen.getByText('2 ativas')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nova rotina' })).toBeInTheDocument()
    expect(container.querySelector('.ds-eyebrow')).toBeNull()
    expect(container.querySelector('[data-page-header]')).toHaveStyle({ height: 'var(--header-height)' })
  })

  it('usa a largura Média por padrão e aplica --content-width', () => {
    render(<PageShell title="Central"><p>Corpo</p></PageShell>)
    expect(readContentWidth()).toBe('medium')
    expect(cssWidth()).toBe('880px')
    expect(screen.getByRole('button', { name: /Largura do conteúdo: Média/ })).toBeInTheDocument()
  })

  it('restaura a largura salva em localStorage', () => {
    localStorage.setItem(CONTENT_WIDTH_KEY, 'wide')
    render(<PageShell title="Central"><p>Corpo</p></PageShell>)
    expect(cssWidth()).toBe('1080px')
    expect(screen.getByRole('button', { name: /Largura do conteúdo: Larga/ })).toBeInTheDocument()
  })

  it('ignora valor inválido salvo', () => {
    localStorage.setItem(CONTENT_WIDTH_KEY, 'gigante')
    expect(readContentWidth()).toBe('medium')
  })

  it('troca a largura pelo menu, salva e atualiza as demais páginas abertas', () => {
    render(<><PageShell title="A"><p>a</p></PageShell><PageShell title="B"><p>b</p></PageShell></>)
    fireEvent.keyDown(screen.getAllByRole('button', { name: /Largura do conteúdo/ })[0], { key: 'Enter' })
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Estreita/ }))
    expect(localStorage.getItem(CONTENT_WIDTH_KEY)).toBe('narrow')
    expect(cssWidth()).toBe('720px')
    expect(screen.getAllByRole('button', { name: /Largura do conteúdo: Estreita/ })).toHaveLength(2)
  })

  it('Total remove o limite da coluna', () => {
    render(<PageShell title="A"><p>a</p></PageShell>)
    act(() => setContentWidth('full'))
    expect(parseInt(cssWidth(), 10)).toBeGreaterThanOrEqual(10000)
  })

  it('variante wide mantém o cabeçalho, sem coluna centralizada nem controle de largura', () => {
    const { container } = render(<PageShell title="Board" wide><p>Colunas</p></PageShell>)
    expect(container.querySelector('[data-page-shell]')).toHaveAttribute('data-variant', 'wide')
    expect(screen.getByRole('heading', { level: 1, name: 'Board' })).toBeInTheDocument()
    expect(container.querySelector('.ds-content')).toBeNull()
    expect(screen.queryByRole('button', { name: /Largura do conteúdo/ })).toBeNull()
  })
})
