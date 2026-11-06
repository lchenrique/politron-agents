/** Prévia de desenvolvimento do board com dados fictícios em vários estados; as ações não chegam ao processo principal. */
import type { Agent, BoardSnapshot, BoardTask, BoardTaskStatus, Snapshot } from '../../../../shared/v9'
import { emptySnapshot } from '../app/appShellShared'
import { BoardPage } from '../board/BoardPage'

const at = '2026-10-31T01:00:00.000Z'
const agent = (id: string, name: string, color: string): Agent => ({ id, name, alias: id, description: '', instructions: '', runtime: 'claude', model: '', color, avatar: '', canWrite: true, computerUse: false, approvalMode: 'automatic', revision: 1, createdAt: at })
const agents = [agent('freya', 'Freya', '#7ee0b5'), agent('hermes', 'Hermes', '#e9eaf0'), agent('tyr', 'Tyr', '#ff8fa3')]
const team = { id: 'dev', name: 'Desenvolvimento', description: 'Equipe do Politron', agentIds: agents.map(item => item.id), createdAt: at, updatedAt: at }
const titles: [BoardTaskStatus, string][] = [
  ['backlog', 'Revisar textos de onboarding'], ['backlog', 'Investigar consumo de memória do renderer em sessões longas com muitas mensagens e anexos'],
  ['ready', 'Atalhos de teclado no board'], ['doing', 'Aplicar modo plano/revisão às ferramentas nativas de escrita e terminal'],
  ['doing', 'Corrigir selects/dropdowns não clicáveis nas Configurações'], ['review', 'Reduzir erros de lint (187 erros) até build limpo'],
  ['rework', 'Estabilizar teste EPERM e atualizar documentação de delegação'], ['blocked', 'Publicar no canal beta'],
  ['integration', 'Painel de delegações na Central do Chief'], ['done', 'Cards estilo Jira no BoardPage'], ['done', 'Antigravity sem travar'],
]
const tasks: BoardTask[] = titles.map(([status, title], index) => ({
  id: `task-${index}`, title, description: 'Descrição detalhada da tarefa com contexto suficiente para o responsável começar sem perguntar.', acceptanceCriteria: '- Critério 1\n- Critério 2',
  kind: 'code', teamId: 'dev', assigneeAgentId: agents[index % 3]!.id, reviewerAgentId: agents[(index + 1) % 3]!.id, source: index % 2 ? 'chief' : 'user', originConversationId: null, status,
  workspaceId: 'project', executionWorkspaceId: null, branch: status === 'backlog' ? null : `board/task-${index}`, currentMissionId: null, currentReviewMissionId: null, reviewRound: status === 'rework' ? 1 : 0,
  reviewDecision: status === 'rework' ? 'changes' : null, reviewFeedback: status === 'rework' ? 'Faltou cobrir o caso de pasta bloqueada.' : null, blockedReason: status === 'blocked' ? 'Aguardando credencial do canal beta.' : null,
  result: status === 'done' ? 'Entregue com testes.' : null, integrationEvidence: null, createdAt: at, updatedAt: at, startedAt: status === 'backlog' ? null : at, completedAt: status === 'done' ? at : null,
}))
const board: BoardSnapshot = { teams: [team], tasks, events: [], missions: [], evidence: [] } as BoardSnapshot
const snapshot = { ...emptySnapshot, agents, workspaces: [{ id: 'project', name: 'politron', kind: 'local', path: 'D:/projetos/politron', archived: false }], board } as unknown as Snapshot

export default function BoardGallery() {
  return <div className="h-dvh overflow-auto bg-background text-foreground" data-board-gallery>
    <BoardPage snapshot={snapshot} onOpenConversation={() => undefined} onNotice={() => undefined} />
  </div>
}
