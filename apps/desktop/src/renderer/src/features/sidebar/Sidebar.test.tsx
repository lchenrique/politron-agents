import { useState } from 'react'
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

/** Entra no projeto clicando na sua linha da lista. */
function enter(name: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp('^' + name) }))
}

/** A visão (Projetos | Boos) vive no AppShell; aqui um estado local faz o papel dele. */
function Harness(props: React.ComponentProps<typeof Sidebar>) {
  const [section, setSection] = useState(props.section ?? 'projects')
  return <Sidebar {...props} section={section} onSectionChange={setSection} />
}

/** Troca a barra para a visão Boos pelo controle segmentado. */
const showBoos = () => fireEvent.click(screen.getByRole('button', { name: 'Boos' }))

function renderSidebar(overrides: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  return render(<Harness snapshot={snapshot} selected={undefined} unreadCounts={{}} agentStates={{}} onSelectConversation={vi.fn()} onStartConversation={vi.fn()} onOpenAgent={vi.fn()} onOpenEditor={vi.fn()} onDeleteWorkspace={vi.fn()} onDeleteConversation={vi.fn()} onDeleteAgent={vi.fn()} onSetChief={vi.fn()} onNotice={vi.fn()} {...overrides} />)
}

describe('hierarquia visual do sidebar', () => {
  it('não tem rodapé: o host mora na barra da janela e a navegação na faixa de ícones', async () => {
    installHostsAPI()
    renderSidebar()
    expect(screen.queryByRole('button', { name: 'Selecionar host' })).not.toBeInTheDocument()
    expect(document.querySelector('footer')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Configurações' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Abrir pasta' })).not.toBeInTheDocument()
  })

  it('visão Projetos: controle Projetos | Boos no topo, sem Central, Empresa nem seção Boos', () => {
    renderSidebar()
    const control = screen.getByRole('group', { name: 'Visão da barra lateral' })
    expect(within(control).getByRole('button', { name: 'Projetos' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(control).getByRole('button', { name: 'Boos' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('heading', { name: 'Projetos' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Boos' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Central do/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Empresa' })).not.toBeInTheDocument()
    expect(control.compareDocumentPosition(screen.getByRole('button', { name: 'Nova sessão' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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

  it('o + da visão Boos abre o editor de agente', () => {
    const onOpenEditor = vi.fn()
    renderSidebar({ onOpenEditor })
    showBoos()
    fireEvent.click(screen.getByRole('button', { name: 'Novo Boo' }))
    expect(onOpenEditor).toHaveBeenCalledWith({ kind: 'agent' })
  })

  it('diferencia Boos na faixa só pela cor: sem foto nem acessórios', () => {
    const custom = { ...agent, avatar: 'data:image/png;base64,AAAA', pitsHeadAccessory: 'boo-king-crown' } as Agent
    const { container } = renderSidebar({ snapshot: { ...snapshot, agents: [custom] } })
    showBoos()
    const strip = screen.getByRole('heading', { name: 'Boos' }).closest('section')!
    expect(strip.querySelector('img')).toBeNull()
    expect(container.innerHTML).toContain('#7565e8')
  })

  it('"Abrir pasta" fica no menu do projeto', () => {
    const openFolder = vi.fn(async () => undefined)
    window.appAPI = { openFolder } as unknown as typeof window.appAPI
    const local: Workspace = { ...workspace, id: 'ws-local', name: 'Site', kind: 'local' }
    renderSidebar({ snapshot: { ...snapshot, workspaces: [local], conversations: [session('c-site', 'Home', local.id)] } })
    fireEvent.contextMenu(screen.getByRole('button', { name: /^Site/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Abrir pasta' }))
    expect(openFolder).toHaveBeenCalledExactlyOnceWith('c-site')
  })

  it('visão Boos: informa o estado do Boo no nome do botão', () => {
    renderSidebar({ agentStates: { 'agent-1': 'working' } })
    showBoos()
    expect(screen.getByRole('button', { name: /^Lyra · trabalhando/ })).toBeInTheDocument()
  })
})

describe('contatos de agentes na barra lateral', () => {
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

  it('não duplica no sidebar desktop os controles da barra da janela', () => {
    renderSidebar()
    expect(screen.queryByRole('button', { name: 'Ir para a central' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Recolher barra lateral' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Busca rápida' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nova sessão' })).toBeVisible()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('inicia uma conversa no projeto pela linha e pela visão do projeto', () => {
    const onStartConversation = vi.fn()
    renderSidebar({ onStartConversation })
    fireEvent.click(screen.getByRole('button', { name: 'Nova sessão em Instruções de Paz' }))
    expect(onStartConversation).toHaveBeenLastCalledWith(workspace.id)
    enter(workspace.name)
    fireEvent.click(screen.getByRole('button', { name: 'Nova sessão no projeto' }))
    expect(onStartConversation).toHaveBeenCalledTimes(2)
    expect(onStartConversation).toHaveBeenLastCalledWith(workspace.id)
  })

  it('visão Boos: o Chief fica fixo no topo, com coroa, e a ordem dos outros segue a salva', () => {
    const chief: Agent = { ...agent, role: 'chief' }
    const mira: Agent = { ...agent, id: 'agent-2', name: 'Alba', alias: 'alba' }
    const zeca: Agent = { ...agent, id: 'agent-3', name: 'Zeca', alias: 'zeca' }
    renderSidebar({ snapshot: { ...snapshot, agents: [zeca, mira, chief] } })
    showBoos()
    const rows = [...document.querySelectorAll('[data-boo-id]')].map(item => item.getAttribute('data-boo-id'))
    expect(rows).toEqual(['agent-1', 'agent-2', 'agent-3'])
    const first = screen.getByRole('button', { name: /^Lyra, Chief/ })
    expect(first.querySelector('svg.lucide-crown')).not.toBeNull()
    expect(screen.getAllByRole('button', { name: /^Lyra/ }).filter(item => item.hasAttribute('aria-expanded') && item.getAttribute('aria-label')?.startsWith('Lyra'))).toHaveLength(1)
    fireEvent.contextMenu(first)
    expect(screen.getByRole('menu')).toHaveAttribute('data-dsh-menu-surface', 'true')
    expect(screen.getByRole('menuitem', { name: /Remover papel de Chief/ })).toBeInTheDocument()
  })

  it('visão Boos: cada Boo abre as sessões dele, de todos os projetos, com o nome do projeto', () => {
    const other: Workspace = { ...workspace, id: 'workspace-2', name: 'Loja', kind: 'local' }
    const mira: Agent = { ...agent, id: 'agent-2', name: 'Alba', alias: 'alba' }
    const conversations = [
      session('c-a', 'Home nova', workspace.id, { updatedAt: '2026-10-03T00:00:00.000Z' }),
      session('c-b', 'Checkout', other.id, { updatedAt: '2026-10-05T00:00:00.000Z' }),
      session('c-c', 'Só da Alba', other.id, { agentIds: [mira.id] }),
      session('c-d', 'Arquivada', workspace.id, { archived: true }),
    ]
    const onSelectConversation = vi.fn()
    const onOpenAgent = vi.fn()
    renderSidebar({ snapshot: { ...snapshot, agents: [agent, mira], workspaces: [workspace, other], conversations }, onSelectConversation, onOpenAgent })
    showBoos()
    expect(screen.queryByText('Home nova')).not.toBeInTheDocument()
    const lyra = screen.getByRole('button', { name: /^Lyra · livre/ })
    expect(lyra).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(lyra)
    expect(lyra).toHaveAttribute('aria-expanded', 'true')
    expect(JSON.parse(localStorage.getItem('politron.sidebar.expanded-boos') || '[]')).toEqual(['agent-1'])
    const row = (name: string) => screen.getByText(name).closest('button')!
    expect(row('Checkout')).toHaveTextContent('Loja')
    expect(row('Home nova')).toHaveTextContent('Instruções de Paz')
    expect(screen.queryByText('Só da Alba')).not.toBeInTheDocument()
    expect(screen.queryByText('Arquivada')).not.toBeInTheDocument()
    // Mais recente primeiro.
    expect(screen.getByText('Checkout').compareDocumentPosition(screen.getByText('Home nova')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(row('Checkout'))
    expect(onSelectConversation).toHaveBeenCalledExactlyOnceWith('c-b')
    fireEvent.click(screen.getByRole('button', { name: 'Nova sessão com Lyra' }))
    expect(onOpenAgent).toHaveBeenCalledExactlyOnceWith(agent, true)
  })

  it('visão Boos: lembra os Boos abertos e permite excluir sessões em lote', () => {
    localStorage.setItem('politron.sidebar.expanded-boos', JSON.stringify(['agent-1']))
    const onDeleteConversations = vi.fn()
    renderSidebar({ snapshot: { ...snapshot, conversations: [session('c-a', 'Primeira'), session('c-b', 'Segunda')] }, onDeleteConversations })
    showBoos()
    expect(screen.getByText('Primeira')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar sessões' }))
    fireEvent.click(screen.getByRole('button', { name: 'Todas' }))
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Seleção de sessões' })).getByRole('button', { name: 'Excluir' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir' }))
    expect(onDeleteConversations).toHaveBeenCalledExactlyOnceWith(expect.arrayContaining(['c-a', 'c-b']))
  })

  it('promove agente a Chief pelo menu de contexto', () => {
    const onSetChief = vi.fn()
    renderSidebar({ onSetChief })
    showBoos()
    fireEvent.contextMenu(screen.getByRole('button', { name: /^Lyra/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Promover a Chief' }))
    expect(onSetChief).toHaveBeenCalledExactlyOnceWith(agent, true)
  })

  it('remove o papel Chief pelo menu de contexto', () => {
    const chief: Agent = { ...agent, role: 'chief' }
    const onSetChief = vi.fn()
    renderSidebar({ snapshot: { ...snapshot, agents: [chief] }, onSetChief })
    showBoos()
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

  it('junta aprovações, perguntas, missões e sessões rodando de todos os projetos; clicar abre a conversa no projeto dela', () => {
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
    const region = () => screen.getByRole('heading', { name: 'Precisa de você' }).closest('section')!
    expect(within(region()).getAllByRole('button').filter(item => !item.matches('.dsh-section-toggle')).map(item => item.textContent)).toEqual(['Aprovar: Lyra quer alterar notes.txt', 'Lyra pergunta: Qual banco usar?', 'Responder: Posso apagar a tabela antiga?', 'Módulo de agendamentos · Lyra'])
    expect(within(region()).getAllByLabelText('Aguardando você')).toHaveLength(3)
    expect(within(region()).getByLabelText('Em execução')).toBeInTheDocument()
    // O projeto com pendência avisa na lista.
    expect(within(screen.getByRole('button', { name: /^Outro projeto/ })).getByLabelText('Workspace precisa de atenção')).toBeInTheDocument()
    fireEvent.click(within(region()).getByRole('button', { name: /Módulo de agendamentos/ }))
    expect(onSelectConversation).toHaveBeenCalledExactlyOnceWith('c-rodando')
    // Entrou no projeto da conversa: a seção passa a mostrar só o que é dele.
    expect(screen.getByRole('button', { name: 'Voltar aos projetos' })).toBeInTheDocument()
    expect(within(region()).getAllByRole('button').filter(item => !item.matches('.dsh-section-toggle')).map(item => item.textContent)).toEqual(['Lyra pergunta: Qual banco usar?', 'Responder: Posso apagar a tabela antiga?', 'Módulo de agendamentos · Lyra'])
  })

  it('na visão do projeto, some quando o projeto não tem nada pendente', () => {
    renderSidebar({ snapshot: { ...snapshot, workspaces: [workspace, other], conversations: [session('c-1', 'Calma'), session('c-2', 'Rodando', other.id)], runs: [running('c-2')] } })
    expect(screen.getByRole('heading', { name: 'Precisa de você' })).toBeInTheDocument()
    enter(workspace.name)
    expect(screen.queryByRole('heading', { name: 'Precisa de você' })).not.toBeInTheDocument()
  })
})

describe('projeto aberto e exclusão', () => {
  it('a lista global só tem linhas de projeto; clicar mostra só aquele projeto, e voltar devolve a lista', () => {
    const other: Workspace = { ...workspace, id: 'workspace-2', name: 'Alfa', kind: 'local' }
    const conversations = Array.from({ length: 12 }, (_, index) => session('s' + index, 'Sessão ' + index, workspace.id, { createdAt: `2026-10-${String(index + 1).padStart(2, '0')}T00:00:00.000Z` }))
    renderSidebar({ snapshot: { ...snapshot, workspaces: [workspace, other], conversations }, unreadCounts: { s3: 2 } })
    expect(screen.queryByText('Sessão 11')).not.toBeInTheDocument()
    const row = screen.getByRole('button', { name: /^Instruções de Paz/ })
    expect(row).not.toHaveAttribute('aria-expanded')
    expect(within(row).getByLabelText('Sessões não lidas')).toBeInTheDocument()
    expect(within(row).getByLabelText('2 não lidas')).toHaveTextContent('2')
    enter(workspace.name)
    expect(screen.getByText('Sessão 11')).toBeInTheDocument()
    expect(screen.queryByText('Sessão 0')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Alfa/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Projetos' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver mais 2 sessões' }))
    expect(screen.getByText('Sessão 0')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar aos projetos' }))
    expect(screen.getByRole('heading', { name: 'Projetos' })).toBeInTheDocument()
    expect(screen.queryByText('Sessão 11')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Alfa/ })).toBeInTheDocument()
  })

  it('na visão do projeto, a equipe fica no projeto e a seção global de Boos não aparece', () => {
    renderSidebar()
    enter(workspace.name)
    expect(screen.queryByRole('button', { name: 'Empresa' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nova sessão' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Novo Boo' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: /Equipe do projeto/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Contratar equipe' })).not.toBeInTheDocument()
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

  it('mostra a equipe do projeto e abre a conversa do Boo no projeto, ou aviso quando não há', () => {
    const other: Workspace = { ...workspace, id: 'workspace-2', name: 'Sem time' }
    const withTeam: Workspace = { ...workspace, defaultAgentIds: [agent.id] }
    const onOpenWorkspaceAgent = vi.fn()
    const onOpenAgent = vi.fn()
    const data = { ...snapshot, workspaces: [withTeam, other] }
    const first = renderSidebar({ snapshot: data, onOpenWorkspaceAgent, onOpenAgent })
    enter(workspace.name)
    const team = screen.getByRole('heading', { name: 'Equipe do projeto' }).closest('section')!
    fireEvent.click(within(team).getByRole('button', { name: /^Lyra/ }))
    expect(onOpenWorkspaceAgent).toHaveBeenCalledExactlyOnceWith(workspace.id, agent)
    expect(onOpenAgent).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar aos projetos' }))
    enter('Sem time')
    expect(screen.getByText('Este projeto ainda não tem equipe.')).toBeInTheDocument()
    first.unmount()
    localStorage.clear()
    // Sem conversa por projeto disponível, abre a conversa do Boo.
    renderSidebar({ snapshot: data, onOpenAgent })
    enter(workspace.name)
    fireEvent.click(within(screen.getByRole('heading', { name: 'Equipe do projeto' }).closest('section')!).getByRole('button', { name: /^Lyra/ }))
    expect(onOpenAgent).toHaveBeenCalledExactlyOnceWith(agent)
  })

  it('entra no projeto da conversa aberta por fora da barra', () => {
    const other: Workspace = { ...workspace, id: 'workspace-2', name: 'Outro projeto' }
    const first = session('c-1', 'Primeira')
    const second = session('c-2', 'Segunda', other.id)
    const props = { snapshot: { ...snapshot, workspaces: [workspace, other], conversations: [first, second] }, unreadCounts: {}, agentStates: {}, onSelectConversation: vi.fn(), onStartConversation: vi.fn(), onOpenAgent: vi.fn(), onOpenEditor: vi.fn(), onDeleteWorkspace: vi.fn(), onDeleteConversation: vi.fn(), onDeleteAgent: vi.fn(), onSetChief: vi.fn(), onNotice: vi.fn() }
    const view = render(<Sidebar {...props} selected={first} />)
    // A conversa restaurada na abertura não tira a barra da lista.
    expect(screen.getByRole('heading', { name: 'Projetos' })).toBeInTheDocument()
    view.rerender(<Sidebar {...props} selected={second} />)
    expect(screen.getByText('Segunda')).toBeInTheDocument()
    expect(screen.queryByText('Primeira')).not.toBeInTheDocument()
    view.rerender(<Sidebar {...props} selected={first} />)
    expect(screen.getByText('Primeira')).toBeInTheDocument()
    expect(screen.queryByText('Segunda')).not.toBeInTheDocument()
  })

  it('aberto na Central sem conversa, a primeira conversa aberta já leva ao projeto dela', () => {
    const other: Workspace = { ...workspace, id: 'workspace-2', name: 'Outro projeto' }
    const second = session('c-2', 'Segunda', other.id)
    const props = { snapshot: { ...snapshot, workspaces: [workspace, other], conversations: [second] }, unreadCounts: {}, agentStates: {}, onSelectConversation: vi.fn(), onStartConversation: vi.fn(), onOpenAgent: vi.fn(), onOpenEditor: vi.fn(), onOpenSettings: vi.fn(), onDeleteWorkspace: vi.fn(), onDeleteConversation: vi.fn(), onDeleteAgent: vi.fn(), onSetChief: vi.fn(), onNotice: vi.fn() }
    const view = render(<Sidebar {...props} selected={undefined} />)
    view.rerender(<Sidebar {...props} selected={second} />)
    expect(screen.getByText('Segunda')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voltar aos projetos' })).toBeInTheDocument()
  })

  it('sessão nova cujo projeto chega num snapshot seguinte também leva a barra até ele', () => {
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
    expect(screen.queryByText('Primeira')).not.toBeInTheDocument()
  })

  it('lembra o projeto aberto e volta à lista quando ele some', () => {
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

  /** Seleção em lote pelo menu do projeto: entra nele já selecionando. */
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
  it('abrir o workspace não cria sessão: apenas as ações de nova sessão criam', () => {
    const onSelectWorkspace = vi.fn()
    const onStartConversation = vi.fn()
    renderSidebar({ onSelectWorkspace, onStartConversation })
    // Entrar no projeto também abre a visão dele: barra e área principal falam do mesmo projeto.
    fireEvent.click(screen.getByTitle('Workspace livre'))
    expect(onSelectWorkspace).toHaveBeenCalledExactlyOnceWith(workspace.id)
    fireEvent.contextMenu(screen.getByTitle('Workspace livre'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Abrir projeto' }))
    expect(onSelectWorkspace).toHaveBeenCalledTimes(2)
    expect(onStartConversation).not.toHaveBeenCalled()
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
    const first = renderSidebar({ snapshot: nestedSnapshot })
    expect(screen.getByRole('button', { name: /^Instruções de Paz/ })).toHaveTextContent(/1$/)
    first.unmount()
    renderSidebar({ snapshot: nestedSnapshot, unreadCounts: { c2: 3 } })
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

  it('reordena Boos na lista e sessões do projeto, salvando no banco', async () => {
    const api = installAppAPI({ projectOrder: [], groups: [], sessionOrder: {}, agentOrder: [] })
    renderSidebar({ snapshot: ordered({ ...snapshot, workspaces: [alfa], conversations: [session('c1', 'Primeira', alfa.id, { createdAt: '2026-10-01T00:00:00.000Z' }), session('c2', 'Segunda', alfa.id, { createdAt: '2026-10-02T00:00:00.000Z' })] }) })
    await waitFor(() => expect(api.sidebarLayout).toHaveBeenCalled())
    showBoos()
    fireEvent.keyDown(screen.getByRole('button', { name: /^Lyra/ }), { key: 'ArrowDown', altKey: true })
    expect(api.saveSidebarLayout).toHaveBeenLastCalledWith({ agentOrder: ['agent-2', 'agent-1'] })
    expect(screen.getByRole('status', { name: 'Ordem do sidebar' })).toHaveTextContent('Boo Lyra movido para a posição 2')
    fireEvent.click(screen.getByRole('button', { name: 'Projetos' }))
    enter('Alfa')
    expect(rowNames(/^(Primeira|Segunda)$/)).toEqual(['Segunda', 'Primeira'])
    fireEvent.keyDown(screen.getByRole('button', { name: /^Segunda/ }), { key: 'ArrowDown', altKey: true })
    expect(rowNames(/^(Primeira|Segunda)$/)).toEqual(['Primeira', 'Segunda'])
    expect(api.saveSidebarLayout).toHaveBeenLastCalledWith({ sessionOrder: { [alfa.id]: ['c1', 'c2'] } })
    expect(screen.getByRole('status', { name: 'Ordem do sidebar' })).toHaveTextContent('Sessão Segunda movida para a posição 2')
  })
})
