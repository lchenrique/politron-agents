import { describe, expect, it } from 'vitest'
import { chooseBooIdentity } from './boo-identity'

describe('identidade automática de Boos', () => {
  it('seleciona nomes mitológicos por especialidade e cores diferentes', () => {
    const existing: Array<{ name: string; alias: string; color: string }> = []
    for (const [description, expected] of [
      ['Arquitetura do produto', 'Atena'],
      ['Programação e implementação', 'Hefesto'],
      ['Pesquisa e documentação', 'Thoth'],
      ['Design de interfaces', 'Freya'],
    ]) {
      const result = chooseBooIdentity({ description, instructions: 'Trabalhe em ' + description }, existing)
      expect(result.name).toBe(expected)
      expect(result.color).toMatch(/^#[a-f0-9]{6}$/i)
      expect(existing.map(item => item.color)).not.toContain(result.color)
      existing.push(result)
    }
  })

  it('preserva nome explícito, normaliza menção e evita colisões', () => {
    const existing = [{ name: 'Nox', alias: 'nox', color: '#786bea' }]
    const result = chooseBooIdentity({ name: 'Nox', instructions: 'Pesquise dados' }, existing)
    expect(result.name).toBe('Nox')
    expect(result.alias).toBe('nox-2')
    expect(result.color).not.toBe(existing[0].color)
  })
})
