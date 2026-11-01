import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => localStorage.clear())
afterEach(() => { delete window.hostsAPI })
import { emptySnapshot } from '../app/appShellShared'
import type { HostsAPI, HostsSnapshot } from '../../../../shared/hosts'
import type { Agent, Approval, Conversation, Mission, Run, Snapshot, Workspace } from '../../../../shared/v9'
import { Sidebar } from './Sidebar'

const hostsSnapshot: HostsSnapshot = { selectedId: 'local', hosts: [{ id: 'local', name: 'Este PC', endpoint: 'local', transport: 'local', status: 'connected' }], local: { enabled: false, address: '127.0.0.1', port: 6778, advertisedUrl: 'ws://127.0.0.1:6778/boobot', relayUrl: '', running: false } }
function installHostsAPI() {
  window.hostsAPI = { snapshot: vi.fn(async () => hostsSnapshot), onChanged: () => () => undefined, configure: vi.fn(async () => hostsSnapshot), add: vi.fn(async () => ({ id: 'home', name: 'Casa', endpoint: 'ws://casa:6778', transport: 'direct' as const, status: 'connected' as const })), select: vi.fn(async () => undefined), remove: vi.fn(), copyPairing: vi.fn(), revoke: vi.fn(), browse: vi.fn(), resolveFolder: vi.fn(), onFolderRequest: () => () => undefined } satisfies HostsAPI
}

const agent: Agent = { id: 'agent-1', name: 'Lyra', alias: 'lyra', description: '', instructions: 'Ajude.', runtime: 'codex', model: '', color: '#7565e8', avatar: '', canWrite: false, computerUse: false, approvalMode: 'ask', revision: 1, createdAt: '2026-10-16T12:00:00.000Z' }
const workspace: Workspace = { id: 'workspace-1', name: 'Instruções de Paz', kind: 'free', path: 'C:/workspace', branch: null, baseBranch: null, parentWorkspaceId: null, instructions: '', defaultAgentIds: [], changes: 0, archived: false, createdAt: '2026-10-16T12:00:00.000Z' }
const snapshot: Snapshot = { ...emptySnapshot, agents: [agent], workspaces: [workspace] }
const session = (id: string, name: string, workspaceId = workspace.id, extra: Partial<Conversation> = {}): Conversation => ({ id, kind: 'direct', name, agentIds: [agent.id], workspaceId, titleAuto: false, revision: 1, archived: false, createdAt: '2026-10-16T12:00:00.000Z', ...extra })
const pending = (conversationId: string, extra: Partial<Approval> = {}): Approval => ({ id: 'approval-' + conversationId, runId: 'run-1', conversationId, agentId: agent.id, kind: 'write', details: { path: 'docs/notes.txt', after: 'texto' }, status: 'pending', createdAt: '', resolvedAt: null, ...extra })
const running = (conversationId: string, agentId = agent.id): Run => ({ id: 'run-' + conversationId, conversationId, agentId, status: 'running' } as unknown as Run)

/** Abre ou recolhe o projeto na árvore clicando na sua linha. */
function enter(name: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp('^' + name) }))
}

function renderSidebar(overrides: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  return render(<Sidebar snapshot={snapshot} selected={undefined} unreadCounts={{}} agentStates={{}} onSelectConversation={vi.fn()} onStartConversation={vi.fn()} onOpenAgent={vi.fn()} onOpenEditor={vi.fn()} onOpenSettings={vi.fn()} onDeleteWorkspace={vi.fn()} onDeleteConversation={vi.fn()} onDeleteAgent={vi.fn()} onSetChief={vi.fn()} onNotice={vi.fn()} {...overrides} />)
}

