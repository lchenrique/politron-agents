import { describe, expect, it } from 'vitest'
import { classifyMessageLink } from './message-link'

describe('classifyMessageLink', () => {
  it('reconhece URLs web, âncoras e arquivos relativos', () => {
    expect(classifyMessageLink('https://docs.example.test/a')).toEqual({ kind: 'url', url: 'https://docs.example.test/a' })
    expect(classifyMessageLink('http://localhost:5173')).toEqual({ kind: 'url', url: 'http://localhost:5173/' })
    expect(classifyMessageLink('#resultado')).toEqual({ kind: 'anchor' })
    expect(classifyMessageLink('./src/My%20File.ts')).toEqual({ kind: 'file', path: 'src/My File.ts' })
    expect(classifyMessageLink('src/app.ts')).toEqual({ kind: 'file', path: 'src/app.ts' })
    expect(classifyMessageLink('docs\\guia.md#instalacao')).toEqual({ kind: 'file', path: 'docs/guia.md' })
    expect(classifyMessageLink('Makefile')).toEqual({ kind: 'file', path: 'Makefile' })
  })
  it('bloqueia traversal, caminhos absolutos, protocolos e codificação inválida', () => {
    for (const href of ['../secret.txt', 'src/../../secret', '%2e%2e/secret', '..%2Fsecret', '/etc/passwd', '\\\\server\\share', '//evil.example/x',
      'C:\\Windows\\win.ini', 'C%3A/Windows', 'javascript:alert(1)', 'file:///C:/x', 'mailto:a@b.c', 'vscode://file/x', 'https://user:pass@x.test',
      'src/a.ts?x=1', '%E0%A4%A', 'a%00b', '', undefined]) expect(classifyMessageLink(href as string)).toEqual({ kind: 'blocked' })
  })
})
