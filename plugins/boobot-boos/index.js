/** Host do bundle: dono dos Boos. Persiste o cadastro, convoca cada Boo como teammate do Agent Team do DSH (o Lead é o Chief) e expõe a UI. */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { activeAgents, archiveBoo, createBoo, createTeam, deleteTeam, emptyState, normalizeState, setProjects, teamFor, updateAgent, updateTeam } from './store.js'
import { briefing, summon } from './team.js'
import { definitions, presetIdOf } from './preset.js'
import { analyze, applyOutcome, createDelegation, needsNotice, notificationText, pending, prune, taskPrompt } from './delegations.js'
import { resolveProject, resolveTeam } from './lookup.js'
import { addRoutine, describeRule, homeOf, MAX_ROUTINES_PER_AGENT, parseRoutine, removeRoutine, routinesOf, scheduleRequest, setHome } from './routines.js'
import { initialNotes, notebookFile } from './notebook.js'

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
const text = description => ({ type: 'string', required: true, description })
const opt = description => ({ type: 'string', description })
const output = { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }

export const name = 'boobot-boos'
export const inject = ['tools', 'webServer', 'agentTeams', 'systemPrompt', 'workspaceRegistry', 'workingDirectory', 'agentPresets', 'schedule', 'sessionController', 'agents']

