import { describe, expect, it } from 'vitest'
import { toFileDiff } from './file-diff-model'

describe('modelo de diff para Pasta UI', () => {
  it('conta substituição como remoção e adição', () => {
    const result = toFileDiff('a\nb\n', 'a\nc\n', 'teste.md')
    expect(result.additions).toBe(1)
    expect(result.deletions).toBe(1)
    expect(result.hunks.flatMap(hunk => hunk.lines).map(line => line.type)).toEqual(['context', 'deletion', 'addition'])
  })

  it('cobre criação, exclusão, CRLF, Unicode e última linha sem newline', () => {
    expect(toFileDiff('', 'olá\r\n', 'novo.md')).toMatchObject({ additions: 1, deletions: 0 })
    expect(toFileDiff('olá\n', '', 'antigo.md')).toMatchObject({ additions: 0, deletions: 1 })
    expect(toFileDiff('ação', 'ações', 'utf.md')).toMatchObject({ additions: 1, deletions: 1 })
    expect(toFileDiff('igual', 'igual', 'igual.md')).toMatchObject({ additions: 0, deletions: 0 })
  })
})
