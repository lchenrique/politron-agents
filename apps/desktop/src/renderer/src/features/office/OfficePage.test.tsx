import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Agent, Message, Run, Snapshot } from '../../../../shared/v9'
import { emptySnapshot } from '../app/appShellShared'
import { OfficePage } from './OfficePage'

const agent = (id: string, name: string, extra: Partial<Agent> = {}) => ({ id, name, alias: id, color: '#ffffff', avatar: '', ...extra }) as Agent
const agents = [agent('chief', 'Chief', { role: 'chief' }), agent('freya', 'Freya'), agent('mimir', 'Mimir')]
const runs = [{ id: 'r1', agentId: 'freya', conversationId: 'conv-freya', status: 'running', parentId: 'r0' }, { id: 'r0', agentId: 'chief', conversationId: 'conv-chief', status: 'waiting', parentId: null }] as Run[]
const messages = [{ id: 'm1', runId: 'r1', role: 'activity', text: 'Edição · src/app.ts', status: 'running', createdAt: '2026-10-31T00:00:00Z', tool: { name: 'workspace_write', status: 'running', startedAt: '2026-10-31T00:00:00Z' } }] as Message[]
const snapshot = { ...emptySnapshot, agents, runs, messages } as unknown as Snapshot

describe('Escritório vivo', () => {
  it('põe cada Boo na sala com o estado real: digitando na mesa, alerta de aprovação e livre pela sala', () => {
    const onOpenConversation = vi.fn(), onOpenAgent = vi.fn()
    const { container } = render(<OfficePage snapshot={snapshot} onOpenConversation={onOpenConversation} onOpenAgent={onOpenAgent} />)
    expect(screen.getByText(/1 trabalhando · 1 aguardando você · 1 livre/)).toBeInTheDocument()
    const freya = screen.getByRole('button', { name: /Freya: Trabalhando\. Edição · src\/app\.ts/ })
    expect(freya).toHaveAttribute('data-mode', 'desk')
    expect(freya.querySelector('svg.boo-work')).not.toBeNull()
    expect(container.querySelectorAll('.office__alert-badge')).toHaveLength(1)
    expect(screen.getByText('app.ts', { exact: false })).toBeInTheDocument()
    fireEvent.click(freya)
    expect(onOpenConversation).toHaveBeenCalledWith('conv-freya')
    const mimir = screen.getByRole('button', { name: /Mimir: Livre/ })
    expect(mimir.getAttribute('data-mode')).not.toBe('desk')
    fireEvent.keyDown(mimir, { key: 'Enter' })
    expect(onOpenAgent).toHaveBeenCalledWith(agents[2])
  })
})
