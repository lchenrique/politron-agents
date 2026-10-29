/**
 * Linha de ferramenta do DSH (ui-tool/components/ToolRow, MIT) com a mesma
 * marcação e CSS. Adaptações Boobot: sem `t`/slots/Cordis (rótulos de
 * strings.ts), disclosure local (ou controlada por `expanded`/`onToggle`),
 * cartões recebidos já no formato dos blocos, sem cartão de imagem nem de
 * pergunta (ficam para a fase do chat).
 */
import { memo, useCallback, useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import { DisclosureRow } from '../DisclosureRow.tsx'
import { TextShimmer } from '../TextShimmer.tsx'
import { CodeBlock } from '../markdown/CodeBlock.tsx'
import { DiffBlock, diffTotals, type DiffHunk } from '../DiffBlock.tsx'
import { ReadBlock, type ReadBlockProps } from '../ReadBlock.tsx'
import { SearchBlock, type SearchBlockProps } from '../SearchBlock.tsx'
import { TerminalBlock, type TerminalBlockProps } from '../TerminalBlock.tsx'
import { WebBlock, type WebBlockProps } from '../WebBlock.tsx'
import { IconInspectOutlineRegular } from '../icons/index.tsx'
import {
  codeToolbarLabels, diffBlockLabels, dshStrings, readBlockLabels, searchBlockLabels, terminalBlockLabels, webBlockLabels,
} from '../strings.ts'
import { ToolDetails, type OpenFile, type ToolDetailsModel } from './ToolDetails.tsx'
import { ExitCodeBadge } from './ExitCodeBadge.tsx'
import type { DistributiveOmit, DshToolState } from './types.ts'
import css from './ToolRow.module.css'

/** Variantes visuais do DSH (`data-variant`). */
export type ToolRowVariant = 'search' | 'read' | 'bash' | 'write' | 'edit' | 'code' | 'others'

/** Estados internos do DSH (`data-state`). */
export type ToolRowState = 'preparing' | 'running' | 'ok' | 'error' | 'stopped'

/** Estado neutro → estado do DSH. */
export function rowState(state: DshToolState): ToolRowState {
  switch (state) {
    case 'success': return 'ok'
    case 'interrupted': return 'stopped'
    default: return state
  }
}

/** Limites de linhas dos cartões dentro do chat (valores do DSH). */
export const CHAT_DIFF_MAX_LINES = 9
export const CHAT_READ_MAX_LINES = 8
export const CHAT_SEARCH_MAX_LINES = 8

/** Cartão de terminal: props do TerminalBlock e a descrição que substitui o resumo. */
export interface ToolRowTerminal {
  card: Omit<TerminalBlockProps, 'labels' | 'maxLines' | 'className'>
  description?: string | undefined
}

export interface ToolRowProps {
  variant: ToolRowVariant
  /** Wire tool name for tool-owned styling layered over the generic variant. */
  toolName?: string | undefined
  icon: ReactNode
  title: string
  summary: string
  /** Trailing fragment kept out of the summary ellipsis; error/stopped rows omit it. */
  summarySuffix?: string | null | undefined
  /** Original argument text formatted only while the row is expanded. */
  bodyRaw?: string | null | undefined
  /** Flattened result text for the Output section. */
  output?: string | null | undefined
  /** First error line for rows without an exit status capsule. */
  errorSummary?: string | null | undefined
  terminal?: ToolRowTerminal | null | undefined
  diff?: DiffHunk[] | null | undefined
  read?: Omit<ReadBlockProps, 'labels' | 'maxLines' | 'className'> | null | undefined
  search?: { card: DistributiveOmit<SearchBlockProps, 'labels' | 'maxLines' | 'className'>; recovery?: string | undefined } | null | undefined
  web?: DistributiveOmit<WebBlockProps, 'labels' | 'className'> | null | undefined
  details?: ToolDetailsModel | null | undefined
  state: ToolRowState
  filePath?: string | undefined
  filePathLine?: number | undefined
  onOpenFile?: OpenFile | undefined
  href?: string | undefined
  inspect?: (() => void) | undefined
  /** Controle opcional do disclosure; sem ele a linha guarda o próprio estado. */
  expanded?: boolean | undefined
  onToggle?: (() => void) | undefined
}

/** Keep a summary link click from toggling the row; the browser still follows the link. */
function stopLinkClick(event: MouseEvent<HTMLAnchorElement>): void {
  event.stopPropagation()
}

/** Visually hidden run-state label for color-only running and settlement cues. */
function stateStatus(state: ToolRowState): string | null {
  switch (state) {
    case 'preparing': return dshStrings.row.preparing
    case 'running': return dshStrings.row.running
    case 'error': return dshStrings.row.failed
    case 'stopped': return dshStrings.row.stopped
    default: return null
  }
}

/** Mesma regra de terminal-card-model: código diferente de zero, código ausente ou sinal. */
export function terminalExitLabel(terminal: ToolRowTerminal | null | undefined): string | null {
  if (terminal == null) return null
  const { exitCode, signal, running, background } = terminal.card
  if (background || running === true) return null
  if (signal !== undefined) return terminalBlockLabels.signal(signal)
  if (exitCode === undefined || exitCode === 0) return null
  if (exitCode === null) return terminalBlockLabels.noExitCode
  return terminalBlockLabels.exitCode(exitCode)
}

/** JSON vira texto indentado; o código de `run_code` mostra só o programa (tool-call-model.formatToolBody). */
export function formatToolBody(variant: ToolRowVariant, argsRaw: string): string | null {
  if (argsRaw === '') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(argsRaw)
  } catch {
    return argsRaw
  }
  if (variant === 'code' && typeof parsed === 'object' && parsed !== null) {
    const code = (parsed as Record<string, unknown>).code
    if (typeof code === 'string' && code !== '') return code
  }
  return JSON.stringify(parsed, null, 2)
}

