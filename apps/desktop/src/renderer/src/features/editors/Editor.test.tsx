import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => { Element.prototype.scrollIntoView = vi.fn() })
import type { Agent } from '../../../../shared/v9'
import { Editor } from './Editor'

const agent = (id: string, name: string): Agent => ({
  id, name, alias: name.toLowerCase(), description: 'Especialista', instructions: 'Instruções do agente',
  runtime: 'codex', model: '', color: '#7565e8', avatar: '', canWrite: false, computerUse: false, approvalMode: 'ask',
  revision: 1, createdAt: '2026-10-16T12:00:00.000Z',
})

const renderEditor = (agents: Agent[] = [], workspaceId: string | null = null) => {
  const onSave = vi.fn().mockResolvedValue(undefined)
  render(<Editor kind="conversation" agents={agents} models={[]} workspaceId={workspaceId} onClose={vi.fn()} onSave={onSave} onPickFolder={vi.fn().mockResolvedValue(null)} />)
  return onSave
}

describe('criação simples de conversa', () => {
  it('usa o Assistente quando nenhum agente é selecionado', async () => {
    const onSave = renderEditor([], 'workspace-1')
    expect(screen.getByText('Assistente padrão selecionado')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Criar conversa' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'workspace-1', kind: 'direct', agentIds: [] })))
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
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ kind: 'group', name: 'Revisão', agentIds: ['a', 'b'], responseMode: 'leader', leaderAgentId: 'a' })))
  })

  it('permite escolher o Jev para responder sem menção e mantém o líder como fallback', async () => {
    const onSave = renderEditor([agent('a', 'Alice'), agent('b', 'Beto')])
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.click(screen.getAllByRole('checkbox')[1])
    fireEvent.change(screen.getByLabelText('Nome da conversa'), { target: { value: 'Equipe' } })
    const mode = screen.getByRole('combobox', { name: 'Quem responde sem menção?' })
    fireEvent.click(mode)
    fireEvent.click(await screen.findByRole('option', { name: 'Automático · Jev pelo OpenRouter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Criar grupo' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ responseMode: 'auto', leaderAgentId: 'a' })))
  })
})

describe('editor de agentes com Poli Studio', () => {
  it('oculta esforço em Haiku sem essa capacidade e salva sem esforço', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const initial: Agent = { ...agent('haiku-agent', 'Haiku'), runtime: 'claude', model: 'haiku', effort: 'max' }
    render(<Editor kind="agent" agents={[]} models={[
      { id: 'claude:haiku', name: 'Haiku', runtime: 'claude', isDefault: false, supportedEfforts: [] },
    ]} initial={initial} onClose={vi.fn()} onSave={onSave} onPickFolder={vi.fn().mockResolvedValue(null)} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Modelo e permissões' }))
    expect(screen.queryByRole('combobox', { name: 'Esforço' })).not.toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
    expect(initial.effort).toBe('max')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ model: 'haiku', effort: undefined })))
  })

  it('limita esforço ao modelo padrão do motor e normaliza o valor incompatível ao salvar', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const initial: Agent = { ...agent('codex-agent', 'Codex'), effort: 'max' }
    render(<Editor kind="agent" agents={[]} models={[
      { id: 'codex:gpt', name: 'GPT', runtime: 'codex', isDefault: true, supportedEfforts: ['low', 'high'], defaultEffort: 'high' },
    ]} initial={initial} onClose={vi.fn()} onSave={onSave} onPickFolder={vi.fn().mockResolvedValue(null)} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Modelo e permissões' }))
    const effort = screen.getByRole('combobox', { name: 'Esforço' })
    expect(effort).toHaveTextContent('Alto')
    fireEvent.click(effort)
    expect(await screen.findByRole('option', { name: 'Baixo' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Alto' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Máximo' })).not.toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('option', { name: 'Alto' }), { key: 'Escape' })
    expect(onSave).not.toHaveBeenCalled()
    expect(initial.effort).toBe('max')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ model: '', effort: 'high' })))
  })

  it('envia o papel de Chief ao salvar um agente existente', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<Editor kind="agent" agents={[]} models={[]} initial={agent('agent-1', 'Atlas')} onClose={vi.fn()} onSave={onSave} onPickFolder={vi.fn().mockResolvedValue(null)} />)
    const role = screen.getByRole('combobox', { name: 'Papel do agente' })
    fireEvent.click(role)
    fireEvent.click(await screen.findByRole('option', { name: 'Chief coordenador' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-1', name: 'Atlas', role: 'chief' })))
  })

  it('envia configurações personalizadas junto com o agente', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<Editor kind="agent" agents={[]} models={[]} initial={agent('poli-1', 'Poli')} onClose={vi.fn()} onSave={onSave} onPickFolder={vi.fn().mockResolvedValue(null)} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Aparência' }))
    expect(screen.getByText('Boo Studio')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Escolher cor #4098eb' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Animação' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ativar animações' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      id: 'poli-1', color: '#4098eb', pitsAnimate: false, pitsShape: 'round',
    })))
  })
})
