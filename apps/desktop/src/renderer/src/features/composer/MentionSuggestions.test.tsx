import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Agent } from '../../../../shared/v9'
import { MentionSuggestions } from './MentionSuggestions'

const agent = { id: 'atlas', name: 'Atlas', alias: 'atlas', color: '#786bea', avatar: '' } as Agent

describe('sugestões de agentes', () => {
  it('mostra nome e alias reais e seleciona a opção por clique', () => {
    const onSelect = vi.fn()
    render(<MentionSuggestions id="mentions" agents={[agent]} activeIndex={0} onSelect={onSelect} />)
    expect(screen.getByRole('listbox', { name: 'Mencionar agente' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: /Atlas.*@atlas/ }))
    expect(onSelect).toHaveBeenCalledWith(agent)
  })

  it('informa quando nenhum participante corresponde à busca', () => {
    render(<MentionSuggestions id="mentions" agents={[]} activeIndex={0} onSelect={vi.fn()} />)
    expect(screen.getByText('Nenhum participante encontrado')).toBeInTheDocument()
  })
})
