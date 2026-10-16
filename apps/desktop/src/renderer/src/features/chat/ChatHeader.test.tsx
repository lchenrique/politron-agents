import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Agent, Conversation, Model } from '../../../../shared/v9'
import { ChatHeader } from './ChatHeader'

const agent: Agent = { id: 'a1', name: 'Lyra', alias: 'lyra', description: '', instructions: '', runtime: 'codex', model: '', color: '#7565e8', avatar: '', canWrite: false, computerUse: false, approvalMode: 'ask', revision: 1, createdAt: '2026-10-16T12:00:00.000Z' }
const conversation: Conversation = { id: 'c1', kind: 'direct', name: 'Planejamento', agentIds: ['a1'], workspaceId: 'ws1', titleAuto: false, revision: 1, archived: false, createdAt: '2026-10-16T12:00:00.000Z' }
const models: Model[] = [{ id: 'codex:model-1', name: 'Codex Fast', runtime: 'codex', isDefault: true }, { id: 'codex:model-2', name: 'Codex Deep', runtime: 'codex', isDefault: false }]

describe('cabeçalho da conversa', () => {
  it('permite remover e adicionar participantes para os próximos envios', () => {
    const onParticipantsChange = vi.fn()
    render(<ChatHeader selected={conversation} selectedAgents={[agent]} agents={[agent]} selectedWorkspace={undefined} models={models} modelName="Codex Fast" onModelChange={vi.fn()} onParticipantsChange={onParticipantsChange} onOpenComputerUse={vi.fn()} onEditConversation={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remover Lyra' }))
    expect(onParticipantsChange).toHaveBeenCalledWith([])
  })

  it('expõe o modelo atual no seletor do cabeçalho', () => {
    const onModelChange = vi.fn()
    render(<ChatHeader selected={conversation} selectedAgents={[agent]} agents={[agent]} selectedWorkspace={undefined} models={models} modelName="Codex Fast" onModelChange={onModelChange} onParticipantsChange={vi.fn()} onOpenComputerUse={vi.fn()} onEditConversation={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Modelo da conversa' }), { target: { value: 'Codex Deep' } })
    expect(onModelChange).toHaveBeenCalledWith('Codex Deep')
  })
})
