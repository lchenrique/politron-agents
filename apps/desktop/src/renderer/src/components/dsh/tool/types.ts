/**
 * Forma neutra de uma chamada de ferramenta para as linhas portadas do DSH.
 *
 * No DSH cada linha deriva seus props de blocos de wire (`ToolCallBlock`) por
 * modelos (`read-card-model`, `diff-card-model`, …). No Boobot os dados virão
 * de mensagens de atividade/ferramenta (fase posterior), então a fronteira é
 * este objeto simples: quem chama já entrega os cartões no formato dos blocos.
 */
import type { DiffHunk } from '../DiffBlock.tsx'
import type { ReadBlockLine } from '../ReadBlock.tsx'
import type { SearchFileGroup } from '../SearchBlock.tsx'
import type { WebBlockProps } from '../WebBlock.tsx'
import type { ToolDetailsModel } from './ToolDetails.tsx'

/** Estado de execução visível. `preparing` = argumentos ainda chegando (não expande). */
export type DshToolState = 'preparing' | 'running' | 'success' | 'error' | 'interrupted'

/**
 * Família da linha; escolhe ícone, título padrão e cartão:
 * read → ReadBlock, search → SearchBlock, web → WebBlock, edit/write → DiffBlock,
 * bash → TerminalBlock (linha própria `BashRow`), todo → contagem de tarefas,
 * code → programa em CodeBlock, details → ToolDetails, generic → IN/OUT.
 */
export type DshToolKind = 'read' | 'search' | 'web' | 'edit' | 'write' | 'bash' | 'todo' | 'code' | 'details' | 'generic'

/** Item de plano para `kind: 'todo'`. */
export interface DshTodoItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

/** Uma chamada de ferramenta pronta para exibir. */
export interface DshToolCall {
  /** Identidade estável (chave de lista e âncora). */
  id: string
  kind: DshToolKind
  /** Título curto; omitido = título padrão da família em PT-BR. */
  title?: string | undefined
  /** Resumo de uma linha (caminho, comando, padrão…). Vazio = só o título. */
  summary: string
  state: DshToolState
  /** Argumentos crus (JSON ou texto) para a seção IN; JSON é formatado ao expandir. */
  input?: string | undefined
  /** Resultado achatado para a seção OUT. */
  output?: string | undefined
  /** Primeira linha do erro; substitui o resumo quando `state: 'error'` e não há código de saída. */
  errorSummary?: string | undefined
  /** Duração total; as linhas não exibem, fica para o cabeçalho do turno ("Concluído em X"). */
  durationMs?: number | undefined
  /** Arquivo alvo; com `onOpenFile` o resumo vira link pontilhado. */
  path?: string | undefined
  /** Linha (1-based) para abrir o arquivo. */
  line?: number | undefined
  /** URL http(s) segura; o resumo vira link externo. */
  href?: string | undefined
  /** Fragmento extra fora da reticência (ex.: tamanho em KB). */
  summarySuffix?: string | undefined
  /** bash: comando, pasta, saída, código de saída/sinal e se roda em segundo plano. */
  terminal?: {
    command: string
    cwd?: string | undefined
    output?: string | undefined
    exitCode?: number | null | undefined
    signal?: string | undefined
    background?: boolean | undefined
  } | undefined
  /** edit/write: trechos antes/depois por arquivo. */
  diff?: DiffHunk[] | undefined
  /** read: janela numerada do arquivo lido. */
  read?: { lines: readonly ReadBlockLine[]; totalLines: number; lang?: string | undefined; label?: string | undefined } | undefined
  /** search: ocorrências agrupadas por arquivo ou lista de caminhos. */
  search?:
    | { kind: 'matches'; files: SearchFileGroup[]; total: number; truncated: boolean }
    | { kind: 'paths'; paths: string[]; total: number; truncated: boolean }
    | undefined
  /** web: resultado de busca ou página aberta, no formato do WebBlock. */
  web?: DistributiveOmit<WebBlockProps, 'labels' | 'className'> | undefined
  /** todo: lista completa depois da atualização. */
  todos?: readonly DshTodoItem[] | undefined
  /** details: campos/listas já localizados. */
  details?: ToolDetailsModel | undefined
  /** Subchamadas (subagente, delegação) desenhadas em árvore. */
  children?: readonly DshToolCall[] | undefined
}

/** Omit que preserva uniões discriminadas. */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
