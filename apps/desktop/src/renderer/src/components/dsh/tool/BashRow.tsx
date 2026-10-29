/**
 * Linha de Bash do DSH (ui-tool/toolviews/bash-sample, MIT): cartão próprio com
 * chevron no hover e TerminalBlock ao expandir. Adaptação: recebe a forma
 * neutra (`DshToolCall`) em vez do bloco de wire e usa strings.ts.
 */
import { memo, useCallback, useMemo, useState, type KeyboardEvent } from 'react'
import clsx from 'clsx'
import {
  IconApiOutlineRegular, IconChevronDownOutlineRegular, IconChevronUpOutlineRegular, IconInspectOutlineRegular,
} from '../icons/index.tsx'
import { CommandText } from '../CommandText.tsx'
import { TerminalBlock } from '../TerminalBlock.tsx'
import { TextShimmer } from '../TextShimmer.tsx'
import { dshStrings, terminalBlockLabels } from '../strings.ts'
import { ExitCodeBadge } from './ExitCodeBadge.tsx'
import { formatToolBody, rowState, terminalExitLabel, type ToolRowState, type ToolRowTerminal } from './ToolRow.tsx'
import type { DshToolCall } from './types.ts'
import css from './bash-sample.module.css'

const BASH_ICON = <IconApiOutlineRegular size={14} />

/** Visually hidden status for the color-only running sweep and error tone. */
function stateStatus(state: ToolRowState): string | null {
  switch (state) {
    case 'preparing': return dshStrings.row.preparing
    case 'running': return dshStrings.bash.running
    case 'error': return dshStrings.bash.failed
    case 'stopped': return dshStrings.bash.stopped
    default: return null
  }
}

/**
 * Render expandable Bash output with an accessible lifecycle label.
 * @param props.call - chamada neutra (`kind: 'bash'`).
 * @param props.inspect - abre o registro da chamada, quando houver.
 * @returns the Bash output row.
 */
export const BashRow = memo(function BashRow({ call, inspect }: { call: DshToolCall; inspect?: (() => void) | undefined }) {
  const terminal: ToolRowTerminal | null = useMemo(() => call.terminal === undefined ? null : {
    card: { ...call.terminal, running: call.state === 'running' },
    description: call.summary === '' ? undefined : call.summary,
  }, [call.terminal, call.state, call.summary])
  const exitLabel = terminalExitLabel(terminal)
  // Exit failures are result data even when the tool call itself succeeds.
  const base = rowState(call.state)
  const state: ToolRowState = base === 'ok' && exitLabel !== null ? 'error' : base
  const status = stateStatus(state)
  const [expanded, setExpanded] = useState(false)
  const toggleExpand = useCallback(() => { setExpanded(value => !value) }, [])
  const background = call.terminal?.background === true
  const bodyRaw = call.input ?? null
  const output = call.output ?? null
  const genericBody = terminal === null && (bodyRaw !== null || output !== null)
  const expandable = state !== 'preparing' && (terminal !== null || genericBody)
  const open = expanded && expandable
  const body = useMemo(() => open && genericBody && bodyRaw !== null ? formatToolBody('bash', bodyRaw) : null, [genericBody, bodyRaw, open])
  const normalSummary = terminal?.description ?? call.summary
  const settlementLine = exitLabel !== null ? null : state === 'error'
    ? call.errorSummary ?? normalSummary
    : state === 'stopped' ? dshStrings.bash.stopped : null
  const running = state === 'running' || state === 'preparing'
  const toggleFromKeyboard = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (!expandable || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    toggleExpand()
  }, [expandable, toggleExpand])
  const leading = open
    ? <IconChevronUpOutlineRegular className={css.chevron} />
    : expandable
      ? (
        <>
          <span className={css.iconIdle}>{BASH_ICON}</span>
          <IconChevronDownOutlineRegular className={clsx(css.chevron, css.chevronHover)} />
        </>
      )
      : BASH_ICON
  return (
    <div className={css.card}>
      <div
        className={css.root}
        data-sample="bash"
        data-variant="bash"
        data-state={state}
        data-expandable={expandable || undefined}
        role={expandable ? 'button' : undefined}
        tabIndex={expandable ? 0 : undefined}
        aria-expanded={expandable ? open : undefined}
        onClick={expandable ? toggleExpand : undefined}
        onKeyDown={expandable ? toggleFromKeyboard : undefined}
      >
        <span className={css.leading}>{leading}</span>
        {status !== null && <span className={css.visuallyHidden}>{status}</span>}
        <TextShimmer active={running}>
          <TextShimmer className={css.title}>{call.title ?? dshStrings.title.bash}</TextShimmer>
          <span className={css.sep} data-shimmer-decoration aria-hidden />
          <span className={clsx(
            css.summary,
            exitLabel === null && state === 'error' && css.errorSummary,
            exitLabel === null && state === 'stopped' && css.stoppedSummary,
          )}>
            <TextShimmer>{settlementLine ?? normalSummary}</TextShimmer>
          </span>
          {exitLabel !== null && <ExitCodeBadge label={exitLabel} />}
        </TextShimmer>
      </div>
      {open && (
        <div className={css.bodyWrap}>
          {terminal !== null
            ? <TerminalBlock {...terminal.card} maxLines={Infinity} labels={terminalBlockLabels} className={css.terminal} />
            : (
              <div className={css.ioCard}>
                {body !== null && (
                  <div className={css.ioSection}>
                    <span className={css.ioLabel}>{dshStrings.row.input}</span>
                    {background
                      ? <CommandText className={css.commandInput} text={body} label={dshStrings.row.commandArguments} />
                      : <span className={css.ioText}>{body}</span>}
                  </div>
                )}
                {body !== null && output !== null && <span className={css.ioDivider} aria-hidden />}
                {output !== null && (
                  <div className={css.ioSection}>
                    <span className={css.ioLabel}>{dshStrings.row.output}</span>
                    <span className={css.ioText} data-error={state === 'error' || undefined}>{output}</span>
                  </div>
                )}
              </div>
            )}
          {inspect !== undefined && (
            <button type="button" className={css.inspectButton} onClick={inspect}>
              <IconInspectOutlineRegular />
              {dshStrings.row.inspect}
            </button>
          )}
        </div>
      )}
    </div>
  )
})
