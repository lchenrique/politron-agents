import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

  it('abre ações do projeto e o submenu de pastas em superfícies DSH', () => {
    renderSidebar()
    fireEvent.contextMenu(screen.getByRole('button', { name: /^Instruções de Paz/ }))
    const menu = screen.getByRole('menu')
    expect(menu).toHaveAttribute('data-dsh-menu-surface', 'true')
    const move = screen.getByRole('menuitem', { name: 'Mover para pasta' })
    fireEvent.focus(move)
    const menus = screen.getAllByRole('menu')
    expect(menus).toHaveLength(2)
    expect(menus[1]).toHaveAttribute('data-dsh-menu-surface', 'true')
    expect(screen.getByRole('menuitem', { name: 'Sem pasta' })).toBeInTheDocument()
  })
})

/** Entra no projeto clicando na sua linha da lista. */
function enter(name: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp('^' + name) }))
}

function renderSidebar(overrides: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  return render(<Sidebar snapshot={snapshot} selected={undefined} unreadCounts={{}} agentStates={{}} onSelectConversation={vi.fn()} onStartConversation={vi.fn()} onOpenAgent={vi.fn()} onOpenEditor={vi.fn()} onOpenSettings={vi.fn()} onDeleteWorkspace={vi.fn()} onDeleteConversation={vi.fn()} onDeleteAgent={vi.fn()} onSetChief={vi.fn()} onNotice={vi.fn()} {...overrides} />)
}

describe('acabamento da barra lateral', () => {
  it('oferece "Novo Boo" no fim da lista de Boos e abre o editor de agente', () => {
    const onOpenEditor = vi.fn()
    renderSidebar({ onOpenEditor, section: 'agents' })
    fireEvent.click(screen.getByRole('button', { name: 'Novo Boo' }))
    expect(onOpenEditor).toHaveBeenCalledWith({ kind: 'agent' })
  })

  it('rodapé numa linha: Configurações e o atalho de pasta só com ícone', () => {
    const onOpenSettings = vi.fn()
    renderSidebar({ onOpenSettings })
    fireEvent.click(screen.getByRole('button', { name: 'Configurações' }))
    expect(onOpenSettings).toHaveBeenCalled()
    const folder = screen.getByRole('button', { name: 'Abrir pasta' })
    expect(folder).toBeDisabled()
    expect(folder).toHaveTextContent('')
  })

  it('marca o painel ativo e informa o estado do Boo', () => {
    renderSidebar({ onOpenHome: vi.fn(), view: 'board', section: 'agents', agentStates: { 'agent-1': 'working' } })
    expect(screen.getByRole('button', { name: /Board da empresa/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('img', { name: 'Trabalhando' })).toBeInTheDocument()
  })
})

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
    expect(screen.getByRole('menu')).toHaveAttribute('data-dsh-menu-surface', 'true')
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
    enter(workspace.name)
    fireEvent.click(screen.getByRole('button', { name: 'Nova sessão no projeto' }))
    expect(onStartConversation).toHaveBeenCalledWith(workspace.id)
  })

  it('mantém Chief compacto com avatar menor e sem título repetido', () => {
    const chief: Agent = { ...agent, role: 'chief' }
    renderSidebar({ snapshot: { ...snapshot, agents: [chief] } })
    const card = screen.getByRole('region', { name: 'Chief' })
    expect(card).toHaveTextContent('Chief · Coordenação')
    expect(card.querySelector('[style*="width: 20px"]')).not.toBeNull()
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
    expect(screen.getByRole('menu')).toHaveAttribute('data-dsh-menu-surface', 'true')
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
    expect(screen.getByLabelText('Workspace precisa de atenção')).toBeInTheDocument()
    enter(workspace.name)
    expect(screen.getByLabelText('Aguardando aprovação')).toBeInTheDocument()
  })
})

