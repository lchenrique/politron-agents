import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

describe('permissões do motor no perfil do agente', () => {
  it.each([
    ['codex', 'Permissões do Codex', 'Acesso total · full access do Codex'],
    ['claude', 'Permissões do Claude Code', 'Acesso total · bypass do Claude Code'],
  ] as const)('oferece e salva a opção específica do runtime %s', async (runtime, label, option) => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<Editor kind="agent" agents={[]} models={[]} initial={{ ...agent('runtime-agent', 'Agente'), runtime }} onClose={vi.fn()} onSave={onSave} onPickFolder={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Modelo e permissões' }))
    fireEvent.click(screen.getByRole('combobox', { name: label }))
    fireEvent.click(await screen.findByRole('option', { name: option }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ runtime, runtimePermissionMode: 'bypass' })))
  })
})

describe('novo projeto por origem', () => {
  const stubApi = (api: Partial<typeof window.appAPI>) => { Object.assign(window, { appAPI: api }) }

  it('cria pasta nova no destino escolhido e salva com agente opcional', async () => {
    const createProjectFolder = vi.fn().mockResolvedValue('C:\\dev\\landing')
    stubApi({ createProjectFolder })
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<Editor kind="workspace" agents={[agent('a', 'Alice')]} models={[]} onClose={vi.fn()} onSave={onSave} onPickFolder={vi.fn().mockResolvedValue('C:\\dev')} />)
    expect(screen.getByRole('radio', { name: /Criar pasta nova/ })).toBeChecked()
    fireEvent.change(screen.getByLabelText('Nome do projeto'), { target: { value: 'landing' } })
    fireEvent.click(screen.getByRole('button', { name: /Escolher/ }))
    expect(await screen.findByText('Será criada: C:\\dev\\landing')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: /Alice/ }))
    expect(screen.getByText('Um agente forma a equipe padrão do projeto.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Criar projeto' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'landing', path: 'C:\\dev\\landing', defaultAgentIds: ['a'] })))
    expect(createProjectFolder).toHaveBeenCalledWith({ parent: 'C:\\dev', name: 'landing' })
  })

  it('mostra só os campos do GitHub e exibe erro recuperável da clonagem', async () => {
    const cloneRepository = vi.fn().mockRejectedValue(new Error(`Error invoking remote method 'v9:cloneRepository': Error: Já existe uma pasta chamada "repo" neste local.`))
    stubApi({ cloneRepository })
    const onSave = vi.fn()
    render(<Editor kind="workspace" agents={[]} models={[]} onClose={vi.fn()} onSave={onSave} onPickFolder={vi.fn().mockResolvedValue('C:\\dev')} />)
    fireEvent.click(screen.getByRole('radio', { name: /Clonar do GitHub/ }))
    expect(screen.getByRole('radio', { name: /Clonar do GitHub/ })).toBeChecked()
    expect(screen.queryByLabelText('Pasta do projeto')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/Repositório do GitHub/), { target: { value: 'carlos/repo' } })
    fireEvent.click(screen.getByRole('button', { name: /Escolher/ }))
    await screen.findByText('Destino: C:\\dev\\repo')
    fireEvent.click(screen.getByRole('button', { name: 'Clonar e criar projeto' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/^Já existe uma pasta chamada "repo" neste local\.$/)
    // No rodapé fixo: o erro fica visível mesmo com o formulário rolado.
    expect(alert.closest('footer')).not.toBeNull()
    expect(cloneRepository).toHaveBeenCalledWith({ repository: 'carlos/repo', parent: 'C:\\dev', name: undefined })
    expect(onSave).not.toHaveBeenCalled()
  })

  it('abre pasta existente sem exigir agentes', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<Editor kind="workspace" agents={[]} models={[]} onClose={vi.fn()} onSave={onSave} onPickFolder={vi.fn().mockResolvedValue('C:\\dev\\site')} />)
    fireEvent.click(screen.getByRole('radio', { name: /Abrir pasta existente/ }))
    fireEvent.click(screen.getByRole('button', { name: /Escolher/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Abrir projeto' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Abrir projeto' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'site', path: 'C:\\dev\\site', defaultAgentIds: [] })))
  })
})

