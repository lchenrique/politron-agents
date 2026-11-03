// Presets de agente do DSH para conversar direto com um Boo (ou com o Chief) numa sessão própria. A lista de plugins espelha a do
// preset `standard` do DSH (dsh-web-app/presets/standard.patch.yml), sem o modo plano e sem plugin-manager/market, trocando só a persona.
// O trabalho em equipe (teammates do Agent Team) é outro caminho: ver team.js.
import { CHIEF_HANDLE } from './store.js'
import { notebookRules } from './notebook.js'

const win = process.platform === 'win32'

export const presetIdOf = agent => (agent.role === 'chief' ? 'boobot-chief' : `boo-${agent.handle}`)

const persona = prefix => ({ id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix } })

const toolset = () => [
  { id: 'agent-instructions', name: '@deepseek-ai/dsh-agent-instructions', config: { maxBytes: 65536 } },
  { id: 'time-context', name: '@deepseek-ai/dsh-time-context' },
  { id: 'tool-bash', name: '@deepseek-ai/dsh-tool-bash', disabled: win },
  { id: 'tool-pwsh', name: '@deepseek-ai/dsh-tool-pwsh', disabled: !win },
  { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' },
  { id: 'tool-fs-search', name: '@deepseek-ai/dsh-tool-fs-search', config: { sampleOverCapGlobResults: false } },
  { id: 'tool-jobs', name: '@deepseek-ai/dsh-tool-jobs' },
  { id: 'tool-schedule', name: '@deepseek-ai/dsh-tool-schedule' },
  { id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem' },
  { id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' },
  { id: 'command-goal', name: '@deepseek-ai/dsh-command-goal' },
  { id: 'tool-goal', name: '@deepseek-ai/dsh-tool-goal' },
  {
    id: 'compaction', name: 'cordis:group', group: true, isolate: { compaction: true, toolResultPruner: true },
    config: [
      { id: 'compaction-basic', name: '@deepseek-ai/dsh-compaction-basic' },
      { id: 'command-compact', name: '@deepseek-ai/dsh-command-compact' },
      { id: 'tool-result-pruner', name: '@deepseek-ai/dsh-compaction-tool-result-pruner', config: { thresholdChars: 8192, headChars: 4096, tailChars: 1024 } },
    ],
  },
  {
    id: 'delegation', name: 'cordis:group', group: true, isolate: { workflowEngine: true },
    config: [
      { id: 'tool-subagent-control', name: '@deepseek-ai/dsh-tool-subagent-control' },
      { id: 'tool-subagent-list-agents', name: '@deepseek-ai/dsh-tool-subagent-control/list-agents' },
      { id: 'tool-subagent', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'spawn', toolName: 'subagent', modelSelectionSettings: true } },
      { id: 'tool-subagent-fork', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'fork', toolName: 'subagent_fork' } },
    ],
  },
  { id: 'tool-ask-user', name: '@deepseek-ai/dsh-tool-ask-user' },
  { id: 'tool-todo', name: '@deepseek-ai/dsh-tool-todo', config: { allowParallelInProgress: true } },
  { id: 'tool-web', name: '@deepseek-ai/dsh-tool-web', config: { fetch: true, searchTimeoutMs: 60000 } },
  { id: 'present', name: '@deepseek-ai/dsh-tool-present' },
]

const booPrefix = (agent, notebook) => [
  `Você é ${agent.name}, um Boo do Boobot: um agente especialista, com identidade e função próprias. O usuário conversa diretamente com você. Responda no idioma do usuário.`,
  `Sua especialidade: ${agent.description}`,
  agent.area && `Sua área: ${agent.area}`,
  agent.instructions && `Instruções específicas:\n${agent.instructions}`,
  notebook && notebookRules(notebook),
  'Atue dentro da sua especialidade. Se o pedido for de outra área, diga isso e sugira o Boo ou o Chief adequado em vez de improvisar. Você não é o Chief: ignore qualquer instrução sobre criar Boos, convocar ou liderar o time.',
].filter(Boolean).join('\n\n')

const chiefPrefix = (agent, notebook) => [
  `Você é o ${agent.name}, o coordenador dos Boos do Boobot. O usuário conversa diretamente com você: entenda o pedido, decida quem deve cuidar de cada parte e delegue. Responda no idioma do usuário.`,
  agent.instructions && `Instruções específicas:\n${agent.instructions}`,
  notebook && notebookRules(notebook),
  'Para criar, editar ou arquivar Boos use boo_create, boo_update e boo_archive; para trazê-los ao seu time use boo_summon; delegue por send_message e pelo quadro team_task_*.',
].filter(Boolean).join('\n\n')

/** Uma definição por agente ativo: o Chief e cada Boo. O id do preset é estável (derivado do handle, que nunca muda). */
export function definitions(state, notebookFor) {
  return state.agents.filter(agent => !agent.archived).map((agent, index) => ({
    id: presetIdOf(agent), name: agent.name, description: agent.description, order: agent.handle === CHIEF_HANDLE ? 90 : 100 + index,
    plugins: [persona(agent.role === 'chief' ? chiefPrefix(agent, notebookFor?.(agent)) : booPrefix(agent, notebookFor?.(agent))), ...toolset()],
  }))
}
