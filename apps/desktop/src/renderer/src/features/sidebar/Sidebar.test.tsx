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

function renderSidebar(overrides: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  return render(<Sidebar snapshot={snapshot} selected={undefined} unreadCounts={{}} agentStates={{}} onSelectConversation={vi.fn()} onStartConversation={vi.fn()} onOpenAgent={vi.fn()} onOpenEditor={vi.fn()} onDeleteWorkspace={vi.fn()} onDeleteConversation={vi.fn()} onDeleteAgent={vi.fn()} onSetChief={vi.fn()} onNotice={vi.fn()} {...overrides} />)
}
/** Cabeçalho (botão que recolhe) da seção de um projeto. */
const header = (name: string) => screen.getByRole('button', { name: new RegExp('^' + name) })
const sectionOf = (name: string) => screen.getByRole('region', { name })

describe('estrutura da barra: busca, Boos e uma lista de conversas', () => {
  it('não tem rodapé nem controles da janela; tem busca, nova sessão e novo projeto, sem o seletor Projetos | Agentes', () => {
    installHostsAPI()
    const onStartConversation = vi.fn()
    const onOpenEditor = vi.fn()
    renderSidebar({ onStartConversation, onOpenEditor })
    expect(document.querySelector('footer')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Selecionar host' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Recolher barra lateral' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Visão da barra lateral' })).not.toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Buscar conversas' })).toBeInTheDocument()
    const start = screen.getByRole('button', { name: 'Nova sessão' })
    expect(start).toHaveAttribute('aria-keyshortcuts', 'Control+N')
    fireEvent.click(start)
    expect(onStartConversation).toHaveBeenCalledExactlyOnceWith()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Novo projeto ou pasta' }), { key: 'Enter' })
    expect(screen.getByRole('menu')).toHaveAttribute('data-dsh-menu-surface', 'true')
    expect(screen.getByRole('menuitem', { name: 'Nova pasta de projetos' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Novo projeto' }))
    expect(onOpenEditor).toHaveBeenCalledExactlyOnceWith({ kind: 'workspace' })
  })

  it('cada linha é uma conversa: título, Boo, hora e a prévia da última fala', () => {
    const onSelectConversation = vi.fn()
    const conversations = [
      session('c-1', 'Revisar login', workspace.id, { preview: 'Pronto, o login\nfoi revisado.', updatedAt: '2026-10-20T10:00:00.000Z' }),
      // Aberta pela seção de agentes com o nome do Boo: o título vem do primeiro pedido, sem repetir "Lyra".
      session('c-2', 'Lyra', workspace.id, { firstPrompt: 'Como está o deploy?', preview: 'Tudo no ar.' }),
      session('c-3', 'Nova conversa'),
    ]
    renderSidebar({ snapshot: { ...snapshot, conversations }, onSelectConversation })
    const row = screen.getByRole('button', { name: 'Revisar login · Lyra' })
    expect(row).toHaveTextContent('Pronto, o login foi revisado.')
    expect(row.querySelector('.dsh-chat-time')?.textContent).not.toBe('')
    expect(row.querySelector('[data-slot="avatar"]')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Como está o deploy? · Lyra' })).toHaveTextContent('Tudo no ar.')
    expect([...document.querySelectorAll('.dsh-chat-title')].map(item => item.textContent)).not.toContain('Lyra')
    expect(screen.getByRole('button', { name: 'Nova conversa · Lyra' })).toHaveTextContent('Nenhuma mensagem ainda')
    fireEvent.click(row)
    expect(onSelectConversation).toHaveBeenCalledExactlyOnceWith('c-1')
  })

  it('o Boo e o grupo abrem a prévia, deixando a linha de cima para o título e a hora; erro vira rótulo curto', () => {
    const conversations = [
      session('c-1', 'Revisar login', workspace.id, { preview: 'Pronto.' }),
      session('c-2', 'Equipe de lançamento', workspace.id, { kind: 'group', agentIds: [agent.id, 'x', 'y', 'z'], preview: 'Combinado.' }),
      session('c-3', 'Deploy', workspace.id, { preview: 'Failed to authenticate: OAuth session expired', previewFailed: true }),
    ]
    renderSidebar({ snapshot: { ...snapshot, conversations } })
    const top = (name: string) => screen.getByRole('button', { name }).querySelector('.dsh-chat-top')?.textContent
    expect(top('Revisar login · Lyra')).not.toContain('Lyra')
    expect(screen.getByRole('button', { name: 'Revisar login · Lyra' })).toHaveTextContent('Lyra: Pronto.')
    expect(top('Equipe de lançamento · Grupo · 4')).not.toContain('Grupo')
    expect(screen.getByRole('button', { name: 'Equipe de lançamento · Grupo · 4' })).toHaveTextContent('Grupo · 4: Combinado.')
    const failed = screen.getByRole('button', { name: 'Deploy · Lyra' })
    expect(failed).toHaveTextContent('Erro na última execução')
    expect(failed).not.toHaveTextContent('Failed')
    expect(failed.querySelector('[data-error]')).not.toBeNull()
  })

  it('worktrees não viram subgrupo com o nome cru da branch: as conversas ficam no projeto, e arquivar fica no menu da conversa', () => {
    const local: Workspace = { ...workspace, id: 'ws-local', name: 'Politron', kind: 'local' }
    const tree: Workspace = { ...workspace, id: 'ws-tree', name: 'board-34a6', kind: 'worktree', branch: 'board/34a631c8-dc24-46c1-ac00-000000000000', parentWorkspaceId: local.id }
    const conversations = [session('c-root', 'Planejar', local.id, { updatedAt: '2026-10-01T00:00:00.000Z' }), session('c-tree', 'Board · Aplicar revisão', tree.id, { updatedAt: '2026-10-02T00:00:00.000Z' })]
    renderSidebar({ snapshot: { ...snapshot, workspaces: [local, tree], conversations } })
    expect(screen.queryByText(/board\/34a631c8/)).not.toBeInTheDocument()
    expect([...sectionOf('Politron').querySelectorAll('.dsh-chat-title')].map(item => item.textContent)).toEqual(['Board · Aplicar revisão', 'Planejar'])
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Board · Aplicar revisão · Lyra' }).parentElement!)
    expect(screen.getByRole('menuitem', { name: 'Arquivar worktree' })).toBeInTheDocument()
  })

  it('ordena da conversa mais recente para a mais antiga e limita cada projeto, sem esconder a aberta', () => {
    const conversations = Array.from({ length: 11 }, (_, index) => session('s' + index, 'Sessão ' + index, workspace.id, { updatedAt: `2026-10-${String(index + 1).padStart(2, '0')}T00:00:00.000Z` }))
    renderSidebar({ snapshot: { ...snapshot, conversations }, selected: conversations[0] })
    const titles = () => [...sectionOf(workspace.name).querySelectorAll('.dsh-chat-title')].map(item => item.textContent)
    expect(titles()).toEqual(['Sessão 10', 'Sessão 9', 'Sessão 8', 'Sessão 7', 'Sessão 6', 'Sessão 5', 'Sessão 4', 'Sessão 3', 'Sessão 0'])
    expect(screen.getByRole('button', { name: 'Sessão 0 · Lyra' })).toHaveAttribute('aria-current', 'page')
    fireEvent.click(screen.getByRole('button', { name: 'Ver mais 2 conversas' }))
    expect(titles()).toHaveLength(11)
  })

  it('seções por projeto recolhem pelo cabeçalho, lembram a escolha e avisam quando recolhidas', () => {
    const other: Workspace = { ...workspace, id: 'workspace-2', name: 'Loja', kind: 'local' }
    const conversations = [session('c-1', 'Checkout', other.id), session('c-2', 'Home', other.id)]
    const first = renderSidebar({ snapshot: { ...snapshot, workspaces: [workspace, other], conversations, approvals: [pending('c-1')] }, unreadCounts: { 'c-2': 2 } })
    const loja = header('Loja')
    expect(loja).toHaveAttribute('aria-expanded', 'true')
    expect(within(loja).getByLabelText('2 não lidas')).toHaveTextContent('2')
    fireEvent.click(loja)
    expect(loja).toHaveAttribute('aria-expanded', 'false')
    expect(within(sectionOf('Loja')).queryByText('Checkout')).not.toBeInTheDocument()
    expect(within(loja).getByLabelText('Projeto precisa de atenção')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('politron.sidebar.closed-sections') || '[]')).toEqual(['project:workspace-2'])
    first.unmount()
    renderSidebar({ snapshot: { ...snapshot, workspaces: [workspace, other], conversations } })
    expect(header('Loja')).toHaveAttribute('aria-expanded', 'false')
  })

  it('abrir o projeto e nova sessão ficam no cabeçalho; abrir não cria sessão', () => {
    const onSelectWorkspace = vi.fn()
    const onStartConversation = vi.fn()
    renderSidebar({ onSelectWorkspace, onStartConversation })
    fireEvent.click(screen.getByRole('button', { name: 'Abrir projeto Instruções de Paz' }))
    expect(onSelectWorkspace).toHaveBeenCalledExactlyOnceWith(workspace.id)
    fireEvent.contextMenu(header(workspace.name))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Abrir projeto' }))
    expect(onSelectWorkspace).toHaveBeenCalledTimes(2)
    expect(onStartConversation).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Nova sessão em Instruções de Paz' }))
    expect(onStartConversation).toHaveBeenCalledExactlyOnceWith(workspace.id)
  })

  it('a conversa aberta por fora da barra abre a seção recolhida do projeto dela', () => {
    localStorage.setItem('politron.sidebar.closed-sections', JSON.stringify(['project:workspace-1']))
    const conversation = session('c-1', 'Primeira')
    const props = { snapshot: { ...snapshot, conversations: [conversation] }, unreadCounts: {}, agentStates: {}, onSelectConversation: vi.fn(), onStartConversation: vi.fn(), onOpenAgent: vi.fn(), onOpenEditor: vi.fn(), onDeleteWorkspace: vi.fn(), onDeleteConversation: vi.fn(), onDeleteAgent: vi.fn(), onSetChief: vi.fn(), onNotice: vi.fn() }
    const view = render(<Sidebar {...props} selected={undefined} />)
    expect(screen.queryByText('Primeira')).not.toBeInTheDocument()
    view.rerender(<Sidebar {...props} selected={conversation} />)
    expect(screen.getByText('Primeira')).toBeInTheDocument()
  })
})

describe('estado de cada conversa no avatar e na prévia', () => {
  it('aprovação, pergunta e missão viram a prévia em âmbar; execução gira no avatar', () => {
    const conversations = [session('c-aprovar', 'Notas'), session('c-pergunta', 'Dúvida'), session('c-missao', 'Migração'), session('c-rodando', 'Agendamentos', workspace.id, { preview: 'Vou começar.' })]
    const mission = { id: 'm-1', title: 'Migrar banco', conversationId: 'c-missao', status: 'waiting', question: 'Posso apagar a tabela antiga?' } as Mission
    renderSidebar({ snapshot: { ...snapshot, conversations, missions: [mission], runs: [running('c-rodando')], approvals: [pending('c-aprovar'), pending('c-pergunta', { id: 'q', kind: 'question', details: { question: 'Qual banco usar?' } })] } })
    expect(screen.getByRole('button', { name: 'Notas · Lyra · aguardando você' })).toHaveTextContent('Aprovar: Lyra quer alterar notes.txt')
    expect(screen.getByRole('button', { name: 'Dúvida · Lyra · aguardando você' })).toHaveTextContent('Lyra pergunta: Qual banco usar?')
    expect(screen.getByRole('button', { name: 'Migração · Lyra · aguardando você' })).toHaveTextContent('Responder: Posso apagar a tabela antiga?')
    const busy = screen.getByRole('button', { name: 'Agendamentos · Lyra · em execução' })
    expect(busy).toHaveTextContent('Vou começar.')
    expect(busy.querySelector('[data-tone="running"]')).not.toBeNull()
    expect(document.querySelectorAll('.dsh-chat-badge[data-tone="attention"]')).toHaveLength(3)
  })

  it('delegações não viram linhas: não lidas e aprovações sobem para a conversa que delegou, e a busca acha a filha', () => {
    const conversations = [session('chief', 'Plano do Atlas'), session('c1', 'Pedido: Examen · Contexto: monorepo BubbleDesk', workspace.id, { parentConversationId: 'chief' }), session('c2', 'Mimir · revisar login', workspace.id, { parentConversationId: 'chief' })]
    renderSidebar({ snapshot: { ...snapshot, conversations, approvals: [pending('c1', { kind: 'command', details: {} })] }, unreadCounts: { c2: 3 } })
    expect(screen.queryByText('Mimir · revisar login')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delegaç/ })).not.toBeInTheDocument()
    const parent = screen.getByRole('button', { name: 'Plano do Atlas · Lyra · aguardando você' })
    expect(parent).toHaveTextContent('Aprovar: Lyra quer rodar um comando')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar conversas' }), { target: { value: 'revisar login' } })
    expect(screen.getByRole('button', { name: 'Mimir · revisar login · Lyra · 3 não lidas' })).toBeInTheDocument()
  })
})

