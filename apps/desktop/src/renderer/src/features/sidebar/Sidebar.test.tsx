import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => localStorage.clear())
afterEach(() => { delete window.hostsAPI })
import { emptySnapshot } from '../app/appShellShared'
import type { HostsAPI, HostsSnapshot } from '../../../../shared/hosts'
import type { Agent, Conversation, Snapshot, Workspace } from '../../../../shared/v9'
import { Sidebar } from './Sidebar'

const hostsSnapshot: HostsSnapshot = { selectedId: 'local', hosts: [{ id: 'local', name: 'Este PC', endpoint: 'local', transport: 'local', status: 'connected' }], local: { enabled: false, address: '127.0.0.1', port: 6778, advertisedUrl: 'ws://127.0.0.1:6778/boobot', relayUrl: '', running: false } }
function installHostsAPI() {
  window.hostsAPI = { snapshot: vi.fn(async () => hostsSnapshot), onChanged: () => () => undefined, configure: vi.fn(async () => hostsSnapshot), add: vi.fn(async () => ({ id: 'home', name: 'Casa', endpoint: 'ws://casa:6778', transport: 'direct' as const, status: 'connected' as const })), select: vi.fn(async () => undefined), remove: vi.fn(), copyPairing: vi.fn(), revoke: vi.fn(), browse: vi.fn(), resolveFolder: vi.fn(), onFolderRequest: () => () => undefined } satisfies HostsAPI
}

const agent: Agent = { id: 'agent-1', name: 'Lyra', alias: 'lyra', description: '', instructions: 'Ajude.', runtime: 'codex', model: '', color: '#7565e8', avatar: '', canWrite: false, computerUse: false, approvalMode: 'ask', revision: 1, createdAt: '2026-10-16T12:00:00.000Z' }
const workspace: Workspace = { id: 'workspace-1', name: 'Instruções de Paz', kind: 'free', path: 'C:/workspace', branch: null, baseBranch: null, parentWorkspaceId: null, instructions: '', defaultAgentIds: [], changes: 0, archived: false, createdAt: '2026-10-16T12:00:00.000Z' }
const snapshot: Snapshot = { ...emptySnapshot, agents: [agent], workspaces: [workspace] }

