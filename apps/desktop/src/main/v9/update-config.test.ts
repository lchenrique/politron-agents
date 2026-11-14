import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defaultUpdateChannel, describeUpdateError, parseGithubReleases, parseUpdateFeeds, updateFeedOptions } from './update-config'

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
  it('lê as Releases do GitHub sem aceitar token nem nomes inválidos', () => {
    expect(parseGithubReleases({ github: { owner: 'lchenrique', repo: 'politron-agents', token: 'ghp_x' } })).toEqual({ owner: 'lchenrique', repo: 'politron-agents' })
    expect(parseGithubReleases({ github: { owner: '../x', repo: 'r' } })).toBeNull()
    expect(parseGithubReleases({ github: 'lchenrique/politron-agents' })).toBeNull()
    expect(parseGithubReleases(null)).toBeNull()
  })
  it('prefere o feed HTTPS do canal e cai para o GitHub público', () => {
    const github = { owner: 'o', repo: 'r' }
    expect(updateFeedOptions({ beta: 'https://x.dev/beta' }, github, 'beta')).toEqual({ provider: 'generic', url: 'https://x.dev/beta' })
    expect(updateFeedOptions({ beta: 'https://x.dev/beta' }, github, 'stable')).toEqual({ provider: 'github', owner: 'o', repo: 'r', private: false })
    expect(updateFeedOptions({}, null, 'stable')).toBeNull()
  })
  it('explica o 404 do repositório privado', () => {
    const options = { provider: 'github' as const, owner: 'o', repo: 'r', private: false as const }
    expect(describeUpdateError('HttpError: 404 Not Found', options)).toMatch(/precisa ser público/)
    expect(describeUpdateError('net::ERR_INTERNET_DISCONNECTED', options)).toBe('net::ERR_INTERNET_DISCONNECTED')
  })
  it('o update-feed.json empacotado aponta para as Releases do GitHub', () => {
    const raw = JSON.parse(readFileSync(join(__dirname, '../../../update-feed.json'), 'utf8'))
    expect(updateFeedOptions(parseUpdateFeeds(raw), parseGithubReleases(raw), 'stable')).toEqual({ provider: 'github', owner: 'lchenrique', repo: 'politron-agents', private: false })
  })
})
