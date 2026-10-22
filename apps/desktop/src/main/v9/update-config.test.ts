import { describe, expect, it } from 'vitest'
import { defaultUpdateChannel, parseUpdateFeeds } from './update-config'

describe('configuração do canal de atualização', () => {
  it('aceita apenas HTTPS público sem credenciais', () => {
    expect(parseUpdateFeeds({
      stable: 'https://downloads.example.com/boobot/stable/',
      beta: 'https://usuario:segredo@downloads.example.com/beta',
    })).toEqual({ stable: 'https://downloads.example.com/boobot/stable' })
    expect(parseUpdateFeeds({ stable: 'file:///etc/passwd', beta: 'http://example.com/beta' })).toEqual({})
    expect(parseUpdateFeeds(null)).toEqual({})
    expect(parseUpdateFeeds({ stable: 'https://updates.example.com/base?token=123' })).toEqual({})
  })
  it('usa canal beta apenas para versões pré-lançamento', () => {
    expect(defaultUpdateChannel('0.1.0-beta.1')).toBe('beta')
    expect(defaultUpdateChannel('0.2.0')).toBe('stable')
  })
})