describe('hierarquia visual do sidebar', () => {
  it('coloca o host na navegação antes do seletor Projetos/Boos', async () => {
    installHostsAPI()
    renderSidebar({ onOpenHome: vi.fn() })
    const navigation = screen.getByRole('navigation', { name: 'Trabalho' })
    const host = await screen.findByRole('button', { name: 'Selecionar host' })
    expect(host).toHaveTextContent('Remoto')
    expect(navigation).toContainElement(host)
    expect(navigation.compareDocumentPosition(screen.getByRole('tablist')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('identifica a árvore com o título Projetos', () => {
    renderSidebar({ onOpenHome: vi.fn() })
    expect(screen.getByRole('heading', { name: 'Projetos' })).toBeInTheDocument()
  })
})

function renderSidebar(overrides: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  return render(<Sidebar snapshot={snapshot} selected={undefined} unreadCounts={{}} agentStates={{}} onSelectConversation={vi.fn()} onStartConversation={vi.fn()} onOpenAgent={vi.fn()} onOpenEditor={vi.fn()} onOpenSettings={vi.fn()} onDeleteWorkspace={vi.fn()} onDeleteConversation={vi.fn()} onDeleteAgent={vi.fn()} onSetChief={vi.fn()} onNotice={vi.fn()} {...overrides} />)
}

describe('contatos de agentes na barra lateral', () => {
  it('abre a conversa direta ao selecionar um agente', () => {
    const onOpenAgent = vi.fn()
    renderSidebar({ onOpenAgent })
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Boos/ }), { button: 0 })
    fireEvent.click(screen.getByRole('button', { name: /Lyra @lyra/ }))
    expect(onOpenAgent).toHaveBeenCalledWith(agent)
  })

  it('mantém a criação de sessão direta e o menu para novos projetos e Boos', () => {
    const onStartConversation = vi.fn()
    renderSidebar({ onStartConversation })
    expect(screen.getByRole('button', { name: 'Criar novo' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Nova sessão' }))
    expect(onStartConversation).toHaveBeenCalledOnce()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Criar novo' }), { key: 'Enter' })
    expect(screen.getByRole('menuitem', { name: 'Novo projeto' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Novo Boo' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Pits, mascote do Politron' })).not.toBeInTheDocument()
  })

  it('preserva a busca inline da PWA ao alternar Projetos e Boos', () => {
    renderSidebar({ browserMode: true })
    expect(screen.getByRole('combobox', { name: 'Busca rápida' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Busca rápida' })).not.toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Boos/ }), { button: 0 })
    expect(screen.getByRole('combobox', { name: 'Busca rápida' })).toBeInTheDocument()
  })

  it('não duplica no sidebar desktop os controles da barra da janela', () => {
    renderSidebar({ onOpenHome: vi.fn() })
    expect(screen.queryByRole('button', { name: 'Ir para a central' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Recolher barra lateral' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Busca rápida' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nova sessão' })).toBeVisible()
    expect(screen.getByRole('tab', { name: /Projetos/ })).toBeVisible()
    expect(screen.getByRole('tab', { name: /Boos/ })).toBeVisible()
    expect(screen.queryByRole('tab', { name: /Agentes/ })).not.toBeInTheDocument()
  })

  it('cria sessão livre na PWA por ação direta, sem menu de um item só', () => {
    const onStartConversation = vi.fn()
    renderSidebar({ browserMode: true, onStartConversation })
    expect(screen.queryByRole('button', { name: 'Criar novo' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Nova sessão' }))
    expect(onStartConversation).toHaveBeenCalledOnce()
  })

  it('encontra um projeto pela busca rápida da PWA', () => {
    const onSelectWorkspace = vi.fn()
    renderSidebar({ browserMode: true, onSelectWorkspace })
    const palette = screen.getByRole('combobox', { name: 'Busca rápida' })
    fireEvent.change(palette, { target: { value: 'Instruções de Paz' } })
    fireEvent.keyDown(palette, { key: 'Enter' })
    expect(onSelectWorkspace).toHaveBeenCalledWith(workspace.id)
  })

  it('inicia uma conversa no workspace pelo atalho da árvore', () => {
    const onStartConversation = vi.fn()
    renderSidebar({ onStartConversation })
    fireEvent.click(screen.getByRole('button', { name: `Nova conversa em ${workspace.name}` }))
    expect(onStartConversation).toHaveBeenCalledWith(workspace.id)
  })

  it('mantém Chief compacto com avatar menor e sem título repetido', () => {
    const chief: Agent = { ...agent, role: 'chief' }
    renderSidebar({ snapshot: { ...snapshot, agents: [chief] } })
    const card = screen.getByRole('region', { name: 'Chief' })
    expect(card).toHaveTextContent('Chief · Coordenação')
    expect(card.querySelector('[style*="width: 30px"]')).not.toBeNull()
    expect(card.querySelector('[style*="width: 42px"]')).toBeNull()
    expect(screen.getByRole('tab', { name: 'Boos' })).toBeInTheDocument()
    expect(card.querySelectorAll('[aria-label="Chief"]')).toHaveLength(1)
  })

  it('fixa um Chief com coroa no topo sem duplicá-lo na lista de agentes', () => {
    const chief: Agent = { ...agent, role: 'chief' }
    renderSidebar({ snapshot: { ...snapshot, agents: [chief] } })
    const section = screen.getByRole('region', { name: 'Chief' })
    expect(section).toHaveTextContent('Lyra')
    expect(section.querySelector('svg[aria-label="Chief"]')).not.toBeNull()
    expect(screen.getAllByText('Lyra')).toHaveLength(1)
    fireEvent.contextMenu(section.querySelector('button')!)
    expect(screen.getByRole('menuitem', { name: /Remover papel de Chief/ })).toBeInTheDocument()
  })

  it('promove agente a Chief pelo menu de contexto', () => {
    const onSetChief = vi.fn()
    renderSidebar({ onSetChief })
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Boos/ }), { button: 0 })
    fireEvent.contextMenu(screen.getByRole('button', { name: /Lyra @lyra/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Promover a Chief' }))
    expect(onSetChief).toHaveBeenCalledExactlyOnceWith(agent, true)
  })

  it('remove o papel Chief pelo menu de contexto', () => {
    const chief: Agent = { ...agent, role: 'chief' }
    const onSetChief = vi.fn()
    renderSidebar({ snapshot: { ...snapshot, agents: [chief] }, onSetChief })
    fireEvent.contextMenu(screen.getByRole('region', { name: 'Chief' }).querySelector('button')!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remover papel de Chief' }))
    expect(onSetChief).toHaveBeenCalledExactlyOnceWith(chief, false)
  })

  it('marca a conversa e o workspace quando há aprovação pendente', () => {
    const conversation: Conversation = { id: 'conversation-1', kind: 'direct', name: 'Revisão', agentIds: [agent.id], workspaceId: workspace.id, titleAuto: false, revision: 1, archived: false, createdAt: '' }
    const withApproval: Snapshot = { ...snapshot, conversations: [conversation], approvals: [{ id: 'approval-1', runId: 'run-1', conversationId: conversation.id, agentId: agent.id, kind: 'write', details: { path: 'notes.txt', after: 'texto' }, status: 'pending', createdAt: '', resolvedAt: null }] }
    renderSidebar({ snapshot: withApproval })
    expect(screen.getByLabelText('Aguardando aprovação')).toBeInTheDocument()
    expect(screen.getByLabelText('Workspace precisa de atenção')).toBeInTheDocument()
  })
})

describe('colapso e exclusão da barra lateral', () => {
  it('recolhe e expande conversas do workspace', () => {
    const conversation: Conversation = { id: 'thread-1', kind: 'direct', name: 'Conversa no workspace', agentIds: [], workspaceId: workspace.id, titleAuto: false, revision: 1, archived: false, createdAt: '' }
    renderSidebar({ snapshot: { ...snapshot, conversations: [conversation] } })
    expect(screen.getByText('Conversa no workspace')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: `Recolher ${workspace.name}` }))
    expect(screen.queryByText('Conversa no workspace')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: `Expandir ${workspace.name}` }))
    expect(screen.getByText('Conversa no workspace')).toBeInTheDocument()
  })
  it('usa modal para cancelar ou confirmar exclusão sem chamar window.confirm', async () => {
    const conversation: Conversation = { id: 'thread-delete', kind: 'direct', name: 'Apagar teste', agentIds: [], workspaceId: workspace.id, titleAuto: false, revision: 1, archived: false, createdAt: '' }
    const onDeleteConversation = vi.fn()
    const confirm = vi.spyOn(window, 'confirm')
    renderSidebar({ snapshot: { ...snapshot, conversations: [conversation] }, onDeleteConversation })
    const actions = screen.getByRole('button', { name: 'Ações da conversa Apagar teste' })
    fireEvent.contextMenu(actions.parentElement!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir conversa' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Excluir a conversa “Apagar teste”?')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onDeleteConversation).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.contextMenu(actions.parentElement!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir conversa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }))
    expect(onDeleteConversation).toHaveBeenCalledExactlyOnceWith(conversation.id)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(confirm).not.toHaveBeenCalled()
    confirm.mockRestore()
  })
})

describe('navegação orientada a workspaces', () => {
  it('abrir o workspace não cria sessão: apenas o botão + cria', () => {
    const onSelectWorkspace = vi.fn()
    const onStartConversation = vi.fn()
    renderSidebar({ onSelectWorkspace, onStartConversation })
    fireEvent.click(screen.getByTitle('Workspace livre'))
    expect(onSelectWorkspace).toHaveBeenCalledExactlyOnceWith(workspace.id)
    expect(onStartConversation).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: `Nova conversa em ${workspace.name}` }))
    expect(onStartConversation).toHaveBeenCalledExactlyOnceWith(workspace.id)
  })

  it('exibe sessões legadas dentro do Livre, sem lista avulsa', () => {
    const legacy: Workspace = { ...workspace, id: 'legacy', name: '' }
    const free: Workspace = { ...workspace, id: 'free', name: 'Livre' }
    const conversation: Conversation = { id: 'legacy-session', kind: 'direct', name: 'Sessão preservada', agentIds: [], workspaceId: legacy.id, titleAuto: false, revision: 1, archived: false, createdAt: '' }
    renderSidebar({ snapshot: { ...snapshot, workspaces: [legacy, free], conversations: [conversation] } })
    expect(screen.getByText('Sessão preservada')).toBeInTheDocument()
    expect(screen.queryByText('Sessões antigas')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Recolher Livre' }))
    expect(screen.queryByText('Sessão preservada')).not.toBeInTheDocument()
  })

  it('usa as abas para alternar agentes e projetos, sem cabeçalhos repetidos', () => {
    renderSidebar()
    expect(screen.queryByRole('button', { name: 'Recolher workspaces' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Novo workspace' })).not.toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Boos/ }), { button: 0 })
    expect(screen.getByRole('button', { name: /Lyra @lyra/ })).toBeInTheDocument()
    expect(screen.queryByText('Meus Polis')).not.toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Projetos/ }), { button: 0 })
    expect(screen.getByRole('button', { name: `Recolher ${workspace.name}` })).toBeInTheDocument()
  })
})
