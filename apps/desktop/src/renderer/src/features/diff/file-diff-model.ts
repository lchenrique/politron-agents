import { parseDiffFromFile } from '@pierre/diffs'
import type { DiffHunk, DiffLine } from '@/components/ai/file-diff'

function content(line: string): string { return line.replace(/\r?\n$/, '') }

export function toFileDiff(before: string, after: string, filename: string): { hunks: DiffHunk[]; additions: number; deletions: number } {
  const parsed = parseDiffFromFile({ name: filename, contents: before }, { name: filename, contents: after })
  let additions = 0
  let deletions = 0
  const hunks = parsed.hunks.map((hunk, index): DiffHunk => {
    const lines: DiffLine[] = []
    for (const part of hunk.hunkContent) {
      if (part.type === 'context') {
        for (let offset = 0; offset < part.lines; offset++) lines.push({
          type: 'context',
          content: content(parsed.additionLines[part.additionLineIndex + offset] ?? ''),
          oldNumber: part.deletionLineIndex + offset + 1,
          newNumber: part.additionLineIndex + offset + 1,
        })
      } else {
        for (let offset = 0; offset < part.deletions; offset++) lines.push({
          type: 'deletion',
          content: content(parsed.deletionLines[part.deletionLineIndex + offset] ?? ''),
          oldNumber: part.deletionLineIndex + offset + 1,
        })
        for (let offset = 0; offset < part.additions; offset++) lines.push({
          type: 'addition',
          content: content(parsed.additionLines[part.additionLineIndex + offset] ?? ''),
          newNumber: part.additionLineIndex + offset + 1,
        })
        additions += part.additions
        deletions += part.deletions
      }
    }
    return { id: `${filename}:${index}`, header: hunk.hunkSpecs?.trim(), lines }
  })
  return { hunks, additions, deletions }
}