describe('editor de agentes com Poli Studio', () => {
  it('salva a cor e o detalhe do editor novo sem alterar as permissões do agente', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<Editor kind="agent" agents={[]} models={[]} initial={agent('boo-custom', 'Boo')} onClose={vi.fn()} onSave={onSave} onPickFolder={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Aparência' }))
    fireEvent.click(screen.getByRole('button', { name: 'Escolher cor #a8d5be' }))
    fireEvent.click(screen.getByRole('button', { name: 'Brotinho' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      id: 'boo-custom', color: '#a8d5be', pitsHeadAccessory: 'boo-sprout', pitsFaceAccessory: 'none', canWrite: false, approvalMode: 'ask',
    })))
  })
  it('marca edição de arquivos ao cadastrar Boo novo sem sobrescrever escolhas de existentes', () => {
    render(<Editor kind="agent" agents={[]} models={[]} onClose={vi.fn()} onSave={vi.fn()} onPickFolder={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Modelo e permissões' }))
    expect(screen.getByRole('checkbox', { name: 'Permitir edição de arquivos do workspace' })).toBeChecked()
  })
  it('mostra a restrição de escrita existente e permite habilitar sem alterar o modo de aprovação', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<Editor kind="agent" agents={[]} models={[]} initial={agent('hermes', 'Hermes')} onClose={vi.fn()} onSave={onSave} onPickFolder={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Modelo e permissões' }))
    const writing = screen.getByRole('checkbox', { name: 'Permitir edição de arquivos do workspace' })
    expect(writing).not.toBeChecked()
    fireEvent.click(writing)
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ canWrite: true, approvalMode: 'ask' })))
  })

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

  it('organiza o drawer em três seções com painel rolável e rodapé fora da rolagem', () => {
    render(<Editor kind="agent" agents={[]} models={[]} initial={agent('atlas', 'Atlas')} onClose={vi.fn()} onSave={vi.fn()} onPickFolder={vi.fn()} />)
    const tablist = screen.getByRole('tablist', { name: 'Seções do agente' })
    expect(within(tablist).getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Identidade', 'Aparência', 'Modelo e permissões'])
    const panel = screen.getByRole('tabpanel', { name: 'Identidade' })
    expect(panel).toHaveClass('overflow-y-auto', 'min-h-0')
    expect(within(panel).getByRole('region', { name: 'Como aparece na conversa' })).toContainElement(screen.getByLabelText('Menção'))
    expect(within(panel).getByRole('region', { name: 'Papel na equipe' })).toContainElement(screen.getByRole('combobox', { name: 'Papel do agente' }))
    const save = screen.getByRole('button', { name: 'Salvar alterações' })
    expect(panel).not.toContainElement(save)
    expect(save.closest('footer')).toHaveClass('shrink-0')
    for (const name of ['Aparência', 'Modelo e permissões']) {
      fireEvent.click(screen.getByRole('tab', { name }))
      expect(screen.getByRole('tabpanel', { name })).not.toContainElement(screen.getByRole('button', { name: 'Salvar alterações' }))
    }
  })

  it('navega entre as seções pelo teclado com foco móvel', () => {
    render(<Editor kind="agent" agents={[]} models={[]} initial={agent('atlas', 'Atlas')} onClose={vi.fn()} onSave={vi.fn()} onPickFolder={vi.fn()} />)
    const agentTabs = within(screen.getByRole('tablist', { name: 'Seções do agente' }))
    const identity = agentTabs.getByRole('tab', { name: 'Identidade' })
    expect(identity).toHaveAttribute('tabindex', '0')
    expect(agentTabs.getByRole('tab', { name: 'Aparência' })).toHaveAttribute('tabindex', '-1')
    fireEvent.keyDown(identity, { key: 'ArrowDown' })
    expect(agentTabs.getByRole('tab', { name: 'Aparência' })).toHaveAttribute('aria-selected', 'true')
    expect(agentTabs.getByRole('tab', { name: 'Aparência' })).toHaveFocus()
    fireEvent.keyDown(agentTabs.getByRole('tab', { name: 'Aparência' }), { key: 'End' })
    expect(agentTabs.getByRole('tab', { name: 'Modelo e permissões' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(agentTabs.getByRole('tab', { name: 'Modelo e permissões' }), { key: 'ArrowRight' })
    expect(agentTabs.getByRole('tab', { name: 'Identidade' })).toHaveAttribute('aria-selected', 'true')
  })

  it('mantém o risco do Bypass ao lado do modo de aprovação e salva os mesmos campos', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<Editor kind="agent" agents={[]} models={[]} initial={{ ...agent('atlas', 'Atlas'), approvalMode: 'bypass' }} onClose={vi.fn()} onSave={onSave} onPickFolder={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Menção'), { target: { value: 'Atlas QA' } })
    fireEvent.click(screen.getByRole('tab', { name: 'Modelo e permissões' }))
    const permissions = screen.getByRole('region', { name: 'Permissões' })
    const note = within(permissions).getByTestId('approval-mode-note')
    expect(note).toHaveAttribute('data-tone', 'warning')
    expect(note).toHaveTextContent('O terminal não é isolado e pode afetar todo o computador.')
    expect(note.previousElementSibling).toContainElement(screen.getByRole('combobox', { name: 'Modo de aprovação' }))
    expect(within(permissions).getByRole('checkbox', { name: /Permitir Computer Use/ })).not.toBeChecked()
    expect(screen.getByRole('region', { name: 'Modelo' })).toContainElement(screen.getByRole('combobox', { name: 'Motor' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      id: 'atlas', name: 'Atlas', alias: 'atlas-qa', instructions: 'Instruções do agente', role: 'agent',
      runtime: 'codex', canWrite: false, computerUse: false, approvalMode: 'bypass',
    })))
  })

  it('mostra no rodapé o erro de instruções vazias e volta para Identidade', async () => {
    const onSave = vi.fn()
    render(<Editor kind="agent" agents={[]} models={[]} initial={{ ...agent('atlas', 'Atlas'), instructions: '' }} onClose={vi.fn()} onSave={onSave} onPickFolder={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Modelo e permissões' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Escreva as instruções de trabalho do agente para continuar.')
    expect(alert.closest('footer')).not.toBeNull()
    expect(screen.getByRole('tab', { name: 'Identidade' })).toHaveAttribute('aria-selected', 'true')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('envia configurações personalizadas junto com o agente', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<Editor kind="agent" agents={[]} models={[]} initial={agent('poli-1', 'Poli')} onClose={vi.fn()} onSave={onSave} onPickFolder={vi.fn().mockResolvedValue(null)} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Aparência' }))
    expect(screen.getByText('Boo Studio')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Escolher cor #4098eb' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ativar animações' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      id: 'poli-1', color: '#4098eb', pitsAnimate: false, pitsShape: 'ghost-wave',
    })))
  })
})