export function apply(ctx, config = {}) {
  const file = config.file || join(process.env.DSH_PROFILE_DIR || join(homedir(), '.dsh'), 'boobot-boos.json')
  let state = emptyState()
  // Cadernos fixos em ~/.dsh/boobot-boos/cadernos/<handle>/notas.md (ao lado do cadastro). Criados vazios na primeira vez.
  const notebookRoot = config.notebookDir || join(dirname(file), 'boobot-boos', 'cadernos')
  const notebookFor = agent => notebookFile(notebookRoot, agent)
  const ensureNotebooks = () => Promise.all(activeAgents(state).map(async agent => {
    const path = notebookFor(agent)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, initialNotes(agent), { encoding: 'utf8', flag: 'wx' }).catch(error => { if (error?.code !== 'EEXIST') throw error })
  }))
  let queue = Promise.resolve()
  let registered = []
  const presetStatus = {} // presetId -> 'ok' | mensagem de falha do DSH

  const json = value => JSON.stringify(value, null, 2)
  const workspaces = () => ctx.workspaceRegistry.list().map(({ id, title, path }) => ({ id, title, path }))
  const baseView = () => ({
    agents: activeAgents(state).map(agent => ({ id: agent.id, handle: agent.handle, name: agent.name, role: agent.role, color: agent.color, area: agent.area ?? '', notebook: notebookFor(agent), description: agent.description, instructions: agent.instructions, presetId: presetIdOf(agent), preset: presetStatus[presetIdOf(agent)] ?? 'pendente' })),
    teams: state.teams.map(team => ({ ...team, workspaceIds: Object.entries(state.projects).filter(([, owner]) => owner === team.id).map(([workspaceId]) => workspaceId) })),
    workspaces: workspaces(),
  })

  // Projeto (workspace) da sessão do Lead, pelo diretório de trabalho atual. Sem projeto registrado, devolve undefined.
  const projectOf = async lead => {
    const path = await ctx.workingDirectory.ensure(lead)
    return ctx.workspaceRegistry.resolveByPath(path).catch(() => undefined)
  }

  // Escritas em série e atômicas (arquivo temporário + rename).
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

  // Presets para conversar direto com o Chief ou com um Boo. O registro recusa id repetido: libera os anteriores antes de registrar
  // os novos (sessões abertas mantêm a revisão antiga; as novas usam a atual).
  let syncing = Promise.resolve()
  const sync = () => {
    syncing = syncing.then(async () => {
      const previous = registered
      registered = []
      for (const dispose of previous) { try { await dispose() } catch (error) { ctx.logger?.warn?.(`boobot-boos: ${error?.message ?? error}`) } }
      for (const key of Object.keys(presetStatus)) delete presetStatus[key]
      try { await ensureNotebooks() } catch (error) { ctx.logger?.warn?.(`boobot-boos: cadernos: ${error?.message ?? error}`) }
      for (const definition of definitions(state, notebookFor)) {
        try { registered.push(await ctx.agentPresets.register(definition)); presetStatus[definition.id] = 'ok' } catch (error) {
          presetStatus[definition.id] = String(error?.message ?? error)
          ctx.logger?.warn?.(`boobot-boos: preset ${definition.id} falhou: ${presetStatus[definition.id]}`)
        }
      }
    })
    return syncing
  }
  ctx.effect(() => async () => { const current = registered; registered = []; for (const dispose of current) { try { await dispose() } catch { /* preset já liberado */ } } })

  // Persistir já no primeiro carregamento fixa o id do Chief; depois registra os presets.
  const loaded = readFile(file, 'utf8')
    .then(raw => { state = normalizeState(JSON.parse(raw)) }, error => { if (error?.code !== 'ENOENT') throw error })
    .then(() => save(state))
    .then(sync)
  const run = async fn => { await loaded; return fn() }
  const mutate = fn => run(async () => { const result = fn(state); await save(result.state); await sync(); return result })

  // O DSH não abre sessão sem projeto, então a conversa direta com um Boo acontece num projeto dedicado "Boos", numa pasta do
  // plugin (fora dos seus projetos). Criado só na primeira conversa, para não aparecer na sidebar sem uso.
  const chatDir = config.chatDir || join(dirname(file), 'boobot-boos-chat')
  const chatWorkspace = async () => { await mkdir(chatDir, { recursive: true }); return ctx.workspaceRegistry.create(chatDir, 'Boos') }

  // Sessão "casa" do agente: a conversa fixa que o botão Conversar reabre e onde as rotinas chegam. Criada pelo Host na primeira vez,
  // no projeto "Boos". Se a sessão guardada sumiu, cria outra (`sessionId` conhecido deixa o DSH reaproveitar uma sessão em branco).
  const ensureHome = async agent => {
    const known = homeOf(state, agent.id)
    if (known && await ctx.sessionController.inspect(known).then(() => true, () => false)) return known
    const workspace = await chatWorkspace()
    const { sessionId } = await ctx.sessionController.create({ workspaceId: workspace.id, ...(known ? { sessionId: known } : {}), agentPreset: presetIdOf(agent) })
    await save(setHome(state, agent.id, sessionId))
    return sessionId
  }

  // Rotinas: o DSH guarda e entrega os lembretes (acorda a sessão casa na hora, com o DSH rodando); aqui só ligamos a rotina ao agente.
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const createRoutine = async (agent, input) => {
    const parsed = parseRoutine(input, zone)
    if (routinesOf(state, agent.id).length >= MAX_ROUTINES_PER_AGENT) throw new Error(`Cada agente tem no máximo ${MAX_ROUTINES_PER_AGENT} rotinas.`)
    const sessionId = await ensureHome(agent)
    const record = await ctx.schedule.create(sessionId, scheduleRequest(parsed))
    try {
      const added = addRoutine(state, agent.id, parsed, record.id, sessionId)
      await save(added.state)
      return added.routine
    } catch (error) {
      await ctx.schedule.delete({ sessionId, id: record.id }).catch(() => undefined)
      throw error
    }
  }
  const deleteRoutine = async routineId => {
    const removed = removeRoutine(state, routineId)
    await ctx.schedule.delete({ sessionId: removed.routine.sessionId, id: removed.routine.scheduleId })
    await save(removed.state)
    return removed.routine
  }
  const dropRoutines = async agentId => { for (const routine of routinesOf(state, agentId)) await deleteRoutine(routine.id) }

  // Cadastro completo com as rotinas e a próxima execução de cada uma (lida do DSH; falha na leitura só omite o horário).
  const view = async () => {
    const base = baseView()
    const pending = new Map()
    const nextRunOf = async routine => {
      if (!pending.has(routine.sessionId)) pending.set(routine.sessionId, ctx.schedule.list({ sessionId: routine.sessionId }).catch(() => []))
      return (await pending.get(routine.sessionId)).find(record => record.id === routine.scheduleId)?.scheduledAt ?? null
    }
    const routines = await Promise.all(state.routines.filter(routine => base.agents.some(agent => agent.id === routine.agentId)).map(async routine => ({
      id: routine.id, agentId: routine.agentId, title: routine.title, prompt: routine.prompt, rule: routine.rule, description: describeRule(routine.rule), nextRun: await nextRunOf(routine),
    })))
    return { ...base, routines, delegations: state.delegations.slice(-30).reverse().map(delegationView) }
  }

  // Delegações: o Chief manda uma tarefa a um Boo numa sessão NOVA do Boo, dentro do projeto (aparece na sidebar do projeto). O estado vem do
  // log da própria sessão (último turno), e quando ela para o Host avisa a conversa de origem. Todo trabalho aqui é serializado.
  let settling = Promise.resolve()
  const enqueue = delegation => { settling = settling.then(() => settleDelegation(delegation.id)).catch(error => ctx.logger?.warn?.(`boobot-boos: delegação: ${error?.message ?? error}`)); return settling }
  const patchDelegation = (id, change) => save({ ...state, delegations: state.delegations.map(item => (item.id === id ? { ...item, ...change } : item)) })
  const find = id => state.delegations.find(item => item.id === id)

  const notifyOrigin = async delegation => {
    const text = notificationText(delegation, { state: delegation.status, summary: delegation.summary, error: delegation.error })
    try {
      await ctx.sessionController.prompt({ requestId: randomUUID(), sessionId: delegation.originSessionId, mode: 'queue', content: [{ type: 'text', text }] }, AbortSignal.timeout(30_000))
    } catch (error) {
      // Conversa de origem apagada: não adianta insistir. Qualquer outra falha fica pendente e é tentada de novo no próximo ciclo.
      if (error?.code !== 'session/not-found') throw error
    }
    await patchDelegation(delegation.id, { notified: delegation.status })
  }

  async function settleDelegation(id) {
    let delegation = find(id)
    if (!delegation) return
    if (delegation.status === 'running' || delegation.status === 'blocked') {
      const { events } = await ctx.sessionController.inspect(delegation.sessionId)
      const next = applyOutcome(delegation, analyze(events))
      if (next !== delegation) { await patchDelegation(id, { status: next.status, summary: next.summary, error: next.error, finishedAt: next.finishedAt }); delegation = find(id) }
    }
    if (delegation && needsNotice(delegation)) await notifyOrigin(delegation)
  }

  // A sessão parou de rodar: confere o log das delegações dela (running ou blocked) e avisa a origem se terminou.
  ctx.effect(() => ctx.on('api-session/status', (sessionId, running) => {
    if (running) return
    for (const delegation of state.delegations) if (delegation.sessionId === sessionId && (delegation.status === 'running' || delegation.status === 'blocked')) enqueue(delegation)
  }))
  // Depois de um reinício: o que terminou enquanto o DSH estava fechado, ou ainda não foi avisado, é resolvido pelo log.
  ctx.effect(() => { const timer = setTimeout(() => { for (const delegation of pending(state.delegations)) enqueue(delegation) }, 8000); return () => clearTimeout(timer) })

  const delegate = async (exec, args) => {
    if (!exec?.agent) throw new Error('Só o Lead de uma conversa pode delegar.')
    const boo = activeAgents(state).find(agent => agent.handle === args.handle && agent.role === 'boo')
    if (!boo) throw new Error(`Boo desconhecido: ${args.handle}. Veja boo_list.`)
    const presetId = presetIdOf(boo)
    if (presetStatus[presetId] !== 'ok') throw new Error(`O preset de ${boo.name} não está ativo: ${presetStatus[presetId] ?? 'pendente'}`)
    const project = args.project ? resolveProject(workspaces(), args.project) : await projectOf(exec.agent)
    if (!project) throw new Error('Esta conversa não está em um projeto registrado no DSH: informe `project`.')
    const chief = state.agents.find(agent => agent.role === 'chief' && !agent.archived)
    const { sessionId } = await ctx.sessionController.create({ workspaceId: project.id, agentPreset: presetId })
    const delegation = createDelegation({ agentId: boo.id, handle: boo.handle, name: boo.name, workspaceId: project.id, projectTitle: project.title, sessionId, originSessionId: exec.agent.id, task: args.task })
    // Grava antes de enviar: se o Boo terminar rápido, o evento de "parou" já encontra a delegação.
    await save({ ...state, delegations: prune([...state.delegations, delegation]) })
    try {
      await ctx.sessionController.prompt({ requestId: randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: taskPrompt({ chiefName: chief?.name ?? 'Chief', project, task: delegation.task }) }] }, AbortSignal.timeout(30_000))
    } catch (error) {
      await patchDelegation(delegation.id, { status: 'failed', error: `não consegui enviar a tarefa: ${error?.message ?? error}`, finishedAt: new Date().toISOString() })
      throw error
    }
    return { id: delegation.id, boo: boo.name, projeto: project.title, pasta: project.path, conversaDoBoo: sessionId, status: 'running', aviso: 'Você será avisado nesta conversa, por uma mensagem automática, quando o Boo terminar, parar ou falhar. Use boo_delegation_list para ver o andamento.' }
  }

  const delegationView = delegation => ({ id: delegation.id, boo: delegation.name, handle: delegation.handle, projeto: delegation.projectTitle, status: delegation.status, tarefa: delegation.task.length > 200 ? `${delegation.task.slice(0, 199)}…` : delegation.task, resumo: delegation.summary, erro: delegation.error, conversaDoBoo: delegation.sessionId, origem: delegation.originSessionId, iniciadaEm: delegation.startedAt, terminouEm: delegation.finishedAt })

  // Convoca os Boos para o time do Lead (a sessão que chamou). Novos Boos entram; quem já está no time é mantido. O projeto é o da sessão
  // ou, com `projectRef`, QUALQUER projeto do DSH: aí cada teammate (novo ou já presente) tem a pasta de trabalho apontada para o projeto
  // (`workingDirectory.set`), e o Chief delega de onde estiver. Se o projeto tem um time, só os Boos dele entram; sem time, todos.
  const convoke = (lead, projectRef) => run(async () => {
    const remote = projectRef ? resolveProject(workspaces(), projectRef) : undefined
    const workspace = remote ?? await projectOf(lead)
    const squad = workspace ? teamFor(state, workspace.id) : undefined
    const result = await summon(ctx.agentTeams, lead, state, AbortSignal.timeout(120_000), squad, notebookFor, remote)
    const moved = []
    const moveFailed = []
    if (remote) {
      for (const [handle, sessionId] of Object.entries(result.members)) {
        try {
          const agent = sessionId ? ctx.agents.get(sessionId) : undefined
          if (!agent) throw new Error('sessão do teammate não está ativa')
          await ctx.workingDirectory.set(agent, remote.path)
          moved.push(handle)
        } catch (error) { moveFailed.push({ handle, error: error instanceof Error ? error.message : String(error) }) }
      }
    }
    const { members, ...summary } = result
    const chief = state.agents.find(agent => agent.role === 'chief' && !agent.archived)
    return json({ project: workspace?.title ?? null, team: squad?.name ?? null, ...summary, ...(remote ? { pastaDeTrabalho: remote.path, apontados: moved, falhaAoApontar: moveFailed } : {}), briefing: briefing(state, chief, squad, remote) })
  })

  const tools = [
    defineTool({
      name: 'boo_list', description: 'Lista o Chief e os Boos (agentes especialistas) com nome no time (handle), especialidade e instruções. Só leitura.',
      parameters: {}, output, execute: () => run(async () => json(await view())),
    }),
    defineTool({
      name: 'boo_summon', description: 'Convoca para o seu time (Agent Team) os Boos do time de um projeto (o desta conversa, ou o informado em `project`), ou todos os Boos se o projeto não tem time: cria os que ainda não estão e devolve o briefing de quem faz o quê. Use no início do trabalho ou depois de criar Boos.',
      parameters: { project: { type: 'string', description: 'Nome ou id de QUALQUER projeto do DSH: convoca o time dele e aponta a pasta de trabalho de cada Boo para o projeto, mesmo que esta conversa esteja em outro. Omita para usar o projeto desta conversa.' } }, output,
      execute: (args, exec) => {
        if (!exec?.agent) throw new Error('Só o Lead de uma sessão pode convocar os Boos.')
        return convoke(exec.agent, args.project)
      },
    }),
    defineTool({
      name: 'boo_team_list', description: 'Lista os times (grupos de Boos), seus membros e os projetos a que cada um está associado. Só leitura.',
      parameters: {}, output, execute: () => run(() => json({ teams: baseView().teams, workspaces: workspaces() })),
    }),
    defineTool({
      name: 'boo_team_create', description: 'Cria um time: grupo nomeado de Boos. Opcionalmente já o associa a um projeto: use `project` (nome ou id de qualquer projeto, veja boo_team_list) ou for_this_project para o projeto desta sessão. Um projeto tem no máximo um time.',
      parameters: { name: text('Nome do time'), description: opt('O que o time faz'), members: { type: 'array', required: true, items: { type: 'string' }, description: 'Handles dos Boos (nome no time, ex.: lyra)' }, for_this_project: { type: 'boolean', description: 'Associar ao projeto desta sessão' }, project: { type: 'string', description: 'Nome ou id do projeto a associar (qualquer projeto do DSH, não só o desta sessão)' } }, output,
      execute: (args, exec) => run(async () => {
        const agentIds = args.members.map(handle => { const boo = activeAgents(state).find(agent => agent.handle === handle && agent.role !== 'chief'); if (!boo) throw new Error(`Boo desconhecido: ${handle}`); return boo.id })
        const workspace = args.project ? resolveProject(workspaces(), args.project) : args.for_this_project ? await projectOf(exec.agent) : undefined
        if (args.for_this_project && !args.project && !workspace) throw new Error('Esta sessão não está em um projeto registrado no DSH.')
        const result = createTeam(state, { name: args.name, description: args.description, agentIds, workspaceIds: workspace ? [workspace.id] : undefined })
        await save(result.state)
        return json(result.team)
      }),
    }),
    defineTool({
      name: 'boo_team_assign', description: 'Associa um time existente a um projeto, substituindo o time anterior dele. Informe `project` (nome ou id de QUALQUER projeto do DSH; sem ele vale o projeto desta sessão) e `team` (nome ou id). Sem `team`, remove o time do projeto.',
      parameters: { team: opt('Nome ou id do time; omita para desassociar'), team_id: opt('Igual a team (compatibilidade)'), project: opt('Nome ou id do projeto; omita para usar o projeto desta sessão') }, output,
      execute: (args, exec) => run(async () => {
        const workspace = args.project ? resolveProject(workspaces(), args.project) : await projectOf(exec.agent)
        if (!workspace) throw new Error('Esta sessão não está em um projeto registrado no DSH: informe `project`.')
        const ref = args.team ?? args.team_id
        const team = ref ? resolveTeam(state.teams, ref) : undefined
        const projects = { ...state.projects }
        delete projects[workspace.id]
        let next = { ...state, projects }
        if (team) next = setProjects(next, team.id, [...Object.entries(next.projects).filter(([, owner]) => owner === team.id).map(([id]) => id), workspace.id])
        await save(next)
        return json({ project: workspace.title, team: teamFor(next, workspace.id)?.name ?? null })
      }),
    }),
    defineTool({
      name: 'boo_create', description: 'Cria um Boo: agente especialista com quem o usuário conversa e a quem o Chief delega. Explique nome e especialidade antes de usar.',
      parameters: { name: text('Nome do Boo'), description: text('Especialidade em uma frase'), instructions: opt('Instruções detalhadas de como o Boo trabalha'), color: opt('Cor do corpo do avatar em #rrggbb (opcional)'), area: opt('Área do Boo, ex.: design, backend, financeiro (opcional)') }, output,
      execute: args => mutate(current => createBoo(current, args)).then(result => json(result.agent)),
    }),
    defineTool({
      name: 'boo_update', description: 'Edita nome, especialidade ou instruções de um Boo ou do Chief. Vale para novas sessões.',
      parameters: { agent_id: text('Id do Boo'), name: opt('Novo nome'), description: opt('Nova especialidade'), instructions: opt('Novas instruções'), color: opt('Nova cor do avatar em #rrggbb'), area: opt('Nova área') }, output,
      execute: ({ agent_id: id, ...fields }) => mutate(current => updateAgent(current, id, fields)).then(result => json(result.agent)),
    }),
    defineTool({
      name: 'boo_archive', description: 'Arquiva um Boo (não apaga). O Chief não pode ser arquivado.',
      parameters: { agent_id: text('Id do Boo') }, output,
      execute: args => run(() => dropRoutines(args.agent_id)).then(() => mutate(current => archiveBoo(current, args.agent_id))).then(result => json(result.agent)),
    }),
    defineTool({
      name: 'boo_delegate',
      description: 'Delega uma tarefa a um Boo numa conversa NOVA dele, dentro do projeto (qualquer projeto do DSH, pelo nome). A conversa aparece na sidebar do projeto e o usuário pode abri-la. Quando o Boo termina, para ou falha, você recebe nesta conversa uma mensagem automática com o resultado. A tarefa deve ser completa e autocontida.',
      parameters: { handle: text('Nome do Boo no time (handle), ex.: dev'), project: opt('Nome ou id do projeto; omita para usar o projeto desta conversa'), task: text('Tarefa completa e autocontida, com o contexto que o Boo precisa') }, output,
      execute: (args, exec) => run(async () => json(await delegate(exec, args))),
    }),
    defineTool({
      name: 'boo_delegation_list',
      description: 'Lista as delegações feitas aos Boos com o andamento de cada uma (running, done, blocked, failed), por projeto. Atualiza o status das que ainda rodam. Só leitura.',
      parameters: { project: opt('Filtrar por projeto (nome ou id)'), status: opt('Filtrar por status: running, done, blocked ou failed') }, output,
      execute: args => run(async () => {
        const project = args.project ? resolveProject(workspaces(), args.project) : undefined
        for (const delegation of state.delegations.filter(item => item.status === 'running' || item.status === 'blocked')) await enqueue(delegation)
        const list = state.delegations.filter(item => (!project || item.workspaceId === project.id) && (!args.status || item.status === args.status))
        return json(list.slice(-30).reverse().map(delegationView))
      }),
    }),
    defineTool({
      name: 'boo_routine_list', description: 'Lista as rotinas (tarefas agendadas) dos agentes, com a próxima execução de cada uma. Só leitura.',
      parameters: {}, output, execute: () => run(async () => json((await view()).routines)),
    }),
    defineTool({
      name: 'boo_routine_create',
      description: 'Cria uma rotina para um agente: um prompt que o DSH entrega na conversa fixa dele no horário definido (precisa do DSH aberto). Explique ao usuário o que vai rodar e quando antes de criar. Frequências: daily (time), weekly (time e weekdays), every (minutes), cron (expression).',
      parameters: {
        handle: text('Nome do agente no time (handle), ex.: lyra ou chief'), title: text('Título curto da rotina'), prompt: text('Instrução completa que o agente receberá a cada execução'),
        kind: text('daily, weekly, every ou cron'), time: opt('HH:mm, para daily e weekly'), weekdays: { type: 'array', items: { type: 'integer' }, description: 'Dias de 1 (segunda) a 7 (domingo), para weekly' },
        minutes: { type: 'integer', description: 'Intervalo em minutos, para every' }, expression: opt('Cron de 5 campos, para cron'),
      }, output,
      execute: args => run(async () => {
        const agent = activeAgents(state).find(item => item.handle === args.handle)
        if (!agent) throw new Error(`Agente desconhecido: ${args.handle}`)
        const routine = await createRoutine(agent, { title: args.title, prompt: args.prompt, rule: { kind: args.kind, time: args.time, weekdays: args.weekdays, minutes: args.minutes, expression: args.expression } })
        return json({ id: routine.id, agent: agent.name, title: routine.title, quando: describeRule(routine.rule) })
      }),
    }),
    defineTool({
      name: 'boo_routine_delete', description: 'Apaga uma rotina pelo id (veja boo_routine_list).',
      parameters: { routine_id: text('Id da rotina') }, output,
      execute: args => run(async () => json({ deleted: (await deleteRoutine(args.routine_id)).title })),
    }),
  ]
  for (const tool of tools) ctx.effect(() => ctx.tools.register(tool))

  // Instrução global (após a política de time): o Lead sabe que é o Chief e que pode criar, editar e convocar Boos. A lista é lida a cada
  // montagem do prompt, então reflete o cadastro atual.
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'boobot-boos',
    order: 650,
    text: () => {
      const team = activeAgents(state).filter(agent => agent.role !== 'chief')
      return [
        'Boobot: se a sua persona já diz que você é um Boo específico, ignore esta seção inteira. Caso contrário, se você é o Lead desta sessão, você é o Chief. Os Boos são agentes especialistas permanentes que fazem parte do time.',
        'Você pode criar Boos (boo_create: explique antes o nome e a especialidade e peça confirmação se o usuário não foi específico), editar (boo_update) e arquivar (boo_archive). Depois de criar, use boo_summon para colocá-los no time, e delegue por send_message e pelo quadro team_task_*.',
        team.length ? `Boos cadastrados: ${team.map(boo => `${boo.handle} (${boo.description})`).join('; ')}. Se ainda não estiverem no time desta sessão, use boo_summon.` : 'Ainda não há Boos cadastrados.',
        'Times (boo_team_create, boo_team_assign, boo_team_list) são grupos de Boos associados a um projeto. Você pode associar um time a QUALQUER projeto do DSH pelo nome (parâmetro `project`), mesmo estando em outra conversa; boo_team_list mostra os projetos. boo_summon convoca, na sua sessão, o time do projeto dela ou, com `project`, o time de QUALQUER projeto do DSH: nesse caso a pasta de trabalho de cada Boo é apontada para o projeto e você delega de onde está, com caminhos absolutos (não precisa pedir ao usuário para abrir outra conversa).',
        'Delegação (boo_delegate, boo_delegation_list): para mandar uma tarefa a um Boo em um projeto, use boo_delegate: cria uma conversa nova do Boo no projeto (visível na sidebar) e você recebe aqui um aviso automático quando ele terminar, parar ou falhar. Use boo_delegation_list para ver o andamento por projeto. Prefira isso a convocar o time quando a tarefa for de um Boo só ou de longa duração.',
        'Rotinas (boo_routine_create, boo_routine_list, boo_routine_delete) agendam um prompt para um agente: o DSH o entrega na conversa fixa dele no horário (precisa do DSH aberto). Antes de criar uma, confirme com o usuário o que roda e quando.',
        'Se você é um teammate e não o Lead, ignore as instruções de criação: trabalhe na sua especialidade.',
      ].join('\n')
    },
  }))

  // `/boos` faz o mesmo pelo composer: o usuário convoca o time sem passar pelo modelo.
  ctx.inject(['commands'], commandCtx => commandCtx.commands.register({
    name: 'boos',
    description: 'Convoca os Boos para o time desta sessão; com um nome de projeto, aponta o trabalho deles para esse projeto',
    input: { hint: '[projeto]' },
    recordInput: false,
    handler: async invocation => {
      try { return { kind: 'success', text: await convoke(invocation.agent, (invocation.rawInput ?? '').trim() || undefined) } } catch (error) { return { kind: 'error', text: error instanceof Error ? error.message : String(error) } }
    },
  }))

  // A UI fala com o Host por esta rota (mesma origem do Web GUI, só loopback): GET lê, POST age e devolve o cadastro atualizado.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/boobot/boos.json',
    handler: async (req, res) => {
      const reply = (status, body) => { res.statusCode = status; res.setHeader('content-type', 'application/json; charset=utf-8'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(body)) }
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket?.remoteAddress ?? '')) return reply(403, { error: 'loopback only' })
      try {
        if (req.method === 'POST') {
          const chunks = []
          for await (const chunk of req) { chunks.push(chunk); if (chunks.length > 64) throw new Error('Corpo grande demais.') }
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
          if (body.action === 'notes') {
            // Conteúdo do caderno, só leitura (o agente é quem escreve; você pode editar o arquivo à mão).
            const agent = await run(() => activeAgents(state).find(item => item.id === body.id))
            if (!agent) throw new Error('Boo não encontrado.')
            const notes = await readFile(notebookFor(agent), 'utf8').catch(error => { if (error?.code === 'ENOENT') return ''; throw error })
            return reply(200, { notes: notes.slice(0, 40_000), path: notebookFor(agent) })
          }
          if (body.action === 'chat') {
            // Garante a sessão casa do agente (criada pelo Host na primeira vez); o Client só a abre.
            const agent = await run(() => activeAgents(state).find(item => item.id === body.id))
            if (!agent) throw new Error('Boo não encontrado.')
            const presetId = presetIdOf(agent)
            if (presetStatus[presetId] !== 'ok') throw new Error(`O preset de ${agent.name} não está ativo: ${presetStatus[presetId] ?? 'pendente'}`)
            const sessionId = await run(() => ensureHome(agent))
            return reply(200, { ...(await run(view)), chat: { sessionId } })
          }
          if (body.action === 'routine_create') {
            const agent = await run(() => activeAgents(state).find(item => item.id === body.id))
            if (!agent) throw new Error('Boo não encontrado.')
            await run(() => createRoutine(agent, body))
            return reply(200, await run(view))
          }
          if (body.action === 'routine_delete') {
            await run(() => deleteRoutine(body.id))
            return reply(200, await run(view))
          }
          if (body.action === 'archive') await run(() => dropRoutines(body.id))
          await mutate(current => {
            if (body.action === 'create') return createBoo(current, body)
            if (body.action === 'update') return updateAgent(current, body.id, body)
            if (body.action === 'archive') return archiveBoo(current, body.id)
            if (body.action === 'team_create') return createTeam(current, body)
            if (body.action === 'team_update') return updateTeam(current, body.id, body)
            if (body.action === 'team_delete') return deleteTeam(current, body.id)
            throw new Error('Ação desconhecida.')
          })
        } else if (req.method !== 'GET') return reply(405, { error: 'method not allowed' })
        return reply(200, await run(view))
      } catch (error) { return reply(400, { error: error instanceof Error ? error.message : String(error) }) }
    },
  }))
}
