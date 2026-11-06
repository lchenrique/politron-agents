import { describe, expect, it } from 'vitest'
import { cardFallbackText, isCardExpired, parseTextAnswer, redactAnswer, validateAnswer, validateCard, type InteractiveCard } from './interactive-card'

const choice: InteractiveCard = { id: 'c1', kind: 'choice', title: 'Biblioteca?', multiple: true, min: 1, max: 2, options: [{ id: 'a', label: 'React' }, { id: 'b', label: 'Vue' }, { id: 'c', label: 'Svelte' }] }
const form: InteractiveCard = { id: 'f1', kind: 'form', title: 'Acesso', fields: [{ id: 'user', label: 'Usuário', required: true }, { id: 'pass', label: 'Senha', secret: true }] }

describe('cartões interativos', () => {
  it('recusa cartões malformados', () => {
    expect(validateCard({ ...choice, options: [] } as InteractiveCard)).toMatch(/opções/)
    expect(validateCard({ ...choice, options: [{ id: 'a', label: 'x' }, { id: 'a', label: 'y' }] } as InteractiveCard)).toMatch(/repetido/)
    expect(validateCard({ ...form, fields: [] } as InteractiveCard)).toMatch(/campos/)
    expect(validateCard(choice)).toBeNull()
  })

  it('valida respostas contra o cartão', () => {
    expect(validateAnswer(choice, { status: 'answered', values: { choices: ['a', 'x'] } })).toMatch(/inexistente/)
    expect(validateAnswer(choice, { status: 'answered', values: { choices: ['a', 'b', 'c'] } })).toMatch(/1 a 2/)
    expect(validateAnswer(choice, { status: 'answered', values: { choices: ['a'] } })).toBeNull()
    expect(validateAnswer(form, { status: 'answered', values: { pass: 'x' } })).toMatch(/Usuário/)
    expect(validateAnswer({ id: 'q', kind: 'confirm', title: 'Ok?' }, { status: 'answered', values: { confirmed: 'sim' as unknown as boolean } })).toMatch(/inválida/)
  })

  it('expira pelo prazo e recusa resposta tardia', () => {
    const card: InteractiveCard = { id: 'q', kind: 'confirm', title: 'Ok?', expiresAt: '2026-01-01T00:00:00Z' }
    expect(isCardExpired(card, Date.parse('2026-01-02T00:00:00Z'))).toBe(true)
    expect(validateAnswer(card, { status: 'answered', values: { confirmed: true } }, Date.parse('2026-01-02T00:00:00Z'))).toMatch(/expirado/)
    expect(isCardExpired({})).toBe(false)
  })

  it('gera a versão em texto e nunca exibe campo secreto no resumo', () => {
    expect(cardFallbackText(choice)).toContain('1. React')
    expect(cardFallbackText(form)).toContain('secreto, não será exibido')
    const summary = redactAnswer(form, { status: 'answered', values: { user: 'ana', pass: 'segredo123' } })
    expect(summary).toContain('ana')
    expect(summary).not.toContain('segredo123')
    expect(redactAnswer(choice, { status: 'expired' })).toBe('Expirado')
  })

  it('interpreta respostas em texto de canais sem botões', () => {
    expect(parseTextAnswer({ id: 'q', kind: 'confirm', title: 'Ok?' }, 'Sim')).toEqual({ answer: { status: 'answered', values: { confirmed: true } } })
    expect(parseTextAnswer({ id: 'q', kind: 'confirm', title: 'Ok?' }, 'talvez')).toHaveProperty('error')
    expect(parseTextAnswer(choice, '1, 3')).toEqual({ answer: { status: 'answered', values: { choices: ['a', 'c'] } } })
    expect(parseTextAnswer(choice, '9')).toHaveProperty('error')
    expect(parseTextAnswer(form, 'usuário: ana\nsenha: x')).toEqual({ answer: { status: 'answered', values: { user: 'ana', pass: 'x' } } })
    expect(parseTextAnswer(form, 'sem formato')).toHaveProperty('error')
    expect(parseTextAnswer(form, 'cancelar')).toEqual({ answer: { status: 'dismissed' } })
  })
})