describe('colapso e exclusão da barra lateral', () => {
  it('mostra só projetos na raiz e as sessões ao entrar, com voltar', () => {
    const conversation: Conversation = { id: 'thread-1', kind: 'direct', name: 'Conversa no workspace', agentIds: [], workspaceId: workspace.id, titleAuto: false, revision: 1, archived: false, createdAt: '' }
    renderSidebar({ snapshot: { ...snapshot, conversations: [conversation] } })
    expect(screen.queryByText('Conversa no workspace')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Instruções de Paz/ })).toHaveTextContent('1')
    enter(workspace.name)
    expect(screen.getByText('Conversa no workspace')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Projeto' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Projetos' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar aos projetos' }))
    expect(screen.queryByText('Conversa no workspace')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Projetos' })).toBeInTheDocument()
  })

  it('mostra o time do projeto na aba Boos, ou aviso quando não há', () => {
    const other: Workspace = { ...workspace, id: 'workspace-2', name: 'Sem time' }
    const conversation: Conversation = { id: 'thread-team', kind: 'direct', name: 'Com Lyra', agentIds: [agent.id], workspaceId: workspace.id, titleAuto: false, revision: 1, archived: false, createdAt: '' }
    renderSidebar({ snapshot: { ...snapshot, workspaces: [workspace, other], conversations: [conversation] } })
    enter(workspace.name)
    expect(screen.queryByRole('button', { name: /Lyra @lyra/ })).not.toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Boos' }), { button: 0 })
    expect(screen.getByRole('button', { name: /Lyra @lyra/ })).toBeInTheDocument()
    expect(screen.queryByText('Com Lyra')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar aos projetos' }))
    enter('Sem time')
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Boos' }), { button: 0 })
    expect(screen.getByText('Este projeto ainda não tem time.')).toBeInTheDocument()
  })

  it('entra no projeto da conversa aberta por fora da barra', () => {
    const other: Workspace = { ...workspace, id: 'workspace-2', name: 'Outro projeto' }
    const first: Conversation = { id: 'c-1', kind: 'direct', name: 'Primeira', agentIds: [], workspaceId: workspace.id, titleAuto: false, revision: 1, archived: false, createdAt: '' }
    const second: Conversation = { ...first, id: 'c-2', name: 'Segunda', workspaceId: other.id }
    const data = { ...snapshot, workspaces: [workspace, other], conversations: [first, second] }
    const props = { snapshot: data, unreadCounts: {}, agentStates: {}, onSelectConversation: vi.fn(), onStartConversation: vi.fn(), onOpenAgent: vi.fn(), onOpenEditor: vi.fn(), onOpenSettings: vi.fn(), onDeleteWorkspace: vi.fn(), onDeleteConversation: vi.fn(), onDeleteAgent: vi.fn(), onSetChief: vi.fn(), onNotice: vi.fn() }
    const view = render(<Sidebar {...props} selected={first} />)
    // A conversa restaurada na abertura não tira a barra da raiz.
    expect(screen.getByRole('heading', { name: 'Projetos' })).toBeInTheDocument()
    view.rerender(<Sidebar {...props} selected={second} />)
    expect(screen.getByText('Segunda')).toBeInTheDocument()
    expect(screen.queryByText('Primeira')).not.toBeInTheDocument()
    view.rerender(<Sidebar {...props} selected={first} />)
    expect(screen.getByText('Primeira')).toBeInTheDocument()
  })

  it('aberto na Central sem conversa, a primeira conversa aberta já leva ao projeto dela', () => {
    const other: Workspace = { ...workspace, id: 'workspace-2', name: 'Outro projeto' }
    const second: Conversation = { id: 'c-2', kind: 'direct', name: 'Segunda', agentIds: [], workspaceId: other.id, titleAuto: false, revision: 1, archived: false, createdAt: '' }
    const props = { snapshot: { ...snapshot, workspaces: [workspace, other], conversations: [second] }, unreadCounts: {}, agentStates: {}, onSelectConversation: vi.fn(), onStartConversation: vi.fn(), onOpenAgent: vi.fn(), onOpenEditor: vi.fn(), onOpenSettings: vi.fn(), onDeleteWorkspace: vi.fn(), onDeleteConversation: vi.fn(), onDeleteAgent: vi.fn(), onSetChief: vi.fn(), onNotice: vi.fn() }
    const view = render(<Sidebar {...props} selected={undefined} />)
    view.rerender(<Sidebar {...props} selected={second} />)
    expect(screen.getByText('Segunda')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voltar aos projetos' })).toBeInTheDocument()
  })

  it('sessão nova cujo projeto chega num snapshot seguinte também leva a barra até ele', () => {
    const livre: Workspace = { ...workspace, id: 'livre', name: 'Livre', kind: 'free' }
    const first: Conversation = { id: 'c-1', kind: 'direct', name: 'Primeira', agentIds: [], workspaceId: workspace.id, titleAuto: false, revision: 1, archived: false, createdAt: '' }
    const fresh: Conversation = { ...first, id: 'c-novo', name: 'Sessão nova', workspaceId: livre.id }
    const props = { unreadCounts: {}, agentStates: {}, onSelectConversation: vi.fn(), onStartConversation: vi.fn(), onOpenAgent: vi.fn(), onOpenEditor: vi.fn(), onOpenSettings: vi.fn(), onDeleteWorkspace: vi.fn(), onDeleteConversation: vi.fn(), onDeleteAgent: vi.fn(), onSetChief: vi.fn(), onNotice: vi.fn() }
    const before = { ...snapshot, workspaces: [workspace], conversations: [first] }
    const view = render(<Sidebar {...props} snapshot={before} selected={first} />)
    // A conversa nova é selecionada antes de o snapshot trazer o projeto Livre recém-criado.
    view.rerender(<Sidebar {...props} snapshot={before} selected={fresh} />)
    view.rerender(<Sidebar {...props} snapshot={{ ...before, workspaces: [workspace, livre], conversations: [first, fresh] }} selected={fresh} />)
    expect(screen.getByText('Sessão nova')).toBeInTheDocument()
    expect(screen.queryByText('Primeira')).not.toBeInTheDocument()
  })

  it('lembra o projeto aberto e volta à raiz quando ele some', () => {
    localStorage.setItem('politron.sidebar.project', workspace.id)
    const first = renderSidebar()
    expect(screen.getByRole('button', { name: 'Voltar aos projetos' })).toBeInTheDocument()
    first.unmount()
    renderSidebar({ snapshot: { ...snapshot, workspaces: [{ ...workspace, archived: true }] } })
    expect(screen.queryByRole('button', { name: 'Voltar aos projetos' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Projetos' })).toBeInTheDocument()
  })
  it('usa modal para cancelar ou confirmar exclusão sem chamar window.confirm', async () => {
    const conversation: Conversation = { id: 'thread-delete', kind: 'direct', name: 'Apagar teste', agentIds: [], workspaceId: workspace.id, titleAuto: false, revision: 1, archived: false, createdAt: '' }
    const onDeleteConversation = vi.fn()
    const confirm = vi.spyOn(window, 'confirm')
    renderSidebar({ snapshot: { ...snapshot, conversations: [conversation] }, onDeleteConversation })
    enter(workspace.name)
    const actions = screen.getByRole('button', { name: 'Ações da conversa Apagar teste' })
    fireEvent.contextMenu(actions.parentElement!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir conversa' }))
    expect(screen.getByRole('dialog')).toHaveAttribute('data-dsh-modal', 'true')
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
  it('seleciona várias sessões e exclui em lote com uma única confirmação', async () => {
    const make = (id: string, name: string): Conversation => ({ id, kind: 'direct', name, agentIds: [], workspaceId: workspace.id, titleAuto: false, revision: 1, archived: false, createdAt: '' })
    const conversations = [make('bulk-1', 'Primeira'), make('bulk-2', 'Segunda'), make('bulk-3', 'Terceira')]
    const onDeleteConversations = vi.fn()
    const onDeleteConversation = vi.fn()
    const onSelectConversation = vi.fn()
    renderSidebar({ snapshot: { ...snapshot, conversations }, onDeleteConversations, onDeleteConversation, onSelectConversation })
    enter(workspace.name)
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar sessões' }))
    const toolbar = screen.getByRole('toolbar', { name: 'Seleção de sessões' })
    expect(within(toolbar).getByRole('button', { name: 'Excluir' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /Primeira/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Terceira/ }))
    expect(onSelectConversation).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox', { name: /Segunda/ })).toHaveAttribute('aria-checked', 'false')
    expect(toolbar).toHaveTextContent('2 selecionadas')
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Excluir' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Excluir 2 conversas?')
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir' }))
    expect(onDeleteConversations).toHaveBeenCalledExactlyOnceWith(['bulk-1', 'bulk-3'])
    expect(onDeleteConversation).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByRole('toolbar', { name: 'Seleção de sessões' })).not.toBeInTheDocument()
  })
  it('marca todas as sessões e cancela a seleção sem excluir', () => {
    const make = (id: string, name: string): Conversation => ({ id, kind: 'direct', name, agentIds: [], workspaceId: workspace.id, titleAuto: false, revision: 1, archived: false, createdAt: '' })
    const onDeleteConversations = vi.fn()
    renderSidebar({ snapshot: { ...snapshot, conversations: [make('all-1', 'Alfa'), make('all-2', 'Beta')] }, onDeleteConversations })
    enter(workspace.name)
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar sessões' }))
    fireEvent.click(screen.getByRole('button', { name: 'Todas' }))
    expect(screen.getAllByRole('checkbox').every(item => item.getAttribute('aria-checked') === 'true')).toBe(true)
    expect(screen.getByRole('toolbar', { name: 'Seleção de sessões' })).toHaveTextContent('2 selecionadas')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(onDeleteConversations).not.toHaveBeenCalled()
  })
})

describe('navegação orientada a workspaces', () => {
  it('abrir o workspace não cria sessão: apenas o botão de nova sessão cria', () => {
    const onSelectWorkspace = vi.fn()
    const onStartConversation = vi.fn()
    renderSidebar({ onSelectWorkspace, onStartConversation })
    fireEvent.click(screen.getByTitle('Workspace livre'))
    expect(onSelectWorkspace).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTitle('Workspace livre'))
    expect(onSelectWorkspace).toHaveBeenCalledExactlyOnceWith(workspace.id)
    expect(onStartConversation).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Nova sessão no projeto' }))
    expect(onStartConversation).toHaveBeenCalledExactlyOnceWith(workspace.id)
  })

  it('exibe sessões legadas dentro do Livre, sem lista avulsa', () => {
    const legacy: Workspace = { ...workspace, id: 'legacy', name: '' }
    const free: Workspace = { ...workspace, id: 'free', name: 'Livre' }
    const conversation: Conversation = { id: 'legacy-session', kind: 'direct', name: 'Sessão preservada', agentIds: [], workspaceId: legacy.id, titleAuto: false, revision: 1, archived: false, createdAt: '' }
    renderSidebar({ snapshot: { ...snapshot, workspaces: [legacy, free], conversations: [conversation] } })
    expect(screen.queryByText('Sessão preservada')).not.toBeInTheDocument()
    expect(screen.queryByText('Sessões antigas')).not.toBeInTheDocument()
    enter('Livre')
    expect(screen.getByText('Sessão preservada')).toBeInTheDocument()
  })

  it('usa as abas para alternar agentes e projetos, sem cabeçalhos repetidos', () => {
    renderSidebar()
    expect(screen.queryByRole('button', { name: 'Recolher workspaces' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Novo workspace' })).not.toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Boos/ }), { button: 0 })
    expect(screen.getByRole('button', { name: /Lyra @lyra/ })).toBeInTheDocument()
    expect(screen.queryByText('Meus Polis')).not.toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Projetos/ }), { button: 0 })
    expect(screen.getByRole('button', { name: /^Instruções de Paz/ })).toBeInTheDocument()
  })
})

describe('delegações aninhadas na sessão que delegou', () => {
  const session = (id: string, name: string, parentConversationId?: string): Conversation => ({ id, kind: 'direct', name, agentIds: [agent.id], workspaceId: workspace.id, titleAuto: false, revision: 1, archived: false, createdAt: '2026-10-16T12:00:00.000Z', ...(parentConversationId ? { parentConversationId } : {}) })
  const nestedSnapshot: Snapshot = { ...snapshot, conversations: [session('chief', 'Plano do Atlas'), session('c1', 'Pedido: Examen · Contexto: monorepo BubbleDesk', 'chief'), session('c2', 'Mimir · revisar login', 'chief')] }

  it('esconde as filhas no topo, conta só sessões de topo e mostra as filhas ao expandir', () => {
    renderSidebar({ snapshot: nestedSnapshot, unreadCounts: { c2: 3 } })
    expect(screen.getByRole('button', { name: /^Instruções de Paz/ })).toHaveTextContent(/1$/)
    enter('Instruções de Paz')
    expect(screen.queryByText('Mimir · revisar login')).not.toBeInTheDocument()
    // Não lidas da filha sobem para a mãe enquanto recolhidas.
    expect(screen.getByLabelText('3 não lidas')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '2 delegações' }))
    expect(screen.getByText('Mimir · revisar login')).toBeInTheDocument()
    expect(screen.getByText('Examen · monorepo BubbleDesk')).toBeInTheDocument()
    expect(screen.getAllByLabelText('3 não lidas')).toHaveLength(1)
  })

  it('aprovação pendente numa filha acende o aviso da mãe', () => {
    const approval = { id: 'a1', runId: 'r1', conversationId: 'c1', agentId: agent.id, kind: 'command' as const, details: {}, status: 'pending' as const, createdAt: '', resolvedAt: null }
    renderSidebar({ snapshot: { ...nestedSnapshot, approvals: [approval] } })
    enter('Instruções de Paz')
    expect(screen.getAllByLabelText('Aguardando aprovação')).toHaveLength(1)
  })
})

describe('reordenação do sidebar', () => {
  const alfa: Workspace = { ...workspace, id: 'ws-alfa', name: 'Alfa', kind: 'local' }
  const beta: Workspace = { ...workspace, id: 'ws-beta', name: 'Beta', kind: 'local' }
  const session = (id: string, name: string, createdAt: string): Conversation => ({ id, workspaceId: alfa.id, name, kind: 'direct', agentIds: [], archived: false, titleAuto: false, revision: 1, createdAt } as Conversation)
  const ordered = (snapshotValue: Snapshot) => ({ ...snapshotValue, agents: [agent, { ...agent, id: 'agent-2', name: 'Mira', alias: 'mira' }] })
  function installAppAPI(saved: Awaited<ReturnType<NonNullable<typeof window.appAPI>['sidebarLayout']>>) {
    const api = { sidebarLayout: vi.fn(async () => saved), saveSidebarLayout: vi.fn(async (input: object) => ({ projectOrder: [], groups: [], sessionOrder: {}, agentOrder: [], ...input })) }
    window.appAPI = api as unknown as typeof window.appAPI
    return api
  }
  afterEach(() => { delete (window as { appAPI?: unknown }).appAPI })
  const rowNames = (pattern: RegExp) => screen.getAllByRole('button').map(item => (item.closest('.dsh-session') ? item.querySelector('.dsh-title')?.textContent : item.textContent) ?? '').filter(text => pattern.test(text))

  it('usa menu DSH nas ações da pasta e abre o modal de renomear', async () => {
    installAppAPI({ projectOrder: [], groups: [{ name: 'Clientes', workspaceIds: [alfa.id] }], sessionOrder: {}, agentOrder: [] })
    renderSidebar({ snapshot: { ...snapshot, workspaces: [alfa, beta] } })
    fireEvent.click(await screen.findByRole('button', { name: 'Ações da pasta Clientes' }))
    expect(screen.getByRole('menu')).toHaveAttribute('data-dsh-menu-surface', 'true')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Renomear pasta' }))
    const dialog = screen.getByRole('dialog', { name: 'Renomear pasta' })
    expect(dialog).toHaveAttribute('data-dsh-modal', 'true')
  })

  it('migra uma vez as pastas antigas do localStorage para o banco', async () => {
    localStorage.setItem('politron.sidebar.groups', JSON.stringify(['Clientes']))
    localStorage.setItem('politron.sidebar.workspace-groups', JSON.stringify({ [alfa.id]: 'Clientes' }))
    const api = installAppAPI(null)
    renderSidebar({ snapshot: { ...snapshot, workspaces: [alfa, beta] } })
    await waitFor(() => expect(api.saveSidebarLayout).toHaveBeenCalledWith({ projectOrder: [], agentOrder: [], sessionOrder: {}, groups: [{ name: 'Clientes', workspaceIds: [alfa.id] }] }))
    expect(screen.getByRole('button', { name: 'Recolher Clientes' })).toBeInTheDocument()
  })

  it('aplica a ordem salva, põe projetos novos no topo e move com Alt+seta anunciando a posição', async () => {
    const novo: Workspace = { ...workspace, id: 'ws-novo', name: 'Novo', kind: 'local' }
    const api = installAppAPI({ projectOrder: [beta.id, alfa.id], groups: [], sessionOrder: {}, agentOrder: [] })
    renderSidebar({ snapshot: { ...snapshot, workspaces: [alfa, beta, novo] } })
    await waitFor(() => expect(rowNames(/^(Alfa|Beta|Novo)/)).toEqual(['Novo0', 'Beta0', 'Alfa0']))
    fireEvent.keyDown(screen.getByRole('button', { name: /^Alfa/ }), { key: 'ArrowUp', altKey: true })
    expect(rowNames(/^(Alfa|Beta|Novo)/)).toEqual(['Novo0', 'Alfa0', 'Beta0'])
    expect(api.saveSidebarLayout).toHaveBeenLastCalledWith({ groups: [], projectOrder: [novo.id, alfa.id, beta.id] })
    expect(screen.getByRole('status', { name: 'Ordem do sidebar' })).toHaveTextContent('Projeto Alfa movido para a posição 2')
    // Sem Alt, a seta não reordena.
    fireEvent.keyDown(screen.getByRole('button', { name: /^Alfa/ }), { key: 'ArrowUp' })
    expect(api.saveSidebarLayout).toHaveBeenCalledTimes(1)
  })

  it('reordena sessões do projeto e Boos e salva no banco', async () => {
    const api = installAppAPI({ projectOrder: [], groups: [], sessionOrder: {}, agentOrder: [] })
    renderSidebar({ snapshot: ordered({ ...snapshot, workspaces: [alfa], conversations: [session('c1', 'Primeira', '2026-10-01T00:00:00.000Z'), session('c2', 'Segunda', '2026-10-02T00:00:00.000Z')] }) })
    await waitFor(() => expect(api.sidebarLayout).toHaveBeenCalled())
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Boos/ }), { button: 0 })
    fireEvent.keyDown(screen.getByRole('button', { name: /Lyra @lyra/ }), { key: 'ArrowDown', altKey: true })
    expect(api.saveSidebarLayout).toHaveBeenLastCalledWith({ agentOrder: ['agent-2', 'agent-1'] })
    expect(screen.getByRole('status', { name: 'Ordem do sidebar' })).toHaveTextContent('Boo Lyra movido para a posição 2')
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Projetos/ }), { button: 0 })
    enter('Alfa')
    expect(rowNames(/^(Primeira|Segunda)$/)).toEqual(['Segunda', 'Primeira'])
    fireEvent.keyDown(screen.getByRole('button', { name: /^Segunda/ }), { key: 'ArrowDown', altKey: true })
    expect(rowNames(/^(Primeira|Segunda)$/)).toEqual(['Primeira', 'Segunda'])
    expect(api.saveSidebarLayout).toHaveBeenLastCalledWith({ sessionOrder: { [alfa.id]: ['c1', 'c2'] } })
    expect(screen.getByRole('status', { name: 'Ordem do sidebar' })).toHaveTextContent('Sessão Segunda movida para a posição 2')
  })
})