describe('hierarquia visual do sidebar', () => {
  it('põe o host no rodapé, ao lado de Configurações, sem atalho de pasta solto', async () => {
    installHostsAPI()
    renderSidebar({ onOpenHome: vi.fn() })
    const host = await screen.findByRole('button', { name: 'Selecionar host' })
    expect(host).toHaveTextContent('Remoto')
    const footer = host.closest('footer')!
    expect(footer).toContainElement(screen.getByRole('button', { name: 'Configurações' }))
    expect(within(footer).getAllByRole('button')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Abrir pasta' })).not.toBeInTheDocument()
  })

  it('empilha as seções com títulos próprios, sem abas', () => {
    renderSidebar({ onOpenHome: vi.fn() })
    expect(screen.getByRole('heading', { name: 'Projetos' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Boos' })).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.getAllByText('Projetos')).toHaveLength(1)
    const central = screen.getByRole('button', { name: /Central do Chief/ })
    expect(central.compareDocumentPosition(screen.getByRole('heading', { name: 'Projetos' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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

describe('acabamento da barra lateral', () => {
  afterEach(() => { delete (window as { appAPI?: unknown }).appAPI })

  it('o + da seção Boos abre o editor de agente', () => {
    const onOpenEditor = vi.fn()
    renderSidebar({ onOpenEditor })
    fireEvent.click(screen.getByRole('button', { name: 'Novo Boo' }))
    expect(onOpenEditor).toHaveBeenCalledWith({ kind: 'agent' })
  })

  it('rodapé com Configurações; "Abrir pasta" fica no menu do projeto', () => {
    const openFolder = vi.fn(async () => undefined)
    window.appAPI = { openFolder } as unknown as typeof window.appAPI
    const onOpenSettings = vi.fn()
    const local: Workspace = { ...workspace, id: 'ws-local', name: 'Site', kind: 'local' }
    renderSidebar({ onOpenSettings, snapshot: { ...snapshot, workspaces: [local], conversations: [session('c-site', 'Home', local.id)] } })
    fireEvent.click(screen.getByRole('button', { name: 'Configurações' }))
    expect(onOpenSettings).toHaveBeenCalled()
    fireEvent.contextMenu(screen.getByRole('button', { name: /^Site/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Abrir pasta' }))
    expect(openFolder).toHaveBeenCalledExactlyOnceWith('c-site')
  })

  it('marca o painel ativo da Empresa e informa o estado do Boo', () => {
    renderSidebar({ onOpenHome: vi.fn(), view: 'board', agentStates: { 'agent-1': 'working' } })
    expect(within(screen.getByRole('navigation', { name: 'Empresa' })).getByRole('button', { name: /Board da empresa/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: /^Lyra · trabalhando/ })).toBeInTheDocument()
  })

  it('recolhe a Empresa e lembra a escolha', () => {
    const onOpenHome = vi.fn()
    const first = renderSidebar({ onOpenHome })
    for (const name of [/Board da empresa/, /Escritório/, /Rotinas/, /Marketplace/]) expect(screen.getByRole('button', { name })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Empresa' }))
    expect(screen.getByRole('button', { name: 'Empresa' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: /Board da empresa/ })).not.toBeInTheDocument()
    first.unmount()
    renderSidebar({ onOpenHome })
    expect(screen.queryByRole('button', { name: /Board da empresa/ })).not.toBeInTheDocument()
  })

  it('"Contratar equipe" leva ao Marketplace', () => {
    const onOpenHome = vi.fn()
    renderSidebar({ onOpenHome })
    fireEvent.click(screen.getByRole('button', { name: 'Contratar equipe' }))
    expect(onOpenHome).toHaveBeenCalledExactlyOnceWith('marketplace')
  })
})

describe('contatos de agentes na barra lateral', () => {
  it('abre a conversa direta ao selecionar um Boo na faixa', () => {
    const onOpenAgent = vi.fn()
    renderSidebar({ onOpenAgent })
    fireEvent.click(screen.getByRole('button', { name: /^Lyra/ }))
    expect(onOpenAgent).toHaveBeenCalledWith(agent)
  })

  it('uma ação de criar no topo; o + de Projetos cria projeto ou pasta', () => {
    const onStartConversation = vi.fn()
    const onOpenEditor = vi.fn()
    renderSidebar({ onStartConversation, onOpenEditor })
    expect(screen.queryByRole('button', { name: 'Criar novo' })).not.toBeInTheDocument()
    const start = screen.getByRole('button', { name: 'Nova sessão' })
    expect(start).toHaveAttribute('aria-keyshortcuts', 'Control+N')
    fireEvent.click(start)
    expect(onStartConversation).toHaveBeenCalledOnce()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Novo projeto ou pasta' }), { key: 'Enter' })
    expect(screen.getByRole('menu')).toHaveAttribute('data-dsh-menu-surface', 'true')
    expect(screen.getByRole('menuitem', { name: 'Nova pasta de projetos' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Novo projeto' }))
    expect(onOpenEditor).toHaveBeenCalledExactlyOnceWith({ kind: 'workspace' })
    expect(screen.queryByRole('img', { name: 'Pits, mascote do Politron' })).not.toBeInTheDocument()
  })

  it('a PWA mantém a busca inline e mostra Projetos e Boos juntos, sem ações de desktop', () => {
    renderSidebar({ browserMode: true, onOpenHome: vi.fn() })
    expect(screen.getByRole('combobox', { name: 'Busca rápida' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Busca rápida' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Lyra/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Instruções de Paz/ })).toBeInTheDocument()
    for (const name of ['Novo Boo', 'Contratar equipe', 'Configurações', 'Novo projeto ou pasta']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Rotinas/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Escritório/ })).toBeInTheDocument()
  })

  it('não duplica no sidebar desktop os controles da barra da janela', () => {
    renderSidebar({ onOpenHome: vi.fn() })
    expect(screen.queryByRole('button', { name: 'Ir para a central' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Recolher barra lateral' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Busca rápida' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nova sessão' })).toBeVisible()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
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

  it('inicia uma conversa no projeto pela árvore', () => {
    const onStartConversation = vi.fn()
    renderSidebar({ onStartConversation })
    fireEvent.click(screen.getByRole('button', { name: 'Nova sessão em Instruções de Paz' }))
    expect(onStartConversation).toHaveBeenLastCalledWith(workspace.id)
    enter(workspace.name)
    fireEvent.click(screen.getByRole('button', { name: 'Nova sessão no projeto' }))
    expect(onStartConversation).toHaveBeenCalledTimes(2)
    expect(onStartConversation).toHaveBeenLastCalledWith(workspace.id)
  })

  it('Central do Chief mostra o Chief e as pendências', () => {
    const chief: Agent = { ...agent, role: 'chief' }
    renderSidebar({ snapshot: { ...snapshot, agents: [chief] }, onOpenHome: vi.fn(), attentionCount: 2 })
    const central = screen.getByRole('button', { name: /Central do Lyra/ })
    expect(within(central).getByLabelText('2 pendências')).toBeInTheDocument()
    expect(central.querySelector('[style*="width: 20px"]')).not.toBeNull()
  })

  it('fixa o Chief com coroa no início da faixa de Boos, sem duplicá-lo', () => {
    const chief: Agent = { ...agent, role: 'chief' }
    const mira: Agent = { ...agent, id: 'agent-2', name: 'Alba', alias: 'alba' }
    renderSidebar({ snapshot: { ...snapshot, agents: [mira, chief] } })
    const boos = within(screen.getByRole('heading', { name: 'Boos' }).closest('section')!).getAllByRole('button').filter(item => !item.matches('[aria-label="Novo Boo"]'))
    expect(boos[0]).toHaveAccessibleName(/^Lyra, Chief/)
    expect(boos[0].querySelector('svg.dsh-boo-crown')).not.toBeNull()
    expect(screen.getAllByRole('button', { name: /^Lyra/ })).toHaveLength(1)
    fireEvent.contextMenu(boos[0])
    expect(screen.getByRole('menu')).toHaveAttribute('data-dsh-menu-surface', 'true')
    expect(screen.getByRole('menuitem', { name: /Remover papel de Chief/ })).toBeInTheDocument()
  })

  it('promove agente a Chief pelo menu de contexto', () => {
    const onSetChief = vi.fn()
    renderSidebar({ onSetChief })
    fireEvent.contextMenu(screen.getByRole('button', { name: /^Lyra/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Promover a Chief' }))
    expect(onSetChief).toHaveBeenCalledExactlyOnceWith(agent, true)
  })

  it('remove o papel Chief pelo menu de contexto', () => {
    const chief: Agent = { ...agent, role: 'chief' }
    const onSetChief = vi.fn()
    renderSidebar({ snapshot: { ...snapshot, agents: [chief] }, onSetChief })
    fireEvent.contextMenu(screen.getByRole('button', { name: /^Lyra, Chief/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remover papel de Chief' }))
    expect(onSetChief).toHaveBeenCalledExactlyOnceWith(chief, false)
  })

  it('marca a conversa e o workspace quando há aprovação pendente', () => {
    const conversation = session('conversation-1', 'Revisão')
    renderSidebar({ snapshot: { ...snapshot, conversations: [conversation], approvals: [pending(conversation.id)] } })
    expect(screen.getByLabelText('Workspace precisa de atenção')).toBeInTheDocument()
    enter(workspace.name)
    expect(screen.getByLabelText('Aguardando aprovação')).toBeInTheDocument()
  })
})

describe('Precisa de você', () => {
  const other: Workspace = { ...workspace, id: 'workspace-2', name: 'Outro projeto', kind: 'local' }

  it('some quando não há nada esperando nem rodando', () => {
    renderSidebar({ snapshot: { ...snapshot, conversations: [session('c-1', 'Calma')] } })
    expect(screen.queryByRole('heading', { name: 'Precisa de você' })).not.toBeInTheDocument()
  })

  it('junta aprovações, perguntas, missões e sessões rodando de todos os projetos e abre a conversa', () => {
    const onSelectConversation = vi.fn()
    const conversations = [session('c-aprovar', 'Notas'), session('c-pergunta', 'Dúvida', other.id), session('c-missao', 'Missão longa', other.id), session('c-rodando', 'Módulo de agendamentos', other.id), session('c-quieta', 'Sem nada')]
    const mission = { id: 'm-1', title: 'Migrar banco', conversationId: 'c-missao', status: 'waiting', question: 'Posso apagar a tabela antiga?' } as Mission
    renderSidebar({
      onSelectConversation,
      snapshot: {
        ...snapshot, workspaces: [workspace, other], conversations,
        approvals: [pending('c-aprovar'), pending('c-pergunta', { id: 'q', kind: 'question', details: { question: 'Qual banco usar?' } })],
        missions: [mission],
        runs: [running('c-rodando'), running('c-aprovar')],
      },
    })
    const region = screen.getByRole('heading', { name: 'Precisa de você' }).closest('section')!
    const items = within(region).getAllByRole('button').map(item => item.textContent)
    expect(items).toEqual(['Aprovar: Lyra quer alterar notes.txt', 'Lyra pergunta: Qual banco usar?', 'Responder: Posso apagar a tabela antiga?', 'Módulo de agendamentos · Lyra'])
    expect(within(region).getAllByLabelText('Aguardando você')).toHaveLength(3)
    expect(within(region).getByLabelText('Em execução')).toBeInTheDocument()
    fireEvent.click(within(region).getByRole('button', { name: /Módulo de agendamentos/ }))
    expect(onSelectConversation).toHaveBeenCalledExactlyOnceWith('c-rodando')
    // O projeto com sessão rodando avisa na árvore, mesmo recolhido.
    expect(within(screen.getByRole('button', { name: /^Outro projeto/ })).getByLabelText('Workspace precisa de atenção')).toBeInTheDocument()
  })
})

describe('árvore de projetos e exclusão', () => {
  it('expande o projeto com as sessões recentes e "Ver todas" abre a visão do projeto', () => {
    const conversations = Array.from({ length: 7 }, (_, index) => session('s' + index, 'Sessão ' + index, workspace.id, { createdAt: `2026-10-0${index + 1}T00:00:00.000Z` }))
    renderSidebar({ snapshot: { ...snapshot, conversations } })
    expect(screen.queryByText('Sessão 6')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Instruções de Paz/ })).toHaveTextContent(/7$/)
    enter(workspace.name)
    expect(screen.getByRole('button', { name: /^Instruções de Paz/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Sessão 6')).toBeInTheDocument()
    expect(screen.getByText('Sessão 2')).toBeInTheDocument()
    expect(screen.queryByText('Sessão 1')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver todas (7)' }))
    expect(screen.getByText('Sessão 0')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Projeto' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Projetos' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar aos projetos' }))
    expect(screen.getByRole('heading', { name: 'Projetos' })).toBeInTheDocument()
    enter(workspace.name)
    expect(screen.queryByText('Sessão 6')).not.toBeInTheDocument()
  })

  it('lembra os projetos abertos na árvore', () => {
    const first = renderSidebar({ snapshot: { ...snapshot, conversations: [session('c-1', 'Lembrada')] } })
    enter(workspace.name)
    first.unmount()
    renderSidebar({ snapshot: { ...snapshot, conversations: [session('c-1', 'Lembrada')] } })
    expect(screen.getByText('Lembrada')).toBeInTheDocument()
  })

  it('fixa favoritos no topo da árvore sem repeti-los na pasta', () => {
    const other: Workspace = { ...workspace, id: 'workspace-2', name: 'Alfa', kind: 'local' }
    renderSidebar({ snapshot: { ...snapshot, workspaces: [workspace, other] } })
    fireEvent.contextMenu(screen.getByRole('button', { name: /^Instruções de Paz/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Favoritar projeto' }))
    const pinned = screen.getByRole('group', { name: 'Favoritos' })
    expect(within(pinned).getByRole('button', { name: /^Instruções de Paz/ })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Instruções de Paz/ })).toHaveLength(1)
    expect(within(pinned).queryByRole('button', { name: /^Alfa/ })).not.toBeInTheDocument()
  })

  it('mostra o time do projeto na aba Boos da visão do projeto, ou aviso quando não há', () => {
    const other: Workspace = { ...workspace, id: 'workspace-2', name: 'Sem time' }
    const data = { ...snapshot, workspaces: [workspace, other], conversations: [session('thread-team', 'Com Lyra')] }
    localStorage.setItem('politron.sidebar.project', workspace.id)
    const first = renderSidebar({ snapshot: data })
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Boos' }), { button: 0 })
    expect(screen.getByRole('button', { name: /Lyra @lyra/ })).toBeInTheDocument()
    expect(screen.queryByText('Com Lyra')).not.toBeInTheDocument()
    first.unmount()
    localStorage.setItem('politron.sidebar.project', other.id)
    renderSidebar({ snapshot: data })
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Boos' }), { button: 0 })
    expect(screen.getByText('Este projeto ainda não tem time.')).toBeInTheDocument()
  })

  it('abre na árvore o projeto da conversa aberta por fora da barra e fecha a visão de outro projeto', () => {
    const other: Workspace = { ...workspace, id: 'workspace-2', name: 'Outro projeto' }
    const first = session('c-1', 'Primeira')
    const second = session('c-2', 'Segunda', other.id)
    const props = { snapshot: { ...snapshot, workspaces: [workspace, other], conversations: [first, second] }, unreadCounts: {}, agentStates: {}, onSelectConversation: vi.fn(), onStartConversation: vi.fn(), onOpenAgent: vi.fn(), onOpenEditor: vi.fn(), onOpenSettings: vi.fn(), onDeleteWorkspace: vi.fn(), onDeleteConversation: vi.fn(), onDeleteAgent: vi.fn(), onSetChief: vi.fn(), onNotice: vi.fn() }
    localStorage.setItem('politron.sidebar.project', workspace.id)
    const view = render(<Sidebar {...props} selected={first} />)
    // A conversa restaurada na abertura não tira a barra da visão lembrada.
    expect(screen.getByRole('button', { name: 'Voltar aos projetos' })).toBeInTheDocument()
    view.rerender(<Sidebar {...props} selected={second} />)
    expect(screen.queryByRole('button', { name: 'Voltar aos projetos' })).not.toBeInTheDocument()
    expect(screen.getByText('Segunda')).toBeInTheDocument()
    expect(screen.getByText('Primeira')).toBeInTheDocument()
  })

  it('aberto na Central sem conversa, a primeira conversa aberta já abre o projeto dela', () => {
    const other: Workspace = { ...workspace, id: 'workspace-2', name: 'Outro projeto' }
    const second = session('c-2', 'Segunda', other.id)
    const props = { snapshot: { ...snapshot, workspaces: [workspace, other], conversations: [second] }, unreadCounts: {}, agentStates: {}, onSelectConversation: vi.fn(), onStartConversation: vi.fn(), onOpenAgent: vi.fn(), onOpenEditor: vi.fn(), onOpenSettings: vi.fn(), onDeleteWorkspace: vi.fn(), onDeleteConversation: vi.fn(), onDeleteAgent: vi.fn(), onSetChief: vi.fn(), onNotice: vi.fn() }
    const view = render(<Sidebar {...props} selected={undefined} />)
    expect(screen.queryByText('Segunda')).not.toBeInTheDocument()
    view.rerender(<Sidebar {...props} selected={second} />)
    expect(screen.getByText('Segunda')).toBeInTheDocument()
  })

  it('sessão nova cujo projeto chega num snapshot seguinte também abre o projeto', () => {
    const livre: Workspace = { ...workspace, id: 'livre', name: 'Livre', kind: 'free' }
    const first = session('c-1', 'Primeira')
    const fresh = session('c-novo', 'Sessão nova', livre.id)
    const props = { unreadCounts: {}, agentStates: {}, onSelectConversation: vi.fn(), onStartConversation: vi.fn(), onOpenAgent: vi.fn(), onOpenEditor: vi.fn(), onOpenSettings: vi.fn(), onDeleteWorkspace: vi.fn(), onDeleteConversation: vi.fn(), onDeleteAgent: vi.fn(), onSetChief: vi.fn(), onNotice: vi.fn() }
    const before = { ...snapshot, workspaces: [workspace], conversations: [first] }
    const view = render(<Sidebar {...props} snapshot={before} selected={first} />)
    // A conversa nova é selecionada antes de o snapshot trazer o projeto Livre recém-criado.
    view.rerender(<Sidebar {...props} snapshot={before} selected={fresh} />)
    view.rerender(<Sidebar {...props} snapshot={{ ...before, workspaces: [workspace, livre], conversations: [first, fresh] }} selected={fresh} />)
    expect(screen.getByText('Sessão nova')).toBeInTheDocument()
  })

  it('lembra a visão do projeto e volta à árvore quando ele some', () => {
    localStorage.setItem('politron.sidebar.project', workspace.id)
    const first = renderSidebar()
    expect(screen.getByRole('button', { name: 'Voltar aos projetos' })).toBeInTheDocument()
    first.unmount()
    renderSidebar({ snapshot: { ...snapshot, workspaces: [{ ...workspace, archived: true }] } })
    expect(screen.queryByRole('button', { name: 'Voltar aos projetos' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Projetos' })).toBeInTheDocument()
  })

  it('usa modal para cancelar ou confirmar exclusão sem chamar window.confirm', async () => {
    const conversation = session('thread-delete', 'Apagar teste')
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

  /** Seleção em lote: o menu do projeto abre a visão dele já selecionando. */
  function startSelecting() {
    fireEvent.contextMenu(screen.getByRole('button', { name: /^Instruções de Paz/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Selecionar sessões…' }))
  }

  it('seleciona várias sessões e exclui em lote com uma única confirmação', async () => {
    const conversations = [session('bulk-1', 'Primeira'), session('bulk-2', 'Segunda'), session('bulk-3', 'Terceira')]
    const onDeleteConversations = vi.fn()
    const onDeleteConversation = vi.fn()
    const onSelectConversation = vi.fn()
    renderSidebar({ snapshot: { ...snapshot, conversations }, onDeleteConversations, onDeleteConversation, onSelectConversation })
    startSelecting()
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
    const onDeleteConversations = vi.fn()
    renderSidebar({ snapshot: { ...snapshot, conversations: [session('all-1', 'Alfa'), session('all-2', 'Beta')] }, onDeleteConversations })
    startSelecting()
    fireEvent.click(screen.getByRole('button', { name: 'Todas' }))
    expect(screen.getAllByRole('checkbox').every(item => item.getAttribute('aria-checked') === 'true')).toBe(true)
    expect(screen.getByRole('toolbar', { name: 'Seleção de sessões' })).toHaveTextContent('2 selecionadas')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(onDeleteConversations).not.toHaveBeenCalled()
  })
})

describe('navegação orientada a workspaces', () => {
  it('abrir o projeto não cria sessão: só as ações de nova sessão criam', () => {
    const onSelectWorkspace = vi.fn()
    const onStartConversation = vi.fn()
    renderSidebar({ onSelectWorkspace, onStartConversation })
    fireEvent.click(screen.getByTitle('Workspace livre'))
    fireEvent.click(screen.getByTitle('Workspace livre'))
    expect(onSelectWorkspace).not.toHaveBeenCalled()
    fireEvent.contextMenu(screen.getByTitle('Workspace livre'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Abrir projeto' }))
    expect(onSelectWorkspace).toHaveBeenCalledExactlyOnceWith(workspace.id)
    expect(onStartConversation).not.toHaveBeenCalled()
    enter(workspace.name)
    fireEvent.click(screen.getByRole('button', { name: 'Nova sessão no projeto' }))
    expect(onStartConversation).toHaveBeenCalledExactlyOnceWith(workspace.id)
  })

  it('exibe sessões legadas dentro do Livre, sem lista avulsa', () => {
    const legacy: Workspace = { ...workspace, id: 'legacy', name: '' }
    const free: Workspace = { ...workspace, id: 'free', name: 'Livre' }
    const conversation = session('legacy-session', 'Sessão preservada', legacy.id)
    renderSidebar({ snapshot: { ...snapshot, workspaces: [legacy, free], conversations: [conversation] } })
    expect(screen.queryByText('Sessão preservada')).not.toBeInTheDocument()
    expect(screen.queryByText('Sessões antigas')).not.toBeInTheDocument()
    enter('Livre')
    expect(screen.getByText('Sessão preservada')).toBeInTheDocument()
  })

  it('mostra "Sessões antigas" só quando existem e não há Livre', () => {
    const legacy: Workspace = { ...workspace, id: 'legacy', name: '' }
    renderSidebar({ snapshot: { ...snapshot, workspaces: [legacy], conversations: [session('legacy-session', 'Sessão preservada', legacy.id)] } })
    expect(screen.getByText('Sessões antigas')).toBeInTheDocument()
    expect(screen.getByText('Sessão preservada')).toBeInTheDocument()
  })
})

describe('delegações aninhadas na sessão que delegou', () => {
  const nestedSnapshot: Snapshot = { ...snapshot, conversations: [session('chief', 'Plano do Atlas'), session('c1', 'Pedido: Examen · Contexto: monorepo BubbleDesk', workspace.id, { parentConversationId: 'chief' }), session('c2', 'Mimir · revisar login', workspace.id, { parentConversationId: 'chief' })] }

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
    renderSidebar({ snapshot: { ...nestedSnapshot, approvals: [pending('c1', { kind: 'command', details: {} })] } })
    enter('Instruções de Paz')
    expect(screen.getAllByLabelText('Aguardando aprovação')).toHaveLength(1)
  })
})

describe('reordenação do sidebar', () => {
  const alfa: Workspace = { ...workspace, id: 'ws-alfa', name: 'Alfa', kind: 'local' }
  const beta: Workspace = { ...workspace, id: 'ws-beta', name: 'Beta', kind: 'local' }
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
    await waitFor(() => expect(rowNames(/^(Alfa|Beta|Novo)$/)).toEqual(['Novo', 'Beta', 'Alfa']))
    fireEvent.keyDown(screen.getByRole('button', { name: /^Alfa/ }), { key: 'ArrowUp', altKey: true })
    expect(rowNames(/^(Alfa|Beta|Novo)$/)).toEqual(['Novo', 'Alfa', 'Beta'])
    expect(api.saveSidebarLayout).toHaveBeenLastCalledWith({ groups: [], projectOrder: [novo.id, alfa.id, beta.id] })
    expect(screen.getByRole('status', { name: 'Ordem do sidebar' })).toHaveTextContent('Projeto Alfa movido para a posição 2')
    // Sem Alt, a seta não reordena.
    fireEvent.keyDown(screen.getByRole('button', { name: /^Alfa/ }), { key: 'ArrowUp' })
    expect(api.saveSidebarLayout).toHaveBeenCalledTimes(1)
  })

  it('reordena Boos na faixa e sessões na visão do projeto, salvando no banco', async () => {
    const api = installAppAPI({ projectOrder: [], groups: [], sessionOrder: {}, agentOrder: [] })
    const data = ordered({ ...snapshot, workspaces: [alfa], conversations: [session('c1', 'Primeira', alfa.id, { createdAt: '2026-10-01T00:00:00.000Z' }), session('c2', 'Segunda', alfa.id, { createdAt: '2026-10-02T00:00:00.000Z' })] })
    const first = renderSidebar({ snapshot: data })
    await waitFor(() => expect(api.sidebarLayout).toHaveBeenCalled())
    fireEvent.keyDown(screen.getByRole('button', { name: /^Lyra/ }), { key: 'ArrowDown', altKey: true })
    expect(api.saveSidebarLayout).toHaveBeenLastCalledWith({ agentOrder: ['agent-2', 'agent-1'] })
    expect(screen.getByRole('status', { name: 'Ordem do sidebar' })).toHaveTextContent('Boo Lyra movido para a posição 2')
    // Alt+seta numa sessão dentro da árvore não move o projeto.
    enter('Alfa')
    fireEvent.keyDown(screen.getByRole('button', { name: /^Segunda/ }), { key: 'ArrowDown', altKey: true })
    expect(api.saveSidebarLayout).toHaveBeenCalledTimes(1)
    first.unmount()
    localStorage.setItem('politron.sidebar.project', alfa.id)
    renderSidebar({ snapshot: data })
    expect(rowNames(/^(Primeira|Segunda)$/)).toEqual(['Segunda', 'Primeira'])
    fireEvent.keyDown(screen.getByRole('button', { name: /^Segunda/ }), { key: 'ArrowDown', altKey: true })
    expect(rowNames(/^(Primeira|Segunda)$/)).toEqual(['Primeira', 'Segunda'])
    expect(api.saveSidebarLayout).toHaveBeenLastCalledWith({ sessionOrder: { [alfa.id]: ['c1', 'c2'] } })
    expect(screen.getByRole('status', { name: 'Ordem do sidebar' })).toHaveTextContent('Sessão Segunda movida para a posição 2')
  })
})
