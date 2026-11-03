// Convocação dos Boos para o Agent Team nativo do DSH. O Lead da sessão é o Chief; cada Boo vira um teammate nomeado (com sessão
// própria, visível em Agent Team > Members). Lógica sem I/O: o serviço `agentTeams` entra por parâmetro.
import { boos } from './store.js'
import { notebookRules } from './notebook.js'

/** Primeira mensagem do teammate: a identidade do Boo. O DSH entrega o prompt inicial sem alterações. */
export const teammatePrompt = (boo, notebook) => [
  `Você é ${boo.name}, um Boo do Boobot: um agente especialista, membro permanente deste time. Seu nome no time é "${boo.handle}". Responda no idioma do usuário.`,
  `Sua especialidade: ${boo.description}`,
  boo.area && `Sua área: ${boo.area}`,
  boo.instructions && `Instruções específicas:\n${boo.instructions}`,
  notebook && notebookRules(notebook),
  'Como trabalhar: o Lead (Chief) e o usuário falam com você por mensagens. Pegue tarefas do quadro compartilhado, avise o time pelo send_message quando terminar ou travar, e fique dentro da sua especialidade; se o pedido for de outra área, diga isso e indique quem deve cuidar.',
  'Agora responda apenas com uma linha confirmando que está pronto, e aguarde instruções.',
].filter(Boolean).join('\n\n')

/** Texto devolvido ao Lead depois de convocar: quem está no time e como delegar. */
export function briefing(state, chief, squad) {
  const team = squad ? boos(state).filter(boo => squad.agentIds.includes(boo.id)) : boos(state)
  return [
    squad && `Time deste projeto: ${squad.name}${squad.description ? `, ${squad.description}` : ''}.`,
    chief?.instructions && `Instruções do Chief:\n${chief.instructions}`,
    team.length
      ? `Boos do time (use send_message com o nome indicado e o quadro de tarefas team_task_* para delegar):\n${team.map(boo => `- ${boo.handle}: ${boo.name}, ${boo.description}${boo.area ? ` [área: ${boo.area}]` : ''}`).join('\n')}\nDelegue o que for especialidade de um Boo, com tarefas completas e autocontidas; depois reúna os resultados e responda ao usuário. Faça você mesmo o que for simples ou não couber a nenhum Boo.`
      : 'Não há Boos cadastrados ainda. Sugira ao usuário criar os especialistas de que precisa (painel Boos ou boo_create).',
  ].filter(Boolean).join('\n\n')
}

/**
 * Cria no time do `lead` os teammates que ainda não existem (todos os Boos, ou só os do `squad` do projeto). Idempotente: quem já está no roster (qualquer status) é pulado,
 * porque o DSH nunca reusa nem renomeia um nome de teammate. Falhas individuais não interrompem as demais.
 */
export async function summon(teams, lead, state, signal, squad, notebookFor) {
  const present = new Set(teams.listMembers(lead).map(member => member.name))
  const result = { spawned: [], present: [], failed: [] }
  const candidates = squad ? boos(state).filter(boo => squad.agentIds.includes(boo.id)) : boos(state)
  for (const boo of candidates) {
    if (present.has(boo.handle)) { result.present.push(boo.handle); continue }
    try {
      await teams.spawnTeammate(lead, { name: boo.handle, description: boo.description, prompt: [{ type: 'text', text: teammatePrompt(boo, notebookFor?.(boo)) }], context: 'fresh', provider: 'spawn', signal })
      result.spawned.push(boo.handle)
    } catch (error) {
      result.failed.push({ handle: boo.handle, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return result
}
