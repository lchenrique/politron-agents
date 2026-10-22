export interface MentionQuery { start: number; end: number; query: string }

const mentionCharacter = /[\p{L}\p{N}_-]/u

export function getMentionQuery(text: string, caret: number): MentionQuery | null {
  if (caret < 0 || caret > text.length) return null
  const prefix = text.slice(0, caret)
  const match = /(?:^|\s)@([\p{L}\p{N}_-]*)$/u.exec(prefix)
  if (!match) return null
  const start = caret - match[1].length - 1
  let end = caret
  while (end < text.length && mentionCharacter.test(text[end])) end++
  return { start, end, query: match[1] }
}

export function replaceMention(text: string, token: MentionQuery, alias: string): { text: string; caret: number } {
  const suffix = text.slice(token.end)
  const separator = /^\s/u.test(suffix) ? '' : ' '
  const inserted = `@${alias}${separator}`
  return { text: text.slice(0, token.start) + inserted + suffix, caret: token.start + inserted.length + (separator ? 0 : 1) }
}
