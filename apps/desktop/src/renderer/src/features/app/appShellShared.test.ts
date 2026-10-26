import { describe, expect, it } from 'vitest'
import { errorText } from './appShellShared'

describe('errorText', () => {
  it('remove o prefixo do Electron', () => {
    expect(errorText(new Error("Error invoking remote method 'v9:x': Error: Falhou."))).toBe('Falhou.')
  })

  // Regressão: no Electron dev com main antigo, o link abria o Navegador vazio e o aviso era um erro técnico em inglês.
  it('explica canal sem handler como processo principal desatualizado', () => {
    const text = errorText(new Error("Error invoking remote method 'platformBrowser:navigate': Error: No handler registered for 'platformBrowser:navigate'"))
    expect(text).toContain('processo principal do Boobot está desatualizado')
    expect(text).toContain('platformBrowser:navigate')
    expect(text).toContain('npm run dev')
  })
})
