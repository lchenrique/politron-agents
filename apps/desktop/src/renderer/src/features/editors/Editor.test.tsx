import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Agent } from '../../../../shared/v9'
import { Editor } from './Editor'

const agent = (id: string, name: string): Agent => ({
  id, name, alias: name.toLowerCase(), description: 'Especialista', instructions: 'Instruções do agente',
  runtime: 'codex', model: '', color: '#7565e8', avatar: '', canWrite: false, computerUse: false, approvalMode: 'ask',
  revision: 1, createdAt: '2026-10-16T12:00:00.000Z',
})

const renderEditor = (agents: Agent[] = [], projectId: string | null = null) => {
  const onSave = vi.fn().mockResolvedValue(undefined)
  render(<Editor kind="conversation" agents={agents} models={[]} projectId={projectId} onClose={vi.fn()} onSave={onSave} onPickFolder={vi.fn().mockResolvedValue(null)} />)
  return onSave
}

describe('criação simples de conversa', () => {
  it('usa o Assistente quando nenhum agente é selecionado', async () => {
    const onSave = renderEditor([], 'project-1')
    expect(screen.getByText('Assistente padrão selecionado')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Criar conversa' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'project-1', kind: 'direct', agentIds: [] })))
  })

  it('exige nome e participantes ao criar um grupo', async () => {
    const onSave = renderEditor([agent('a', 'Alice'), agent('b', 'Beto')])
    const participants = screen.getAllByRole('checkbox')
    fireEvent.click(participants[0])
    fireEvent.click(participants[1])
    expect(screen.getByText('Conversa em grupo. Dê um nome para continuar.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Criar grupo' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Nome da conversa'), { target: { value: 'Revisão' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar grupo' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ kind: 'group', name: 'Revisão', agentIds: ['a', 'b'] })))
  })
})
