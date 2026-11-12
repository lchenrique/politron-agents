import { describe, expect, it } from 'vitest'
import type { SkillInfo } from '../../../shared/skills'
import { containsSecret, reflectionPrompt, shouldReflect, skillsPromptBlock } from './learning'

const skill = (name: string, source: SkillInfo['source'] = 'codex', description = `Quando usar ${name}.`): SkillInfo => ({ id: `${source}:/x/${name}`, name, description, source, path: `/x/${name}` })

describe('shouldReflect', () => {
  const base = { status: 'completed' as const, planMode: false, delegated: false, toolCalls: 5, recoveredFromError: false, savedSkill: false }
  it('dispara com 5 ou mais chamadas de ferramenta numa execução concluída', () => {
    expect(shouldReflect(base)).toBe(true)
    expect(shouldReflect({ ...base, toolCalls: 4 })).toBe(false)
  })
  it('dispara com erro de ferramenta seguido de sucesso, mesmo com poucas chamadas', () => {
    expect(shouldReflect({ ...base, toolCalls: 2, recoveredFromError: true })).toBe(true)
  })
  it('não dispara em modo plano, sub-execução delegada, execução falha/interrompida ou quando já gravou skill', () => {
    expect(shouldReflect({ ...base, planMode: true })).toBe(false)
    expect(shouldReflect({ ...base, delegated: true })).toBe(false)
    expect(shouldReflect({ ...base, status: 'failed' })).toBe(false)
    expect(shouldReflect({ ...base, status: 'interrupted' })).toBe(false)
    expect(shouldReflect({ ...base, savedSkill: true })).toBe(false)
    expect(shouldReflect({ ...base, queuedWork: true })).toBe(false)
  })
})

describe('skillsPromptBlock', () => {
  it('lista aprendidas primeiro, com slug, e respeita o limite de itens e de caracteres', () => {
    const skills = [...Array.from({ length: 50 }, (_, index) => skill(`codex-${index}`)), skill('Corrigir build', 'learned')]
    skills[50]!.path = '/dados/skills-learned/corrigir-build'
    const block = skillsPromptBlock(skills)
    expect(block.split('\n')[1]).toContain('Corrigir build (slug corrigir-build)')
    expect(block.split('\n').length).toBeLessThanOrEqual(31)
    expect(block.length).toBeLessThanOrEqual(3000)
  })
  it('corta pelo tamanho mesmo com poucos itens de descrição longa', () => {
    const block = skillsPromptBlock(Array.from({ length: 30 }, (_, index) => skill(`s${index}`, 'custom', 'x'.repeat(400))))
    expect(block.length).toBeLessThanOrEqual(3000)
  })
  it('fica vazio sem skills', () => { expect(skillsPromptBlock([])).toBe('') })
})

describe('reflectionPrompt', () => {
  it('é curto, pede save_skill ou "nada a aprender" e inclui as skills atuais', () => {
    const prompt = reflectionPrompt('Skills disponíveis:\n- A: a')
    expect(prompt).toContain('save_skill')
    expect(prompt).toContain('nada a aprender')
    expect(prompt).toContain('- A: a')
    expect(reflectionPrompt('').length).toBeLessThan(800)
  })
})

describe('containsSecret', () => {
  it('reconhece chaves de API, tokens Bearer e chaves privadas', () => {
    expect(containsSecret('export OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwx')).toBe(true)
    expect(containsSecret('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abcdefghijk')).toBe(true)
    expect(containsSecret('-----BEGIN OPENSSH PRIVATE KEY-----\nabc')).toBe(true)
    expect(containsSecret('token ghp_abcdefghijklmnopqrstuvwxyz0123456789')).toBe(true)
    expect(containsSecret('AKIAABCDEFGHIJKLMNOP')).toBe(true)
  })
  it('aceita procedimentos comuns', () => {
    expect(containsSecret('Rode npm install e depois npm test. Use o header Authorization: Bearer <token> do cofre.')).toBe(false)
  })
})
