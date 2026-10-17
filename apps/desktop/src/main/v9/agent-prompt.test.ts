import { describe, expect, it } from 'vitest'
import { buildAgentSystemPrompt } from './agent-prompt'
import type { Agent } from '../../shared/v9'

const agent = { id: 'a1', name: 'Nina', alias: 'nina', instructions: 'Cuide do frontend.' } as Agent

describe('preâmbulo de sistema compartilhado entre Codex e Claude', () => {
  it('ensina o apelido "Pits" e as regras de colaboração, para não divergir entre motores', () => {
    const prompt = buildAgentSystemPrompt(agent, '')
    expect(prompt).toContain('"Pits" é o apelido carinhoso')
    expect(prompt).toContain('group_members e ask_agent')
    expect(prompt).toContain('Não afirme ter feito uma ação sem resultado real de ferramenta.')
    expect(prompt).toContain('@nina')
  })

  it('anexa as instruções do projeto só quando existem', () => {
    expect(buildAgentSystemPrompt(agent)).not.toContain('Instruções do projeto')
    expect(buildAgentSystemPrompt(agent, 'Use TypeScript estrito.')).toContain('Instruções do projeto:\nUse TypeScript estrito.')
  })
})
