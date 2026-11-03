/** Host do bundle: tools do Board para o agente, persistência em JSON e o comando /board que a UI consulta. */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { activeAgents, archiveAgent, assignTask, createAgent, createTask, createTeam, emptyState, moveTask, normalizeState, STATUSES, updateAgent } from './store.js'

// `@deepseek-ai/dsh-tools` não resolve para um bundle linkado de fora do perfil; ToolDefinition é um objeto simples,
// então `parameters` vira JSON Schema aqui (campos com `required: true` entram em `required`).
const defineTool = tool => {
  const properties = {}
  const required = []
  for (const [key, { required: isRequired, ...schema }] of Object.entries(tool.parameters)) {
    properties[key] = schema
    if (isRequired) required.push(key)
  }
  return { ...tool, parameters: { type: 'object', additionalProperties: false, properties, required } }
}

const text = value => ({ type: 'string', required: true, description: value })
const opt = (type, description) => ({ type, description })
const render = (_args, value) => [{ type: 'text', text: value }]
const output = { schema: { type: 'string' }, render }

export const name = 'boobot-board'
export const inject = ['tools', 'webServer']

export function apply(ctx, config = {}) {
  const file = config.file || join(process.env.DSH_PROFILE_DIR || join(homedir(), '.dsh'), 'boobot-board.json')
  // Os Boos e o Chief pertencem ao plugin (estado em JSON, versão 2); nada é lido do Politron nem de presets do DSH.
  let state = emptyState()
  const roster = () => activeAgents(state).map(({ id, name, role, description, model }) => ({ id, name, role, description, model }))
  const agentIds = () => activeAgents(state).map(agent => agent.id)
  let queue = Promise.resolve()

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
  // Persistir já no primeiro carregamento fixa o id do Chief (sem isso ele mudaria a cada reinício até a primeira edição).
  const loaded = readFile(file, 'utf8')
    .then(raw => { const stored = JSON.parse(raw); state = normalizeState(stored); return stored.version === 2 ? undefined : save(state) },
      error => { if (error?.code !== 'ENOENT') throw error; return save(state) })
  const run = async fn => { await loaded; return fn() }
  const json = value => JSON.stringify(value, null, 2)

  const view = () => ({
    teams: state.teams,
    tasks: state.tasks.map(task => ({ ...task, team: state.teams.find(team => team.id === task.teamId)?.name ?? null })),
    statuses: STATUSES,
    agents: roster(),
  })

  const tools = [
    defineTool({
      name: 'board_team_list', description: 'Lista as equipes do Board e os Boos disponíveis. Só leitura.',
      parameters: {}, output,
      execute: () => run(() => json({ teams: state.teams, availableAgents: roster() })),
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
    defineTool({
      name: 'board_agent_create', description: 'Cria um Boo (agente) do Boobot. Explique nome e função antes de usar.',
      parameters: { name: text('Nome do Boo'), description: opt('string', 'Função em uma frase'), instructions: opt('string', 'Instruções do Boo'), model: opt('string', 'Modelo preferido') }, output,
      execute: args => run(async () => {
        const result = createAgent(state, args)
        await save(result.state)
        return json(result.agent)
      }),
    }),
    defineTool({
      name: 'board_agent_update', description: 'Edita nome, função, instruções ou modelo de um Boo existente (inclui o Chief).',
      parameters: { agent_id: text('Id do Boo'), name: opt('string', 'Novo nome'), description: opt('string', 'Nova função'), instructions: opt('string', 'Novas instruções'), model: opt('string', 'Novo modelo') }, output,
      execute: args => run(async () => {
        const { agent_id: id, ...fields } = args
        const result = updateAgent(state, id, fields)
        await save(result.state)
        return json(result.agent)
      }),
    }),
    defineTool({
      name: 'board_agent_archive', description: 'Arquiva um Boo (não apaga). O Chief não pode ser arquivado e o Boo não pode ter cartões em aberto.',
      parameters: { agent_id: text('Id do Boo') }, output,
      execute: args => run(async () => {
        const result = archiveAgent(state, args.agent_id)
        await save(result.state)
        return json(result.agent)
      }),
    }),
  ]

  const disposers = tools.map(tool => ctx.tools.register(tool))

  // A UI pede o estado (`/board`) e age (`/board move <id> <status>`); ambos passam pelas mesmas funções das tools.
  // `commands` é opcional: registra quando o serviço existir (o efeito é descartado com o plugin).
  ctx.inject(['commands'], commandCtx => commandCtx.commands.register({
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
  }))

  // A UI lê o Board por GET na mesma origem do Web GUI (só loopback; o Board não deve vazar para a rede).
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/boobot/board.json',
    handler: async (req, res) => {
      const reply = (status, body) => { res.statusCode = status; res.setHeader('content-type', 'application/json; charset=utf-8'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(body)) }
      const address = req.socket?.remoteAddress ?? ''
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) return reply(403, { error: 'loopback only' })
      if (req.method === 'POST') {
        try {
          const chunks = []
          for await (const chunk of req) { chunks.push(chunk); if (chunks.length > 64) throw new Error('Corpo grande demais.') }
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
          await run(async () => {
            const result = body.action === 'agent_create' ? createAgent(state, body)
              : body.action === 'agent_update' ? updateAgent(state, body.id, body)
              : body.action === 'agent_archive' ? archiveAgent(state, body.id)
              : (() => { throw new Error('Ação desconhecida.') })()
            await save(result.state)
          })
          return reply(200, await run(view))
        } catch (error) { return reply(400, { error: error instanceof Error ? error.message : String(error) }) }
      }
      if (req.method !== 'GET') return reply(405, { error: 'method not allowed' })
      try { reply(200, await run(view)) } catch (error) { reply(500, { error: error instanceof Error ? error.message : String(error) }) }
    },
  }))

  return () => { for (const dispose of disposers) dispose?.() }
}
