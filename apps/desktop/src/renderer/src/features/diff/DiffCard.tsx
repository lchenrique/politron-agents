import { memo, useMemo } from 'react'
import { FileDiff } from '@/components/ai/file-diff'
import type { DiffBlock } from './types'
import { toFileDiff } from './file-diff-model'

interface DiffCardProps {
  block: DiffBlock
  defaultExpanded?: boolean
}

export const DiffCard = memo(function DiffCard({ block, defaultExpanded = false }: DiffCardProps) {
  const model = useMemo(() => toFileDiff(block.originalContent || '', block.modifiedContent || '', block.filePath), [block.filePath, block.originalContent, block.modifiedContent])
  return <div className="min-w-0 py-1">
    <FileDiff filename={block.filePath} hunks={model.hunks} additions={model.additions} deletions={model.deletions} defaultOpen={defaultExpanded} />
  </div>
})

export default DiffCard
