import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Agent, BoardSnapshot, Snapshot } from '../../../../shared/v9'
import { BoardPage } from './BoardPage'

const agents = [
  { id: 'worker', name: 'Ana', alias: 'ana' },
  { id: 'reviewer', name: 'Bia', alias: 'bia' },
] as Agent[]
const base = {
  assistant: { id: 'assistant', name: 'Boo', alias: 'boo' }, agents, workspaces: [{ id: 'project', name: 'Produto', kind: 'project', path: 'C:/produto', archived: false }, { id: 'other-project', name: 'Loja', kind: 'project', path: 'C:/loja', archived: false }],
  conversations: [], messages: [], runs: [], fileChanges: [], approvals: [], terminalEnabled: true,
  missions: [{ id: 'worker-mission', status: 'completed' }, { id: 'review-mission', status: 'completed', result: 'Aprovado.' }],
} as unknown as Snapshot
const team = { id: 'dev', name: 'Desenvolvimento', description: '', agentIds: ['worker', 'reviewer'], createdAt: '2026-10-29', updatedAt: '2026-10-29' }
const otherTeam = { ...team, id: 'marketing', name: 'Marketing' }
const task = { id: 'task', title: 'Corrigir login', description: 'Tratar token expirado.', acceptanceCriteria: 'Retornar erro 401.', kind: 'code', teamId: 'dev', assigneeAgentId: 'worker', reviewerAgentId: 'reviewer', source: 'user', status: 'review', workspaceId: 'project', executionWorkspaceId: 'worktree', branch: 'board/task', currentMissionId: 'worker-mission', currentReviewMissionId: 'review-mission', reviewRound: 0, reviewDecision: null, reviewFeedback: null, blockedReason: null, result: 'Implementação pronta.', integrationEvidence: null, createdAt: '2026-10-29', updatedAt: '2026-10-29', startedAt: '2026-10-29', completedAt: null }
const board: BoardSnapshot = { teams: [team], tasks: [task], events: [], missions: [{ taskId: 'task', role: 'worker', round: 0, missionId: 'worker-mission', conversationId: 'worker-chat', createdAt: '2026-10-29' }, { taskId: 'task', role: 'reviewer', round: 0, missionId: 'review-mission', conversationId: 'review-chat', createdAt: '2026-10-29' }], evidence: [] } as unknown as BoardSnapshot

const original = window.appAPI
beforeEach(() => {
  window.appAPI = {
    saveBoardTeam: vi.fn(async input => ({ id: 'new-team', ...input })),
    createBoardTask: vi.fn(async input => ({ id: 'new-task', ...input })),
    updateBoardTask: vi.fn(async () => undefined),
    assignBoardTask: vi.fn(async () => undefined),
    reassignBoardTask: vi.fn(async () => undefined),
    boardTaskAction: vi.fn(async () => undefined),
    addBoardEvidence: vi.fn(async () => undefined),
  } as unknown as typeof window.appAPI
})
afterEach(() => { window.appAPI = original })

