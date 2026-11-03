import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { emptyState, createBoo } from './store.js'
import { initialNotes, notebookFile, notebookRules, MAX_NOTES_LINES } from './notebook.js'
import { teammatePrompt } from './team.js'
import { definitions } from './preset.js'

const lyra = () => createBoo(emptyState(), { name: 'Lyra', description: 'UX', area: 'design' })

test('caderno fica em <raiz>/<handle>/notas.md e nasce com seções e o nome do agente', () => {
  const { agent } = lyra()
  assert.equal(notebookFile('/r', agent), join('/r', 'lyra', 'notas.md'))
  assert.match(initialNotes(agent), /# Caderno de Lyra/)
  assert.match(initialNotes(agent), /## Decisões e padrões/)
})

test('regras do caderno: caminho, limite de linhas, sem segredos e sem mexer em caderno alheio', () => {
  const text = notebookRules('/r/lyra/notas.md')
  assert.match(text, /\/r\/lyra\/notas\.md/)
  assert.match(text, new RegExp(`${MAX_NOTES_LINES} linhas`))
  assert.match(text, /senhas, tokens, chaves/)
  assert.match(text, /não altere o caderno de outros agentes/)
})

test('teammate e conversa direta recebem o caderno e a área na persona; sem caminho, sem bloco de caderno', () => {
  const { state, agent } = lyra()
  assert.match(teammatePrompt(agent, '/r/lyra/notas.md'), /Seu caderno de memória: \/r\/lyra\/notas\.md/)
  assert.match(teammatePrompt(agent, '/r/lyra/notas.md'), /Sua área: design/)
  assert.doesNotMatch(teammatePrompt(agent), /caderno de memória/)
  const defs = definitions(state, a => `/r/${a.handle}/notas.md`)
  const persona = id => defs.find(d => d.id === id).plugins[0].config.prefix
  assert.match(persona('boo-lyra'), /\/r\/lyra\/notas\.md/)
  assert.match(persona('boobot-chief'), /\/r\/chief\/notas\.md/)
})
