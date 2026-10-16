import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { emptySnapshot } from '../app/appShellShared'
import type { Agent, Project, Snapshot } from '../../../../shared/v9'
import { Sidebar } from './Sidebar'

const agent: Agent = { id: 'agent-1', name: 'Lyra', alias: 'lyra', description: '', instructions: 'Ajude.', runtime: 'codex', model: '', color: '#7565e8', avatar: '', canWrite: false, computerUse: false, revision: 1, createdAt: '2026-10-16T12:00:00.000Z' }
const project: Project = { id: 'project-1', name: 'Instruções de Paz', directory: null, instructions: '', defaultAgentIds: [], revision: 1, archived: false, createdAt: '2026-10-16T12:00:00.000Z' }
const snapshot: Snapshot = { ...emptySnapshot, agents: [agent], projects: [project] }

function renderSidebar(overrides: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  return render(<Sidebar snapshot={snapshot} selected={undefined} unreadCounts={{}} agentStates={{}} onSelectConversation={vi.fn()} onStartConversation={vi.fn()} onOpenAgent={vi.fn()} onOpenEditor={vi.fn()} onOpenSettings={vi.fn()} onNotice={vi.fn()} {...overrides} />)
}

describe('contatos de agentes na barra lateral', () => {
  it('abre a conversa direta ao selecionar um agente', () => {
    const onOpenAgent = vi.fn()
    renderSidebar({ onOpenAgent })
    fireEvent.click(screen.getByRole('button', { name: /Lyra @lyra/ }))
    expect(onOpenAgent).toHaveBeenCalledWith(agent)
  })

  it('inicia a conversa do projeto pelo seletor de participantes', () => {
    const onOpenEditor = vi.fn()
    renderSidebar({ onOpenEditor })
    fireEvent.click(screen.getByRole('button', { name: 'Nova conversa em Instruções de Paz' }))
    expect(onOpenEditor).toHaveBeenCalledWith({ kind: 'conversation', projectId: project.id })
  })
})