/** Disclosure local quando o dono não controla. */
function useRowDisclosure(expanded: boolean | undefined, onToggle: (() => void) | undefined) {
  const [own, setOwn] = useState(false)
  const toggleOwn = useCallback(() => { setOwn(value => !value) }, [])
  return expanded === undefined ? { expanded: own, toggle: onToggle ?? toggleOwn } : { expanded, toggle: onToggle ?? toggleOwn }
}

/**
 * Render one tool summary and lazily mounted result card.
 * @param props - tool state, summary, output, and navigation callbacks.
 * @returns the tool disclosure.
 */
export const ToolRow = memo(function ToolRow({
  variant, toolName, icon, title, summary, summarySuffix, bodyRaw, output, errorSummary,
  terminal, diff, read, search, web, details, state, filePath, filePathLine, onOpenFile, href, inspect,
  expanded: controlledExpanded, onToggle,
}: ToolRowProps) {
  const { expanded, toggle: toggleExpand } = useRowDisclosure(controlledExpanded, onToggle)
  const terminalBody = terminal ?? null
  const diffBody = diff ?? null
  const readBody = read ?? null
  const searchBody = search ?? null
  const webBody = web ?? null
  const detailsBody = details ?? null
  const inputRaw = bodyRaw ?? null
  const outputText = output ?? null
  const card = terminalBody ?? diffBody ?? readBody ?? searchBody ?? webBody ?? detailsBody
  const expandable = state !== 'preparing' && (inputRaw !== null || outputText !== null || card !== null)
  const open = expanded && expandable
  const bodyText = useMemo(
    () => open && card === null && inputRaw !== null ? formatToolBody(variant, inputRaw) : null,
    [card, inputRaw, open, variant],
  )
  const status = stateStatus(state)
  const running = state === 'running' || state === 'preparing'
  const normalSummary = terminalBody?.description ?? (open ? detailsBody?.expandedSummary ?? summary : summary)
  const exitLabel = terminalExitLabel(terminal)
  // Generic failures retain their first result line; command exits keep their description.
  const failureLine = state === 'error' && exitLabel === null ? errorSummary ?? normalSummary : null
  const summaryText = failureLine ?? normalSummary
  const diffStat = useMemo(() => diffBody === null ? null : diffTotals(diffBody), [diffBody])
  const settledWithCue = state === 'error' || state === 'stopped'
  const suffix = settledWithCue ? null : summarySuffix ?? null
  const totals = settledWithCue ? null : diffStat
  const openFile = useMemo(() => filePath !== undefined && onOpenFile !== undefined && !settledWithCue
    ? (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (filePathLine === undefined) onOpenFile(filePath)
      else onOpenFile(filePath, { line: filePathLine })
    }
    : undefined, [filePath, filePathLine, onOpenFile, settledWithCue])
  const linkHref = settledWithCue ? undefined : href
  // Enter/Space on the focused path or URL link must not bubble to the row's toggle.
  const summaryLinkKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
  }, [])
  // The code variant's program renders through CodeBlock, so only its output joins the IN/OUT card.
  const cardBody = variant === 'code' ? null : bodyText
  const collapsedContent = useMemo(() => summaryText !== '' && (
    <>
      <span className={css.sep} data-shimmer-decoration aria-hidden />
      {exitLabel === null && openFile !== undefined ? (
        <button type="button" className={css.fileLink} onClick={openFile} onKeyDown={summaryLinkKeyDown}>
          <TextShimmer>{summaryText}</TextShimmer>
        </button>
      ) : exitLabel === null && linkHref !== undefined ? (
        <a
          className={css.fileLink}
          href={linkHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={stopLinkClick}
          onKeyDown={summaryLinkKeyDown}
        >
          <TextShimmer>{summaryText}</TextShimmer>
        </a>
      ) : (
        <span
          className={clsx(
            css.summary,
            exitLabel === null && state === 'error' && css.errorSummary,
            exitLabel === null && state === 'stopped' && css.stoppedSummary,
          )}
        >
          <TextShimmer>{summaryText}</TextShimmer>
        </span>
      )}
      {exitLabel !== null && <ExitCodeBadge label={exitLabel} />}
      {suffix !== null && <TextShimmer className={css.summarySuffix}>{suffix}</TextShimmer>}
      {totals !== null && (
        <TextShimmer className={clsx(css.summarySuffix, css.diffStat)}>
          <span className={css.diffAdded}>{`+${totals.added}`}</span>{' '}<span className={css.diffRemoved}>{`-${totals.removed}`}</span>
        </TextShimmer>
      )}
    </>
  ), [summaryLinkKeyDown, linkHref, openFile, state, suffix, totals, summaryText, exitLabel])
  const expandedContent = useMemo(() => open ? (
    <div className={clsx(css.bodyWrap, detailsBody !== null && css.detailsBodyWrap)}>
      {terminalBody !== null
        ? <TerminalBlock {...terminalBody.card} maxLines={Infinity} labels={terminalBlockLabels} className={css.terminalBody} />
        : diffBody !== null
          ? <DiffBlock diffs={diffBody} labels={diffBlockLabels} maxLines={CHAT_DIFF_MAX_LINES} className={css.diffBody} />
          : readBody !== null
            ? <ReadBlock {...readBody} labels={readBlockLabels} maxLines={CHAT_READ_MAX_LINES} className={css.readBody} />
            : searchBody !== null
              ? (
                <>
                  <SearchBlock {...searchBody.card} labels={searchBlockLabels} maxLines={CHAT_SEARCH_MAX_LINES} className={css.searchBody} />
                  {searchBody.recovery !== undefined && <div className={css.searchRecovery}>{searchBody.recovery}</div>}
                </>
              )
              : webBody !== null
                ? <WebBlock {...webBody} labels={webBlockLabels} className={css.webBody} />
                : detailsBody !== null
                  ? <ToolDetails model={detailsBody} hasInspect={inspect !== undefined} onOpenFile={onOpenFile} />
                  : (
                    <>
                      {variant === 'code' && bodyText !== null && (
                        <div className={css.bodyScroll}>
                          <CodeBlock code={bodyText} lang="typescript" copyLabel={dshStrings.copy} copiedLabel={dshStrings.copied}
                            toolbarLabels={codeToolbarLabels} className={css.codeBody} />
                        </div>
                      )}
                      {(cardBody !== null || outputText !== null) && (
                        <div className={css.ioCard}>
                          {cardBody !== null && (
                            <div className={css.ioSection}>
                              <span className={css.ioLabel}>{dshStrings.row.input}</span>
                              <span className={css.ioText}>{cardBody}</span>
                            </div>
                          )}
                          {cardBody !== null && outputText !== null && <span className={css.ioDivider} aria-hidden />}
                          {outputText !== null && (
                            <div className={css.ioSection}>
                              <span className={css.ioLabel}>{dshStrings.row.output}</span>
                              <span className={css.ioText} data-error={state === 'error' || undefined}>{outputText}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
      {inspect !== undefined && (
        <button type="button" className={css.inspectButton} onClick={inspect}>
          <IconInspectOutlineRegular />
          {dshStrings.row.inspect}
        </button>
      )}
    </div>
  ) : undefined, [
    open, detailsBody, terminalBody, diffBody, readBody, searchBody, webBody, inspect, onOpenFile,
    variant, bodyText, cardBody, outputText, state,
  ])
  return (
    <div className={css.root} data-variant={variant} data-tool={toolName} data-state={state}>
      {status !== null && <span className={css.visuallyHidden}>{status}</span>}
      <DisclosureRow
        rowClassName={css.row}
        leadingClassName={css.leading}
        titleClassName={css.title}
        icon={icon}
        title={title}
        running={running}
        open={open}
        expandable={expandable}
        expandOnRowClick
        keepContentWhenOpen
        onToggle={toggleExpand}
        collapsedContent={collapsedContent}
      >
        {expandedContent}
      </DisclosureRow>
    </div>
  )
})
