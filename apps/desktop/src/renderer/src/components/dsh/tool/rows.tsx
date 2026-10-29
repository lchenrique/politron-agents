/**
 * Linhas especializadas do DSH (ui-tool/toolviews: read-row, read-family-row,
 * search-row, web-row, file-mutation-row, todo-row, details-row e
 * GenericToolCard, MIT). No DSH cada uma registra um slot por nome de
 * ferramenta e deriva props de modelos de wire; aqui cada uma recebe a forma
 * neutra `DshToolCall` e entrega os mesmos ícones, títulos e cartões ao ToolRow.
 */
import { memo, type ReactNode } from 'react'
import {
  IconAgentPresetOutlineRegular, IconApiOutlineRegular, IconBrowseOutlineRegular, IconChecklistOutlineRegular,
  IconCodeOutlineRegular, IconEditOutlineRegular, IconGlobeOutlineRegular, IconSearchOutlineRegular, IconSparkleRegular,
} from '../icons/index.tsx'
import { dshStrings } from '../strings.ts'
import { BashRow } from './BashRow.tsx'
import { planSummary } from './plan-summary.ts'
import type { OpenFile } from './ToolDetails.tsx'
import { ToolRow, rowState, type ToolRowProps, type ToolRowVariant } from './ToolRow.tsx'
import type { DshToolCall, DshToolKind } from './types.ts'

/** Props comuns às linhas: a chamada e as ações do dono. */
export interface DshRowProps {
  call: DshToolCall
  onOpenFile?: OpenFile | undefined
  inspect?: (() => void) | undefined
}

const VARIANT: Record<DshToolKind, ToolRowVariant> = {
  read: 'read', search: 'search', web: 'read', edit: 'edit', write: 'write', bash: 'bash',
  todo: 'others', code: 'code', details: 'others', generic: 'others',
}

const GENERIC_ICONS: Record<ToolRowVariant, ReactNode> = {
  search: <IconSearchOutlineRegular size={14} />,
  read: <IconBrowseOutlineRegular size={14} />,
  bash: <IconApiOutlineRegular size={14} />,
  write: <IconEditOutlineRegular size={14} />,
  edit: <IconEditOutlineRegular size={14} />,
  code: <IconCodeOutlineRegular size={14} />,
  others: <IconSparkleRegular size={14} />,
}

const DEFAULT_TITLE: Record<DshToolKind, string> = {
  read: dshStrings.title.read, search: dshStrings.title.search, web: dshStrings.title.webSearch,
  edit: dshStrings.title.edit, write: dshStrings.title.write, bash: dshStrings.title.bash,
  todo: dshStrings.title.todo, code: dshStrings.title.code, details: dshStrings.title.generic, generic: dshStrings.title.generic,
}

/** Campos que toda linha repassa ao ToolRow. */
function baseProps({ call, onOpenFile, inspect }: DshRowProps): Omit<ToolRowProps, 'icon'> {
  return {
    variant: VARIANT[call.kind],
    title: call.title ?? DEFAULT_TITLE[call.kind],
    summary: call.summary,
    summarySuffix: call.summarySuffix,
    output: call.output,
    errorSummary: call.errorSummary,
    state: rowState(call.state),
    filePath: call.path,
    filePathLine: call.line,
    onOpenFile,
    inspect,
  }
}

/** Família de leitura de arquivo único: ícone de navegação, resumo como caminho que abre, sem corpo de argumentos. */
export function ReadFamilyRow(props: DshRowProps) {
  const { call } = props
  return (
    <ToolRow
      {...baseProps(props)}
      icon={<IconBrowseOutlineRegular size={14} />}
      bodyRaw={null}
      read={call.read === undefined ? undefined : { ...call.read, label: call.read.label ?? call.path }}
    />
  )
}

/** Leitura com a janela numerada e abertura na linha pedida. */
export const ReadRow = ReadFamilyRow

/** grep/glob com o cartão de ocorrências ou caminhos. */
export function SearchRow(props: DshRowProps) {
  const { call } = props
  return (
    <ToolRow
      {...baseProps(props)}
      icon={<IconSearchOutlineRegular size={14} />}
      search={call.search === undefined ? undefined : { card: call.search }}
    />
  )
}

/** Busca na web (globo) ou página aberta (navegação, resumo como link externo). */
export function WebRow(props: DshRowProps) {
  const { call } = props
  const fetch = call.web?.kind === 'fetch'
  return (
    <ToolRow
      {...baseProps(props)}
      title={call.title ?? (fetch ? dshStrings.title.webFetch : dshStrings.title.webSearch)}
      icon={fetch ? <IconBrowseOutlineRegular size={14} /> : <IconGlobeOutlineRegular size={14} />}
      web={call.web}
      href={call.href}
    />
  )
}

/** edit/write: caminho, tamanho opcional e o diff aplicado com totais +/-. */
export function FileMutationRow(props: DshRowProps) {
  const { call } = props
  return <ToolRow {...baseProps(props)} icon={<IconEditOutlineRegular size={14} />} diff={call.diff} />
}

/** Lista de tarefas: "N/M concluídas · tarefa ativa" e `+n` para outras ativas em paralelo. */
export function TodoRow(props: DshRowProps) {
  const { call } = props
  const summary = call.todos === undefined ? { text: call.summary, extra: 0 } : (() => {
    const { done, total, activeContent, activeExtra } = planSummary(call.todos)
    const head = dshStrings.todo.completed(done, total)
    return { text: activeContent === null ? head : `${head} · ${activeContent}`, extra: activeExtra }
  })()
  return (
    <ToolRow
      {...baseProps(props)}
      icon={<IconChecklistOutlineRegular />}
      summary={summary.text}
      summarySuffix={summary.extra > 0 ? `+${summary.extra}` : call.summarySuffix}
      bodyRaw={call.input}
      details={call.details}
    />
  )
}

/** Resultado registrado com campos e listas compactos. */
export function DetailsRow(props: DshRowProps) {
  const { call } = props
  const details = call.details
  return (
    <ToolRow
      {...baseProps(props)}
      icon={<IconAgentPresetOutlineRegular size={14} />}
      summary={call.summary !== '' ? call.summary : details?.summary ?? details?.items[0]?.title ?? details?.empty ?? ''}
      details={details}
      bodyRaw={call.input}
    />
  )
}

/** Linha genérica (fallback do DSH): ícone por variante e cartão IN/OUT. */
export function GenericToolRow(props: DshRowProps) {
  const base = baseProps(props)
  return <ToolRow {...base} icon={GENERIC_ICONS[base.variant]} bodyRaw={props.call.input} />
}

/** Escolhe a linha especializada pela família da chamada. */
export const DshToolCallRow = memo(function DshToolCallRow(props: DshRowProps) {
  switch (props.call.kind) {
    case 'read': return <ReadRow {...props} />
    case 'search': return <SearchRow {...props} />
    case 'web': return <WebRow {...props} />
    case 'edit':
    case 'write': return <FileMutationRow {...props} />
    case 'bash': return <BashRow call={props.call} inspect={props.inspect} />
    case 'todo': return <TodoRow {...props} />
    case 'details': return <DetailsRow {...props} />
    default: return <GenericToolRow {...props} />
  }
})
