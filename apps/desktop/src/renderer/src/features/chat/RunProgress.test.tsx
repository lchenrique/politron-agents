import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RunProgress } from './RunProgress'

describe('andamento real dos agentes', () => {
  it('mostra que o agente está trabalhando enquanto a execução roda', () => {
    render(<RunProgress status="running" agentName="Atlas" />)
    expect(screen.getByRole('status')).toHaveTextContent('Atlas está trabalhando…')
  })

  it('apresenta falha sem indicar conclusão', () => {
    render(<RunProgress status="failed" agentName="Atlas" />)
    expect(screen.getByRole('status')).toHaveTextContent('Execução falhou')
  })

  it('não mostra nada fora de execução ou falha: fila, espera, interrompida ou concluída ficam mudas aqui', () => {
    for (const status of ['completed', 'queued', 'waiting', 'interrupted'] as const) {
      const { container, unmount } = render(<RunProgress status={status} agentName="Atlas" />)
      expect(container).toBeEmptyDOMElement()
      unmount()
    }
  })
})
