import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RunProgress } from './RunProgress'

describe('andamento real dos agentes', () => {
  it('mostra apenas uma etapa verificada, sem dados da demo', () => {
    render(<RunProgress status="running" agentName="Atlas" hasText={false} />)
    expect(screen.getByRole('region', { name: 'Estado de execução do agente' })).toHaveTextContent('Atlas está executando a tarefa')
    expect(screen.getByText('Aguardando resposta do agente')).toBeInTheDocument()
    expect(screen.queryByText(/Searching the web|Reading 4 sources/i)).not.toBeInTheDocument()
  })

  it('apresenta falha sem indicar conclusão', () => {
    render(<RunProgress status="failed" agentName="Atlas" hasText />)
    expect(screen.getByRole('region', { name: 'Estado de execução do agente' })).toHaveTextContent('Execução falhou')
  })

  it('não mostra progresso animado após execução ou durante aprovação', () => {
    const { container, rerender } = render(<RunProgress status="completed" agentName="Atlas" hasText />)
    expect(container).toBeEmptyDOMElement()
    rerender(<RunProgress status="waiting" agentName="Atlas" hasText={false} />)
    expect(container).toBeEmptyDOMElement()
  })
})
