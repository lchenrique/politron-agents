import { describe, expect, it } from 'vitest'
import { getMentionQuery, replaceMention } from './mentions'

describe('menções no composer', () => {
  it('localiza o token no cursor e ignora endereços de e-mail', () => {
    expect(getMentionQuery('Olá @at', 7)).toEqual({ start: 4, end: 7, query: 'at' })
    expect(getMentionQuery('a@atlas.com', 7)).toBeNull()
    expect(getMentionQuery('oi\n@ní', 6)).toEqual({ start: 3, end: 6, query: 'ní' })
  })

  it('substitui apenas o token no meio do texto, inclusive aliases Unicode e com hífen', () => {
    expect(replaceMention('Oi @at hoje', { start: 3, end: 6, query: 'at' }, 'atlas')).toEqual({ text: 'Oi @atlas hoje', caret: 10 })
    expect(replaceMention('@atlas e @ni agora', { start: 9, end: 12, query: 'ni' }, 'nina-é')).toEqual({ text: '@atlas e @nina-é agora', caret: 17 })
  })
})
