import { describe, expect, it } from 'vitest'
import { buildAgentSystemPrompt } from './agent-prompt'
import type { Agent } from '../../shared/v9'

const agent = { id: 'a1', name: 'Nina', alias: 'nina', instructions: 'Cuide do frontend.' } as Agent

describe('preâmbulo de sistema compartilhado entre Codex e Claude', () => {
  it('usa Boo e Boobot com as regras de colaboração entre motores', () => {
    const prompt = buildAgentSystemPrompt(agent, '')
    expect(prompt).toContain('Este aplicativo se chama Boobot.')
    expect(prompt).toContain('Cada agente é um Boo')
    expect(prompt).toContain('group_members e ask_agent')
    expect(prompt).toContain('Não afirme ter feito uma ação sem resultado real de ferramenta.')
    expect(prompt).toContain('@nina')
  })

  it('orienta o Chief a montar a equipe quando útil e distinguir Boos temporários', () => {
    const prompt = buildAgentSystemPrompt({ ...agent, role: 'chief' })
    expect(prompt).toContain('propose_boos')
    expect(prompt).toContain('group_members')
    expect(prompt).toContain('purpose=team')
    expect(prompt).toContain('purpose=task')
    expect(prompt).toContain('Boos dessa equipe devem ser PERMANENTES')
    expect(prompt).toContain('temporary=true')
    expect(prompt).toContain('Toda criação e delegação exige aprovação')
  })

  it('anexa as instruções do projeto só quando existem', () => {
    expect(buildAgentSystemPrompt(agent)).not.toContain('Instruções do projeto')
    expect(buildAgentSystemPrompt(agent, 'Use TypeScript estrito.')).toContain('Instruções do projeto:\nUse TypeScript estrito.')
  })
})