describe('busca', () => {
  it('filtra por título, prévia e Boo; Esc limpa e volta às seções', () => {
    const mira: Agent = { ...agent, id: 'agent-2', name: 'Mira', alias: 'mira' }
    const conversations = [session('c-1', 'Checkout', workspace.id, { preview: 'cupom aplicado' }), session('c-2', 'Home', workspace.id, { agentIds: [mira.id] }), session('c-3', 'Notas')]
    renderSidebar({ snapshot: { ...snapshot, agents: [agent, mira], conversations } })
    const input = screen.getByRole('searchbox', { name: 'Buscar conversas' })
    fireEvent.change(input, { target: { value: 'cupom' } })
    const results = () => [...screen.getByRole('region', { name: 'Resultados da busca' }).querySelectorAll('.dsh-chat-title')].map(item => item.textContent)
    expect(results()).toEqual(['Checkout'])
    expect(screen.getByRole('button', { name: 'Checkout · Lyra' })).toHaveTextContent('Instruções de Paz · Lyra: cupom aplicado')
    fireEvent.change(input, { target: { value: 'mira' } })
    expect(results()).toEqual(['Home'])
    fireEvent.change(input, { target: { value: 'nada disso' } })
    expect(screen.getByText('Nenhuma conversa encontrada.')).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input).toHaveValue('')
    expect(sectionOf(workspace.name)).toBeInTheDocument()
  })
})

