import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Agent, Message, Run, Snapshot } from '../../../../shared/v9'
import { emptySnapshot } from '../app/appShellShared'
import { OfficePage } from './OfficePage'

const agent = (id: string, name: string, extra: Partial<Agent> = {}) => ({ id, name, alias: id, color: '#ffffff', avatar: '', ...extra }) as Agent
const agents = [agent('chief', 'Chief', { role: 'chief' }), agent('freya', 'Freya'), agent('mimir', 'Mimir')]
const runs = [{ id: 'r1', agentId: 'freya', conversationId: 'conv-freya', status: 'running', parentId: 'r0' }, { id: 'r0', agentId: 'chief', conversationId: 'conv-chief', status: 'running', parentId: null }] as Run[]
const messages = [{ id: 'm1', runId: 'r1', role: 'activity', text: 'Edição · src/app.ts', status: 'running', createdAt: '2026-10-31T00:00:00Z', tool: { name: 'workspace_write', status: 'running', startedAt: '2026-10-31T00:00:00Z' } }] as Message[]
const snapshot = { ...emptySnapshot, agents, runs, messages } as unknown as Snapshot

describe('Escritório', () => {
  it('mostra cada Boo na mesa com o estado real e abre onde ele trabalha', () => {
    const onOpenConversation = vi.fn(), onOpenAgent = vi.fn()
    const { container } = render(<OfficePage snapshot={snapshot} onOpenConversation={onOpenConversation} onOpenAgent={onOpenAgent} />)
    expect(screen.getByText(/1 trabalhando/)).toBeInTheDocument()
    const freya = screen.getByRole('button', { name: /Freya: Trabalhando\. Edição · src\/app\.ts/ })
    expect(freya.querySelector('svg.boo-work')).not.toBeNull()
    expect(container.querySelectorAll('.office__link')).toHaveLength(1)
    fireEvent.click(freya)
    expect(onOpenConversation).toHaveBeenCalledWith('conv-freya')
    fireEvent.click(screen.getByRole('button', { name: /Mimir: Livre/ }))
    expect(onOpenAgent).toHaveBeenCalledWith(agents[2])
  })
})
