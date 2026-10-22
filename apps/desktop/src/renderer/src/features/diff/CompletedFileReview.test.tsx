import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { FileChange } from '../../../../shared/v9'
import { CompletedFileReview } from './CompletedFileReview'

const change: FileChange = {
  id: 'change-1', runId: 'run-1', messageId: 'message-1', toolCallId: 'tool-1',
  agentId: 'agent-1', workspaceId: 'workspace-1', path: 'src/main.ts',
  status: 'applied', before: 'const a = 1\n', after: 'const a = 2\n',
  additions: 1, deletions: 1, truncated: false, binary: false, createdAt: '',
}

describe('revisão de arquivos após a tarefa', () => {
  it('mostra um resumo compacto até o usuário expandir, sem falsa aprovação', () => {
    render(<CompletedFileReview changes={[change]} />)
    const trigger = screen.getByRole('button', { name: 'Revisar arquivos modificados' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('region', { name: 'Revisão de arquivos modificados' })).toHaveTextContent('1 arquivo modificado')
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const panel = screen.getByRole('region', { name: 'Revisão de arquivos modificados' })
    expect(panel).toHaveTextContent('src/main.ts')
    expect(panel).toHaveTextContent('+1')
    expect(screen.queryByText('1 arquivo alterado')).not.toBeInTheDocument()
    expect(screen.getAllByText('1 arquivo modificado')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /Reject all|Accept all|Rejeitar tudo|Aceitar tudo/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dispensar revisão' }))
    expect(screen.queryByRole('region', { name: 'Revisão de arquivos modificados' })).not.toBeInTheDocument()
  })
  it('ignora escritas sem confirmação', () => {
    const { container } = render(<CompletedFileReview changes={[{ ...change, status: 'failed' }]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