describe('seção de agentes', () => {
  it('Chief primeiro com coroa; clicar abre a conversa; o menu promove e remove o Chief; + cria um Boo', () => {
    const chief: Agent = { ...agent, role: 'chief' }
    const alba: Agent = { ...agent, id: 'agent-2', name: 'Alba', alias: 'alba' }
    const onOpenAgent = vi.fn()
    const onSetChief = vi.fn()
    const onOpenEditor = vi.fn()
    renderSidebar({ snapshot: { ...snapshot, agents: [alba, chief] }, onOpenAgent, onSetChief, onOpenEditor, agentStates: { 'agent-2': 'working' } })
    const strip = screen.getByRole('region', { name: 'Agentes' })
    const boos = within(strip).getAllByRole('button').map(item => item.getAttribute('aria-label'))
    expect(boos).toEqual(['Lyra, Chief · livre', 'Alba · trabalhando', 'Novo agente'])
    const lyra = within(strip).getByRole('button', { name: /^Lyra, Chief/ })
    expect(lyra.querySelector('svg.lucide-crown')).not.toBeNull()
    fireEvent.click(lyra)
    expect(onOpenAgent).toHaveBeenCalledExactlyOnceWith(chief)
    fireEvent.contextMenu(lyra)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remover papel de Chief' }))
    expect(onSetChief).toHaveBeenCalledExactlyOnceWith(chief, false)
    fireEvent.click(within(strip).getByRole('button', { name: 'Novo agente' }))
    expect(onOpenEditor).toHaveBeenCalledExactlyOnceWith({ kind: 'agent' })
  })

  it('promove a Chief pelo menu e diferencia os Boos só pela cor', () => {
    const custom = { ...agent, avatar: 'data:image/png;base64,AAAA', pitsHeadAccessory: 'boo-king-crown' } as Agent
    const onSetChief = vi.fn()
    const onOpenAgent = vi.fn()
    const { container } = renderSidebar({ snapshot: { ...snapshot, agents: [custom], conversations: [session('c-1', 'Notas')] }, onSetChief, onOpenAgent })
    expect(container.querySelector('img')).toBeNull()
    expect(container.innerHTML).toContain('#7565e8')
    fireEvent.contextMenu(within(screen.getByRole('region', { name: 'Agentes' })).getByRole('button', { name: /^Lyra/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Promover a Chief' }))
    expect(onSetChief).toHaveBeenCalledExactlyOnceWith(custom, true)
    fireEvent.contextMenu(within(screen.getByRole('region', { name: 'Agentes' })).getByRole('button', { name: /^Lyra/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Nova conversa' }))
    expect(onOpenAgent).toHaveBeenCalledExactlyOnceWith(custom, true)
  })
})

describe('menus, favoritos e exclusão', () => {
  afterEach(() => { delete (window as { appAPI?: unknown }).appAPI })

  it('abre ações do projeto e o submenu de pastas em superfícies DSH; "Abrir pasta" fica no menu', () => {
    const openFolder = vi.fn(async () => undefined)
    window.appAPI = { openFolder } as unknown as typeof window.appAPI
    const local: Workspace = { ...workspace, id: 'ws-local', name: 'Site', kind: 'local' }
    renderSidebar({ snapshot: { ...snapshot, workspaces: [local], conversations: [session('c-site', 'Home', local.id)] } })
    fireEvent.contextMenu(header('Site'))
    expect(screen.getByRole('menu')).toHaveAttribute('data-dsh-menu-surface', 'true')
    fireEvent.focus(screen.getByRole('menuitem', { name: 'Mover para pasta' }))
    expect(screen.getAllByRole('menu')).toHaveLength(2)
    expect(screen.getByRole('menuitem', { name: 'Sem pasta' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Abrir pasta' }))
    expect(openFolder).toHaveBeenCalledExactlyOnceWith('c-site')
  })

  it('projeto favorito sobe ao topo sem se repetir; conversa favorita entra em Favoritos', () => {
    const other: Workspace = { ...workspace, id: 'workspace-2', name: 'Alfa', kind: 'local' }
    renderSidebar({ snapshot: { ...snapshot, workspaces: [workspace, other], conversations: [session('c-1', 'Notas', other.id)] } })
    const names = () => [...document.querySelectorAll('.dsh-section-name')].map(item => item.textContent)
    expect(names()).toEqual(['Alfa', 'Instruções de Paz'])
    fireEvent.contextMenu(header('Instruções de Paz'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Favoritar projeto' }))
    expect(names()).toEqual(['Instruções de Paz', 'Alfa'])
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Notas · Lyra' }).parentElement!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Favoritar sessão' }))
    expect(within(screen.getByRole('region', { name: 'Favoritos' })).getByText('Notas')).toBeInTheDocument()
  })

  it('usa modal para cancelar ou confirmar exclusão sem chamar window.confirm', async () => {
    const conversation = session('thread-delete', 'Apagar teste')
    const onDeleteConversation = vi.fn()
    const confirm = vi.spyOn(window, 'confirm')
    renderSidebar({ snapshot: { ...snapshot, conversations: [conversation] }, onDeleteConversation })
    const actions = screen.getByRole('button', { name: 'Ações da conversa Apagar teste' })
    fireEvent.contextMenu(actions.parentElement!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir conversa' }))
    expect(screen.getByRole('dialog')).toHaveAttribute('data-dsh-modal', 'true')
    expect(screen.getByRole('dialog')).toHaveTextContent('Excluir a conversa “Apagar teste”?')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onDeleteConversation).not.toHaveBeenCalled()
    fireEvent.contextMenu(actions.parentElement!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir conversa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }))
    expect(onDeleteConversation).toHaveBeenCalledExactlyOnceWith(conversation.id)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(confirm).not.toHaveBeenCalled()
    confirm.mockRestore()
  })

  /** Seleção em lote pelo menu do projeto. */
  function startSelecting() {
    fireEvent.contextMenu(header(workspace.name))
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

describe('sessões antigas', () => {
  it('exibe sessões legadas dentro do Livre, sem lista avulsa', () => {
    const legacy: Workspace = { ...workspace, id: 'legacy', name: '' }
    const free: Workspace = { ...workspace, id: 'free', name: 'Livre' }
    renderSidebar({ snapshot: { ...snapshot, workspaces: [legacy, free], conversations: [session('legacy-session', 'Sessão preservada', legacy.id)] } })
    expect(screen.queryByText('Sessões antigas')).not.toBeInTheDocument()
    expect(within(sectionOf('Livre')).getByText('Sessão preservada')).toBeInTheDocument()
  })

  it('mostra "Sessões antigas" só quando existem e não há Livre', () => {
    const legacy: Workspace = { ...workspace, id: 'legacy', name: '' }
    renderSidebar({ snapshot: { ...snapshot, workspaces: [legacy], conversations: [session('legacy-session', 'Sessão preservada', legacy.id)] } })
    expect(within(sectionOf('Sessões antigas')).getByText('Sessão preservada')).toBeInTheDocument()
  })
})

describe('reordenação do sidebar', () => {
  const alfa: Workspace = { ...workspace, id: 'ws-alfa', name: 'Alfa', kind: 'local' }
  const beta: Workspace = { ...workspace, id: 'ws-beta', name: 'Beta', kind: 'local' }
  function installAppAPI(saved: Awaited<ReturnType<NonNullable<typeof window.appAPI>['sidebarLayout']>>) {
    const api = { sidebarLayout: vi.fn(async () => saved), saveSidebarLayout: vi.fn(async (input: object) => ({ projectOrder: [], groups: [], sessionOrder: {}, agentOrder: [], ...input })) }
    window.appAPI = api as unknown as typeof window.appAPI
    return api
  }
  afterEach(() => { delete (window as { appAPI?: unknown }).appAPI })
  const sectionNames = () => [...document.querySelectorAll('.dsh-section-name')].map(item => item.textContent)

  it('usa menu DSH nas ações da pasta e abre o modal de renomear', async () => {
    installAppAPI({ projectOrder: [], groups: [{ name: 'Clientes', workspaceIds: [alfa.id] }], sessionOrder: {}, agentOrder: [] })
    renderSidebar({ snapshot: { ...snapshot, workspaces: [alfa, beta] } })
    fireEvent.click(await screen.findByRole('button', { name: 'Ações da pasta Clientes' }))
    expect(screen.getByRole('menu')).toHaveAttribute('data-dsh-menu-surface', 'true')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Renomear pasta' }))
    expect(screen.getByRole('dialog', { name: 'Renomear pasta' })).toHaveAttribute('data-dsh-modal', 'true')
  })

  it('migra uma vez as pastas antigas do localStorage para o banco', async () => {
    localStorage.setItem('politron.sidebar.groups', JSON.stringify(['Clientes']))
    localStorage.setItem('politron.sidebar.workspace-groups', JSON.stringify({ [alfa.id]: 'Clientes' }))
    const api = installAppAPI(null)
    renderSidebar({ snapshot: { ...snapshot, workspaces: [alfa, beta] } })
    await waitFor(() => expect(api.saveSidebarLayout).toHaveBeenCalledWith({ projectOrder: [], agentOrder: [], sessionOrder: {}, groups: [{ name: 'Clientes', workspaceIds: [alfa.id] }] }))
    expect(screen.getByRole('button', { name: 'Recolher Clientes' })).toBeInTheDocument()
  })

  it('aplica a ordem salva, põe projetos novos no topo e move com Alt+seta no cabeçalho anunciando a posição', async () => {
    const novo: Workspace = { ...workspace, id: 'ws-novo', name: 'Novo', kind: 'local' }
    const api = installAppAPI({ projectOrder: [beta.id, alfa.id], groups: [], sessionOrder: {}, agentOrder: [] })
    renderSidebar({ snapshot: { ...snapshot, workspaces: [alfa, beta, novo] } })
    await waitFor(() => expect(sectionNames()).toEqual(['Novo', 'Beta', 'Alfa']))
    fireEvent.keyDown(header('Alfa'), { key: 'ArrowUp', altKey: true })
    expect(sectionNames()).toEqual(['Novo', 'Alfa', 'Beta'])
    expect(api.saveSidebarLayout).toHaveBeenLastCalledWith({ groups: [], projectOrder: [novo.id, alfa.id, beta.id] })
    expect(screen.getByRole('status', { name: 'Ordem do sidebar' })).toHaveTextContent('Projeto Alfa movido para a posição 2')
    // Sem Alt, a seta não reordena.
    fireEvent.keyDown(header('Alfa'), { key: 'ArrowUp' })
    expect(api.saveSidebarLayout).toHaveBeenCalledTimes(1)
  })

  it('reordena agentes na seção com Alt+seta, salvando no banco', async () => {
    const api = installAppAPI({ projectOrder: [], groups: [], sessionOrder: {}, agentOrder: [] })
    renderSidebar({ snapshot: { ...snapshot, agents: [agent, { ...agent, id: 'agent-2', name: 'Mira', alias: 'mira' }], workspaces: [alfa] } })
    await waitFor(() => expect(api.sidebarLayout).toHaveBeenCalled())
    fireEvent.keyDown(within(screen.getByRole('region', { name: 'Agentes' })).getByRole('button', { name: /^Lyra/ }), { key: 'ArrowDown', altKey: true })
    expect(api.saveSidebarLayout).toHaveBeenLastCalledWith({ agentOrder: ['agent-2', 'agent-1'] })
    expect(screen.getByRole('status', { name: 'Ordem do sidebar' })).toHaveTextContent('Boo Lyra movido para a posição 2')
  })
})
