/**
 * Árvore raiz/subchamadas do DSH (ui-tool/ToolCallTree, MIT): cada chamada numa
 * `.callRow` e os filhos recuados com a linha-guia à esquerda. Adaptação: o
 * despacho por slot virou `DshToolCallRow` e a entrada é a forma neutra.
 */
import { memo } from 'react'
import { DshToolCallRow } from './rows.tsx'
import type { OpenFile } from './ToolDetails.tsx'
import type { DshToolCall } from './types.ts'
import css from './ToolCallTree.module.css'

interface ToolCallTreeProps {
  call: DshToolCall
  onOpenFile?: OpenFile | undefined
  /** Abre o registro de uma chamada pelo id. */
  inspectCall?: ((id: string) => void) | undefined
}

/**
 * Render one root Tool call and its recursive children.
 * @param props - chamada raiz e ações do dono.
 * @returns the Tool call tree.
 */
export const ToolCallTree = memo(function ToolCallTree({ call, onOpenFile, inspectCall }: ToolCallTreeProps) {
  const children = call.state === 'preparing' ? undefined : call.children
  return (
    <div className={css.callRow} data-chat-anchor-key={`call:${call.id}`} data-chat-call-id={call.id}>
      <DshToolCallRow
        call={call}
        onOpenFile={onOpenFile}
        inspect={inspectCall === undefined ? undefined : () => { inspectCall(call.id) }}
      />
      {children !== undefined && children.length > 0 ? (
        <div className={css.subCalls} data-subcalls>
          {children.map(child => (
            <ToolCallTree key={child.id} call={child} onOpenFile={onOpenFile} inspectCall={inspectCall} />
          ))}
        </div>
      ) : null}
    </div>
  )
})
