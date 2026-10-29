/**
 * Textos de interface em PT-BR para os componentes portados do DSH.
 * No DSH estes rótulos chegam por `t()` do namespace `conversation`
 * (packages/client/ui-conversation/src/client/locales.ts); aqui as chaves
 * originais viram campos fixos e os blocos recebem os objetos prontos.
 */
import type { CodeToolbarLabels } from './CodeToolbar.tsx'
import type { DiffBlockLabels } from './DiffBlock.tsx'
import type { ImageLightboxLabels } from './ImageLightbox.tsx'
import type { JsonTreeLabels } from './JsonTree.tsx'
import type { ReadBlockLabels } from './ReadBlock.tsx'
import type { SearchBlockLabels } from './SearchBlock.tsx'
import type { TerminalBlockLabels } from './TerminalBlock.tsx'
import type { WebBlockLabels } from './WebBlock.tsx'
import type { MarkdownLabels } from './markdown/render.tsx'

const linhas = (count: number): string => (count === 1 ? '1 linha' : `${count} linhas`)

/** Rótulos soltos (equivalentes às chaves `copy`, `row.*`, `bash.*`, `todo.*`, `tool.title.*`). */
export const dshStrings = {
  copy: 'Copiar',
  copied: 'Copiado',
  collapse: 'Recolher',
  close: 'Fechar',
  footnotes: 'Notas de rodapé',
  row: {
    preparing: 'Preparando chamada de ferramenta',
    running: 'Em execução',
    failed: 'Falhou',
    stopped: 'Interrompida',
    input: 'IN',
    output: 'OUT',
    inspect: 'Inspecionar',
    commandArguments: 'Argumentos do comando',
  },
  bash: {
    running: 'Em execução',
    failed: 'Falhou',
    stopped: 'Interrompido',
  },
  todo: {
    completed: (done: number, total: number): string => `${done}/${total} concluídas`,
  },
  title: {
    search: 'Pesquisar',
    read: 'Ler',
    bash: 'Terminal',
    write: 'Escrever',
    edit: 'Editar',
    code: 'Código',
    generic: 'Chamada de ferramenta',
    grep: 'Grep',
    glob: 'Glob',
    webSearch: 'Pesquisar na web',
    webFetch: 'Abrir página',
    todo: 'Atualizar lista de tarefas',
  },
  sizeKb: (kilobytes: number): string => `${kilobytes} KB`,
  image: {
    dialog: 'Visualização da imagem original',
    loading: 'Carregando imagem…',
    failed: 'A imagem não foi carregada',
    open: 'Ver original',
  },
} as const

/** Barra dos cartões de código (`codeBlock.*`). */
export const codeToolbarLabels: CodeToolbarLabels = {
  codeLabel: 'Código',
  wrapLabel: 'Quebrar linhas',
  unwrapLabel: 'Não quebrar linhas',
}

/** Rótulos do Markdown (`markdown.footnotes` + cópia dos blocos de código). */
export const markdownLabels: MarkdownLabels = {
  code: { copyLabel: dshStrings.copy, copiedLabel: dshStrings.copied, toolbarLabels: codeToolbarLabels },
  footnotes: dshStrings.footnotes,
}

/** `diff.*` */
export const diffBlockLabels: DiffBlockLabels = {
  ...codeToolbarLabels,
  copy: dshStrings.copy,
  copied: dshStrings.copied,
  collapseAria: 'Recolher diferenças',
  expandAria: count => `Expandir mais ${linhas(count)} de diferenças`,
  collapse: dshStrings.collapse,
  expand: count => `… mais ${linhas(count)}`,
}

/** `read.*` */
export const readBlockLabels: ReadBlockLabels = {
  ...codeToolbarLabels,
  window: (shown, total) => `Mostrando ${shown} de ${total} linhas`,
  copy: dshStrings.copy,
  copied: dshStrings.copied,
  collapseAria: 'Recolher conteúdo',
  expandAria: count => `Expandir mais ${linhas(count)}`,
  collapse: dshStrings.collapse,
  expand: count => `… mais ${linhas(count)}`,
}

/** `search.*` */
export const searchBlockLabels: SearchBlockLabels = {
  pathsSummary: (shown, total, truncated) => truncated ? `Mostrando ${shown} de ${total} caminhos` : `${shown} caminhos`,
  matchesSummary: (shown, total, files, truncated) => truncated
    ? `Mostrando ${shown} de ${total} ocorrências · ${files} arquivos`
    : `${shown} ocorrências · ${files} arquivos`,
  copy: dshStrings.copy,
  copied: dshStrings.copied,
  noResults: 'Nenhum resultado',
  collapseAria: 'Recolher resultados',
  expandAria: count => `Expandir mais ${linhas(count)} de resultados`,
  collapse: dshStrings.collapse,
  expand: count => `… mais ${linhas(count)}`,
}

/** `web.*` */
export const webBlockLabels: WebBlockLabels = {
  noResults: 'Nenhum resultado encontrado',
  sourcesTruncated: 'Lista de fontes truncada',
  http: 'HTTP',
  contentTruncated: 'Conteúdo truncado',
  markdown: markdownLabels,
}

/** `terminal.*` */
export const terminalBlockLabels: TerminalBlockLabels = {
  commandLine: line => `Linha de comando ${line}`,
  signal: signal => `sinal ${signal}`,
  exitCode: code => `código de saída ${code}`,
  noExitCode: 'sem código de saída',
  running: 'Em execução',
  failed: 'Falhou',
  done: 'Concluído',
  copy: dshStrings.copy,
  copied: dshStrings.copied,
  noOutput: 'Sem saída',
  collapseAria: 'Recolher saída',
  collapse: dshStrings.collapse,
  expandAria: hidden => `Expandir as ${linhas(hidden)} restantes da saída`,
  expand: hidden => `… mais ${linhas(hidden)}`,
}

/** Visualizador de imagem. */
export const imageLightboxLabels: ImageLightboxLabels = {
  dialog: dshStrings.image.dialog,
  close: dshStrings.close,
}

/** Árvore JSON (`json.*` do inspetor). */
export const jsonTreeLabels: JsonTreeLabels = {
  copyValue: 'Copiar valor',
  copyJson: 'Copiar JSON',
  copyPath: 'Copiar caminho',
  copyPrettyJson: 'Copiar JSON formatado',
  copyCompactJson: 'Copiar JSON compacto',
  copied: dshStrings.copied,
  copyFailed: 'Falha ao copiar',
  collapseNode: 'Recolher',
  expandNode: 'Expandir',
  copyButtonTitle: action => `${action}; clique com o botão direito para mais opções de cópia`,
}