describe('BoardPage', () => {
  it('mostra o estado vazio e mantém a criação explícita do board separada do chat', () => {
    render(<BoardPage snapshot={{ ...base, board: { teams: [], tasks: [], events: [], missions: [], evidence: [] } } as Snapshot} onOpenConversation={vi.fn()} onNotice={vi.fn()} readOnly={false} />)
    expect(screen.getByRole('heading', { name: 'Board da empresa' })).toBeInTheDocument()
    expect(screen.getByText('Nenhuma tarefa no board ainda')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nova equipe' })).toBeInTheDocument()
  })

  it('cria uma equipe, cria um card e inicia o responsável/revisor escolhidos', async () => {
    render(<BoardPage snapshot={{ ...base, board: { teams: [], tasks: [], events: [], missions: [], evidence: [] } } as Snapshot} onOpenConversation={vi.fn()} onNotice={vi.fn()} readOnly={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Nova equipe' }))
    fireEvent.change(screen.getByLabelText('Nome da equipe'), { target: { value: 'Desenvolvimento' } })
    fireEvent.click(screen.getByLabelText('Ana'))
    fireEvent.click(screen.getByLabelText('Bia'))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar equipe' }))
    await waitFor(() => expect(window.appAPI.saveBoardTeam).toHaveBeenCalledWith({ name: 'Desenvolvimento', description: '', agentIds: ['worker', 'reviewer'] }))

    fireEvent.click(screen.getByRole('button', { name: 'Nova tarefa' }))
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Corrigir login' } })
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Tratar token expirado.' } })
    fireEvent.change(screen.getByLabelText('Critérios de aceite'), { target: { value: 'Retornar erro 401.' } })
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'code' } })
    fireEvent.change(screen.getByLabelText('Workspace do projeto'), { target: { value: 'project' } })
    fireEvent.change(screen.getByLabelText('Responsável'), { target: { value: 'worker' } })
    fireEvent.change(screen.getByLabelText('Revisor'), { target: { value: 'reviewer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar e iniciar' }))
    await waitFor(() => expect(window.appAPI.createBoardTask).toHaveBeenCalledWith({ title: 'Corrigir login', description: 'Tratar token expirado.', acceptanceCriteria: 'Retornar erro 401.', kind: 'code', teamId: 'new-team', workspaceId: 'project' }))
    await waitFor(() => expect(window.appAPI.assignBoardTask).toHaveBeenCalledWith('new-task', 'worker', 'reviewer'))
  })

  it('permite abrir a conversa do revisor e oculta mutações em leitura PWA', async () => {
    const openConversation = vi.fn()
    const { rerender } = render(<BoardPage snapshot={{ ...base, board } as Snapshot} onOpenConversation={openConversation} onNotice={vi.fn()} readOnly={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir conversa do revisor' }))
    expect(openConversation).toHaveBeenCalledWith('review-chat')
    expect(screen.getByRole('button', { name: 'Pedir alterações' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar revisão' }))
    await waitFor(() => expect(window.appAPI.boardTaskAction).toHaveBeenCalledWith('task', 'approve', ''))
    fireEvent.click(screen.getByRole('button', { name: 'Pedir alterações' }))
    fireEvent.change(screen.getByLabelText('Feedback para Corrigir login'), { target: { value: 'Trate o token expirado.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }))
    await waitFor(() => expect(window.appAPI.boardTaskAction).toHaveBeenCalledWith('task', 'request_changes', 'Trate o token expirado.'))
    fireEvent.change(screen.getByLabelText('Nova evidência Corrigir login'), { target: { value: 'Teste de expiração passou.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Anexar evidência' }))
    await waitFor(() => expect(window.appAPI.addBoardEvidence).toHaveBeenCalledWith('task', { kind: 'note', label: 'Evidência', summary: 'Teste de expiração passou.' }))
    rerender(<BoardPage snapshot={{ ...base, board } as Snapshot} onOpenConversation={openConversation} onNotice={vi.fn()} readOnly />)
    expect(screen.queryByRole('button', { name: 'Nova tarefa' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aprovar revisão' })).not.toBeInTheDocument()
  })

  it('exige evidência para fechar integração e filtra tarefas por texto e status', async () => {
    const onNotice = vi.fn()
    const integrationTask = { ...task, status: 'integration' as const }
    const integrationBoard = { ...board, teams: [team, otherTeam], tasks: [integrationTask, { ...integrationTask, id: 'other', title: 'Atualizar perfil', kind: 'general' as const, teamId: 'marketing', assigneeAgentId: 'reviewer', workspaceId: 'other-project', status: 'done' as const }] }
    render(<BoardPage snapshot={{ ...base, board: integrationBoard } as Snapshot} onOpenConversation={vi.fn()} onNotice={onNotice} readOnly={false} />)
    expect(screen.getAllByRole('article')).toHaveLength(2)
    fireEvent.change(screen.getByLabelText('Buscar tarefas'), { target: { value: 'login' } })
    expect(screen.getAllByRole('article')).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('Filtrar equipe'), { target: { value: 'dev' } })
    fireEvent.change(screen.getByLabelText('Filtrar responsável'), { target: { value: 'worker' } })
    fireEvent.change(screen.getByLabelText('Filtrar projeto'), { target: { value: 'project' } })
    fireEvent.change(screen.getByLabelText('Filtrar tipo'), { target: { value: 'code' } })
    fireEvent.change(screen.getByLabelText('Filtrar status'), { target: { value: 'integration' } })
    expect(screen.getAllByRole('article')).toHaveLength(1)
    const integrate = screen.getByRole('button', { name: 'Registrar integração' })
    expect(integrate).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Evidência de integração Corrigir login'), { target: { value: 'PR #123 integrado.' } })
    expect(integrate).toBeEnabled()
    fireEvent.click(integrate)
    await waitFor(() => expect(window.appAPI.boardTaskAction).toHaveBeenCalledWith('task', 'integrate', 'PR #123 integrado.'))
  })

  it('permite reatribuir uma tarefa bloqueada por uma equipe', async () => {
    const blocked = { ...task, status: 'blocked' as const, blockedReason: 'Aguardando credenciais.' }
    render(<BoardPage snapshot={{ ...base, board: { ...board, tasks: [blocked] } } as Snapshot} onOpenConversation={vi.fn()} onNotice={vi.fn()} readOnly={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reatribuir' }))
    fireEvent.change(screen.getByLabelText('Responsável para Corrigir login'), { target: { value: 'reviewer' } })
    fireEvent.change(screen.getByLabelText('Revisor para Corrigir login'), { target: { value: 'worker' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar reatribuição' }))
    await waitFor(() => expect(window.appAPI.reassignBoardTask).toHaveBeenCalledWith('task', 'reviewer', 'worker'))
  })

  it('permite atribuir depois um card que ficou na fila sem responsáveis', async () => {
    const backlog = { ...task, status: 'backlog' as const, assigneeAgentId: null, reviewerAgentId: null, currentMissionId: null, currentReviewMissionId: null }
    render(<BoardPage snapshot={{ ...base, board: { ...board, tasks: [backlog] } } as Snapshot} onOpenConversation={vi.fn()} onNotice={vi.fn()} readOnly={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Atribuir' }))
    fireEvent.change(screen.getByLabelText('Responsável para Corrigir login'), { target: { value: 'worker' } })
    fireEvent.change(screen.getByLabelText('Revisor para Corrigir login'), { target: { value: 'reviewer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar atribuição' }))
    await waitFor(() => expect(window.appAPI.assignBoardTask).toHaveBeenCalledWith('task', 'worker', 'reviewer'))
  })

  it('edita os dados do card enquanto ele ainda não tem execução', async () => {
    const backlog = { ...task, status: 'backlog' as const, assigneeAgentId: null, reviewerAgentId: null, currentMissionId: null, currentReviewMissionId: null }
    render(<BoardPage snapshot={{ ...base, board: { ...board, tasks: [backlog] } } as Snapshot} onOpenConversation={vi.fn()} onNotice={vi.fn()} readOnly={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar tarefa' }))
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Atualizar login' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(window.appAPI.updateBoardTask).toHaveBeenCalledWith('task', { title: 'Atualizar login', description: 'Tratar token expirado.', acceptanceCriteria: 'Retornar erro 401.', kind: 'code', teamId: 'dev', workspaceId: 'project' }))
  })

  it('mostra posição e motivo quando a execução do board ainda aguarda vaga', () => {
    const queuedTask = { ...task, status: 'doing' as const, currentMissionId: 'worker-mission' }
    const queuedBoard = { ...board, tasks: [queuedTask] }
    const queuedRun = { id: 'queued-run', conversationId: 'worker-chat', status: 'queued', createdAt: '2026-10-29T10:00:00.000Z' }
    render(<BoardPage snapshot={{ ...base, runs: [queuedRun], board: queuedBoard } as unknown as Snapshot} onOpenConversation={vi.fn()} onNotice={vi.fn()} readOnly={false} />)
    expect(screen.getByText('Aguardando vaga · posição 1')).toBeInTheDocument()
    expect(screen.getByText(/limite global de duas execuções ou a liberação do mesmo workspace/)).toBeInTheDocument()
  })
})
