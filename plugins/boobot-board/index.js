/** Host do bundle: tools do Board para o agente, persistência em JSON e o comando /board que a UI consulta. */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { assignTask, createTask, createTeam, emptyState, moveTask, STATUSES } from './store.js'

const text = value => ({ type: 'string', required: true, description: value })
const opt = (type, description) => ({ type, description })
const render = (_args, value) => [{ type: 'text', text: value }]
const output = { schema: { type: 'string' }, render }

export function apply(ctx, config = {}) {
  const file = config.file || join(process.env.DSH_PROFILE_DIR || join(homedir(), '.dsh'), 'boobot-board.json')
  // Ids dos Boos: `config.agents` enquanto o serviço de presets não é lido (ver README, "A confirmar").
  const agentIds = () => (Array.isArray(config.agents) ? config.agents : [])
  let state = emptyState()
  let queue = Promise.resolve()

  const loaded = readFile(file, 'utf8').then(raw => { state = { ...emptyState(), ...JSON.parse(raw) } }, error => { if (error?.code !== 'ENOENT') throw error })

  // Escritas em série e atômicas (arquivo temporário + rename): uma falha não corrompe o Board salvo.
  const save = next => {
    state = next
    queue = queue.then(async () => {
      await mkdir(dirname(file), { recursive: true })
      const tmp = `${file}.${process.pid}.tmp`
      await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8')
      await rename(tmp, file)
    })
    return queue
  }
  const run = async fn => { await loaded; return fn() }
  const json = value => JSON.stringify(value, null, 2)

  const view = () => ({
    teams: state.teams,
    tasks: state.tasks.map(task => ({ ...task, team: state.teams.find(team => team.id === task.teamId)?.name ?? null })),
    statuses: STATUSES,
  })

  const tools = [
    defineTool({
      name: 'board_team_list', description: 'Lista as equipes do Board e os Boos disponíveis. Só leitura.',
      parameters: {}, output,
      execute: () => run(() => json({ teams: state.teams, availableAgents: agentIds() })),
    }),
    defineTool({
      name: 'board_task_list', description: 'Lista os cartões do Board, com filtro opcional por equipe e status. Só leitura.',
      parameters: { team_id: opt('string', 'Id da equipe'), status: opt('string', `Um de: ${STATUSES.join(', ')}`) }, output,
      execute: args => run(() => json(state.tasks.filter(task => (!args.team_id || task.teamId === args.team_id) && (!args.status || task.status === args.status)))),
    }),
    defineTool({
      name: 'board_team_create', description: 'Cria uma equipe do Board. Explique o nome e os membros antes de usar.',
      parameters: { name: text('Nome da equipe'), description: opt('string', 'Descrição'), agents: { type: 'array', required: true, items: { type: 'string' }, description: 'Ids dos Boos da equipe' } }, output,
      execute: args => run(async () => {
        const result = createTeam(state, args, agentIds())
        await save(result.state)
        return json(result.team)
      }),
    }),
    defineTool({
      name: 'board_task_create', description: 'Cria um cartão no Board e atribui responsável e revisor distintos da equipe.',
      parameters: {
        title: text('Título'), description: text('Descrição'), acceptance_criteria: text('Critérios de aceite'),
        kind: text('general ou code'), team_id: text('Id da equipe'), workspace_id: opt('string', 'Obrigatório para code'),
        assignee: text('Id do Boo responsável'), reviewer: text('Id do Boo revisor'),
      }, output,
      execute: args => run(async () => {
        const result = createTask(state, { title: args.title, description: args.description, acceptanceCriteria: args.acceptance_criteria, kind: args.kind, teamId: args.team_id, workspaceId: args.workspace_id },
          { worker: args.assignee, reviewer: args.reviewer })
        await save(result.state)
        return json(result.task)
      }),
    }),
    defineTool({
      name: 'board_task_move', description: 'Move um cartão de status. Bloqueio exige motivo em `note`.',
      parameters: { task_id: text('Id do cartão'), status: text(`Um de: ${STATUSES.join(', ')}`), note: opt('string', 'Resultado ou motivo') }, output,
      execute: args => run(async () => {
        const result = moveTask(state, args.task_id, args.status, { note: args.note ?? '', actor: { type: 'agent', id: null } })
        await save(result.state)
        return json(result.task)
      }),
    }),
    defineTool({
      name: 'board_task_assign', description: 'Define responsável e revisor distintos, da equipe, para um cartão parado ou bloqueado.',
      parameters: { task_id: text('Id do cartão'), assignee: text('Id do Boo responsável'), reviewer: text('Id do Boo revisor') }, output,
      execute: args => run(async () => {
        const result = assignTask(state, args.task_id, args.assignee, args.reviewer, agentIds(), { type: 'agent', id: null })
        await save(result.state)
        return json(result.task)
      }),
    }),
  ]

  const disposers = tools.map(tool => ctx.tools.register(tool))

  // A UI pede o estado (`/board`) e age (`/board move <id> <status>`); ambos passam pelas mesmas funções das tools.
  const command = ctx.commands?.register({
    name: 'board',
    description: 'Mostra o Board da empresa',
    input: { hint: '[move <id> <status>]' },
    recordInput: false,
    handler: async ({ rawInput }) => run(async () => {
      const [verb, id, status] = rawInput.trim().split(/\s+/)
      try {
        if (verb === 'move') { const result = moveTask(state, id, status); await save(result.state) }
        return { kind: 'success', text: json(view()) }
      } catch (error) {
        return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
      }
    }),
  })

  return () => { for (const dispose of disposers) dispose?.(); command?.() }
}
