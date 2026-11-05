// Resolução de referências escritas por um agente ou pelo usuário ("bubbledesk", "Web", um id) para projetos e times.
// Pura: o Chief precisa associar um time a QUALQUER projeto pelo nome, não só ao projeto da sessão em que está.

const norm = value => String(value ?? '').trim().toLowerCase()

function pick(items, ref, { article, noun }, fields) {
  const wanted = norm(ref)
  if (!wanted) throw new Error(`Informe ${article} ${noun}.`)
  const exact = items.filter(item => fields.some(field => norm(item[field]) === wanted))
  if (exact.length === 1) return exact[0]
  const matches = exact.length > 1 ? exact : items.filter(item => fields.some(field => norm(item[field]).includes(wanted)))
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) throw new Error(`"${ref}" é ambíguo entre: ${matches.map(item => item.title ?? item.name).join(', ')}. Use o id ou o nome completo.`)
  throw new Error(`${noun[0].toUpperCase()}${noun.slice(1)} não encontrado: "${ref}". Disponíveis: ${items.map(item => item.title ?? item.name).join(', ') || 'nenhum'}.`)
}

/** Projeto (workspace do DSH) por id, título ou parte do título/caminho. */
export const resolveProject = (workspaces, ref) => pick(workspaces, ref, { article: 'o', noun: 'projeto' }, ['id', 'title', 'path'])

/** Time por id ou nome (ou parte única do nome). */
export const resolveTeam = (teams, ref) => pick(teams, ref, { article: 'o', noun: 'time' }, ['id', 'name'])
