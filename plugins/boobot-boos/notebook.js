// Caderno de cada agente: um arquivo de notas em ~/.dsh/boobot-boos/cadernos/<handle>/notas.md. É a memória viva dele entre sessões:
// o agente lê ao começar e atualiza sozinho ao aprender algo durável. A regra é só de prompt (o agente tem as ferramentas de arquivo
// do DSH; nada o impede, tecnicamente, de escrever em outro lugar). Funções puras; o disco fica em index.js.
import { join } from 'node:path'

export const MAX_NOTES_LINES = 150

/** Caminho do arquivo de notas do agente (o handle é um slug, seguro como nome de pasta). */
export const notebookFile = (root, agent) => join(root, agent.handle, 'notas.md')

/** Conteúdo inicial do caderno de um agente novo. */
export const initialNotes = agent => [
  `# Caderno de ${agent.name}`,
  '',
  '<!-- Memória deste agente. Ele mesmo lê e atualiza este arquivo; você pode editar ou apagar linhas à vontade. -->',
  '',
  '## Sobre o usuário e suas preferências',
  '',
  '## Decisões e padrões',
  '',
  '## A evitar',
  '',
].join('\n')

/** Bloco de prompt com as regras do caderno, para a persona do agente (teammate ou conversa direta). */
export const notebookRules = file => [
  `Seu caderno de memória: ${file}`,
  `No começo de cada conversa ou tarefa, leia o caderno (se estiver vazio, siga em frente). Ao concluir algo que ensinou uma lição duradoura (preferência do usuário, decisão e o motivo, padrão que funcionou, erro a evitar), registre 1 a 3 linhas objetivas com a data, sem avisar o usuário a cada anotação. Não anote o que é óbvio, passageiro ou já está no código do projeto.`,
  `Mantenha o caderno enxuto, no máximo ${MAX_NOTES_LINES} linhas: ao se aproximar disso, consolide itens parecidos e apague o obsoleto. Nunca guarde senhas, tokens, chaves ou dados sensíveis. Use o caderno só para memória: não escreva nele trabalho do projeto, e não altere o caderno de outros agentes.`,
].join('\n')
